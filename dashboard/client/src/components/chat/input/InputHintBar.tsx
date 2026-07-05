import { useTranslation } from "react-i18next";
import { ShortcutDropdown } from "./ShortcutDropdown";

export function InputHintBar() {
  const { t } = useTranslation("chat-input");
  return (
    <div className="px-3 py-1.5 text-[10px] text-gray-500 flex items-center gap-3 whitespace-nowrap overflow-x-auto no-scrollbar">
      <span className="flex items-center gap-1 shrink-0">
        <kbd className="kbd">⏎</kbd>
        <span>{t("hint.send", "Send")}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <kbd className="kbd">⇧⏎</kbd>
        <span className="hidden sm:inline">{t("hint.newline", "Newline")}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <kbd className="kbd">/</kbd>
        <span className="hidden md:inline">{t("hint.commands", "Commands")}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <kbd className="kbd">@</kbd>
        <span className="hidden md:inline">{t("hint.files", "Files")}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <kbd className="kbd">↑↓</kbd>
        <span className="hidden sm:inline">{t("hint.recall", "Recall")}</span>
      </span>
      <span className="ml-auto shrink-0">
        <ShortcutDropdown />
      </span>
    </div>
  );
}
