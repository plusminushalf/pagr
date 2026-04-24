import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, net } from 'electron';
import path from 'node:path';
import { promises as fsp, statSync } from 'node:fs';
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

// Holds a folder path delivered by macOS's `open-file` event before the app
// is ready (e.g. when the user launches pagr by dropping a folder onto the
// app icon). Consumed once `app.whenReady` resolves.
let pendingOpenFileFolder: string | null = null;

function pickFolderFromArgv(argv: string[]): string | null {
  // In a packaged build argv[0] is the pagr binary; in dev it's the electron
  // binary followed by '.' (the app path). Skip those and scan the rest for
  // the first argument that resolves to a directory on disk.
  const start = app.isPackaged ? 1 : 2;
  for (let i = start; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || arg.startsWith('-')) continue;
    try {
      const resolved = path.resolve(arg);
      if (statSync(resolved).isDirectory()) return resolved;
    } catch {
      // Not a readable path — keep scanning.
    }
  }
  return null;
}

// Only allow one pagr process at a time so `pagr ~/notes` from the terminal
// re-uses the running app (opening a new window) instead of spawning a second
// Electron instance. Must run before `app.whenReady()` resolves.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
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
  // When set, the window is in single-file mode: the sidebar tree contains
  // only this file, and structural events under the parent folder must not
  // replace the tree with folder contents.
  singleFilePath: string | null;
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
    singleFilePath: null,
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

app.on('second-instance', (_event, argv) => {
  const folder = pickFolderFromArgv(argv);
  if (folder) {
    allowedRoots.add(folder);
    createWindow(folder);
    return;
  }
  const wins = BrowserWindow.getAllWindows();
  if (wins.length === 0) {
    createWindow();
    return;
  }
  const win = wins[0];
  if (win.isMinimized()) win.restore();
  win.focus();
});

// macOS fires `open-file` when the user opens a folder with pagr via Finder
// (right-click → Open With → pagr) or drops a folder on the app icon.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  let resolved: string;
  try {
    resolved = path.resolve(filePath);
    if (!statSync(resolved).isDirectory()) return;
  } catch {
    return;
  }
  if (!app.isReady() || BrowserWindow.getAllWindows().length === 0) {
    pendingOpenFileFolder = resolved;
    return;
  }
  allowedRoots.add(resolved);
  createWindow(resolved);
});

function sendToFocused(channel: string) {
  const win = BrowserWindow.getFocusedWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel);
}

function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Settings…',
                accelerator: 'Cmd+,',
                click: () => sendToFocused('menu:openSettings'),
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToFocused('menu:openFolder'),
        },
        {
          label: 'Open File…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendToFocused('menu:openFile'),
        },
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              {
                label: 'Settings…',
                accelerator: 'Ctrl+,',
                click: () => sendToFocused('menu:openSettings'),
              },
            ]),
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => sendToFocused('menu:toggleSidebar'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+?',
          click: () => sendToFocused('menu:showShortcuts'),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildAppMenu());
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

  // Pick up a folder the user supplied via `pagr ~/notes` on the command line,
  // or a folder delivered via `open-file` before the app was ready. If both
  // fire, the `open-file` path wins — it's the one macOS just emitted.
  const initialFolder =
    pendingOpenFileFolder ?? pickFolderFromArgv(process.argv);
  pendingOpenFileFolder = null;
  if (initialFolder) allowedRoots.add(initialFolder);
  createWindow(initialFolder ?? undefined);

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
  // In single-file mode the sidebar only ever shows the opened file, so skip
  // folder-wide refreshes — structural events under the parent folder don't
  // belong in the tree.
  if (state.singleFilePath) return;
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
  state.singleFilePath = null;
  allowedRoots.add(folder);
  const tree = await walkDir(folder);
  void startWatching(state, folder);
  return { root: folder, tree };
});

// Open a single supported file. Sets the parent directory as the permission
// root (so `safe-file://` images next to the file still resolve, and read/write
// IPC path checks pass) but the sidebar tree contains only this file — no
// sibling discovery. The watcher follows just this path.
ipcMain.handle('dialog:openFile', async (evt) => {
  const state = getState(evt);
  const opts: Electron.OpenDialogOptions = {
    properties: ['openFile'],
    filters: [
      {
        name: 'Supported files',
        extensions: [
          'md', 'markdown', 'mdx',
          'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
          'pdf',
        ],
      },
    ],
  };
  const result = state
    ? await dialog.showOpenDialog(state.window, opts)
    : await dialog.showOpenDialog(opts);
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const folder = path.dirname(filePath);
  allowedRoots.add(folder);
  if (!state) {
    createWindow(folder);
    return null;
  }
  state.openFolderRoot = folder;
  state.singleFilePath = filePath;
  const tree: FileNode[] = [
    { name: path.basename(filePath), path: filePath, kind: 'file' },
  ];
  void startWatching(state, filePath);
  return { root: folder, tree, filePath };
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
  state.singleFilePath = null;
  allowedRoots.add(folder);
  const tree = await walkDir(folder);
  void startWatching(state, folder);
  return { root: folder, tree };
});

ipcMain.handle('fs:listDir', async (evt, folder: string) => {
  const state = getState(evt);
  if (!state) throw new Error('No window state');
  state.openFolderRoot = folder;
  state.singleFilePath = null;
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
