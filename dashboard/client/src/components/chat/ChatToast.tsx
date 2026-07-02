/**
 * @file ChatToast.tsx
 * @description Transient toast notifications for the IDE-style /chat workspace.
 * Watches the workspace problem list and surfaces the most recent problem as a
 * short-lived toast in the bottom-right corner.
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, X } from "lucide-react";
import { useChatWorkspace } from "./ChatWorkspaceContext";

interface Toast {
  id: string;
  kind: "error" | "success";
  message: string;
}

const TOAST_TTL_MS = 5000;

export function ChatToastContainer() {
  const { state } = useChatWorkspace();
  const [toast, setToast] = useState<Toast | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const latest = state.problems[0];
    if (!latest) return;
    if (seenRef.current.has(latest.id)) return;
    seenRef.current.add(latest.id);

    const next: Toast = {
      id: latest.id,
      kind: latest.source === "git" ? "error" : "error",
      message: latest.message,
    };
    setToast(next);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), TOAST_TTL_MS);
  }, [state.problems]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!toast) return null;

  const isErr = toast.kind === "error";
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md pointer-events-none">
      <div
        className={`pointer-events-auto rounded-lg border px-3 py-2 shadow-lg flex items-start gap-2 ${
          isErr
            ? "border-red-500/50 bg-red-500/15 text-red-100"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
        }`}
      >
        {isErr ? (
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        ) : (
          <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
        )}
        <span className="text-xs leading-relaxed flex-1 break-all">{toast.message}</span>
        <button
          type="button"
          onClick={() => setToast(null)}
          className="text-current/70 hover:text-current p-0.5"
          aria-label="dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
