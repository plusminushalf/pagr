import { contextBridge, ipcRenderer } from 'electron';

export type FileNode = {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  children?: FileNode[];
};

export type OpenFolderResult = { root: string; tree: FileNode[] } | null;

const api = {
  openFolder: (): Promise<OpenFolderResult> =>
    ipcRenderer.invoke('dialog:openFolder'),
  listDir: (folder: string): Promise<FileNode[]> =>
    ipcRenderer.invoke('fs:listDir', folder),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath: string, contents: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:writeFile', filePath, contents),
};

contextBridge.exposeInMainWorld('pagr', api);

export type PagrApi = typeof api;
