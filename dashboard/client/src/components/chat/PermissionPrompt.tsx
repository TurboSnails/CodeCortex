import { useState } from "react";
import { ShieldAlert, Check, X, AlertTriangle, Clock } from "lucide-react";
import type { PermissionRequestEnvelope } from "./types";
import type { TranscriptContent } from "../../lib/types";
import { renderInput, buildSummary } from "../conversation/ToolCallBlock";
import { styleForTool } from "../conversation/toolStyle";

/** Commands that are considered dangerous and need extra scrutiny */
const DANGEROUS_COMMANDS = new Set([
  "rm", "del", "rmdir", "rm -rf", "format", "mkfs",
  "dd", "fdisk", "parted",
  "chmod", "chown", "chgrp",
  "kill", "killall", "pkill",
  "shutdown", "reboot", "halt", "poweroff",
  "curl", "wget", "nc", "netcat", "ncat",
  "ssh", "scp", "sftp",
  "eval", "exec", "source",
  "git push --force", "git push -f",
  "npm", "yarn", "pip", "gem",
]);

function isDangerousCommand(toolName: string, toolInput?: unknown): boolean {
  if (toolName.toLowerCase() === "bash" && typeof toolInput === "object" && toolInput !== null) {
    const input = toolInput as { command?: string };
    if (input.command) {
      const cmd = input.command.toLowerCase().trim();
      return DANGEROUS_COMMANDS.has(cmd) || cmd.includes("rm -rf") || cmd.includes("sudo");
    }
  }
  if (toolName.toLowerCase() === "write" || toolName.toLowerCase() === "edit") {
    return true; // File modifications are potentially dangerous
  }
  return false;
}

function ToolPreview({ toolName, toolInput }: { toolName: string; toolInput: Record<string, unknown> }) {
  const toolUse: TranscriptContent = {
    type: "tool_use",
    name: toolName,
    input: toolInput,
  };
  const summary = buildSummary(toolUse);
  const style = styleForTool(toolName);
  const Icon = style.Icon;
  return (
    <div className={`rounded-lg border ${style.border} bg-surface-2/60 overflow-hidden`}>
      <div className="w-full flex items-center gap-2.5 px-3 py-2 text-left">
        <span className={`flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded ${style.chip}`}>
          <Icon className="w-3 h-3" />
        </span>
        <span className={`font-mono font-medium text-[13px] flex-shrink-0 ${style.text}`}>
          {toolName}
        </span>
        {summary && (
          <span className="text-gray-500 text-xs font-mono truncate min-w-0" title={summary}>
            {summary}
          </span>
        )}
      </div>
      <div className="border-t border-surface-3 bg-surface-1/40 px-3 py-3 space-y-2.5">
        {renderInput(toolUse)}
      </div>
    </div>
  );
}

export function PermissionPrompt({
  request,
  onApprove,
  onReject,
  disabled,
  variant = "banner",
}: {
  request: PermissionRequestEnvelope;
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
  variant?: "banner" | "inline";
}) {
  const [rememberChoice, setRememberChoice] = useState(false);
  const isDangerous = isDangerousCommand(request.tool_name, request.tool_input);
  const hasToolInput = request.tool_input != null && typeof request.tool_input === "object";

  const wrapperClasses =
    variant === "inline"
      ? "rounded-xl border shadow-sm flex flex-col gap-3 px-4 py-3"
      : "px-4 py-3 border-b flex flex-col gap-3";

  const borderColor = isDangerous ? "border-red-500/30 bg-red-500/10" : "border-amber-500/20 bg-amber-500/10";
  const iconColor = isDangerous ? "text-red-300" : "text-amber-200";

  return (
    <div className={`${wrapperClasses} ${borderColor}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        {isDangerous ? (
          <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
        ) : (
          <ShieldAlert className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
        )}
        <span className={`text-xs font-medium ${iconColor}`}>
          {isDangerous ? "Dangerous operation - Review carefully" : "Permission request"}
        </span>
        <span className="ml-auto text-[10px] text-gray-500 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Review required
        </span>
      </div>

      {/* Tool preview */}
      {hasToolInput ? (
        <ToolPreview toolName={request.tool_name} toolInput={request.tool_input as Record<string, unknown>} />
      ) : (
        <div className="text-sm text-gray-200">{request.description ?? ""}</div>
      )}

      {/* Actions */}
      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 md:py-1.5 text-xs font-medium disabled:opacity-40 min-h-[44px] transition-colors ${
            isDangerous
              ? "bg-red-600/20 text-red-300 hover:bg-red-600/30 border border-red-500/30"
              : "bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          {isDangerous ? "Approve Dangerous" : "Approve"}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-surface-3/50 text-gray-300 hover:bg-surface-3 px-3 py-2.5 md:py-1.5 text-xs font-medium disabled:opacity-40 min-h-[44px] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Reject
        </button>

        {/* Remember choice checkbox */}
        <label className="ml-auto flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer hover:text-gray-300">
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
            className="w-3 h-3 rounded border-gray-500 bg-surface-3 accent-accent"
          />
          Remember this session
        </label>
      </div>
    </div>
  );
}
