import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard } from "lucide-react";

const shortcuts = [
  { label: "Send", keys: ["⏎"] },
  { label: "Newline", keys: ["⇧", "⏎"] },
  { label: "Force send", keys: ["⌘", "⏎"] },
  { label: "Commands", keys: ["/"] },
  { label: "Files", keys: ["@"] },
  { label: "Recall history", keys: ["↑", "↓"] },
];

export function ShortcutDropdown() {
  const { t } = useTranslation("chat-input");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const open = () => dialogRef.current?.show();
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Keyboard shortcuts"
        className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors"
      >
        <Keyboard className="w-4 h-4" />
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="rounded-xl border border-border bg-surface-1 shadow-xl shadow-black/50 p-0 m-auto"
        style={{ maxWidth: "20rem", width: "90vw" }}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium text-gray-200">{t("hint.title", "Keyboard Shortcuts")}</span>
          <button
            type="button"
            onClick={close}
            className="text-xs text-gray-500 hover:text-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>
        <ul className="py-2">
          {shortcuts.map((s) => (
            <li key={s.label} className="flex items-center justify-between px-4 py-1.5 hover:bg-surface-2">
              <span className="text-sm text-gray-300">{s.label}</span>
              <span className="flex items-center gap-0.5">
                {s.keys.map((k, i) => (
                  <kbd key={i} className="kbd text-[10px]">{k}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
