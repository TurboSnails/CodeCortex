import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import type { ReviewResult } from "../lib/types";
import { MarkdownContent } from "./conversation/MarkdownContent";

interface Props {
  sessionId: string;
  onCountChange?: (n: number) => void;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ReviewsTab({ sessionId, onCountChange }: Props) {
  const [reviews, setReviews] = useState<ReviewResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.review
      .getHistory(sessionId)
      .then(({ reviews: data }) => {
        setReviews(data);
      })
      .catch(() => {
        setReviews([]);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    onCountChange?.(reviews.length);
  }, [reviews.length, onCountChange]);

  useEffect(() => {
    return eventBus.subscribe((msg) => {
      if (msg.type !== "review_ready") return;
      const d = msg.data as {
        sessionId: string;
        id: number;
        model: string;
        review: string;
        createdAt: string;
      };
      if (d.sessionId !== sessionId) return;
      const newReview: ReviewResult = {
        id: d.id,
        model: d.model,
        review: d.review,
        createdAt: d.createdAt ?? new Date().toISOString(),
      };
      setReviews((prev) => [newReview, ...prev]);
    });
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
        加载审核记录…
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-sm gap-2">
        <History className="w-8 h-8 text-slate-700" />
        <span>暂无审核记录</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-2">
      {reviews.map((r) => (
        <div
          key={r.id}
          className="rounded-lg border border-slate-700 bg-slate-900/60 overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
            className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-mono text-slate-400 shrink-0">
                {formatTime(r.createdAt)}
              </span>
              <span className="text-sm font-medium text-indigo-300 truncate">
                {r.model}
              </span>
            </div>
            <span className="text-slate-600 text-xs ml-2">
              {expandedId === r.id ? "▲" : "▼"}
            </span>
          </button>

          {expandedId === r.id && (
            <div className="px-4 pb-4 border-t border-slate-700/50">
              <div className="pt-3 text-sm text-slate-300">
                <MarkdownContent text={r.review} dense />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}