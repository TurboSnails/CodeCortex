import { X, Bot, Loader2 } from "lucide-react";
import type { ReviewResult } from "../lib/types";

interface Props {
  result: ReviewResult | null;
  onClose: () => void;
  loading?: boolean;
}

export function ReviewPanel({ result, onClose, loading = false }: Props) {
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[480px] max-h-[60vh] flex flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-medium text-slate-100">Code Review</span>
          {result && (
            <span className="text-xs text-slate-500 font-mono">{result.model}</span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-slate-500 hover:text-slate-100 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400" data-testid="review-loading">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Reviewing changes…</span>
          </div>
        ) : result ? (
          <pre className="whitespace-pre-wrap text-sm text-slate-300 font-sans leading-relaxed">
            {result.review}
          </pre>
        ) : (
          <p className="text-sm text-slate-500">No review result.</p>
        )}
      </div>
    </div>
  );
}
