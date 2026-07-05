import { useState } from "react";
import { useTranslation } from "react-i18next";
import { animations } from "./icons";
import type { Attachment } from "../../../lib/types";
import { FileText, Image, X, Eye } from "lucide-react";

export interface AttachmentStripProps {
  items: Attachment[];
  onRemove: (id: string) => void;
  onPreview?: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  return FileText;
}

export function AttachmentStrip({ items, onRemove, onPreview }: AttachmentStripProps) {
  const { t } = useTranslation("chat-input");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2" role="list">
      {items.map((a) => {
        const isImage = a.mimeType.startsWith("image/");
        const isHovered = hoveredId === a.id;
        const FileIcon = getFileIcon(a.mimeType);

        return (
          <div
            key={a.id}
            role="listitem"
            className={`group relative rounded-lg border border-border bg-surface-2 overflow-hidden transition-all ${animations.attachmentEnter} ${isHovered ? "ring-1 ring-accent/50" : ""}`}
            style={{ width: isHovered ? "10rem" : "4rem", height: isHovered ? "6rem" : "4rem" }}
            onMouseEnter={() => setHoveredId(a.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {isImage ? (
              <img src={a.dataUrl} alt={a.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-surface-3/50">
                <FileIcon className="w-6 h-6 text-gray-400" />
                <span className="text-[8px] text-gray-500 mt-1 truncate max-w-full px-1">
                  {a.mimeType.split("/").pop()?.toUpperCase()}
                </span>
              </div>
            )}

            {/* Expanded preview on hover */}
            {isHovered && (
              <div className="absolute inset-0 bg-surface-1/95 p-2 flex flex-col">
                <div className="text-[10px] text-gray-200 truncate font-medium">{a.name}</div>
                <div className="text-[9px] text-gray-500 mt-0.5">{formatBytes(a.sizeBytes)}</div>
                {onPreview && (
                  <button
                    type="button"
                    onClick={() => onPreview(a.id)}
                    className="mt-auto flex items-center justify-center gap-1 text-[9px] text-accent hover:text-accent/80 transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    Preview
                  </button>
                )}
              </div>
            )}

            {/* Remove button */}
            <button
              type="button"
              aria-label={t("attachments.remove", "Remove")}
              onClick={() => onRemove(a.id)}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
