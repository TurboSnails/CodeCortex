import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, Search, FolderOpen, GitBranch, PanelBottom, Focus, Square } from "lucide-react";

interface ShortcutGroup {
  title?: string;
  items: { label: string; keys: string[]; icon?: React.ReactNode }[];
}

const inputShortcuts: ShortcutGroup = {
  title: "Input",
  items: [
    { label: "Send message", keys: ["↵"] },
    { label: "New line", keys: ["⇧", "↵"] },
    { label: "Force send", keys: ["⌘", "↵"] },
    { label: "Command palette", keys: ["/"] },
    { label: "Reference file", keys: ["@"] },
    { label: "Recall history", keys: ["↑"] },
    { label: "Next suggestion", keys: ["↓"] },
    { label: "Select suggestion", keys: ["Tab"] },
    { label: "Close autocomplete", keys: ["Esc"] },
  ],
};

const ideShortcuts: ShortcutGroup = {
  title: "IDE Navigation",
  items: [
    { label: "Toggle sidebar", keys: ["⌘", "B"], icon: <FolderOpen className="w-3 h-3" /> },
    { label: "Explorer", keys: ["⌘", "⇧", "E"], icon: <Search className="w-3 h-3" /> },
    { label: "Git panel", keys: ["⌘", "⇧", "G"], icon: <GitBranch className="w-3 h-3" /> },
    { label: "Toggle terminal", keys: ["⌘", "J"], icon: <PanelBottom className="w-3 h-3" /> },
    { label: "Focus mode", keys: ["⌘", "⇧", "F"], icon: <Focus className="w-3 h-3" /> },
    { label: "Stop run", keys: ["Esc"] },
  ],
};

export function ShortcutDropdown() {
  const { t } = useTranslation("chat-input");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const open = () => dialogRef.current?.show();
  const close = () => dialogRef.current?.close();

  const renderShortcutGroup = (group: ShortcutGroup) => (
    <div>
      {group.title && (
        <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 border-b border-border/50">
          {group.title}
        </div>
      )}
      <ul className="py-1">
        {group.items.map((s) => (
          <li
            key={s.label}
            className="flex items-center justify-between px-4 py-2 hover:bg-surface-2/70 transition-colors group"
          >
            <span className="flex items-center gap-2 text-sm text-gray-300">
              {s.icon && <span className="text-gray-500 group-hover:text-gray-400">{s.icon}</span>}
              {s.label}
            </span>
            <span className="flex items-center gap-1">
              {s.keys.map((k, i) => (
                <kbd
                  key={i}
                  className="px-1.5 py-0.5 rounded bg-surface-3 text-[10px] font-mono text-gray-400 border border-border/50"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Keyboard shortcuts"
        className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
        title="Keyboard shortcuts"
      >
        <Keyboard className="w-4 h-4" />
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="rounded-xl border border-border bg-surface-1 shadow-xl shadow-black/50 p-0 m-auto"
        style={{ maxWidth: "26rem", width: "90vw" }}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium text-gray-200 flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-gray-400" />
            {t("hint.title", "Keyboard Shortcuts")}
          </span>
          <button
            type="button"
            onClick={close}
            className="text-xs text-gray-500 hover:text-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {renderShortcutGroup(inputShortcuts)}
          {renderShortcutGroup(ideShortcuts)}
        </div>
        <div className="px-4 py-2 border-t border-border/50 text-[10px] text-gray-600 text-center">
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-surface-3 text-[9px]">⌘</kbd>
            <span>= Cmd on Mac, Ctrl on Windows</span>
          </span>
        </div>
      </dialog>
    </>
  );
}
