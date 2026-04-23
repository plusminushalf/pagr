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

export type ExternalChangeEvent =
  | { path: string; kind: 'change'; content: string }
  | { path: string; kind: 'add' | 'unlink' | 'addDir' | 'unlinkDir' };

export type TreeChangedEvent = { root: string; tree: FileNode[] };

export interface PagrApi {
  openFolder(): Promise<OpenFolderResult>;
  listDir(folder: string): Promise<FileNode[]>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, contents: string): Promise<boolean>;
  searchContent(query: string): Promise<ContentMatch[]>;
  onExternalChange(cb: (evt: ExternalChangeEvent) => void): () => void;
  onTreeChanged(cb: (evt: TreeChangedEvent) => void): () => void;
}

declare global {
  interface Window {
    pagr: PagrApi;
  }
}
