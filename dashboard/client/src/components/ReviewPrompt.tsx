import { ShieldCheck } from "lucide-react";

interface Props {
  sessionId: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ReviewPrompt({ sessionId, onConfirm, onDismiss }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-indigo-400 shrink-0" />
          <p className="text-sm font-medium text-slate-100">Review this session?</p>
        </div>

        <div className="px-4 py-3">
          <p className="text-xs text-slate-400">
            Session <span className="font-mono text-slate-300">{sessionId}</span> has finished a
            turn. Run multi-model code review on the current diff?
          </p>
        </div>

        <div className="flex justify-end gap-2 px-4 pb-4">
          <button
            onClick={onDismiss}
            className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:text-slate-100 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            Yes, Review
          </button>
        </div>
      </div>
    </div>
  );
}
