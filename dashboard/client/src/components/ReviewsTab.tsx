import { useEffect, useState, useRef, useCallback } from "react";
import { History } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import type { ReviewReadyPayload, ReviewResult } from "../lib/types";
import { MarkdownContent } from "./conversation/MarkdownContent";

interface Props {
  sessionId: string;
  onCountChange?: (n: number) => void;
}

const PAGE_SIZE = 20;

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const lastEmittedCount = useRef<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    offsetRef.current = reviews.length;
  }, [reviews.length]);

  const emitCountIfChanged = useCallback(
    (n: number) => {
      if (lastEmittedCount.current !== n) {
        lastEmittedCount.current = n;
        onCountChange?.(n);
      }
    },
    [onCountChange],
  );

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      try {
        const {
          reviews: data,
          total: t,
          hasMore: more,
        } = await api.review.getHistory(sessionId, {
          offset,
          limit: PAGE_SIZE,
        });
        setTotal(t);
        setHasMore(more);
        setReviews((prev) => {
          const next = append
            ? [...prev, ...data.filter((r) => !prev.some((p) => p.id === r.id))]
            : data;
          emitCountIfChanged(t);
          return next;
        });
      } catch {
        if (!append) {
          setReviews([]);
          setHasMore(false);
        }
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [sessionId, emitCountIfChanged],
  );

  // Initial load
  useEffect(() => {
    setLoading(true);
    setReviews([]);
    setHasMore(false);
    lastEmittedCount.current = null;
    loadPage(0, false);
  }, [sessionId, loadPage]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || loading || loadingMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setLoadingMore(true);
          loadPage(offsetRef.current, true);
        }
      },
      { rootMargin: "100px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, loadPage]);

  useEffect(() => {
    return eventBus.subscribe((msg) => {
      if (msg.type !== "review_ready") return;
      const d = msg.data as ReviewReadyPayload;
      if (d.sessionId !== sessionId) return;
      const newReview: ReviewResult = {
        id: d.id,
        model: d.model,
        review: d.review,
        createdAt: d.createdAt ?? new Date().toISOString(),
      };
      setReviews((prev) => {
        if (prev.some((r) => r.id === newReview.id)) return prev;
        const next = [newReview, ...prev];
        setTotal((t) => {
          const updated = t + 1;
          emitCountIfChanged(updated);
          return updated;
        });
        return next;
      });
    });
  }, [sessionId, emitCountIfChanged]);

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

      <div ref={sentinelRef} className="h-1" aria-hidden="true" />

      {loadingMore && (
        <div className="flex items-center justify-center py-3 text-slate-500 text-xs">
          加载更多…
        </div>
      )}

      {!hasMore && reviews.length > 0 && (
        <div className="text-center py-3 text-slate-600 text-xs">
          已加载全部 {total} 条
        </div>
      )}
    </div>
  );
}
