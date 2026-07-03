/**
 * @file FileTree.tsx
 * @description Recursive file tree for the Explorer panel in the IDE-style /chat
 * page. Supports expand/collapse, selection, and drag-to-input.
 */

import { Folder, FileCode, ChevronRight, ChevronDown } from "lucide-react";
import type { FileTreeNode } from "../../lib/api";

interface FileTreeProps {
  nodes: FileTreeNode[];
  expandedPaths: Set<string>;
  selectedPath: string | null;
  highlightedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string, type: "file" | "directory") => void;
}

function TreeNode({
  node,
  expanded,
  selected,
  highlighted,
  expandedPaths,
  selectedPath,
  highlightedPaths,
  onToggle,
  onSelect,
}: {
  node: FileTreeNode;
  expanded: boolean;
  selected: boolean;
  highlighted: boolean;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  highlightedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string, type: "file" | "directory") => void;
}) {
  const isDir = node.type === "directory";
  const hasChildren = isDir && (node.children?.length ?? 0) > 0;

  const handleClick = () => {
    if (isDir) {
      // Expand/collapse is owned by the parent's toggle handler; do not
      // also call onSelect (the parent would toggle again and the net
      // effect is a no-op). For files, forward to onSelect.
      onToggle(node.path);
      return;
    }
    onSelect(node.path, node.type);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (isDir) return;
    e.dataTransfer.setData("text/plain", node.path);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="select-none">
      <button
        type="button"
        draggable={!isDir}
        onDragStart={handleDragStart}
        onClick={handleClick}
        className={`w-full flex items-center gap-1.5 px-2 py-0.5 text-[13px] transition-colors ${
          selected
            ? "bg-accent/15 text-accent"
            : highlighted
              ? "bg-amber-500/10 text-amber-200"
              : "text-gray-300 hover:bg-surface-2"
        }`}
      >
        <span className="w-3.5 h-3.5 inline-flex items-center justify-center">
          {isDir && hasChildren ? (
            expanded ? (
              <ChevronDown className="w-3 h-3 text-gray-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-gray-500" />
            )
          ) : (
            <span className="w-3 h-3" />
          )}
        </span>
        {isDir ? (
          <Folder className="w-3.5 h-3.5 text-sky-400/80 flex-shrink-0" />
        ) : (
          <FileCode className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && expanded && node.children && (
        <div className="pl-4">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              expanded={expandedPaths.has(child.path)}
              selected={selectedPath === child.path}
              highlighted={highlightedPaths.has(child.path)}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              highlightedPaths={highlightedPaths}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  nodes,
  expandedPaths,
  selectedPath,
  highlightedPaths,
  onToggle,
  onSelect,
}: FileTreeProps) {
  return (
    <div className="py-1">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          expanded={expandedPaths.has(node.path)}
          selected={selectedPath === node.path}
          highlighted={highlightedPaths.has(node.path)}
          expandedPaths={expandedPaths}
          selectedPath={selectedPath}
          highlightedPaths={highlightedPaths}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
