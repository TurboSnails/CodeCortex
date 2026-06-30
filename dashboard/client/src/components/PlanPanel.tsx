import { ClipboardCheck, CheckSquare, Square } from "lucide-react";
import type { SessionPlan } from "../lib/types";

interface Props {
  plan: SessionPlan;
  onToggle: (taskIndex: number, done: boolean) => void;
}

export function PlanPanel({ plan, onToggle }: Props) {
  const done = plan.tasks.filter((t) => t.done).length;
  const total = plan.tasks.length;

  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <ClipboardCheck className="w-3.5 h-3.5 text-indigo-400" />
        Plan
        <span className="text-gray-600 font-mono">
          · {done}/{total}
        </span>
      </h3>

      <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 space-y-2">
        {plan.tasks.map((task, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(i, !task.done)}
            className="flex items-start gap-2 w-full text-left group"
          >
            {task.done ? (
              <CheckSquare className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-slate-600 mt-0.5 shrink-0 group-hover:text-slate-400 transition-colors" />
            )}
            <span
              className={`text-sm ${task.done ? "line-through text-slate-500" : "text-slate-300 group-hover:text-slate-100"} transition-colors`}
            >
              {task.text}
            </span>
          </button>
        ))}
        {plan.tasks.length === 0 && (
          <p className="text-sm text-slate-500">No tasks yet.</p>
        )}
      </div>

      {total > 0 && (
        <div className="mt-1.5 h-1 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
