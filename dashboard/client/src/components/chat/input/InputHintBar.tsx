import { useTranslation } from "react-i18next";

export function InputHintBar() {
  const { t } = useTranslation("chat-input");
  return (
    <div className="px-3 py-1 text-[10px] text-gray-500 whitespace-normal md:whitespace-nowrap">
      <span>{t("hint.send", "Send")}</span>{" "}
      <kbd className="kbd">⏎</kbd>{" "}
      <span>· {t("hint.newline", "Newline")}</span>{" "}
      <kbd className="kbd">⇧⏎</kbd>{" "}
      <span>· {t("hint.forceSend", "Force send")}</span>{" "}
      <kbd className="kbd">⌘⏎</kbd>{" "}
      <span>· {t("hint.commands", "Commands")}</span>{" "}
      <kbd className="kbd">/</kbd>{" "}
      <span>· {t("hint.files", "Files")}</span>{" "}
      <kbd className="kbd">@</kbd>{" "}
      <span>· {t("hint.recall", "Recall history")}</span>{" "}
      <kbd className="kbd">↑↓</kbd>
    </div>
  );
}
