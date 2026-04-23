import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FileNode } from './types';
import { FileTree } from './components/FileTree';
import { Editor } from './components/Editor';
import { CommandPalette } from './components/CommandPalette';
import { SettingsPanel } from './components/SettingsPanel';
import {
  FONT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  getFontStack,
  loadFont,
  loadTheme,
  type FontKey,
  type ThemeKey,
} from './settings';

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 600;
const SIDEBAR_DEFAULT = 260;
const SIDEBAR_STORAGE_KEY = 'pagr:sidebarWidth';

export function App() {
  const [root, setRoot] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [activeContent, setActiveContent] = useState<string>('');
  const [dirty, setDirty] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [font, setFont] = useState<FontKey>(() => loadFont());
  const [theme, setTheme] = useState<ThemeKey>(() => loadTheme());
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= SIDEBAR_MIN && stored <= SIDEBAR_MAX
      ? stored
      : SIDEBAR_DEFAULT;
  });
  const resizingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(FONT_STORAGE_KEY, font);
    document.documentElement.style.setProperty('--font-editor', getFontStack(font));
  }, [font]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX));
      setSidebarWidth(w);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

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

  const flatFiles = useMemo(() => flattenMarkdownFiles(tree), [tree]);

  // Keybindings: Cmd/Ctrl+S save, Cmd/Ctrl+K command palette.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (activePath && dirty) {
          void saveActive(activeContent);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activePath, dirty, activeContent, saveActive]);

  return (
    <div
      className="app"
      style={{ gridTemplateColumns: `${sidebarWidth}px 4px 1fr` }}
    >
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
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-footer-btn"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
          >
            <span className="sidebar-footer-icon">⚙</span>
            Settings
          </button>
          {settingsOpen && (
            <SettingsPanel
              font={font}
              theme={theme}
              onFontChange={setFont}
              onThemeChange={setTheme}
              onClose={() => setSettingsOpen(false)}
            />
          )}
        </div>
      </aside>
      <div
        className="sidebar-resizer"
        onMouseDown={onResizeStart}
        role="separator"
        aria-orientation="vertical"
      />
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
      {paletteOpen && (
        <CommandPalette
          files={flatFiles}
          onSelect={(node) => {
            setPaletteOpen(false);
            void selectFile(node);
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  );
}

function flattenMarkdownFiles(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  const walk = (list: FileNode[]) => {
    for (const n of list) {
      if (n.kind === 'dir') {
        if (n.children) walk(n.children);
      } else if (/\.(md|markdown|mdx)$/i.test(n.name)) {
        out.push(n);
      }
    }
  };
  walk(nodes);
  return out;
}
