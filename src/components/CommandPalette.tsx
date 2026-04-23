import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentMatch, FileNode } from '../types';

type Props = {
  files: FileNode[];
  onSelect: (node: FileNode) => void;
  onClose: () => void;
};

type Row =
  | { kind: 'file'; node: FileNode }
  | { kind: 'content'; match: ContentMatch };

export function CommandPalette({ files, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [contentMatches, setContentMatches] = useState<ContentMatch[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const fileResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files.slice(0, 50);
    return files
      .map((f) => ({ f, score: fuzzyScore(q, f.name.toLowerCase(), f.path.toLowerCase()) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((s) => s.f);
  }, [files, query]);

  // Debounced content search. Filename matches always show; content matches
  // come in below them, excluding files already listed by name.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setContentMatches([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const matches = await window.pagr.searchContent(q);
        setContentMatches(matches);
      } catch {
        setContentMatches([]);
      }
    }, 120);
    return () => window.clearTimeout(handle);
  }, [query]);

  const rows: Row[] = useMemo(() => {
    const filePaths = new Set(fileResults.map((f) => f.path));
    const contentRows: Row[] = contentMatches
      .filter((m) => !filePaths.has(m.path))
      .map((m) => ({ kind: 'content', match: m }));
    return [
      ...fileResults.map((f) => ({ kind: 'file', node: f }) as Row),
      ...contentRows,
    ];
  }, [fileResults, contentMatches]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLLIElement>(
      `li[data-idx="${index}"]`,
    );
    item?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const pickRow = (row: Row) => {
    if (row.kind === 'file') {
      onSelect(row.node);
    } else {
      onSelect({
        name: row.match.name,
        path: row.match.path,
        kind: 'file',
      });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = rows[index];
      if (picked) pickRow(picked);
    }
  };

  const firstContentIdx = rows.findIndex((r) => r.kind === 'content');

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search files and contents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul ref={listRef} className="palette-list">
          {rows.length === 0 && (
            <li className="palette-empty">
              {query.trim() ? 'No matches' : 'Type to search'}
            </li>
          )}
          {rows.flatMap((row, i) => {
            const active = i === index;
            const items: React.ReactNode[] = [];
            if (i === 0 && row.kind === 'file') {
              items.push(
                <li key="sec:files" className="palette-section">
                  Files
                </li>,
              );
            }
            if (i === firstContentIdx) {
              items.push(
                <li key="sec:content" className="palette-section">
                  In files
                </li>,
              );
            }
            if (row.kind === 'file') {
              const f = row.node;
              items.push(
                <li
                  key={`f:${f.path}`}
                  data-idx={i}
                  className={`palette-item ${active ? 'is-active' : ''}`}
                  onMouseEnter={() => setIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickRow(row);
                  }}
                >
                  <span className="palette-name">{f.name}</span>
                  <span className="palette-path">{f.path}</span>
                </li>,
              );
            } else {
              const m = row.match;
              items.push(
                <li
                  key={`c:${m.path}:${m.line}`}
                  data-idx={i}
                  className={`palette-item ${active ? 'is-active' : ''}`}
                  onMouseEnter={() => setIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickRow(row);
                  }}
                >
                  <span className="palette-name">
                    {m.name}
                    <span className="palette-line">:{m.line}</span>
                  </span>
                  <span className="palette-snippet">{m.snippet}</span>
                  <span className="palette-path">{m.path}</span>
                </li>,
              );
            }
            return items;
          })}
        </ul>
      </div>
    </div>
  );
}

function fuzzyScore(query: string, name: string, path: string): number {
  if (name.includes(query)) return 1000 - name.indexOf(query);
  if (path.includes(query)) return 500 - path.indexOf(query);
  let qi = 0;
  let score = 0;
  for (let i = 0; i < name.length && qi < query.length; i++) {
    if (name[i] === query[qi]) {
      score += 10 - Math.min(9, i - qi);
      qi++;
    }
  }
  return qi === query.length ? score : 0;
}
