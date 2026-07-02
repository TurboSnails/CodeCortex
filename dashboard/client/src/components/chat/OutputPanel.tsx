/**
 * @file OutputPanel.tsx
 * @description Bottom panel for the IDE-style /chat page. Shows a read-only log
 * of Bash tool invocations and their outputs.
 */

import { Terminal, Trash2, X } from "lucide-react";
import type { Envelope } from "./types";

interface OutputPanelProps {
  envelopes: Envelope[];
  onClear: () => void;
  onClose: () => void;
}

function isBashToolUse(env: Envelope | undefined | null): env is { type: "tool_use"; name: "bash"; id: string; input?: { command?: string } } {
  return (
    env != null &&
    (env as { type?: string }).type === "tool_use" &&
    (env as { name?: string }).name?.toLowerCase() === "bash"
  );
}

function isToolResultForId(env: Envelope | undefined | null, id: string): env is { type: "tool_result"; tool_use_id: string; content?: unknown; is_error?: boolean } {
  return (
    env != null &&
    (env as { type?: string }).type === "tool_result" &&
    (env as { tool_use_id?: string }).tool_use_id === id
  );
}

export function OutputPanel({ envelopes, onClear, onClose }: OutputPanelProps) {
  const entries: { id: string; command: string; output: string; isError: boolean }[] = [];
  for (let i = 0; i < envelopes.length; i++) {
    const env = envelopes[i];
    if (isBashToolUse(env)) {
      const command = env.input?.command || "";
      const result = envelopes.slice(i + 1).find((e) => isToolResultForId(e, env.id));
      const output = result ? (typeof result.content === "string" ? result.content : JSON.stringify(result.content)) : "";
      entries.push({ id: env.id, command, output, isError: result?.is_error || false });
    }
  }

  return (
    <div className="h-full flex flex-col bg-surface-1">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-2/40">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          <Terminal className="w-3.5 h-3.5" />
          Output
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClear}
            className="p-1 text-gray-500 hover:text-gray-300 hover:bg-surface-2 rounded"
            title="Clear output"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-300 hover:bg-surface-2 rounded"
            title="Close panel"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-2 font-mono text-[11px]">
        {entries.length === 0 && (
          <div className="text-gray-500 italic">No Bash output yet.</div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="mb-2">
            <div className="flex items-center gap-1.5 text-gray-400 mb-0.5">
              <span className="text-gray-600">$</span>
              <span className="text-gray-300">{entry.command}</span>
            </div>
            {entry.output && (
              <pre
                className={`whitespace-pre-wrap break-words pl-3 border-l border-gray-700 ${
                  entry.isError ? "text-red-300" : "text-gray-400"
                }`}
              >
                {entry.output}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
