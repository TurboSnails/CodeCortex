import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Play } from "lucide-react";
import { api } from "../../lib/api";
import { useRunChat } from "./useRunChat";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput, type ChatSlashCommand } from "./ChatInput";
import { useChatWorkspaceActions } from "./ChatWorkspaceContext";
import { ChatModeSelector } from "./ChatModeSelector";
import { WorkflowProgress } from "./WorkflowProgress";
import { useWorkflowMarkers } from "./useWorkflowMarkers";
import {
  getNextCommand,
  getPlaceholder,
  getWorkflowSteps,
  type ChatMode,
} from "./workflowConfig";
import type { SendPayload } from "../../lib/types";

function ErrorBanner({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="px-4 py-2.5 border-b border-red-500/20 bg-red-500/10 flex items-center gap-2 text-sm text-red-200">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{children}</span>
      {actions}
    </div>
  );
}

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

type WorkflowState =
  | { kind: "idle" }
  | { kind: "running"; mode: ChatMode; stepId: string }
  | { kind: "paused"; mode: ChatMode; stepId: string; reason: string }
  | { kind: "error"; mode: ChatMode; stepId: string; message: string }
  | { kind: "done"; mode: ChatMode };

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
  const workspaceActions = useChatWorkspaceActions();
  const [slashCommands, setSlashCommands] = useState<ChatSlashCommand[]>(BUILTIN_SLASH_COMMANDS);
  const [mode, setMode] = useState<ChatMode>("normal");
  const [workflow, setWorkflow] = useState<WorkflowState>({ kind: "idle" });
  const lastHandledKey = useRef<number | null>(null);
  const autoAdvanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingAutoAdvance, setPendingAutoAdvance] = useState<{ command: string; stepId: string } | null>(null);
  const [isAutoAdvancePending, setIsAutoAdvancePending] = useState(false);
  const lastWorkflowPayloadRef = useRef<SendPayload | null>(null);
  const lastWorkflowActionRef = useRef<"start" | "send" | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Pass cwd so the server resolves the project `.claude/` relative to the
    // chat's working directory. Without this, the server falls back to its
    // own process.cwd() — which is `dashboard/` when `npm run dev` is run
    // from the dashboard subdir, so project-level skills/commands disappear.
    api.ccConfig
      .commands("all", cwd)
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
  }, [cwd]);

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

  const { marker, cleanedEnvelopes, isComplete, latestAssistantKey } = useWorkflowMarkers(displayEnvelopes, mode);

  const canSend = !!handle?.id && isLive;

  // If an API call (start/send) fails while a workflow is running, transition to
  // an error state so the user can retry or cancel. The useRunChat error banner
  // still surfaces the message above this one.
  useEffect(() => {
    if (!error || workflow.kind !== "running") return;
    setWorkflow({ kind: "error", mode: workflow.mode, stepId: workflow.stepId, message: error });
  }, [error, workflow.kind]);

  useEffect(() => {
    if (workflow.kind === "idle") {
      lastHandledKey.current = null;
      return;
    }
    if (!marker || workflow.kind !== "running" || !isComplete) return;
    if (lastHandledKey.current === latestAssistantKey) return;
    lastHandledKey.current = latestAssistantKey;

    if (marker.kind === "error") {
      setIsAutoAdvancePending(false);
      setWorkflow({ kind: "error", mode: workflow.mode, stepId: workflow.stepId, message: marker.message });
      return;
    }

    if (marker.kind === "done") {
      setIsAutoAdvancePending(false);
      setWorkflow({ kind: "done", mode: workflow.mode });
      setMode("normal");
      return;
    }

    if (marker.kind === "pause") {
      setIsAutoAdvancePending(false);
      setWorkflow({ kind: "paused", mode: workflow.mode, stepId: workflow.stepId, reason: "Waiting for user input" });
      return;
    }

    if (marker.kind === "continue") {
      const nextCommand = getNextCommand(workflow.mode, workflow.stepId);
      if (!nextCommand) {
        setIsAutoAdvancePending(false);
        setWorkflow({ kind: "done", mode: workflow.mode });
        setMode("normal");
        return;
      }
      const nextStepId = getWorkflowSteps(workflow.mode).find((s) => s.command === nextCommand)?.id ?? workflow.stepId;
      setPendingAutoAdvance({ command: nextCommand, stepId: nextStepId });
      setIsAutoAdvancePending(true);
      autoAdvanceTimeout.current = setTimeout(() => {
        autoAdvanceTimeout.current = null;
        setPendingAutoAdvance(null);
        setIsAutoAdvancePending(false);
        lastWorkflowActionRef.current = "send";
        lastWorkflowPayloadRef.current = { text: nextCommand, attachments: [] };
        send(nextCommand).catch(() => {
          // Error is surfaced via useRunChat.error and handled by the error effect above.
        });
        setWorkflow({ kind: "running", mode: workflow.mode, stepId: nextStepId });
      }, 600);
    }

    return () => {
      if (autoAdvanceTimeout.current) {
        clearTimeout(autoAdvanceTimeout.current);
        autoAdvanceTimeout.current = null;
      }
      setPendingAutoAdvance(null);
      setIsAutoAdvancePending(false);
    };
    // `marker` is intentionally omitted: it is derived from the same envelopes
    // that produce `isComplete` and `latestAssistantKey`, but its object identity
    // changes on every typewriter tick. We only need to act when a complete
    // assistant reply arrives, which is captured by the key/complete deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow, send, isComplete, latestAssistantKey]);

  const onSend = () => {
    const text = followUp.trim();
    if (!text) return;
    if (canSend) send({ text, attachments: [] });
    else start(text);
  };

  const onSendWithPayload = async (payload: import("../../lib/types").SendPayload) => {
    const hasContent = !!payload.text || payload.attachments.length > 0;
    if (!hasContent) return;

    if (workflow.kind === "idle" && mode !== "normal") {
      const firstStep = getWorkflowSteps(mode)[0];
      if (!firstStep) return;
      const combined = `${firstStep.command} ${payload.text}`.trim();
      // TODO: start() only accepts a string prompt, so attachments from the
      // first workflow send are dropped. Extend start() to accept a SendPayload
      // when we want full attachment support here.
      lastWorkflowPayloadRef.current = { text: combined, attachments: [] };
      lastWorkflowActionRef.current = "start";
      setWorkflow({ kind: "running", mode, stepId: firstStep.id });
      await start(combined);
      return;
    }

    if (workflow.kind === "paused") {
      lastWorkflowPayloadRef.current = payload;
      lastWorkflowActionRef.current = "send";
      setWorkflow((w) => (w.kind === "paused" ? { ...w, kind: "running" } : w));
      await send(payload);
      return;
    }

    if (canSend) await send(payload);
    else await start(payload.text);
  };

  const handleRetry = async () => {
    if (workflow.kind !== "error") return;
    setWorkflow({ kind: "running", mode: workflow.mode, stepId: workflow.stepId });
    if (lastWorkflowActionRef.current === "start" && lastWorkflowPayloadRef.current) {
      lastWorkflowActionRef.current = "start";
      await start(lastWorkflowPayloadRef.current.text);
    } else if (lastWorkflowActionRef.current === "send" && lastWorkflowPayloadRef.current) {
      lastWorkflowActionRef.current = "send";
      await send(lastWorkflowPayloadRef.current);
    } else {
      const step = getWorkflowSteps(workflow.mode).find((s) => s.id === workflow.stepId);
      if (!step) return;
      lastWorkflowActionRef.current = "send";
      await send(step.command);
    }
  };

  const cancelWorkflow = () => {
    if (autoAdvanceTimeout.current) {
      clearTimeout(autoAdvanceTimeout.current);
      autoAdvanceTimeout.current = null;
    }
    setPendingAutoAdvance(null);
    setIsAutoAdvancePending(false);
    void stop();
    setWorkflow({ kind: "idle" });
    setMode("normal");
  };

  return (
    <div
      className={`flex flex-col rounded-xl border border-border bg-surface-1 overflow-hidden ${
        className ?? "h-[min(70vh,600px)] md:h-[600px]"
      }`}
    >
      {error && workflow.kind !== "error" && (
        <ErrorBanner>{error}</ErrorBanner>
      )}

      {workflow.kind === "error" && (
        <ErrorBanner
          actions={
            <>
              <button
                type="button"
                onClick={handleRetry}
                className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-100 text-xs font-medium"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={cancelWorkflow}
                className="px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-100 text-xs font-medium"
              >
                Cancel
              </button>
            </>
          }
        >
          {workflow.message}
        </ErrorBanner>
      )}

      {!handle && (
        <div className="px-4 py-3 border-b border-border bg-surface-2/50 text-xs text-gray-500 flex items-center gap-2">
          <Play className="w-3.5 h-3.5" />
          {t("chat.startHint", "Type a message to start a new Claude Code run for this session.")}
        </div>
      )}

      <ChatModeSelector
        mode={mode}
        onChange={(next) => {
          if (workflow.kind !== "idle") {
            // TODO(i18n): hardcoded Chinese confirmation per brief; replace with i18n key when available.
            const ok = window.confirm("当前工作流尚未完成，切换模式将取消进度。是否继续？");
            if (!ok) return;
            cancelWorkflow();
          }
          setMode(next);
        }}
      />
      {workflow.kind !== "idle" && workflow.kind !== "done" && workflow.kind !== "error" && (
        <WorkflowProgress
          mode={workflow.mode}
          currentStepId={workflow.stepId}
          onCancel={cancelWorkflow}
        />
      )}

      {workflow.kind === "paused" && (
        <div className="px-4 py-2 border-b border-amber-500/20 bg-amber-500/10 text-xs text-amber-200">
          {/* TODO(i18n): hardcoded Chinese string per brief; replace with i18n key when available. */}
          当前步骤需要你的输入，请继续描述需求或回答问题。
        </div>
      )}

      {workflow.kind === "running" && pendingAutoAdvance && (
        <div className="px-4 py-2 border-b border-blue-500/20 bg-blue-500/10 text-xs text-blue-200">
          {/* TODO(i18n): hardcoded Chinese string per brief; replace with i18n key when available. */}
          当前步骤已完成，下一步将自动执行 {pendingAutoAdvance.command}。
        </div>
      )}

      <ChatMessageList
        envelopes={cleanedEnvelopes}
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
        onError={(msg) => workspaceActions.addProblem({ source: "chat-attachments", message: msg })}
        onStop={stop}
        disabled={busy === "start" || busy === "send" || busy === "stop" || isAutoAdvancePending}
        isLive={isLive}
        placeholder={mode === "normal" ? (canSend ? t("chat.followUpPlaceholder") : t("chat.startPlaceholder")) : getPlaceholder(mode)}
        slashCommands={slashCommands}
        fileCwd={cwd}
      />
    </div>
  );
}
