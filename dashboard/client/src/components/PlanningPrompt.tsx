import { useState } from "react";
import { ClipboardList } from "lucide-react";
import type { Session } from "../lib/types";

interface Props {
  session: Session;
  onSkip: () => void;
  onPlan: (description: string) => void;
  submitting?: boolean;
}

export function PlanningPrompt({ session, onSkip, onPlan, submitting = false }: Props) {
  const [description, setDescription] = useState("");

  const sessionLabel = session.name || session.id;

  function handlePlan() {
    const trimmed = description.trim();
    if (!trimmed) return;
    onPlan(trimmed);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
      <div className="flex items-center gap-3 border-b border-slate-700 px-4 py-3">
        <ClipboardList className="h-4 w-4 text-indigo-400 shrink-0" />
        <p className="text-sm font-medium text-slate-100 truncate">
          New session: <span className="text-indigo-400">{sessionLabel}</span>
        </p>
      </div>

      <div className="px-4 py-3">
        <p className="text-xs text-slate-400 mb-2">
          Want to plan this task? Describe what you want to accomplish (or skip to start freely).
        </p>
        <textarea
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          rows={3}
          placeholder="e.g. 1. Add auth module  2. Write tests  3. Deploy"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className="flex justify-end gap-2 px-4 pb-4">
        <button
          onClick={onSkip}
          disabled={submitting}
          className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:text-slate-100 transition-colors disabled:opacity-50"
        >
          Skip
        </button>
        <button
          onClick={handlePlan}
          disabled={submitting || !description.trim()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          {submitting ? "Planning…" : "Plan it"}
        </button>
      </div>
    </div>
  );
}
