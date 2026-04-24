import { app, BrowserWindow, dialog, ipcMain, protocol, net } from 'electron';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';

// chokidar v5 is ESM-only; main is CJS, so load it dynamically.
type ChokidarModule = typeof import('chokidar');
type Watcher = import('chokidar').FSWatcher;
let chokidarPromise: Promise<ChokidarModule> | null = null;
const getChokidar = () => (chokidarPromise ??= import('chokidar'));

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Register `safe-file://` as a privileged, standard scheme. The renderer can
// reference local images inside an opened folder via `safe-file:///abs/path`,
// and we gate access to paths under any folder the user has opened this session.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'safe-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
    },
  },
]);

// Per-window state. Multiple windows can be open, each tracking its own folder,
// watcher, and tree-refresh timer. Keyed by webContents.id.
type WindowState = {
  window: BrowserWindow;
  openFolderRoot: string | null;
  watcher: Watcher | null;
  treeRefreshTimer: NodeJS.Timeout | null;
  // Folder to load on first renderer mount; the renderer pulls it via
  // `window:takeInitialFolder` once it's ready.
  pendingInitialFolder: string | null;
};
const windowStates = new Map<number, WindowState>();

// Every folder the user has opened this session. `safe-file://` requests are
// allowed if the requested path sits under any of these. The handler can't
// see the requesting webContents, so we authorize by union rather than per-window.
const allowedRoots = new Set<string>();

// Map<absPath, content> — content we just wrote via fs:writeFile. When
// chokidar fires 'change' for one of these paths, we read the file and
// compare; if it matches what we wrote, it's a self-write and we swallow it.
const selfWrites = new Map<string, string>();
const SELF_WRITE_TTL_MS = 3000;

function getState(event: Electron.IpcMainInvokeEvent): WindowState | null {
  return windowStates.get(event.sender.id) ?? null;
}

const createWindow = (initialFolder?: string) => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  const state: WindowState = {
    window: mainWindow,
    openFolderRoot: null,
    watcher: null,
    treeRefreshTimer: null,
    pendingInitialFolder: initialFolder ?? null,
  };
  const webContentsId = mainWindow.webContents.id;
  windowStates.set(webContentsId, state);

  mainWindow.on('closed', () => {
    if (state.watcher) void state.watcher.close().catch(() => undefined);
    if (state.treeRefreshTimer) clearTimeout(state.treeRefreshTimer);
    windowStates.delete(webContentsId);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return mainWindow;
};

app.whenReady().then(() => {
  // Resolve `safe-file://` requests to an absolute file path, but only if the
  // requested path is inside one of the folders the user has opened.
  protocol.handle('safe-file', async (request) => {
    try {
      const url = new URL(request.url);
      // URL is like: safe-file:///Users/me/notes/img.png
      // `url.pathname` gives "/Users/me/notes/img.png" on macOS.
      let absPath = decodeURIComponent(url.pathname);
      // On Windows the path starts with "/C:/...", strip leading slash.
      if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(absPath)) {
        absPath = absPath.slice(1);
      }
      const resolved = path.resolve(absPath);
      let ok = false;
      for (const root of allowedRoots) {
        const rootResolved = path.resolve(root);
        if (
          resolved === rootResolved ||
          resolved.startsWith(rootResolved + path.sep)
        ) {
          ok = true;
          break;
        }
      }
      if (!ok) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(resolved).toString());
    } catch (err) {
      return new Response(`Error: ${(err as Error).message}`, { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  for (const state of windowStates.values()) {
    if (state.watcher) void state.watcher.close().catch(() => undefined);
    if (state.treeRefreshTimer) clearTimeout(state.treeRefreshTimer);
  }
  windowStates.clear();
});

// ---------- IPC ----------

export type FileNode = {
  name: string;
  path: string; // absolute path
  kind: 'file' | 'dir';
  children?: FileNode[];
};

const MD_EXT = new Set(['.md', '.markdown', '.mdx']);

const scheduleTreeRefresh = (state: WindowState) => {
  if (!state.openFolderRoot) return;
  if (state.treeRefreshTimer) clearTimeout(state.treeRefreshTimer);
  state.treeRefreshTimer = setTimeout(async () => {
    state.treeRefreshTimer = null;
    if (!state.openFolderRoot) return;
    try {
      const tree = await walkDir(state.openFolderRoot);
      if (!state.window.isDestroyed()) {
        state.window.webContents.send('fs:treeChanged', {
          root: state.openFolderRoot,
          tree,
        });
      }
    } catch {
      // Folder may have been removed; swallow — renderer keeps stale tree.
    }
  }, 200);
};

async function startWatching(state: WindowState, folder: string) {
  if (state.watcher) {
    await state.watcher.close().catch(() => undefined);
    state.watcher = null;
  }
  const { watch } = await getChokidar();
  const w = watch(folder, {
    ignoreInitial: true,
    // Skip dotfiles/dirs to match walkDir's behavior.
    ignored: (p) => {
      const base = path.basename(p);
      return base.startsWith('.') && base !== '.';
    },
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 50,
    },
  });
  state.watcher = w;

  w.on('change', async (p: string) => {
    const abs = path.resolve(p);
    const ext = path.extname(abs).toLowerCase();
    // For text we load and diff against self-writes; for binary (images/pdf)
    // we just notify so the renderer can bust its cache.
    if (MD_EXT.has(ext)) {
      let content: string;
      try {
        content = await fsp.readFile(abs, 'utf-8');
      } catch {
        return;
      }
      const expected = selfWrites.get(abs);
      if (expected !== undefined && expected === content) return;
      if (!state.window.isDestroyed()) {
        state.window.webContents.send('fs:externalChange', {
          path: abs,
          kind: 'change',
          content,
        });
      }
    } else if (!state.window.isDestroyed()) {
      state.window.webContents.send('fs:externalChange', {
        path: abs,
        kind: 'change',
      });
    }
  });

  const onStructural = (kind: 'add' | 'unlink' | 'addDir' | 'unlinkDir') => (p: string) => {
    const abs = path.resolve(p);
    if (!state.window.isDestroyed()) {
      state.window.webContents.send('fs:externalChange', {
        path: abs,
        kind,
      });
    }
    scheduleTreeRefresh(state);
  };
  w.on('add', onStructural('add'));
  w.on('unlink', onStructural('unlink'));
  w.on('addDir', onStructural('addDir'));
  w.on('unlinkDir', onStructural('unlinkDir'));
}

const IMG_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
]);

const PDF_EXT = new Set(['.pdf']);

async function walkDir(dir: string): Promise<FileNode[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const nodes: FileNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip dotfiles
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const children = await walkDir(full).catch(() => []);
      nodes.push({ name: entry.name, path: full, kind: 'dir', children });
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (MD_EXT.has(ext) || IMG_EXT.has(ext) || PDF_EXT.has(ext)) {
        nodes.push({ name: entry.name, path: full, kind: 'file' });
      }
    }
  }
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

ipcMain.handle('dialog:openFolder', async (evt) => {
  const state = getState(evt);
  if (!state) return null;
  const result = await dialog.showOpenDialog(state.window, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const folder = result.filePaths[0];
  state.openFolderRoot = folder;
  allowedRoots.add(folder);
  const tree = await walkDir(folder);
  void startWatching(state, folder);
  return { root: folder, tree };
});

ipcMain.handle('dialog:openFolderInNewWindow', async (evt) => {
  const state = getState(evt);
  const result = state
    ? await dialog.showOpenDialog(state.window, {
        properties: ['openDirectory'],
      })
    : await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return false;
  const folder = result.filePaths[0];
  allowedRoots.add(folder);
  createWindow(folder);
  return true;
});

ipcMain.handle('window:takeInitialFolder', async (evt) => {
  const state = getState(evt);
  if (!state) return null;
  const folder = state.pendingInitialFolder;
  state.pendingInitialFolder = null;
  if (!folder) return null;
  state.openFolderRoot = folder;
  allowedRoots.add(folder);
  const tree = await walkDir(folder);
  void startWatching(state, folder);
  return { root: folder, tree };
});

ipcMain.handle('fs:listDir', async (evt, folder: string) => {
  const state = getState(evt);
  if (!state) throw new Error('No window state');
  state.openFolderRoot = folder;
  allowedRoots.add(folder);
  void startWatching(state, folder);
  return walkDir(folder);
});

ipcMain.handle('fs:readFile', async (evt, filePath: string) => {
  const state = getState(evt);
  if (!state?.openFolderRoot) throw new Error('No folder open');
  const resolved = path.resolve(filePath);
  const rootResolved = path.resolve(state.openFolderRoot);
  if (!resolved.startsWith(rootResolved)) throw new Error('Forbidden');
  return fsp.readFile(resolved, 'utf-8');
});

ipcMain.handle('fs:readFileBytes', async (evt, filePath: string) => {
  const state = getState(evt);
  if (!state?.openFolderRoot) throw new Error('No folder open');
  const resolved = path.resolve(filePath);
  const rootResolved = path.resolve(state.openFolderRoot);
  if (!resolved.startsWith(rootResolved)) throw new Error('Forbidden');
  const buf = await fsp.readFile(resolved);
  // IPC clones a Uint8Array cleanly; return a fresh one backed by the buffer.
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
});

ipcMain.handle(
  'fs:writeFile',
  async (evt, filePath: string, contents: string) => {
    const state = getState(evt);
    if (!state?.openFolderRoot) throw new Error('No folder open');
    const resolved = path.resolve(filePath);
    const rootResolved = path.resolve(state.openFolderRoot);
    if (!resolved.startsWith(rootResolved)) throw new Error('Forbidden');
    selfWrites.set(resolved, contents);
    setTimeout(() => {
      if (selfWrites.get(resolved) === contents) selfWrites.delete(resolved);
    }, SELF_WRITE_TTL_MS);
    await fsp.writeFile(resolved, contents, 'utf-8');
    return true;
  },
);

export type ContentMatch = {
  path: string;
  name: string;
  line: number;
  snippet: string;
};

async function collectMarkdownFiles(dir: string, out: string[]): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(full, out);
    } else if (
      entry.isFile() &&
      MD_EXT.has(path.extname(entry.name).toLowerCase())
    ) {
      out.push(full);
    }
  }
}

ipcMain.handle(
  'fs:searchContent',
  async (evt, query: string): Promise<ContentMatch[]> => {
    const state = getState(evt);
    const q = query.trim().toLowerCase();
    if (!q || !state?.openFolderRoot) return [];
    const files: string[] = [];
    await collectMarkdownFiles(state.openFolderRoot, files);
    const results: ContentMatch[] = [];
    const MAX_RESULTS = 50;
    for (const file of files) {
      if (results.length >= MAX_RESULTS) break;
      let text: string;
      try {
        text = await fsp.readFile(file, 'utf-8');
      } catch {
        continue;
      }
      const lower = text.toLowerCase();
      const idx = lower.indexOf(q);
      if (idx === -1) continue;
      // Determine line number and snippet around the match.
      const lineStart = text.lastIndexOf('\n', idx - 1) + 1;
      const lineEndRaw = text.indexOf('\n', idx);
      const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
      const line = text.slice(0, idx).split('\n').length;
      const rawSnippet = text.slice(lineStart, lineEnd);
      const snippet = rawSnippet.length > 160
        ? (() => {
            const col = idx - lineStart;
            const start = Math.max(0, col - 40);
            const end = Math.min(rawSnippet.length, start + 160);
            return (start > 0 ? '…' : '') + rawSnippet.slice(start, end);
          })()
        : rawSnippet;
      results.push({
        path: file,
        name: path.basename(file),
        line,
        snippet,
      });
    }
    return results;
  },
);
