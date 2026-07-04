/**
 * @file ConfirmDialog.tsx
 * @description Shared themed confirmation modal, replacing native window.confirm()
 * for actions that discard in-progress work (mode switch, new session).
 */

import { useEffect, useRef } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal?.();
    } else if (typeof dialogRef.current?.close === "function") {
      dialogRef.current.close();
    }
  }, [open]);

  if (!open) {
    return <dialog ref={dialogRef} />;
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        if (e.target === dialogRef.current) onCancel();
      }}
      onCancel={() => onCancel()}
      className="rounded-xl border border-border bg-surface-1 shadow-xl shadow-black/50 p-0 m-auto"
      style={{ maxWidth: "24rem", width: "90vw" }}
    >
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-gray-200">{title}</span>
      </div>
      <div className="px-4 py-3 text-sm text-gray-300">{message}</div>
      <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-gray-300 border border-border hover:bg-surface-3 hover:text-gray-100 transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            destructive
              ? "bg-red-600 text-white hover:bg-red-500"
              : "bg-indigo-600 text-white hover:bg-indigo-500"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
