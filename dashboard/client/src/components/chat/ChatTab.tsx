import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Play } from "lucide-react";
import { api } from "../../lib/api";
import { useRunChat } from "./useRunChat";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput, type ChatSlashCommand } from "./ChatInput";

const BUILTIN_SLASH_COMMANDS: ChatSlashCommand[] = [
  { name: "help", description: "List available commands", source: "builtin" },
  { name: "clear", description: "Clear the conversation", source: "builtin" },
  { name: "config", description: "Open the interactive config menu", source: "builtin" },
  { name: "model", description: "Change model mid-session", source: "builtin" },
  { name: "compact", description: "Compact the conversation context", source: "builtin" },
  { name: "memory", description: "Edit CLAUDE.md", source: "builtin" },
  { name: "hooks", description: "Manage hooks", source: "builtin" },
  { name: "cost", description: "Show session cost", source: "builtin" },
  { name: "agents", description: "List subagents", source: "builtin" },
  { name: "review", description: "Review current changes", source: "builtin" },
  { name: "release-notes", description: "Show CC release notes", source: "builtin" },
  { name: "permissions", description: "Edit permission rules", source: "builtin" },
  { name: "status", description: "Show session status", source: "builtin" },
  { name: "init", description: "Initialise CLAUDE.md from codebase", source: "builtin" },
  { name: "login", description: "Sign in to Claude", source: "builtin" },
  { name: "logout", description: "Sign out", source: "builtin" },
  { name: "exit", description: "Exit the session", source: "builtin" },
  { name: "mcp", description: "Manage MCP servers", source: "builtin" },
  { name: "plugin", description: "Manage plugins", source: "builtin" },
  { name: "output-style", description: "Change output style", source: "builtin" },
];

export function ChatTab({
  sessionId,
  cwd,
  className,
}: {
  sessionId: string;
  cwd: string;
  className?: string;
}) {
  const { t } = useTranslation("sessions");
  const [slashCommands, setSlashCommands] = useState<ChatSlashCommand[]>(BUILTIN_SLASH_COMMANDS);

  useEffect(() => {
    let cancelled = false;
    api.ccConfig
      .commands("all")
      .then((res) => {
        if (cancelled) return;
        const fromServer = res.items.map((c) => ({
          name: c.name,
          description: c.preview,
          source: c.source === "skill" ? ("skill" as const) : (c.scope as "user" | "project"),
        })) as ChatSlashCommand[];
        setSlashCommands([...fromServer, ...BUILTIN_SLASH_COMMANDS]);
      })
      .catch(() => {
        // leave builtins
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    handle,
    displayEnvelopes,
    busy,
    error,
    followUp,
    setFollowUp,
    start,
    send,
    stop,
    activePermissionRequest,
    respondToPermission,
    isLive,
  } = useRunChat({ sessionId, cwd });

  const canSend = !!handle?.id && isLive;

  const onSend = () => {
    const text = followUp.trim();
    if (!text) return;
    if (canSend) send({ text, attachments: [] });
    else start(text);
  };

  const onSendWithPayload = async (payload: import("../../lib/types").SendPayload) => {
    const hasContent = !!payload.text || payload.attachments.length > 0;
    if (!hasContent) return;
    if (canSend) await send(payload);
    else await start(payload.text);
  };

  return (
    <div
      className={`flex flex-col rounded-xl border border-border bg-surface-1 overflow-hidden ${
        className ?? "h-[min(70vh,600px)] md:h-[600px]"
      }`}
    >
      {error && (
        <div className="px-4 py-2.5 border-b border-red-500/20 bg-red-500/10 flex items-center gap-2 text-sm text-red-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!handle && (
        <div className="px-4 py-3 border-b border-border bg-surface-2/50 text-xs text-gray-500 flex items-center gap-2">
          <Play className="w-3.5 h-3.5" />
          {t("chat.startHint", "Type a message to start a new Claude Code run for this session.")}
        </div>
      )}

      <ChatMessageList
        envelopes={displayEnvelopes}
        isLive={isLive && !activePermissionRequest}
        activePermissionRequest={activePermissionRequest}
        onApprovePermission={() => respondToPermission(true)}
        onRejectPermission={() => respondToPermission(false)}
        permissionBusy={busy !== null}
      />

      <ChatInput
        value={followUp}
        onChange={setFollowUp}
        onSend={onSend}
        onSendWithPayload={onSendWithPayload}
        onError={(msg) => console.warn(msg)}
        onStop={stop}
        disabled={busy === "start" || busy === "send" || busy === "stop"}
        isLive={isLive}
        placeholder={canSend ? t("chat.followUpPlaceholder") : t("chat.startPlaceholder")}
        slashCommands={slashCommands}
        fileCwd={cwd}
      />
    </div>
  );
}
