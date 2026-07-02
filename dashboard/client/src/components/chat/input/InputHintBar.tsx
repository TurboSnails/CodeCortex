import { useTranslation } from "react-i18next";

export function InputHintBar() {
  const { t } = useTranslation("chat-input");
  return (
    <div className="px-3 py-1 text-[10px] text-gray-500 whitespace-normal md:whitespace-nowrap">
      <span>{t("hint.send")}</span>{" "}
      <kbd className="kbd">⏎</kbd>{" "}
      <span>· {t("hint.newline")}</span>{" "}
      <kbd className="kbd">⇧⏎</kbd>{" "}
      <span>· {t("hint.forceSend")}</span>{" "}
      <kbd className="kbd">⌘⏎</kbd>{" "}
      <span>· {t("hint.commands")}</span>{" "}
      <kbd className="kbd">/</kbd>{" "}
      <span>· {t("hint.files")}</span>{" "}
      <kbd className="kbd">@</kbd>{" "}
      <span>· {t("hint.recall")}</span>{" "}
      <kbd className="kbd">↑↓</kbd>
    </div>
  );
}
