import { useState } from 'react';
import { fileKindFromName, type FileNode } from '../types';

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

  const kind = fileKindFromName(node.name);
  const supported = kind !== 'unsupported';
  const isActive = activePath === node.path;
  return (
    <li className="tree-item tree-file">
      <div
        className={`tree-row ${isActive ? 'is-active' : ''} ${
          supported ? '' : 'is-disabled'
        }`}
        style={{ paddingLeft: depth * 12 + 20 }}
        onClick={() => supported && onSelect(node)}
        title={supported ? node.path : 'Unsupported file type'}
      >
        <span className="tree-name">{node.name}</span>
      </div>
    </li>
  );
}
