import { useEffect, useRef, useState } from "react";
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

  // If an API call (start/send) fails while a workflow is running, return the
  // workflow to idle. The useRunChat error banner already surfaces the message,
  // so we avoid duplicating it with a workflow error banner.
  useEffect(() => {
    if (!error || workflow.kind !== "running") return;
    setWorkflow({ kind: "idle" });
  }, [error, workflow]);

  useEffect(() => {
    if (workflow.kind === "idle") {
      lastHandledKey.current = null;
      return;
    }
    if (!marker || workflow.kind !== "running" || !isComplete) return;
    if (lastHandledKey.current === latestAssistantKey) return;
    lastHandledKey.current = latestAssistantKey;

    if (marker.kind === "error") {
      setWorkflow({ kind: "error", mode: workflow.mode, stepId: workflow.stepId, message: marker.message });
      return;
    }

    if (marker.kind === "done") {
      setWorkflow({ kind: "done", mode: workflow.mode });
      setMode("normal");
      return;
    }

    if (marker.kind === "pause") {
      setWorkflow({ kind: "paused", mode: workflow.mode, stepId: workflow.stepId, reason: "Waiting for user input" });
      return;
    }

    if (marker.kind === "continue") {
      const nextCommand = getNextCommand(workflow.mode, workflow.stepId);
      if (!nextCommand) {
        setWorkflow({ kind: "done", mode: workflow.mode });
        setMode("normal");
        return;
      }
      const nextStepId = getWorkflowSteps(workflow.mode).find((s) => s.command === nextCommand)?.id ?? workflow.stepId;
      send(nextCommand).catch((err: unknown) => {
        setWorkflow({
          kind: "error",
          mode: workflow.mode,
          stepId: workflow.stepId,
          message: err instanceof Error ? err.message : "auto-advance failed",
        });
      });
      setWorkflow({ kind: "running", mode: workflow.mode, stepId: nextStepId });
    }
  }, [marker, workflow, send, isComplete, latestAssistantKey]);

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
      setWorkflow({ kind: "running", mode, stepId: firstStep.id });
      await start(combined);
      return;
    }

    if (workflow.kind === "paused") {
      setWorkflow((w) => (w.kind === "paused" ? { ...w, kind: "running" } : w));
      await send(payload);
      return;
    }

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

      {workflow.kind === "error" && (
        <div className="px-4 py-2.5 border-b border-red-500/20 bg-red-500/10 flex items-center gap-2 text-sm text-red-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {workflow.message}
        </div>
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
            void stop();
            setWorkflow({ kind: "idle" });
          }
          setMode(next);
        }}
        disabled={workflow.kind === "running"}
      />
      {workflow.kind !== "idle" && workflow.kind !== "done" && workflow.kind !== "error" && (
        <WorkflowProgress
          mode={workflow.mode}
          currentStepId={workflow.stepId}
          onCancel={() => {
            void stop();
            setWorkflow({ kind: "idle" });
            setMode("normal");
          }}
        />
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
        disabled={busy === "start" || busy === "send" || busy === "stop"}
        isLive={isLive}
        placeholder={mode === "normal" ? (canSend ? t("chat.followUpPlaceholder") : t("chat.startPlaceholder")) : getPlaceholder(mode)}
        slashCommands={slashCommands}
        fileCwd={cwd}
      />
    </div>
  );
}
