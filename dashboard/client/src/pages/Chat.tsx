/**
 * @file Chat.tsx
 * @description Top-level interactive Claude Code chat page rendered as an
 * IDE-style workspace. Combines the existing chat stream with an Explorer,
 * Git panel, Tool details, output log, and status bar.
 */

import { useEffect, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MessageSquare, History, RefreshCw, Maximize2, Minimize2 } from "lucide-react";
import { api } from "../lib/api";
import type { CwdSuggestion } from "../lib/api";
import { ChatTab } from "../components/chat/ChatTab";
import { ChatWorkspaceProvider, useChatWorkspace, useChatWorkspaceActions } from "../components/chat/ChatWorkspaceContext";
import { ActivityBar } from "../components/chat/ActivityBar";
import { ResizablePanel } from "../components/chat/ResizablePanel";
import { FileTree } from "../components/chat/FileTree";
import { FilePreview } from "../components/chat/FilePreview";
import { GitPanel } from "../components/chat/GitPanel";
import { ToolDetails } from "../components/chat/ToolDetails";
import { BottomPanel } from "../components/chat/BottomPanel";
import { ChatStatusBar } from "../components/chat/ChatStatusBar";
import { ChatToastContainer } from "../components/chat/ChatToast";
import { useChatShortcuts } from "../components/chat/useChatShortcuts";
import { useRunChat } from "../components/chat/useRunChat";
import { SessionHistoryDialog } from "../components/chat/SessionHistoryDialog";
import { ConfirmDialog } from "../components/chat/ConfirmDialog";

function ChatWorkspace() {
  const { t } = useTranslation(["sessions", "run", "common"]);
  const { state } = useChatWorkspace();
  const actions = useChatWorkspaceActions();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const newSessionId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `chat-${Date.now()}`;

  const [sessionId, setSessionId] = useState(newSessionId);

  const [cwd, setCwd] = useState("");
  const [cwds, setCwds] = useState<CwdSuggestion[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingNewSession, setPendingNewSession] = useState(false);

  useEffect(() => {
    api.run
      .cwds()
      .then((res) => {
        setCwds(res.items);
        const first = res.items[0];
        if (first) {
          setCwd((current) => current || first.path);
        }
      })
      .catch(console.error);
  }, []);

  const runChat = useRunChat({ cwd, initialModel: selectedModel || undefined });
  const {
    handle,
    displayEnvelopes,
    busy,
    error,
    activePermissionRequest,
    respondToPermission,
    isLive,
    stop,
  } = runChat;

  // Load file tree when cwd changes
  useEffect(() => {
    if (!cwd) return;
    let cancelled = false;
    actions.setExplorerLoading(true);
    api.files
      .tree(cwd, 3)
      .then((res) => {
        if (cancelled) return;
        actions.setExplorerTree(res.tree);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "failed to load files";
        actions.setExplorerError(message);
        actions.addProblem({ source: "explorer", message });
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, actions]);

  // Load file preview when selected path changes
  useEffect(() => {
    const path = state.explorer.selectedPath;
    if (!path || !cwd) {
      actions.setFilePreview({ content: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    actions.setFilePreview({ content: null, loading: true, error: null });
    api.files
      .content(cwd, path)
      .then((res) => {
        if (cancelled) return;
        actions.setFilePreview({ content: res.content, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "failed to read file";
        actions.setFilePreview({
          content: null,
          loading: false,
          error: message,
        });
        actions.addProblem({ source: "file", message });
      });
    return () => {
      cancelled = true;
    };
  }, [state.explorer.selectedPath, cwd, actions]);

  // Load Git status when cwd or Git view activates
  const loadGitStatus = useCallback(() => {
    if (!cwd) return;
    actions.setGitLoading(true);
    api.git
      .status(cwd)
      .then((status) => {
        actions.setGitStatus(status);
      })
      .catch((err) => {
        actions.setGitError(err instanceof Error ? err.message : "git status failed");
      });
  }, [cwd, actions]);

  useEffect(() => {
    if (state.rightPanel.activeTab === "git") {
      loadGitStatus();
    }
  }, [state.rightPanel.activeTab, cwd, loadGitStatus]);

  // Load Git diff when selected file changes
  useEffect(() => {
    const file = state.git.selectedFile;
    if (!file || !cwd) {
      actions.setGitDiff({ diff: null, loading: false });
      return;
    }
    const isStaged = state.git.status?.staged.some((s) => s.file === file) ?? false;
    actions.setGitDiff({ diff: null, loading: true });
    api.git
      .diff(cwd, file, isStaged)
      .then((diff) => {
        actions.setGitDiff({ diff, loading: false });
      })
      .catch(() => {
        actions.setGitDiff({ diff: null, loading: false });
      });
  }, [state.git.selectedFile, state.git.status, cwd, actions]);

  // Highlight files targeted by current tool_use or permission_request
  useEffect(() => {
    const paths = new Set<string>();
    for (const env of displayEnvelopes) {
      const e = env as { type?: string; name?: string; input?: { file_path?: string; path?: string } };
      if (e.type === "tool_use" && ["read", "write", "edit"].includes(e.name?.toLowerCase() || "")) {
        const p = e.input?.file_path || e.input?.path;
        if (p) paths.add(p);
      }
      if (e.type === "permission_request") {
        const p = (e as { path?: string }).path;
        if (p) paths.add(p);
      }
    }
    actions.setHighlightedPaths(paths);
  }, [displayEnvelopes, actions]);

  // Auto-expand bottom panel on Bash output
  const prevBashCountRef = useRef(0);
  useEffect(() => {
    const bashCount = displayEnvelopes.filter((e) => {
      const t = (e as { type?: string; name?: string }).type;
      const n = (e as { name?: string }).name;
      return t === "tool_use" && n?.toLowerCase() === "bash";
    }).length;
    if (bashCount > prevBashCountRef.current && !state.bottomPanel.visible) {
      actions.showBottomPanel(true);
    }
    prevBashCountRef.current = bashCount;
  }, [displayEnvelopes, state.bottomPanel.visible, actions]);

  useChatShortcuts({
    toggleLeftSidebar: actions.toggleLeftSidebar,
    setLeftView: actions.setLeftView,
    toggleRightPanel: actions.toggleRightPanel,
    setRightTab: actions.setRightTab,
    toggleBottomPanel: actions.toggleBottomPanel,
    setBottomTab: actions.setBottomTab,
    stopRun: isLive ? stop : undefined,
    toggleFocusMode: actions.toggleFocusMode,
  });

  const handleFileSelect = useCallback(
    (path: string, type: "file" | "directory") => {
      if (type === "file") {
        actions.openFilePreview(path);
      }
      // For directories: FileTree's onClick now handles expand/collapse
      // via onToggle only. We do nothing here to avoid a double-toggle.
    },
    [actions]
  );

  const handleGitStage = useCallback(
    async (file?: string) => {
      if (!cwd) return;
      try {
        await api.git.stage(cwd, file);
        loadGitStatus();
      } catch (err) {
        actions.addProblem({ source: "git", message: err instanceof Error ? err.message : "stage failed" });
      }
    },
    [cwd, loadGitStatus, actions]
  );

  const handleGitUnstage = useCallback(
    async (file?: string) => {
      if (!cwd) return;
      try {
        await api.git.unstage(cwd, file);
        loadGitStatus();
      } catch (err) {
        actions.addProblem({ source: "git", message: err instanceof Error ? err.message : "unstage failed" });
      }
    },
    [cwd, loadGitStatus, actions]
  );

  const handleGitCommit = useCallback(
    async (message: string) => {
      if (!cwd) return;
      try {
        await api.git.commit(cwd, message);
        loadGitStatus();
      } catch (err) {
        actions.addProblem({ source: "git", message: err instanceof Error ? err.message : "commit failed" });
      }
    },
    [cwd, loadGitStatus, actions]
  );

  const handleGitPush = useCallback(async () => {
    if (!cwd) return;
    try {
      await api.git.push(cwd, true);
      loadGitStatus();
    } catch (err) {
      actions.addProblem({ source: "git", message: err instanceof Error ? err.message : "push failed" });
    }
  }, [cwd, loadGitStatus, actions]);

  const resetToNewSession = useCallback(() => {
    runChat.reset();
    setSessionId(newSessionId());
  }, [runChat]);

  const handleNewSessionClick = useCallback(() => {
    if (runChat.isLive || runChat.followUp.trim().length > 0) {
      setPendingNewSession(true);
      return;
    }
    resetToNewSession();
  }, [runChat, resetToNewSession]);

  const leftHeader = state.leftSidebar.activeView === "explorer" ? "Explorer" : "Settings";

  const leftContent =
    state.leftSidebar.activeView === "explorer" ? (
      state.explorer.tree ? (
        <FileTree
          nodes={state.explorer.tree}
          expandedPaths={state.explorer.expandedPaths}
          selectedPath={state.explorer.selectedPath}
          highlightedPaths={state.highlightedPaths}
          onToggle={actions.toggleExpandPath}
          onSelect={handleFileSelect}
        />
      ) : state.explorer.loading ? (
        <div className="p-3 text-xs text-gray-500">Loading files...</div>
      ) : (
        <div className="p-3 text-xs text-red-300">{state.explorer.error || "No files"}</div>
      )
    ) : (
      <div className="p-3 text-xs text-gray-500">Settings panel placeholder.</div>
    );

  const rightContent =
    state.rightPanel.activeTab === "tool" ? (
      <ToolDetails
        envelopes={displayEnvelopes}
        activePermissionRequest={activePermissionRequest}
        onApprove={() => respondToPermission(true)}
        onReject={() => respondToPermission(false)}
        permissionBusy={busy !== null}
      />
    ) : state.rightPanel.activeTab === "file" ? (
      <FilePreview
        path={state.explorer.selectedPath}
        content={state.filePreview.content}
        loading={state.filePreview.loading}
        error={state.filePreview.error}
      />
    ) : (
      <GitPanel
        cwd={cwd}
        status={state.git.status}
        diff={state.git.diff}
        loading={state.git.loading}
        diffLoading={state.git.diffLoading}
        error={state.git.error}
        selectedFile={state.git.selectedFile}
        onSelectFile={actions.selectGitFile}
        onStage={handleGitStage}
        onUnstage={handleGitUnstage}
        onCommit={handleGitCommit}
        onPush={handleGitPush}
      />
    );

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] lg:h-[calc(100vh-6rem)] overflow-hidden">
      <div className="md:hidden flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-surface-1">
        <button
          type="button"
          aria-label={mobileSidebarOpen ? "Hide sidebar" : "Show sidebar"}
          onClick={() => setMobileSidebarOpen((v) => !v)}
          className="p-2 rounded-lg hover:bg-surface-3"
        >
          <Menu className="w-4 h-4 text-gray-200" />
        </button>
        <span className="text-xs text-gray-400 truncate">{cwd || ""}</span>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">/chat</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100 flex items-center gap-2">
            <MessageSquare className="w-6 h-6" />
            {t("chat.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t("chat.startHint")}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={actions.toggleFocusMode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-gray-300 border border-border hover:bg-surface-3 hover:text-gray-100 transition-colors"
          >
            {state.focusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {state.focusMode ? t("chat.exitFocusMode") : t("chat.focusMode")}
          </button>
          <button
            type="button"
            onClick={handleNewSessionClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-gray-300 border border-border hover:bg-surface-3 hover:text-gray-100 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t("chat.newSession")}
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-gray-300 border border-border hover:bg-surface-3 hover:text-gray-100 transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            {t("chat.history")}
          </button>
          <div className="min-w-[16rem]">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              {t("run:fields.cwd")}
            </label>
            <select
              className="input w-full text-sm"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
            >
              {cwds.map((item) => (
                <option key={item.path} value={item.path}>
                  {item.path}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex border border-border rounded-xl overflow-hidden bg-surface-1">
        {!state.focusMode && (
          <div className={mobileSidebarOpen ? "block md:contents" : "hidden md:contents"}>
            <ActivityBar active={state.leftSidebar.activeView} onChange={(v) => { actions.setLeftView(v); setMobileSidebarOpen(false); }} />
            <ResizablePanel
              side="left"
              visible={state.leftSidebar.visible}
              defaultWidth={240}
              onToggle={actions.toggleLeftSidebar}
              header={leftHeader}
            >
              {leftContent}
            </ResizablePanel>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          {error && (
            <div className="px-4 py-2 border-b border-red-500/20 bg-red-500/10 text-sm text-red-200 flex items-center gap-2 flex-shrink-0">
              {error}
            </div>
          )}

          <div className="flex-1 min-h-0">
            {cwd ? (
              <ChatTab key={sessionId} runChat={runChat} cwd={cwd} className="h-full border-0 rounded-none" />
            ) : null}
          </div>

          {state.bottomPanel.visible && (
            <div className="hidden md:block h-48 border-t border-border flex-shrink-0">
              <BottomPanel envelopes={displayEnvelopes} />
            </div>
          )}

          <ChatStatusBar
            cwd={cwd}
            model={handle?.model || selectedModel || null}
            onModelChange={setSelectedModel}
            sessionId={handle?.sessionId}
            envelopes={displayEnvelopes}
          />
        </div>

        <ChatToastContainer />

        <ResizablePanel
          side="right"
          visible={state.rightPanel.visible}
          defaultWidth={280}
          onToggle={actions.toggleRightPanel}
          header={
            state.rightPanel.activeTab === "tool"
              ? "Tool Details"
              : state.rightPanel.activeTab === "file"
                ? "File Preview"
                : "Git"
          }
        >
          <div className="flex border-b border-border">
            {(["tool", "file", "git"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => actions.setRightTab(tab)}
                className={`flex-1 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  state.rightPanel.activeTab === tab
                    ? "text-accent border-b-2 border-accent bg-accent/5"
                    : "text-gray-500 hover:text-gray-300 hover:bg-surface-2"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {rightContent}
        </ResizablePanel>
      </div>

      <ConfirmDialog
        open={pendingNewSession}
        title={t("chat.newSessionConfirmTitle")}
        message={t("chat.newSessionConfirmMessage")}
        confirmLabel={t("chat.newSessionConfirmAction")}
        cancelLabel={t("common:cancel")}
        destructive
        onConfirm={() => {
          setPendingNewSession(false);
          resetToNewSession();
        }}
        onCancel={() => setPendingNewSession(false)}
      />
      <SessionHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(id) => setSessionId(id)}
      />
    </div>
  );
}

export function Chat() {
  return (
    <ChatWorkspaceProvider>
      <ChatWorkspace />
    </ChatWorkspaceProvider>
  );
}
