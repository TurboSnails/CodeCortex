/**
 * @file ChatStatusBar.tsx
 * @description Bottom status bar for the IDE-style /chat page. Shows cwd, model,
 * connection state, and the reusable TokenMeter. Includes a model selector for
 * the next run.
 */

import { useSyncExternalStore } from "react";
import { Folder, Wifi, WifiOff, Cpu, ChevronDown } from "lucide-react";
import { eventBus } from "../../lib/eventBus";
import { TokenMeter, computeTokens } from "./TokenMeter";
import type { Envelope } from "./types";

const MODEL_OPTIONS = [
  { value: "", label: "default" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];

interface ChatStatusBarProps {
  cwd: string;
  model: string | null;
  onModelChange?: (model: string) => void;
  sessionId?: string | null;
  envelopes: Envelope[];
}

export function ChatStatusBar({ cwd, model, onModelChange, sessionId, envelopes }: ChatStatusBarProps) {
  const connected = useSyncExternalStore(
    eventBus.onConnection,
    () => eventBus.connected,
    () => false
  );
  const tokenStats = computeTokens(envelopes);
  const selected = model || "";

  return (
    <div className="h-6 flex items-center gap-4 px-3 text-[11px] text-gray-400 bg-accent/5 border-t border-border flex-shrink-0 overflow-hidden">
      <span className="inline-flex items-center gap-1.5 flex-shrink-0">
        <Folder className="w-3 h-3 text-gray-500" />
        <span className="font-mono truncate max-w-[16rem]">{cwd}</span>
      </span>

      <span className="inline-flex items-center gap-1.5 flex-shrink-0">
        <Cpu className="w-3 h-3 text-gray-500" />
        {onModelChange ? (
          <div className="relative">
            <select
              value={selected}
              onChange={(e) => onModelChange(e.target.value)}
              className="appearance-none bg-transparent text-gray-300 font-mono pr-4 focus:outline-none cursor-pointer"
              title="Select model for next run"
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-gray-600" />
          </div>
        ) : (
          <span className="font-mono">{model || "default"}</span>
        )}
      </span>

      <span className="inline-flex items-center gap-1.5 flex-shrink-0">
        {connected ? (
          <Wifi className="w-3 h-3 text-emerald-400" />
        ) : (
          <WifiOff className="w-3 h-3 text-gray-500" />
        )}
        <span className={connected ? "text-emerald-400" : ""}>{connected ? "live" : "offline"}</span>
      </span>

      {sessionId && (
        <span className="font-mono text-gray-500 flex-shrink-0">
          {sessionId.slice(0, 8)}
        </span>
      )}

      <div className="ml-auto flex-shrink-0">
        <TokenMeter stats={tokenStats} />
      </div>
    </div>
  );
}
