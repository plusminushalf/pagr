export type FileNode = {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  children?: FileNode[];
};

export type OpenFolderResult = { root: string; tree: FileNode[] } | null;

export type ContentMatch = {
  path: string;
  name: string;
  line: number;
  snippet: string;
};

export interface PagrApi {
  openFolder(): Promise<OpenFolderResult>;
  listDir(folder: string): Promise<FileNode[]>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, contents: string): Promise<boolean>;
  searchContent(query: string): Promise<ContentMatch[]>;
}

declare global {
  interface Window {
    pagr: PagrApi;
  }
}
