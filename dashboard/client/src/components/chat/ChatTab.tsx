import { useTranslation } from "react-i18next";
import { AlertCircle, Play } from "lucide-react";
import { useRunChat } from "./useRunChat";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { PermissionPrompt } from "./PermissionPrompt";

export function ChatTab({
  sessionId,
  cwd,
}: {
  sessionId: string;
  cwd: string;
}) {
  const { t } = useTranslation("sessions");
  const {
    handle,
    envelopes,
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

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface-1 overflow-hidden h-[min(70vh,600px)] md:h-[600px]">
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

      {activePermissionRequest && (
        <PermissionPrompt
          request={activePermissionRequest}
          onApprove={() => respondToPermission(true)}
          onReject={() => respondToPermission(false)}
          disabled={busy === "send"}
        />
      )}

      <ChatMessageList envelopes={envelopes} isLive={isLive && !activePermissionRequest} />

      <ChatInput
        value={followUp}
        onChange={setFollowUp}
        onSend={() => {
          if (canSend) send(followUp);
          else start(followUp);
        }}
        onStop={stop}
        disabled={busy === "start" || busy === "send" || busy === "stop"}
        isLive={isLive}
        placeholder={canSend ? t("chat.followUpPlaceholder") : t("chat.startPlaceholder")}
      />
    </div>
  );
}
