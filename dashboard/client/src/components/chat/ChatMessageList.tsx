import { useRef, useEffect, useState, useCallback, memo } from "react";
import { Bot, Sparkles, Wrench, ChevronDown, Copy, Check, MoreHorizontal, Clock } from "lucide-react";
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

/** Format a timestamp as compact local time (e.g. "14:23:01"). */
function formatLocalTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Format a timestamp for date grouping header (e.g. "Today", "Yesterday", "July 5"). */
function formatDateGroup(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDate.getTime() === today.getTime()) return "Today";
  if (msgDate.getTime() === yesterday.getTime()) return "Yesterday";
  if (msgDate.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Check if two dates are on the same day. */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Get or create timestamp for an envelope (defaults to now for live messages). */
function getEnvelopeTimestamp(env: Envelope): Date {
  if ("timestamp" in env && typeof env.timestamp === "string") {
    const d = new Date(env.timestamp);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Date group header component */
const DateGroupHeader = memo(function DateGroupHeader({ date }: { date: Date }) {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="inline-flex items-center gap-2 text-[11px] text-gray-500 bg-surface-1/80 border border-surface-3 rounded-full px-3 py-1">
        <Clock className="w-3 h-3" />
        <span>{formatDateGroup(date)}</span>
      </div>
    </div>
  );
});

/** Message action menu */
function MessageActions({ text, onCopy }: { text: string; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      onCopy();
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text, onCopy]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-1 rounded hover:bg-surface-3/50 text-gray-500 hover:text-gray-300 transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Message actions"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-20 bg-surface-2 border border-surface-3 rounded-lg shadow-lg py-1 min-w-[120px]">
            <button
              type="button"
              onClick={handleCopy}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-surface-3/50 transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy text"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AssistantBlocks({ blocks, isStreaming = false }: { blocks: ContentBlock[]; isStreaming?: boolean }) {
  const rendered: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b) continue;
    if (b.type === "text") {
      const isLastText = i === blocks.length - 1 || blocks.slice(i + 1).every((blk) => blk?.type === "tool_use" || blk?.type === "tool_result");
      rendered.push(
        <StreamingText key={i} text={b.text || ""} showCursor={isStreaming && isLastText} />,
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

/** Text component with streaming cursor animation */
const StreamingText = memo(function StreamingText({ text, showCursor }: { text: string; showCursor?: boolean }) {
  const [displayText, setDisplayText] = useState(text);
  const [, setIsAnimating] = useState(false);
  const targetText = useRef(text);
  const animationRef = useRef<number | null>(null);
  const lastCharCount = useRef(text.length);

  useEffect(() => {
    targetText.current = text;
    if (text.length === 0) {
      setDisplayText("");
      setIsAnimating(false);
      return;
    }
    // If text grew (streaming), animate the new characters
    if (text.length > lastCharCount.current) {
      setIsAnimating(true);
      const startText = displayText;
      const endText = text;
      const charsToAdd = endText.length - startText.length;
      const duration = Math.min(300, charsToAdd * 20); // Cap at 300ms for smooth feel
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const charCount = Math.round(startText.length + charsToAdd * eased);
        setDisplayText(endText.slice(0, charCount));
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setDisplayText(endText);
          // Keep isAnimating true briefly to show cursor at end of streaming
          setTimeout(() => setIsAnimating(false), 100);
        }
      };
      animationRef.current = requestAnimationFrame(animate);
      lastCharCount.current = text.length;
    } else {
      // Text complete or shrinking (shouldn't happen normally)
      setDisplayText(text);
      setIsAnimating(false);
      lastCharCount.current = text.length;
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [text]);

  return (
    <span className="relative">
      <MarkdownContent text={displayText} />
      {showCursor && displayText.length > 0 && (
        <span className="absolute w-0.5 h-3.5 bg-violet-400/80 rounded-sm animate-pulse ml-0.5 mt-1 align-middle" />
      )}
    </span>
  );
});

/** Animated typing cursor */
function TypingCursor() {
  return (
    <span className="inline-flex items-center">
      <span className="w-2 h-4 bg-violet-400/70 rounded-sm animate-pulse" />
    </span>
  );
}

/** Streaming speed indicator */
function StreamingSpeedIndicator({ charCount }: { charCount: number }) {
  const [speed, setSpeed] = useState(0);
  const charsRef = useRef(charCount);
  const lastTimeRef = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    const timeDiff = now - lastTimeRef.current;
    if (timeDiff >= 500) {
      const charsDiff = charCount - charsRef.current;
      const cps = Math.round(charsDiff / (timeDiff / 1000));
      setSpeed(cps);
      charsRef.current = charCount;
      lastTimeRef.current = now;
    }
  }, [charCount]);

  if (speed === 0) return null;
  return (
    <span className="text-[10px] text-gray-600 font-mono ml-2">
      {speed > 0 ? `${speed} c/s` : ""}
    </span>
  );
}

function PulsingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function StreamingIndicator({ env }: { env: Envelope | null }) {
  if (!isStreamingAssistant(env)) {
    return (
      <div className="flex items-center gap-2.5 text-xs text-gray-400">
        <PulsingDots />
        <span>Claude is thinking<span className="animate-pulse">…</span></span>
      </div>
    );
  }

  const blocks = env.message?.content || [];
  const last = blocks[blocks.length - 1];

  if (!last) {
    return (
      <div className="flex items-center gap-2.5 text-xs text-gray-400">
        <PulsingDots />
        <span>Claude is thinking<span className="animate-pulse">…</span></span>
      </div>
    );
  }

  if (last.type === "thinking") {
    const thinkingText = (last as { thinking?: string }).thinking || "";
    return (
      <div className="flex items-center gap-2 text-xs text-violet-300">
        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
        <span>Thinking<span className="animate-pulse">…</span></span>
        <span className="text-[10px] text-violet-400/60 font-mono ml-1">
          {thinkingText.length.toLocaleString()} chars
        </span>
      </div>
    );
  }

  if (last.type === "text") {
    const text = last.text || "";
    const preview = text.slice(-60);
    return (
      <div className="flex items-center gap-2 text-sm text-gray-200">
        <TypingCursor />
        <span className="text-xs text-gray-500 max-w-[14rem] truncate font-mono">
          {preview || <span className="text-gray-600 italic">waiting for text…</span>}
        </span>
        <StreamingSpeedIndicator charCount={text.length} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 text-xs text-gray-400">
      <PulsingDots />
      <span>Processing<span className="animate-pulse">…</span></span>
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
  const [, setCopiedMessageId] = useState<string | null>(null);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distFromBottom < 100;
    setIsNearBottom(near);
    setShowScrollButton(!near && envelopes.length > 2);
  }, [envelopes.length]);

  useEffect(() => {
    if (isNearBottom && typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [envelopes.length, activePermissionRequest?.id, isNearBottom]);

  const lastEnvelope = envelopes[envelopes.length - 1] ?? null;
  const showStreamingIndicator = isLive && !activePermissionRequest;

  // Build list with date group headers
  const elements: React.ReactNode[] = [];
  let lastDateGroup: Date | null = null;

  envelopes.forEach((env, i) => {
    const timestamp = getEnvelopeTimestamp(env);
    const dateGroup = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());

    // Add date group header if needed
    if (!lastDateGroup || !isSameDay(lastDateGroup, dateGroup)) {
      elements.push(
        <DateGroupHeader key={`date-${dateGroup.toISOString()}`} date={dateGroup} />
      );
      lastDateGroup = dateGroup;
    }

    if (isUserEnvelope(env)) {
      const text = getUserText(env);
      const msgId = `user-${i}`;
      elements.push(
        <div key={i} className="flex justify-end group relative">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
            {text}
          </div>
          <div className="absolute -top-1 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <MessageActions text={text} onCopy={() => setCopiedMessageId(msgId)} />
          </div>
          <span className="absolute -bottom-4 right-2 text-[10px] text-gray-600 font-mono">
            {formatLocalTime(timestamp)}
          </span>
        </div>
      );
    } else if (isAssistantEnvelope(env)) {
      const msgId = `assistant-${i}`;
      const content = getAssistantContent(env);
      const textContent = content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n");
      elements.push(
        <div key={i} className="flex justify-start gap-3 group relative">
          <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bot className="w-4 h-4 text-gray-400" />
          </div>
          <div className="max-w-[85%] min-w-0 rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-2.5 text-sm text-gray-200">
            <AssistantBlocks blocks={content} isStreaming={isStreamingAssistant(env)} />
          </div>
          {textContent && (
            <div className="absolute -top-1 left-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <MessageActions text={textContent} onCopy={() => setCopiedMessageId(msgId)} />
            </div>
          )}
          <span className="absolute -bottom-4 left-10 text-[10px] text-gray-600 font-mono">
            {formatLocalTime(timestamp)}
          </span>
        </div>
      );
    } else if (isToolUseEnvelope(env)) {
      elements.push(
        <div key={i} className="flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 shadow-sm">
            <Wrench className="w-3 h-3" />
            {env.name}
          </div>
        </div>
      );
    } else if (isPermissionRequestEnvelope(env)) {
      elements.push(
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
  });

  // Add active permission request if exists
  if (activePermissionRequest && onApprovePermission && onRejectPermission) {
    const timestamp = new Date();
    const dateGroup = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
    if (!lastDateGroup || !isSameDay(lastDateGroup, dateGroup)) {
      elements.push(<DateGroupHeader key="date-active-perm" date={dateGroup} />);
    }
    elements.push(
      <div key="active-perm" className="flex justify-start gap-3">
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
    );
  }

  // Add streaming indicator if live
  if (showStreamingIndicator) {
    elements.push(
      <div key="streaming" className="flex justify-start gap-3">
        <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center">
          <Bot className="w-4 h-4 text-gray-400" />
        </div>
        <div className="flex items-center">
          <StreamingIndicator env={lastEnvelope} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
    >
      {elements}
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
