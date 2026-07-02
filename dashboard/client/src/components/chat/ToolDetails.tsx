/**
 * @file ToolDetails.tsx
 * @description Right panel Tool tab for the IDE-style /chat page. Shows the
 * active tool call, permission request context, and recent tool history.
 */

import { useMemo, useState } from "react";
import { Wrench, Check, X, ShieldAlert } from "lucide-react";
import type { Envelope, PermissionRequestEnvelope } from "./types";
import { ToolInputPreview } from "./ToolInputPreview";

interface ToolDetailsProps {
  envelopes: Envelope[];
  activePermissionRequest: PermissionRequestEnvelope | null;
  onApprove: () => void;
  onReject: () => void;
  permissionBusy: boolean;
}

function isToolUseEnvelope(env: Envelope | null): env is { type: "tool_use"; name: string; input?: unknown } {
  return env != null && (env as { type?: string }).type === "tool_use" && typeof (env as { name?: string }).name === "string";
}

function isToolResultEnvelope(env: Envelope | null): env is { type: "tool_result"; tool_use_id?: string; content?: unknown; is_error?: boolean } {
  return env != null && (env as { type?: string }).type === "tool_result";
}

function formatInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  return JSON.stringify(input, null, 2);
}

function formatOutput(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return JSON.stringify(content, null, 2);
}

function ToolHistoryItem({
  tool,
  result,
}: {
  tool: { name: string; input?: unknown };
  result?: { content?: unknown; is_error?: boolean } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border rounded-md overflow-hidden mb-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-2"
      >
        <Wrench className="w-3 h-3 text-gray-500" />
        <span className="font-mono text-[11px] text-gray-200">{tool.name}</span>
        {result && (
          <span
            className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
              result.is_error ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"
            }`}
          >
            {result.is_error ? "error" : "ok"}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-2 py-1.5 border-t border-border bg-surface-2/30">
          <pre className="text-[10px] font-mono text-gray-400 whitespace-pre-wrap">{formatInput(tool.input)}</pre>
          {result && (
            <pre
              className={`mt-1 text-[10px] font-mono whitespace-pre-wrap ${
                result.is_error ? "text-red-300" : "text-gray-400"
              }`}
            >
              {formatOutput(result.content)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolDetails({
  envelopes,
  activePermissionRequest,
  onApprove,
  onReject,
  permissionBusy,
}: ToolDetailsProps) {
  const { activeTool, recentTools } = useMemo(() => {
    const tools: { id: string; name: string; input?: unknown }[] = [];
    const results = new Map<string, { content?: unknown; is_error?: boolean }>();
    let active = null as { name: string; input?: unknown } | null;

    for (const env of envelopes) {
      if (isToolUseEnvelope(env)) {
        const id = (env as { id?: string }).id || `${tools.length}`;
        tools.push({ id, name: env.name, input: env.input });
        active = { name: env.name, input: env.input };
      } else if (isToolResultEnvelope(env)) {
        const id = (env as { tool_use_id?: string }).tool_use_id;
        if (id) {
          results.set(id, {
            content: (env as { content?: unknown }).content,
            is_error: (env as { is_error?: boolean }).is_error,
          });
        }
      }
    }

    const recent = tools
      .slice(-10)
      .reverse()
      .map((t) => ({ ...t, result: results.get(t.id) ?? null }));

    return { activeTool: active, recentTools: recent };
  }, [envelopes]);

  return (
    <div className="h-full flex flex-col px-3 py-2">
      {activePermissionRequest ? (
        <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-xs text-amber-200 font-medium mb-2">
            <ShieldAlert className="w-4 h-4" />
            Permission request
          </div>
          {activePermissionRequest.tool_input != null ? (
            <ToolInputPreview
              toolName={activePermissionRequest.tool_name}
              toolInput={activePermissionRequest.tool_input}
            />
          ) : (
            <div className="text-[12px] text-gray-200 mb-3">{activePermissionRequest.description}</div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={onApprove}
              disabled={permissionBusy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              Approve
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={permissionBusy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              Reject
            </button>
          </div>
        </div>
      ) : activeTool ? (
        <div className="mb-3 rounded-xl border border-border bg-surface-2/30 p-3">
          <div className="flex items-center gap-2 text-xs text-gray-300 font-medium mb-2">
            <Wrench className="w-4 h-4 text-gray-500" />
            {activeTool.name}
          </div>
          <pre className="text-[11px] font-mono text-gray-400 whitespace-pre-wrap break-words">
            {formatInput(activeTool.input)}
          </pre>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-gray-500 py-8 text-center">
          <Wrench className="w-8 h-8 mb-3 opacity-30" />
          <p className="text-sm">No active tool call.</p>
        </div>
      )}

      {recentTools.length > 0 && (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-1 py-2">
            Recent tools
          </div>
          {recentTools.map((t) => (
            <ToolHistoryItem key={t.id} tool={t} result={t.result} />
          ))}
        </div>
      )}
    </div>
  );
}
