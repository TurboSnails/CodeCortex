import { X } from "lucide-react";
import { getWorkflowSteps, type ChatMode } from "./workflowConfig";

export interface WorkflowProgressProps {
  mode: ChatMode;
  currentStepId: string;
  onCancel: () => void;
}

export function WorkflowProgress({ mode, currentStepId, onCancel }: WorkflowProgressProps) {
  const steps = getWorkflowSteps(mode);
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-[11px]">
      <div className="flex items-center gap-1.5">
        {steps.map((step, idx) => {
          const isDone = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <span key={step.id} className="inline-flex items-center gap-1.5">
              {idx > 0 && <span className="text-gray-600">→</span>}
              <span
                className={`px-1.5 py-0.5 rounded border ${
                  isDone
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : isCurrent
                    ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                    : "text-gray-500 border-transparent"
                }`}
              >
                {isDone ? <span>✓</span> : null}{" "}
                <span aria-current={isCurrent ? "step" : undefined}>{step.id}</span>
              </span>
            </span>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="ml-auto inline-flex items-center gap-1 text-gray-500 hover:text-red-400"
        aria-label="Cancel workflow"
      >
        <X className="w-3 h-3" />
        <span>取消</span>
      </button>
    </div>
  );
}
