import { contextBridge, ipcRenderer } from 'electron';

export type FileNode = {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  children?: FileNode[];
};

export type OpenFolderResult = { root: string; tree: FileNode[] } | null;

export type OpenFileResult =
  | { root: string; tree: FileNode[]; filePath: string }
  | null;

export type ContentMatch = {
  path: string;
  name: string;
  line: number;
  snippet: string;
};

export type ExternalChangeEvent =
  | { path: string; kind: 'change'; content?: string }
  | { path: string; kind: 'add' | 'unlink' | 'addDir' | 'unlinkDir' };

export type TreeChangedEvent = { root: string; tree: FileNode[] };

const onMenu = (channel: string, cb: () => void): (() => void) => {
  const handler = () => cb();
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const api = {
  openFolder: (): Promise<OpenFolderResult> =>
    ipcRenderer.invoke('dialog:openFolder'),
  openFile: (): Promise<OpenFileResult> =>
    ipcRenderer.invoke('dialog:openFile'),
  openFolderInNewWindow: (): Promise<boolean> =>
    ipcRenderer.invoke('dialog:openFolderInNewWindow'),
  onMenuOpenFolder: (cb: () => void) => onMenu('menu:openFolder', cb),
  onMenuOpenFile: (cb: () => void) => onMenu('menu:openFile', cb),
  onMenuOpenSettings: (cb: () => void) => onMenu('menu:openSettings', cb),
  onMenuToggleSidebar: (cb: () => void) => onMenu('menu:toggleSidebar', cb),
  onMenuShowShortcuts: (cb: () => void) => onMenu('menu:showShortcuts', cb),
  takeInitialFolder: (): Promise<OpenFolderResult> =>
    ipcRenderer.invoke('window:takeInitialFolder'),
  listDir: (folder: string): Promise<FileNode[]> =>
    ipcRenderer.invoke('fs:listDir', folder),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', filePath),
  readFileBytes: (filePath: string): Promise<Uint8Array> =>
    ipcRenderer.invoke('fs:readFileBytes', filePath),
  writeFile: (filePath: string, contents: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:writeFile', filePath, contents),
  searchContent: (query: string): Promise<ContentMatch[]> =>
    ipcRenderer.invoke('fs:searchContent', query),
  onExternalChange: (cb: (evt: ExternalChangeEvent) => void): (() => void) => {
    const handler = (_e: unknown, evt: ExternalChangeEvent) => cb(evt);
    ipcRenderer.on('fs:externalChange', handler);
    return () => ipcRenderer.removeListener('fs:externalChange', handler);
  },
  onTreeChanged: (cb: (evt: TreeChangedEvent) => void): (() => void) => {
    const handler = (_e: unknown, evt: TreeChangedEvent) => cb(evt);
    ipcRenderer.on('fs:treeChanged', handler);
    return () => ipcRenderer.removeListener('fs:treeChanged', handler);
  },
};

contextBridge.exposeInMainWorld('pagr', api);

export type PagrApi = typeof api;
