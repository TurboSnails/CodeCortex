import { describe, it, expect, vi } from "vitest";
import { render, screen, renderHook, act } from "@testing-library/react";
import {
  ChatWorkspaceProvider,
  useChatWorkspace,
  useChatWorkspaceActions,
} from "../ChatWorkspaceContext";
import { computeTokens, formatNum, TokenMeter } from "../TokenMeter";
import type { Envelope } from "../types";
import type { FileTreeNode } from "../../../lib/api";

function wrapper({ children }: { children: React.ReactNode }) {
  return <ChatWorkspaceProvider>{children}</ChatWorkspaceProvider>;
}

describe("TokenMeter", () => {
  it("computeTokens returns zeros for empty envelopes", () => {
    const stats = computeTokens([]);
    expect(stats).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: null,
      contextWindow: null,
    });
  });

  it("extracts usage from result modelUsage", () => {
    const envelopes: Envelope[] = [
      {
        type: "result",
        total_cost_usd: 0.1234,
        modelUsage: {
          "claude-sonnet": {
            contextWindow: 200_000,
            inputTokens: 1000,
            outputTokens: 500,
            cacheReadInputTokens: 200,
            cacheCreationInputTokens: 50,
          },
        },
      },
    ];
    const stats = computeTokens(envelopes);
    expect(stats.inputTokens).toBe(1000);
    expect(stats.outputTokens).toBe(500);
    expect(stats.cacheReadTokens).toBe(200);
    expect(stats.cacheCreationTokens).toBe(50);
    expect(stats.costUsd).toBe(0.1234);
    expect(stats.contextWindow).toBe(200_000);
  });

  it("sets 1M context window for [1m] model system init", () => {
    const envelopes: Envelope[] = [
      { type: "system", subtype: "init", model: "claude-opus-4-8[1m]" },
    ];
    const stats = computeTokens(envelopes);
    expect(stats.contextWindow).toBe(1_000_000);
  });

  it("formatNum renders compact token counts", () => {
    expect(formatNum(0)).toBe("0");
    expect(formatNum(999)).toBe("999");
    expect(formatNum(1500)).toBe("1.5k");
    expect(formatNum(100_000)).toBe("100k");
    expect(formatNum(1_500_000)).toBe("1.50M");
  });

  it("TokenMeter renders percentage bar", () => {
    render(
      <TokenMeter
        stats={{
          inputTokens: 50_000,
          outputTokens: 10_000,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          costUsd: 0.05,
          contextWindow: 200_000,
        }}
      />
    );
    expect(screen.getByText(/25%/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.0500/)).toBeInTheDocument();
  });
});

describe("ChatWorkspaceContext", () => {
  it("throws when useChatWorkspace is used outside provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useChatWorkspace())).toThrow(
      "useChatWorkspace must be used within ChatWorkspaceProvider"
    );
    vi.restoreAllMocks();
  });

  it("initial state has explorer visible and bottom hidden", () => {
    const { result } = renderHook(() => useChatWorkspace(), { wrapper });
    expect(result.current.state.leftSidebar.visible).toBe(true);
    expect(result.current.state.leftSidebar.activeView).toBe("explorer");
    expect(result.current.state.bottomPanel.visible).toBe(false);
    expect(result.current.state.problems).toEqual([]);
  });

  it("toggleLeftSidebar flips visibility", () => {
    const { result } = renderHook(() => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }), {
      wrapper,
    });
    act(() => result.current.actions.toggleLeftSidebar());
    expect(result.current.state.leftSidebar.visible).toBe(false);
    act(() => result.current.actions.toggleLeftSidebar());
    expect(result.current.state.leftSidebar.visible).toBe(true);
  });

  it("setLeftView opens sidebar and switches view", () => {
    const { result } = renderHook(() => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }), {
      wrapper,
    });
    act(() => result.current.actions.toggleLeftSidebar());
    expect(result.current.state.leftSidebar.visible).toBe(false);
    act(() => result.current.actions.setLeftView("git"));
    expect(result.current.state.leftSidebar.visible).toBe(true);
    expect(result.current.state.leftSidebar.activeView).toBe("git");
  });

  it("setExplorerTree updates tree and clears loading/error", () => {
    const { result } = renderHook(() => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }), {
      wrapper,
    });
    const tree: FileTreeNode[] = [{ name: "src", type: "directory", path: "src", children: [] }];
    act(() => result.current.actions.setExplorerTree(tree));
    expect(result.current.state.explorer.tree).toBe(tree);
    expect(result.current.state.explorer.loading).toBe(false);
    expect(result.current.state.explorer.error).toBeNull();
  });

  it("addProblem appends problem with id and timestamp", () => {
    const { result } = renderHook(() => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }), {
      wrapper,
    });
    act(() => result.current.actions.addProblem({ source: "git", message: "stage failed" }));
    expect(result.current.state.problems).toHaveLength(1);
    const p = result.current.state.problems[0]!;
    expect(p.source).toBe("git");
    expect(p.message).toBe("stage failed");
    expect(typeof p.id).toBe("string");
    expect(typeof p.timestamp).toBe("number");
  });

  it("keeps at most 100 problems", () => {
    const { result } = renderHook(() => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }), {
      wrapper,
    });
    act(() => {
      for (let i = 0; i < 105; i++) {
        result.current.actions.addProblem({ source: "test", message: `problem ${i}` });
      }
    });
    expect(result.current.state.problems).toHaveLength(100);
    expect(result.current.state.problems[0]!.message).toBe("problem 104");
  });

  it("toggleFocusMode hides all panels and snapshots prior visibility", () => {
    const { result } = renderHook(
      () => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }),
      { wrapper }
    );
    act(() => result.current.actions.toggleBottomPanel()); // bottom becomes visible

    act(() => result.current.actions.toggleFocusMode());

    expect(result.current.state.focusMode).toBe(true);
    expect(result.current.state.leftSidebar.visible).toBe(false);
    expect(result.current.state.rightPanel.visible).toBe(false);
    expect(result.current.state.bottomPanel.visible).toBe(false);
  });

  it("toggleFocusMode restores the exact prior visibility on exit", () => {
    const { result } = renderHook(
      () => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }),
      { wrapper }
    );
    act(() => result.current.actions.toggleRightPanel()); // right panel becomes hidden (was visible)

    act(() => result.current.actions.toggleFocusMode()); // enter focus
    act(() => result.current.actions.toggleFocusMode()); // exit focus

    expect(result.current.state.focusMode).toBe(false);
    expect(result.current.state.leftSidebar.visible).toBe(true);
    expect(result.current.state.rightPanel.visible).toBe(false);
    expect(result.current.state.bottomPanel.visible).toBe(false);
  });

  it("clearProblems removes all problems", () => {
    const { result } = renderHook(() => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }), {
      wrapper,
    });
    act(() => result.current.actions.addProblem({ source: "git", message: "x" }));
    act(() => result.current.actions.clearProblems());
    expect(result.current.state.problems).toHaveLength(0);
  });

  it("openFilePreview selects file and switches right panel to file tab", () => {
    const { result } = renderHook(() => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }), {
      wrapper,
    });
    act(() => result.current.actions.openFilePreview("src/index.ts"));
    expect(result.current.state.explorer.selectedPath).toBe("src/index.ts");
    expect(result.current.state.rightPanel.activeTab).toBe("file");
    expect(result.current.state.rightPanel.visible).toBe(true);
  });
});
