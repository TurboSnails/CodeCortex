import { useTranslation } from "react-i18next";
import { animations, icons } from "./icons";
import type { Attachment } from "../../../lib/types";

export interface AttachmentStripProps {
  items: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentStrip({ items, onRemove }: AttachmentStripProps) {
  const { t } = useTranslation("chat-input");
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2" role="list">
      {items.map((a) => (
        <div
          key={a.id}
          role="listitem"
          className={`group relative w-14 h-14 rounded-md border border-border bg-surface-2 overflow-hidden ${animations.attachmentEnter}`}
        >
          <img src={a.dataUrl} alt={a.name} className="w-full h-full object-cover" />
          <button
            type="button"
            aria-label={t("attachments.remove", "Remove image")}
            onClick={() => onRemove(a.id)}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <icons.close className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
