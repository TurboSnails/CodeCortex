import { useState } from "react";
import { ShieldCheck, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../lib/api";
import { MarkdownContent } from "./conversation/MarkdownContent";
import type { ReviewResult } from "../lib/types";

interface Props {
  sessionId: string;
}

export function ReviewTrigger({ sessionId }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function trigger() {
    setLoading(true);
    setResult(null);
    setExpanded(true);
    try {
      const res = await api.review.trigger(sessionId);
      setResult({ id: 0, model: res.model, review: res.review, createdAt: new Date().toISOString() });
    } catch {
      setResult({ id: 0, model: "error", review: "Review failed. Check that your API key is configured in Settings → Review.", createdAt: new Date().toISOString() });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          Code Review
        </h3>
        <button
          onClick={trigger}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600/20 border border-indigo-500/30 px-2.5 py-1 text-xs text-indigo-400 hover:bg-indigo-600/30 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
          {loading ? "Reviewing…" : "Review diff"}
        </button>
      </div>

      {(loading || result) && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/60">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center justify-between w-full px-4 py-2.5 text-left"
          >
            <span className="text-xs text-slate-400 font-mono">{result?.model ?? "…"}</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
          </button>
          {expanded && (
            <div className="px-4 pb-3">
              {loading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Fetching diff and calling review model…</span>
                </div>
              ) : result?.review ? (
                <MarkdownContent text={result.review} dense />
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
