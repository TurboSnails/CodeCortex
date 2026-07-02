/**
 * @file ActivityBar.tsx
 * @description Vertical icon bar on the far left of the IDE-style /chat page.
 * Switches the left sidebar between Explorer, Git, and Settings views.
 */

import { FolderTree, GitBranch, Settings } from "lucide-react";
import type { LeftSidebarView } from "./ChatWorkspaceContext";

interface ActivityBarProps {
  active: LeftSidebarView;
  onChange: (view: LeftSidebarView) => void;
}

const ITEMS: { view: LeftSidebarView; icon: typeof FolderTree; label: string }[] = [
  { view: "explorer", icon: FolderTree, label: "Explorer" },
  { view: "git", icon: GitBranch, label: "Source Control" },
  { view: "settings", icon: Settings, label: "Settings" },
];

export function ActivityBar({ active, onChange }: ActivityBarProps) {
  return (
    <div className="w-12 flex flex-col items-center py-2 border-r border-border bg-surface-1 flex-shrink-0">
      {ITEMS.map(({ view, icon: Icon, label }) => {
        const isActive = active === view;
        return (
          <button
            key={view}
            type="button"
            onClick={() => onChange(view)}
            title={label}
            className={`relative w-9 h-9 rounded-md flex items-center justify-center mb-1 transition-colors ${
              isActive
                ? "bg-accent/15 text-accent"
                : "text-gray-500 hover:text-gray-300 hover:bg-surface-2"
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-accent rounded-r" />
            )}
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
