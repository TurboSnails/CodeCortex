import { useRef, useEffect, useState } from "react";
import { Bot, Sparkles, Wrench, ChevronDown } from "lucide-react";
import type {
  Envelope,
  AssistantMessage,
  UserMessage,
  PermissionRequestEnvelope,
  ContentBlock,
  StreamingAssistantMessage,
} from "./types";
import type { TranscriptContent } from "../../lib/types";
import { MarkdownContent } from "../conversation/MarkdownContent";
import { ToolCallBlock } from "../conversation/ToolCallBlock";
import { PermissionPrompt } from "./PermissionPrompt";
import { ThinkingBlock } from "./ThinkingBlock";

function isUserEnvelope(env: Envelope): env is UserMessage {
  return (env as { type?: string }).type === "user";
}

function isAssistantEnvelope(env: Envelope | null): env is AssistantMessage {
  return env != null && (env as { type?: string }).type === "assistant";
}

function isStreamingAssistant(env: Envelope | null): env is StreamingAssistantMessage {
  return isAssistantEnvelope(env) && !!(env as StreamingAssistantMessage).message?._streaming;
}

function isToolUseEnvelope(env: Envelope): env is { type: "tool_use"; name: string } {
  return (env as { type?: string }).type === "tool_use" && typeof (env as { name?: string }).name === "string";
}

function isPermissionRequestEnvelope(env: Envelope): env is PermissionRequestEnvelope {
  return (env as { type?: string }).type === "permission_request";
}

function getUserText(env: UserMessage): string {
  const content = env.message?.content;
  return typeof content === "string" ? content : "";
}

function getAssistantContent(env: AssistantMessage): ContentBlock[] {
  const content = env.message?.content;
  if (Array.isArray(content)) return content;
  if (typeof content === "string" && content) return [{ type: "text", text: content }];
  return [];
}

function toTranscriptContent(block: ContentBlock): TranscriptContent {
  if (block.type === "tool_use") {
    return {
      type: "tool_use",
      id: block.id,
      name: block.name,
      input:
        block.input && typeof block.input === "object"
          ? (block.input as Record<string, unknown>)
          : undefined,
    };
  }
  if (block.type === "tool_result") {
    let output = "";
    if (typeof block.content === "string") output = block.content;
    else if (block.content != null) output = JSON.stringify(block.content, null, 2);
    return {
      type: "tool_result",
      id: block.tool_use_id,
      output,
      is_error: block.is_error,
    };
  }
  return block as TranscriptContent;
}

function findPairedResult(
  blocks: ContentBlock[],
  startIndex: number,
  toolUseId: string
): { result: ContentBlock | null; nextIndex: number } {
  for (let i = startIndex + 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b) continue;
    if (b.type !== "tool_result") break;
    if ((b as { tool_use_id?: string }).tool_use_id === toolUseId) {
      return { result: b, nextIndex: i + 1 };
    }
  }
  return { result: null, nextIndex: startIndex + 1 };
}

function AssistantBlocks({ blocks }: { blocks: ContentBlock[] }) {
  const rendered: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b) continue;
    if (b.type === "text") {
      rendered.push(
        <MarkdownContent key={i} text={b.text || ""} />,
      );
    } else if (b.type === "thinking") {
      rendered.push(
        <ThinkingBlock key={i} text={(b as { thinking?: string }).thinking || ""} />,
      );
    } else if (b.type === "tool_use") {
      const { result, nextIndex } = findPairedResult(blocks, i, b.id);
      rendered.push(
        <ToolCallBlock
          key={i}
          toolUse={toTranscriptContent(b)}
          toolResult={result ? toTranscriptContent(result) : null}
        />,
      );
      i = nextIndex - 1;
    } else if (b.type === "tool_result") {
      // orphan result - render as a plain result card
      rendered.push(
        <ToolCallBlock
          key={i}
          toolUse={{ type: "tool_use", name: "result", id: (b as { tool_use_id?: string }).tool_use_id }}
          toolResult={toTranscriptContent(b)}
        />,
      );
    }
  }
  return <div className="space-y-2.5">{rendered}</div>;
}

function PulsingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-gray-500 animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

function StreamingIndicator({ env }: { env: Envelope | null }) {
  if (!isStreamingAssistant(env)) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <PulsingDots />
        Claude is thinking…
      </div>
    );
  }

  const blocks = env.message?.content || [];
  const last = blocks[blocks.length - 1];

  if (!last) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <PulsingDots />
        Claude is thinking…
      </div>
    );
  }

  if (last.type === "thinking") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-violet-300">
        <Sparkles className="w-3 h-3" />
        Thinking…
      </div>
    );
  }

  if (last.type === "text") {
    const preview = (last.text || "").slice(-40);
    return (
      <span className="inline-flex items-center gap-2 text-sm text-gray-200">
        <span className="animate-pulse text-gray-400">▍</span>
        {preview && (
          <span className="text-xs text-gray-500 max-w-[12rem] truncate">{preview}</span>
        )}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <PulsingDots />
      Claude is thinking…
    </div>
  );
}

export function ChatMessageList({
  envelopes,
  isLive,
  activePermissionRequest,
  onApprovePermission,
  onRejectPermission,
  permissionBusy,
}: {
  envelopes: Envelope[];
  isLive: boolean;
  activePermissionRequest?: PermissionRequestEnvelope | null;
  onApprovePermission?: () => void;
  onRejectPermission?: () => void;
  permissionBusy?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distFromBottom < 100;
    setIsNearBottom(near);
    setShowScrollButton(!near && envelopes.length > 2);
  };

  useEffect(() => {
    if (isNearBottom && typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [envelopes.length, activePermissionRequest?.id, isNearBottom]);

  const lastEnvelope = envelopes[envelopes.length - 1] ?? null;
  const showStreamingIndicator = isLive && !activePermissionRequest;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
    >
      {envelopes.map((env, i) => {
        if (isUserEnvelope(env)) {
          return (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
                {getUserText(env)}
              </div>
            </div>
          );
        }
        if (isAssistantEnvelope(env)) {
          return (
            <div key={i} className="flex justify-start gap-3">
              <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-gray-400" />
              </div>
              <div className="max-w-[85%] min-w-0 rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-2.5 text-sm text-gray-200">
                <AssistantBlocks blocks={getAssistantContent(env)} />
              </div>
            </div>
          );
        }
        if (isToolUseEnvelope(env)) {
          return (
            <div key={i} className="flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 shadow-sm">
                <Wrench className="w-3 h-3" />
                {env.name}
              </div>
            </div>
          );
        }
        if (isPermissionRequestEnvelope(env)) {
          return (
            <div key={i} className="flex justify-start gap-3">
              <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-gray-400" />
              </div>
              <div className="max-w-[90%] min-w-[16rem]">
                {onApprovePermission && onRejectPermission ? (
                  <PermissionPrompt
                    request={env}
                    onApprove={onApprovePermission}
                    onReject={onRejectPermission}
                    disabled={permissionBusy}
                    variant="inline"
                  />
                ) : (
                  <div className="text-xs text-amber-200">{env.description}</div>
                )}
              </div>
            </div>
          );
        }
        return null;
      })}
      {activePermissionRequest && onApprovePermission && onRejectPermission && (
        <div className="flex justify-start gap-3">
          <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-gray-400" />
          </div>
          <div className="max-w-[90%] min-w-[16rem]">
            <PermissionPrompt
              request={activePermissionRequest}
              onApprove={onApprovePermission}
              onReject={onRejectPermission}
              disabled={permissionBusy}
              variant="inline"
            />
          </div>
        </div>
      )}
      {showStreamingIndicator && (
        <div className="flex justify-start gap-3">
          <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center">
            <Bot className="w-4 h-4 text-gray-400" />
          </div>
          <div className="flex items-center">
            <StreamingIndicator env={lastEnvelope} />
          </div>
        </div>
      )}
      {showScrollButton && (
        <button
          type="button"
          onClick={() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            setShowScrollButton(false);
          }}
          className="fixed bottom-24 right-6 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-2 border border-border text-xs text-gray-300 shadow-lg hover:bg-surface-3 transition-colors"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-3 h-3" />
          滚动到底部
        </button>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
