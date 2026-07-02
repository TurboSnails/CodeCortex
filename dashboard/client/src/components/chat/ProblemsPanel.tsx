/**
 * @file ProblemsPanel.tsx
 * @description Bottom panel tab that aggregates async errors and problems from
 * the IDE-style /chat workspace (file loading, Git operations, etc.).
 */

import { AlertCircle, X, Trash2 } from "lucide-react";
import { useChatWorkspace, useChatWorkspaceActions } from "./ChatWorkspaceContext";

export function ProblemsPanel() {
  const { state } = useChatWorkspace();
  const actions = useChatWorkspaceActions();
  const problems = state.problems;

  return (
    <div className="h-full flex flex-col bg-surface-1">
      <div className="flex-1 min-h-0 overflow-auto p-2">
        {problems.length === 0 ? (
          <div className="text-gray-500 italic text-xs">No problems detected.</div>
        ) : (
          <div className="space-y-1">
            {problems.map((problem) => (
              <div
                key={problem.id}
                className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/5 px-2 py-1.5 text-xs"
              >
                <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold uppercase tracking-wider text-[10px] text-red-300">
                      {problem.source}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {new Date(problem.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-red-100/90 break-words leading-relaxed">{problem.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => actions.removeProblem(problem.id)}
                  className="p-1 text-gray-500 hover:text-gray-300 hover:bg-surface-2 rounded flex-shrink-0"
                  title="Dismiss"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProblemsPanelHeader() {
  const { state } = useChatWorkspace();
  const actions = useChatWorkspaceActions();
  const count = state.problems.length;

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-2/40">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        <AlertCircle className="w-3.5 h-3.5" />
        Problems
        {count > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 text-[10px]">
            {count}
          </span>
        )}
      </div>
      {count > 0 && (
        <button
          type="button"
          onClick={() => actions.clearProblems()}
          className="p-1 text-gray-500 hover:text-gray-300 hover:bg-surface-2 rounded"
          title="Clear all problems"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
