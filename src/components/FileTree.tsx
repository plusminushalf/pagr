import { useState } from 'react';
import type { FileNode } from '../types';

type Props = {
  nodes: FileNode[];
  activePath: string | null;
  onSelect: (node: FileNode) => void;
  depth?: number;
};

export function FileTree({ nodes, activePath, onSelect, depth = 0 }: Props) {
  return (
    <ul className="tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          activePath={activePath}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
    </ul>
  );
}

function TreeNode({
  node,
  activePath,
  onSelect,
  depth,
}: {
  node: FileNode;
  activePath: string | null;
  onSelect: (node: FileNode) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 1);

  if (node.kind === 'dir') {
    return (
      <li className="tree-item tree-dir">
        <div
          className="tree-row"
          style={{ paddingLeft: depth * 12 + 6 }}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="tree-caret">{open ? '▾' : '▸'}</span>
          <span className="tree-name">{node.name}</span>
        </div>
        {open && node.children && node.children.length > 0 && (
          <FileTree
            nodes={node.children}
            activePath={activePath}
            onSelect={onSelect}
            depth={depth + 1}
          />
        )}
      </li>
    );
  }

  const isMd = /\.(md|markdown|mdx)$/i.test(node.name);
  const isActive = activePath === node.path;
  return (
    <li className="tree-item tree-file">
      <div
        className={`tree-row ${isActive ? 'is-active' : ''} ${
          isMd ? '' : 'is-disabled'
        }`}
        style={{ paddingLeft: depth * 12 + 20 }}
        onClick={() => isMd && onSelect(node)}
        title={isMd ? node.path : 'Only markdown files are editable'}
      >
        <span className="tree-name">{node.name}</span>
      </div>
    </li>
  );
}
