import { app, BrowserWindow, dialog, ipcMain, protocol, net } from 'electron';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Register `safe-file://` as a privileged, standard scheme. The renderer can
// reference local images inside an opened folder via `safe-file:///abs/path`,
// and we gate access to paths under the currently open folder only.
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

let openFolderRoot: string | null = null;

const createWindow = () => {
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
};

app.whenReady().then(() => {
  // Resolve `safe-file://` requests to an absolute file path, but only if the
  // requested path is inside the currently open folder.
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
      if (!openFolderRoot) {
        return new Response('No folder open', { status: 403 });
      }
      const resolved = path.resolve(absPath);
      const rootResolved = path.resolve(openFolderRoot);
      if (
        resolved !== rootResolved &&
        !resolved.startsWith(rootResolved + path.sep)
      ) {
        return new Response('Forbidden', { status: 403 });
      }
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

// ---------- IPC ----------

export type FileNode = {
  name: string;
  path: string; // absolute path
  kind: 'file' | 'dir';
  children?: FileNode[];
};

const MD_EXT = new Set(['.md', '.markdown', '.mdx']);
const IMG_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
]);

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
      if (MD_EXT.has(ext) || IMG_EXT.has(ext)) {
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

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const folder = result.filePaths[0];
  openFolderRoot = folder;
  const tree = await walkDir(folder);
  return { root: folder, tree };
});

ipcMain.handle('fs:listDir', async (_evt, folder: string) => {
  openFolderRoot = folder;
  return walkDir(folder);
});

ipcMain.handle('fs:readFile', async (_evt, filePath: string) => {
  if (!openFolderRoot) throw new Error('No folder open');
  const resolved = path.resolve(filePath);
  const rootResolved = path.resolve(openFolderRoot);
  if (!resolved.startsWith(rootResolved)) throw new Error('Forbidden');
  return fsp.readFile(resolved, 'utf-8');
});

ipcMain.handle(
  'fs:writeFile',
  async (_evt, filePath: string, contents: string) => {
    if (!openFolderRoot) throw new Error('No folder open');
    const resolved = path.resolve(filePath);
    const rootResolved = path.resolve(openFolderRoot);
    if (!resolved.startsWith(rootResolved)) throw new Error('Forbidden');
    await fsp.writeFile(resolved, contents, 'utf-8');
    return true;
  },
);

