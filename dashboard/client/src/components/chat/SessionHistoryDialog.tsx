import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { History, X, MessageSquare, Search, Filter, ArrowUpDown, Clock, Zap } from "lucide-react";
import { api } from "../../lib/api";
import type { Session, SessionStatus } from "../../lib/types";

interface SessionHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
}

type SortOption = "lastActivity" | "name" | "status" | "duration";
type FilterStatus = "all" | SessionStatus;

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diffMs = end - start;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m`;
  return "<1m";
}

const STATUS_COLORS: Record<SessionStatus, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-blue-500/15", text: "text-blue-300", label: "Active" },
  completed: { bg: "bg-emerald-500/15", text: "text-emerald-300", label: "Completed" },
  error: { bg: "bg-red-500/15", text: "text-red-300", label: "Error" },
  abandoned: { bg: "bg-gray-500/15", text: "text-gray-400", label: "Abandoned" },
};

export function SessionHistoryDialog({ open, onClose, onSelect }: SessionHistoryDialogProps) {
  const { t } = useTranslation("sessions");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<SortOption>("lastActivity");
  const [sortAsc, setSortAsc] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.sessions
      .list({ limit: 50 })
      .then((res) => setSessions(res.sessions))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal?.();
      // Focus search on open
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      if (typeof dialogRef.current?.close === "function") {
        dialogRef.current.close();
      }
      // Reset state on close
      setSearchQuery("");
      setFilterStatus("all");
    }
  }, [open]);

  const filteredAndSortedSessions = useMemo(() => {
    let result = [...sessions];

    // Filter by status
    if (filterStatus !== "all") {
      result = result.filter((s) => s.status === filterStatus);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.cwd?.toLowerCase().includes(q) ||
          s.model?.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "lastActivity":
          cmp = new Date(b.last_activity || b.started_at).getTime() - new Date(a.last_activity || a.started_at).getTime();
          break;
        case "name":
          cmp = (a.name || "").localeCompare(b.name || "");
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "duration":
          cmp = new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [sessions, searchQuery, filterStatus, sortBy, sortAsc]);

  const handleSelect = (sessionId: string) => {
    onSelect(sessionId);
    onClose();
  };

  const handleSortChange = (newSort: SortOption) => {
    if (sortBy === newSort) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(newSort);
      setSortAsc(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="rounded-xl border border-border bg-surface-1 shadow-xl shadow-black/50 p-0 m-auto"
      style={{ maxWidth: "36rem", width: "90vw", maxHeight: "85vh" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-200 flex items-center gap-2">
            <History className="w-4 h-4" />
            {t("history", "Session History")}
            <span className="text-[10px] text-gray-500 font-normal ml-1">
              ({filteredAndSortedSessions.length} sessions)
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions by name, path, or model..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-2 border border-border rounded-lg text-gray-200 placeholder-gray-500 outline-none focus:border-accent/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Filters and Sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3 text-gray-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="text-[10px] bg-surface-2 border border-border rounded px-1.5 py-1 text-gray-300 outline-none focus:border-accent/50"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="error">Error</option>
              <option value="abandoned">Abandoned</option>
            </select>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <ArrowUpDown className="w-3 h-3 text-gray-500" />
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as SortOption)}
              className="text-[10px] bg-surface-2 border border-border rounded px-1.5 py-1 text-gray-300 outline-none focus:border-accent/50"
            >
              <option value="lastActivity">Last Activity</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="duration">Duration</option>
            </select>
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              className={`p-1 rounded hover:bg-surface-3 transition-colors ${sortAsc ? "text-accent" : "text-gray-500"}`}
              title={sortAsc ? "Ascending" : "Descending"}
            >
              <ArrowUpDown className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Session List */}
      <div className="overflow-auto" style={{ maxHeight: "calc(85vh - 7.5rem)" }}>
        {loading ? (
          <div className="p-8 text-sm text-gray-500 text-center">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin m-auto mb-2" />
            Loading sessions...
          </div>
        ) : filteredAndSortedSessions.length === 0 ? (
          <div className="p-8 text-sm text-gray-500 text-center">
            {sessions.length === 0 ? (
              <>
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <div>No sessions found</div>
                <div className="text-[10px] text-gray-600 mt-1">Start a new chat to create your first session</div>
              </>
            ) : (
              <>
                <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <div>No matching sessions</div>
                <div className="text-[10px] text-gray-600 mt-1">Try adjusting your search or filters</div>
              </>
            )}
          </div>
        ) : (
          <ul className="py-1">
            {filteredAndSortedSessions.map((session) => {
              const statusStyle = STATUS_COLORS[session.status] || STATUS_COLORS.completed;
              const timeDisplay = session.last_activity || session.started_at;
              const duration = formatDuration(session.started_at, session.ended_at);

              return (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(session.id)}
                    className="w-full text-left px-4 py-3 hover:bg-surface-2/70 transition-colors group flex items-start gap-3 border-b border-border/50 last:border-b-0"
                  >
                    <div className="mt-0.5">
                      <MessageSquare className="w-4 h-4 text-gray-500 group-hover:text-gray-400 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-200 truncate font-medium">
                          {session.name || t("untitled", "Untitled Session")}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text}`}>
                          {statusStyle.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(timeDisplay)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {duration}
                        </span>
                        {session.model && (
                          <span className="text-gray-600 truncate max-w-[8rem]" title={session.model}>
                            {session.model.split("/").pop()}
                          </span>
                        )}
                      </div>
                      {session.cwd && (
                        <div className="text-[10px] text-gray-600 mt-0.5 truncate font-mono">
                          {session.cwd}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </dialog>
  );
}
