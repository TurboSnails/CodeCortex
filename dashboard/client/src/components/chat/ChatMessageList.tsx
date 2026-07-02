import { useRef, useEffect } from "react";
import { Bot, Wrench } from "lucide-react";
import type { Envelope, AssistantMessage, UserMessage } from "./types";
import { MarkdownContent } from "../conversation/MarkdownContent";

function isUserEnvelope(env: Envelope): env is UserMessage {
  return (env as { type?: string }).type === "user";
}

function isAssistantEnvelope(env: Envelope): env is AssistantMessage {
  return (env as { type?: string }).type === "assistant";
}

function isToolUseEnvelope(env: Envelope): env is { type: "tool_use"; name: string } {
  return (env as { type?: string }).type === "tool_use" && typeof (env as { name?: string }).name === "string";
}

function getUserText(env: UserMessage): string {
  const content = env.message?.content;
  return typeof content === "string" ? content : "";
}

function getAssistantText(env: AssistantMessage): string {
  const content = env.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof (b as { text?: string }).text === "string")
    .map((b) => b.text)
    .join("");
}

export function ChatMessageList({
  envelopes,
  isLive,
}: {
  envelopes: Envelope[];
  isLive: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === "function") {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [envelopes.length]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
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
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-2.5 text-sm text-gray-200">
                <MarkdownContent text={getAssistantText(env)} />
              </div>
            </div>
          );
        }
        if (isToolUseEnvelope(env)) {
          return (
            <div key={i} className="flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
                <Wrench className="w-3 h-3" />
                {env.name}
              </div>
            </div>
          );
        }
        return null;
      })}
      {isLive && (
        <div className="flex justify-start gap-3">
          <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center">
            <Bot className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-xs text-gray-500 flex items-center">
            Claude is thinking…
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
