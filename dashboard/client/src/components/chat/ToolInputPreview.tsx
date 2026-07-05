import type { TranscriptContent } from "../../lib/types";
import { renderInput, buildSummary } from "../conversation/ToolCallBlock";
import { styleForTool } from "../conversation/toolStyle";

interface ToolInputPreviewProps {
  toolName: string;
  toolInput?: unknown;
}

export function ToolInputPreview({ toolName, toolInput }: ToolInputPreviewProps) {
  const toolUse: TranscriptContent = {
    type: "tool_use",
    name: toolName,
    input: typeof toolInput === "object" && toolInput !== null
      ? (toolInput as Record<string, unknown>)
      : undefined,
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
