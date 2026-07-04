import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { History, X, MessageSquare } from "lucide-react";
import { api } from "../../lib/api";
import type { Session } from "../../lib/types";

interface SessionHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
}

export function SessionHistoryDialog({ open, onClose, onSelect }: SessionHistoryDialogProps) {
  const { t } = useTranslation("sessions");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.sessions
      .list({ limit: 20 })
      .then((res) => setSessions(res.sessions))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal?.();
    } else {
      if (typeof dialogRef.current?.close === "function") {
        dialogRef.current.close();
      }
    }
  }, [open]);

  const handleSelect = (sessionId: string) => {
    onSelect(sessionId);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="rounded-xl border border-border bg-surface-1 shadow-xl shadow-black/50 p-0 m-auto"
      style={{ maxWidth: "28rem", width: "90vw", maxHeight: "80vh" }}
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <span className="text-sm font-medium text-gray-200 flex items-center gap-2">
          <History className="w-4 h-4" />
          {t("history", "Session History")}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-auto" style={{ maxHeight: "calc(80vh - 3rem)" }}>
        {loading ? (
          <div className="p-4 text-sm text-gray-500 text-center">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">No sessions found</div>
        ) : (
          <ul className="py-1">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(session.id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-surface-2 transition-colors flex items-start gap-3"
                >
                  <MessageSquare className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 truncate">
                      {session.name || t("untitled", "Untitled Session")}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {session.last_activity
                        ? new Date(session.last_activity).toLocaleString()
                        : new Date(session.started_at).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      session.status === "completed"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : session.status === "error"
                          ? "bg-red-500/15 text-red-300"
                          : session.status === "active"
                            ? "bg-blue-500/15 text-blue-300"
                            : "bg-gray-500/15 text-gray-400"
                    }`}
                  >
                    {session.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
