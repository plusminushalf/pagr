import { useCallback, useEffect, useState } from 'react';
import type { FileNode } from './types';
import { FileTree } from './components/FileTree';
import { Editor } from './components/Editor';

export function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [activeContent, setActiveContent] = useState<string>('');
  const [dirty, setDirty] = useState(false);

  const openFolder = useCallback(async () => {
    const result = await window.pagr.openFolder();
    if (!result) return;
    setRoot(result.root);
    setTree(result.tree);
    setActivePath(null);
    setActiveContent('');
    setDirty(false);
  }, []);

  const selectFile = useCallback(async (node: FileNode) => {
    if (node.kind !== 'file') return;
    const ext = node.name.toLowerCase().split('.').pop() ?? '';
    if (!['md', 'markdown', 'mdx'].includes(ext)) return;
    const contents = await window.pagr.readFile(node.path);
    setActivePath(node.path);
    setActiveContent(contents);
    setDirty(false);
  }, []);

  const saveActive = useCallback(
    async (markdown: string) => {
      if (!activePath) return;
      await window.pagr.writeFile(activePath, markdown);
      setDirty(false);
    },
    [activePath],
  );

  // Cmd/Ctrl+S to save.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (activePath && dirty) {
          // The editor passes its current markdown via onChange; we persist the latest copy.
          void saveActive(activeContent);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activePath, dirty, activeContent, saveActive]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="btn" onClick={openFolder} type="button">
            {root ? 'Change folder…' : 'Open folder…'}
          </button>
          {root && (
            <div className="sidebar-root" title={root}>
              {root.split('/').filter(Boolean).pop() ?? root}
            </div>
          )}
        </div>
        <div className="sidebar-tree">
          {tree.length === 0 && !root && (
            <div className="sidebar-empty">
              Open a folder to get started.
            </div>
          )}
          <FileTree
            nodes={tree}
            activePath={activePath}
            onSelect={selectFile}
          />
        </div>
      </aside>
      <main className="editor-pane">
        {activePath ? (
          <Editor
            key={activePath}
            initialMarkdown={activeContent}
            onChange={(md) => {
              setActiveContent(md);
              setDirty(true);
            }}
          />
        ) : (
          <div className="editor-empty">
            {root ? 'Select a markdown file to edit.' : 'No folder open.'}
          </div>
        )}
        {activePath && (
          <div className="status-bar">
            <span>{activePath}</span>
            <span>{dirty ? '● unsaved' : 'saved'}</span>
          </div>
        )}
      </main>
    </div>
  );
}
