import { useCallback, useState } from "react";
import type { Attachment, SendPayload } from "../../lib/types";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_COUNT = 8;

export interface AttachmentsApi {
  items: Attachment[];
  onPaste: (e: ClipboardEvent | React.ClipboardEvent) => void;
  onDrop: (e: DragEvent | React.DragEvent) => void;
  onPick: (files: FileList | File[] | null) => void;
  remove: (id: string) => void;
  clear: () => void;
  buildPayload: (text: string) => SendPayload;
}

export interface UseAttachmentsOptions {
  onError?: (message: string) => void;
}

function filesToArray(input: FileList | File[] | null | undefined): File[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return Array.from(input as FileList);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function useAttachments(options: UseAttachmentsOptions = {}): AttachmentsApi {
  const [items, setItems] = useState<Attachment[]>([]);
  const onError = options.onError;

  const accept = useCallback(
    async (files: File[]) => {
      const next: Attachment[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > MAX_BYTES) {
          onError?.("Max 5MiB per image");
          continue;
        }
        if (items.length + next.length >= MAX_COUNT) {
          onError?.("Max 8 images per message");
          break;
        }
        try {
          const dataUrl = await readAsDataUrl(file);
          next.push({
            id: crypto.randomUUID(),
            kind: "image",
            dataUrl,
            mimeType: file.type,
            name: file.name,
            sizeBytes: file.size,
          });
        } catch {
          onError?.("Failed to read file");
        }
      }
      if (next.length) setItems((prev) => [...prev, ...next]);
    },
    [items.length, onError]
  );

  const onPaste = useCallback(
    (e: ClipboardEvent | React.ClipboardEvent) => {
      const files = filesToArray((e as ClipboardEvent).clipboardData?.files as FileList | undefined);
      if (files.length === 0) return;
      e.preventDefault?.();
      void accept(files);
    },
    [accept]
  );

  const onDrop = useCallback(
    (e: DragEvent | React.DragEvent) => {
      e.preventDefault?.();
      const files = filesToArray((e as DragEvent).dataTransfer?.files as FileList | undefined);
      void accept(files);
    },
    [accept]
  );

  const onPick = useCallback((files: FileList | File[] | null) => void accept(filesToArray(files)), [accept]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const buildPayload = useCallback(
    (text: string): SendPayload => {
      const payload: SendPayload = { text: text.trim(), attachments: items };
      setItems([]);
      return payload;
    },
    [items]
  );

  return { items, onPaste, onDrop, onPick, remove, clear, buildPayload };
}
