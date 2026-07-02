/**
 * @file BottomPanel.tsx
 * @description Bottom panel shell for the IDE-style /chat page. Switches between
 * the Terminal output log and the Problems aggregator.
 */

import { Terminal, AlertCircle } from "lucide-react";
import { OutputPanel } from "./OutputPanel";
import { ProblemsPanel } from "./ProblemsPanel";
import { useChatWorkspace, useChatWorkspaceActions } from "./ChatWorkspaceContext";
import type { Envelope } from "./types";

interface BottomPanelProps {
  envelopes: Envelope[];
}

export function BottomPanel({ envelopes }: BottomPanelProps) {
  const { state } = useChatWorkspace();
  const actions = useChatWorkspaceActions();
  const activeTab = state.bottomPanel.activeTab;
  const problemCount = state.problems.length;

  return (
    <div className="h-full flex flex-col bg-surface-1 border-t border-border">
      <div className="flex items-center justify-between px-2 border-b border-border bg-surface-2/40">
        <div className="flex items-center">
          {(["terminal", "problems"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => actions.setBottomTab(tab)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                activeTab === tab
                  ? "text-accent border-b-2 border-accent bg-accent/5"
                  : "text-gray-500 hover:text-gray-300 hover:bg-surface-2"
              }`}
            >
              {tab === "terminal" ? (
                <Terminal className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              {tab}
              {tab === "problems" && problemCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 text-[10px]">
                  {problemCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => actions.showBottomPanel(false)}
          className="p-1 text-gray-500 hover:text-gray-300 hover:bg-surface-2 rounded text-[11px]"
        >
          Hide
        </button>
      </div>

      {activeTab === "terminal" ? (
        <OutputPanel
          envelopes={envelopes}
          onClear={() => {}}
          onClose={() => actions.showBottomPanel(false)}
        />
      ) : (
        <ProblemsPanel />
      )}
    </div>
  );
}
