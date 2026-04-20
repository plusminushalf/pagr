export type FileNode = {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  children?: FileNode[];
};

export type OpenFolderResult = { root: string; tree: FileNode[] } | null;

export interface PagrApi {
  openFolder(): Promise<OpenFolderResult>;
  listDir(folder: string): Promise<FileNode[]>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, contents: string): Promise<boolean>;
}

declare global {
  interface Window {
    pagr: PagrApi;
  }
}
