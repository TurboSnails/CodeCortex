/**
 * @file ChatWorkspaceContext.tsx
 * @description React Context + useReducer for the IDE-style /chat workspace.
 * Manages panel visibility, Activity Bar selection, file tree state, Git panel
 * state, and aggregated problems. Keeps related UI state in one place so the
 * Activity Bar, side panels, bottom panel, and status bar stay synchronized.
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import type { FileTreeNode, GitStatusResponse, GitDiffResponse } from "../../lib/api";

export type LeftSidebarView = "explorer" | "settings";
export type RightPanelTab = "tool" | "file" | "git";
export type BottomPanelTab = "terminal" | "problems";

export interface Problem {
  id: string;
  source: string;
  message: string;
  timestamp: number;
}

export interface ChatWorkspaceState {
  leftSidebar: {
    visible: boolean;
    activeView: LeftSidebarView;
  };
  rightPanel: {
    visible: boolean;
    activeTab: RightPanelTab;
  };
  bottomPanel: {
    visible: boolean;
    activeTab: BottomPanelTab;
  };
  explorer: {
    tree: FileTreeNode[] | null;
    loading: boolean;
    error: string | null;
    selectedPath: string | null;
    expandedPaths: Set<string>;
  };
  filePreview: {
    content: string | null;
    loading: boolean;
    error: string | null;
  };
  git: {
    status: GitStatusResponse | null;
    loading: boolean;
    error: string | null;
    selectedFile: string | null;
    diff: GitDiffResponse | null;
    diffLoading: boolean;
  };
  problems: Problem[];
  activeToolId: string | null;
  highlightedPaths: Set<string>;
  focusMode: boolean;
  preFocusSnapshot: { left: boolean; right: boolean; bottom: boolean } | null;
}

type Action =
  | { type: "toggle_left_sidebar" }
  | { type: "set_left_sidebar"; payload: boolean }
  | { type: "set_left_view"; payload: LeftSidebarView }
  | { type: "toggle_right_panel" }
  | { type: "set_right_panel"; payload: boolean }
  | { type: "set_right_tab"; payload: RightPanelTab }
  | { type: "toggle_bottom_panel" }
  | { type: "set_bottom_panel"; payload: boolean }
  | { type: "set_bottom_tab"; payload: BottomPanelTab }
  | { type: "set_explorer_tree"; payload: FileTreeNode[] }
  | { type: "set_explorer_loading"; payload: boolean }
  | { type: "set_explorer_error"; payload: string | null }
  | { type: "select_file"; payload: string | null }
  | { type: "toggle_expand_path"; payload: string }
  | { type: "set_file_preview"; payload: { content: string | null; loading: boolean; error: string | null } }
  | { type: "set_git_status"; payload: GitStatusResponse }
  | { type: "set_git_loading"; payload: boolean }
  | { type: "set_git_error"; payload: string | null }
  | { type: "select_git_file"; payload: string | null }
  | { type: "set_git_diff"; payload: { diff: GitDiffResponse | null; loading: boolean } }
  | { type: "add_problem"; payload: Omit<Problem, "id" | "timestamp"> }
  | { type: "clear_problems" }
  | { type: "remove_problem"; payload: string }
  | { type: "set_active_tool"; payload: string | null }
  | { type: "set_highlighted_paths"; payload: Set<string> }
  | { type: "open_file_preview"; payload: string }
  | { type: "toggle_focus_mode" };

const initialState: ChatWorkspaceState = {
  leftSidebar: { visible: true, activeView: "explorer" },
  rightPanel: { visible: true, activeTab: "tool" },
  bottomPanel: { visible: false, activeTab: "terminal" },
  explorer: {
    tree: null,
    loading: false,
    error: null,
    selectedPath: null,
    expandedPaths: new Set(),
  },
  filePreview: {
    content: null,
    loading: false,
    error: null,
  },
  git: {
    status: null,
    loading: false,
    error: null,
    selectedFile: null,
    diff: null,
    diffLoading: false,
  },
  problems: [],
  activeToolId: null,
  highlightedPaths: new Set(),
  focusMode: false,
  preFocusSnapshot: null,
};

function reducer(state: ChatWorkspaceState, action: Action): ChatWorkspaceState {
  switch (action.type) {
    case "toggle_left_sidebar":
      return { ...state, leftSidebar: { ...state.leftSidebar, visible: !state.leftSidebar.visible } };
    case "set_left_sidebar":
      return { ...state, leftSidebar: { ...state.leftSidebar, visible: action.payload } };
    case "set_left_view":
      return {
        ...state,
        leftSidebar: { visible: true, activeView: action.payload },
      };
    case "toggle_right_panel":
      return { ...state, rightPanel: { ...state.rightPanel, visible: !state.rightPanel.visible } };
    case "set_right_panel":
      return { ...state, rightPanel: { ...state.rightPanel, visible: action.payload } };
    case "set_right_tab":
      return { ...state, rightPanel: { visible: true, activeTab: action.payload } };
    case "toggle_bottom_panel":
      return { ...state, bottomPanel: { ...state.bottomPanel, visible: !state.bottomPanel.visible } };
    case "set_bottom_panel":
      return { ...state, bottomPanel: { ...state.bottomPanel, visible: action.payload } };
    case "set_bottom_tab":
      return { ...state, bottomPanel: { ...state.bottomPanel, activeTab: action.payload } };
    case "set_explorer_tree":
      return { ...state, explorer: { ...state.explorer, tree: action.payload, loading: false, error: null } };
    case "set_explorer_loading":
      return { ...state, explorer: { ...state.explorer, loading: action.payload } };
    case "set_explorer_error":
      return { ...state, explorer: { ...state.explorer, error: action.payload, loading: false, tree: null } };
    case "select_file":
      return { ...state, explorer: { ...state.explorer, selectedPath: action.payload } };
    case "toggle_expand_path": {
      const next = new Set(state.explorer.expandedPaths);
      if (next.has(action.payload)) next.delete(action.payload);
      else next.add(action.payload);
      return { ...state, explorer: { ...state.explorer, expandedPaths: next } };
    }
    case "set_file_preview":
      return { ...state, filePreview: action.payload };
    case "open_file_preview":
      return {
        ...state,
        rightPanel: { visible: true, activeTab: "file" },
        explorer: { ...state.explorer, selectedPath: action.payload },
      };
    case "set_git_status":
      return { ...state, git: { ...state.git, status: action.payload, loading: false, error: null } };
    case "set_git_loading":
      return { ...state, git: { ...state.git, loading: action.payload } };
    case "set_git_error":
      return { ...state, git: { ...state.git, error: action.payload, loading: false } };
    case "select_git_file":
      return { ...state, git: { ...state.git, selectedFile: action.payload } };
    case "set_git_diff":
      return {
        ...state,
        git: { ...state.git, diff: action.payload.diff, diffLoading: action.payload.loading },
      };
    case "add_problem": {
      const problem: Problem = {
        ...action.payload,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
      };
      return { ...state, problems: [problem, ...state.problems].slice(0, 100) };
    }
    case "clear_problems":
      return { ...state, problems: [] };
    case "remove_problem":
      return { ...state, problems: state.problems.filter((p) => p.id !== action.payload) };
    case "set_active_tool":
      return { ...state, activeToolId: action.payload };
    case "set_highlighted_paths":
      return { ...state, highlightedPaths: action.payload };
    case "toggle_focus_mode": {
      if (!state.focusMode) {
        return {
          ...state,
          focusMode: true,
          preFocusSnapshot: {
            left: state.leftSidebar.visible,
            right: state.rightPanel.visible,
            bottom: state.bottomPanel.visible,
          },
          leftSidebar: { ...state.leftSidebar, visible: false },
          rightPanel: { ...state.rightPanel, visible: false },
          bottomPanel: { ...state.bottomPanel, visible: false },
        };
      }
      const snap = state.preFocusSnapshot ?? { left: true, right: true, bottom: false };
      return {
        ...state,
        focusMode: false,
        preFocusSnapshot: null,
        leftSidebar: { ...state.leftSidebar, visible: snap.left },
        rightPanel: { ...state.rightPanel, visible: snap.right },
        bottomPanel: { ...state.bottomPanel, visible: snap.bottom },
      };
    }
    default:
      return state;
  }
}

interface ChatWorkspaceContextValue {
  state: ChatWorkspaceState;
  dispatch: React.Dispatch<Action>;
}

const ChatWorkspaceContext = createContext<ChatWorkspaceContextValue | null>(null);

export function ChatWorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <ChatWorkspaceContext.Provider value={{ state, dispatch }}>
      {children}
    </ChatWorkspaceContext.Provider>
  );
}

export function useChatWorkspace() {
  const ctx = useContext(ChatWorkspaceContext);
  if (!ctx) {
    throw new Error("useChatWorkspace must be used within ChatWorkspaceProvider");
  }
  return ctx;
}

export function useChatWorkspaceActions() {
  const { dispatch } = useChatWorkspace();

  const toggleLeftSidebar = useCallback(() => dispatch({ type: "toggle_left_sidebar" }), [dispatch]);
  const showLeftSidebar = useCallback((v: boolean) => dispatch({ type: "set_left_sidebar", payload: v }), [dispatch]);
  const setLeftView = useCallback((v: LeftSidebarView) => dispatch({ type: "set_left_view", payload: v }), [dispatch]);
  const toggleRightPanel = useCallback(() => dispatch({ type: "toggle_right_panel" }), [dispatch]);
  const showRightPanel = useCallback((v: boolean) => dispatch({ type: "set_right_panel", payload: v }), [dispatch]);
  const setRightTab = useCallback((v: RightPanelTab) => dispatch({ type: "set_right_tab", payload: v }), [dispatch]);
  const toggleBottomPanel = useCallback(() => dispatch({ type: "toggle_bottom_panel" }), [dispatch]);
  const showBottomPanel = useCallback((v: boolean) => dispatch({ type: "set_bottom_panel", payload: v }), [dispatch]);
  const setBottomTab = useCallback((v: BottomPanelTab) => dispatch({ type: "set_bottom_tab", payload: v }), [dispatch]);
  const setExplorerTree = useCallback((tree: FileTreeNode[]) => dispatch({ type: "set_explorer_tree", payload: tree }), [dispatch]);
  const setExplorerLoading = useCallback((v: boolean) => dispatch({ type: "set_explorer_loading", payload: v }), [dispatch]);
  const setExplorerError = useCallback((err: string | null) => dispatch({ type: "set_explorer_error", payload: err }), [dispatch]);
  const selectFile = useCallback((path: string | null) => dispatch({ type: "select_file", payload: path }), [dispatch]);
  const toggleExpandPath = useCallback((path: string) => dispatch({ type: "toggle_expand_path", payload: path }), [dispatch]);
  const setFilePreview = useCallback(
    (payload: { content: string | null; loading: boolean; error: string | null }) => dispatch({ type: "set_file_preview", payload }),
    [dispatch]
  );
  const openFilePreview = useCallback((path: string) => dispatch({ type: "open_file_preview", payload: path }), [dispatch]);
  const setGitStatus = useCallback((status: GitStatusResponse) => dispatch({ type: "set_git_status", payload: status }), [dispatch]);
  const setGitLoading = useCallback((v: boolean) => dispatch({ type: "set_git_loading", payload: v }), [dispatch]);
  const setGitError = useCallback((err: string | null) => dispatch({ type: "set_git_error", payload: err }), [dispatch]);
  const selectGitFile = useCallback((file: string | null) => dispatch({ type: "select_git_file", payload: file }), [dispatch]);
  const setGitDiff = useCallback(
    (payload: { diff: GitDiffResponse | null; loading: boolean }) => dispatch({ type: "set_git_diff", payload }),
    [dispatch]
  );
  const addProblem = useCallback((problem: Omit<Problem, "id" | "timestamp">) => dispatch({ type: "add_problem", payload: problem }), [dispatch]);
  const clearProblems = useCallback(() => dispatch({ type: "clear_problems" }), [dispatch]);
  const removeProblem = useCallback((id: string) => dispatch({ type: "remove_problem", payload: id }), [dispatch]);
  const setActiveTool = useCallback((id: string | null) => dispatch({ type: "set_active_tool", payload: id }), [dispatch]);
  const setHighlightedPaths = useCallback((paths: Set<string>) => dispatch({ type: "set_highlighted_paths", payload: paths }), [dispatch]);
  const toggleFocusMode = useCallback(() => dispatch({ type: "toggle_focus_mode" }), [dispatch]);

  return useMemo(
    () => ({
      toggleLeftSidebar,
      showLeftSidebar,
      setLeftView,
      toggleRightPanel,
      showRightPanel,
      setRightTab,
      toggleBottomPanel,
      showBottomPanel,
      setBottomTab,
      setExplorerTree,
      setExplorerLoading,
      setExplorerError,
      selectFile,
      toggleExpandPath,
      setFilePreview,
      openFilePreview,
      setGitStatus,
      setGitLoading,
      setGitError,
      selectGitFile,
      setGitDiff,
      addProblem,
      clearProblems,
      removeProblem,
      setActiveTool,
      setHighlightedPaths,
      toggleFocusMode,
    }),
    [
      toggleLeftSidebar,
      showLeftSidebar,
      setLeftView,
      toggleRightPanel,
      showRightPanel,
      setRightTab,
      toggleBottomPanel,
      showBottomPanel,
      setBottomTab,
      setExplorerTree,
      setExplorerLoading,
      setExplorerError,
      selectFile,
      toggleExpandPath,
      setFilePreview,
      openFilePreview,
      setGitStatus,
      setGitLoading,
      setGitError,
      selectGitFile,
      setGitDiff,
      addProblem,
      clearProblems,
      removeProblem,
      setActiveTool,
      setHighlightedPaths,
      toggleFocusMode,
    ]
  );
}
