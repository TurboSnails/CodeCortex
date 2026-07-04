import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Chat } from "../Chat";
import { api } from "../../lib/api";
import type { RunHandle } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    run: {
      cwds: vi.fn(() => Promise.resolve({ items: [{ path: "/tmp/project" }] })),
      start: vi.fn(),
      send: vi.fn(),
      kill: vi.fn(),
      respondToPermission: vi.fn(),
      files: vi.fn(),
    },
    files: {
      tree: vi.fn(() => Promise.resolve({ tree: [] })),
      content: vi.fn(() => Promise.resolve({ content: "" })),
    },
    git: {
      status: vi.fn(() => Promise.resolve({ staged: [], unstaged: [] })),
      diff: vi.fn(() => Promise.resolve({ diff: "" })),
    },
    ccConfig: {
      commands: vi.fn(() => Promise.resolve({ items: [] })),
    },
  },
}));

let busCallback: ((msg: unknown) => void) | null = null;
vi.mock("../../lib/eventBus", () => ({
  eventBus: {
    subscribe: vi.fn((cb: (msg: unknown) => void) => {
      busCallback = cb;
      return () => {
        busCallback = null;
      };
    }),
    connected: true,
    onConnection: vi.fn(() => () => {}),
  },
}));

const mockStart = vi.mocked(api.run.start);

function makeHandle(): RunHandle {
  return {
    id: "run-1",
    pid: 123,
    mode: "conversation",
    cwd: "/tmp/project",
    model: null,
    permissionMode: "acceptEdits",
    effort: null,
    prompt: "hello",
    argv: [],
    resumeSessionId: null,
    status: "running",
    startedAt: Date.now(),
    endedAt: null,
    exitCode: null,
    signal: null,
    error: null,
    sessionId: "sess-1",
    envelopeCount: 1,
    stdoutTail: "",
    stderrTail: "",
  };
}

describe("Chat page", () => {
  beforeEach(() => {
    busCallback = null;
    vi.clearAllMocks();
    mockStart.mockResolvedValue(makeHandle());
    (api.run.cwds as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [{ path: "/tmp/project" }] });
  });

  it("feeds real envelope data to the page-level status bar (not a dead runChat instance)", async () => {
    render(<Chat />);

    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    await waitFor(() => expect(busCallback).not.toBeNull());

    act(() => {
      busCallback?.({
        type: "run_stream",
        data: {
          id: "run-1",
          envelope: {
            type: "result",
            total_cost_usd: 0.25,
            modelUsage: {
              "claude-sonnet": {
                contextWindow: 200_000,
                inputTokens: 1000,
                outputTokens: 500,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
              },
            },
          },
        },
      });
    });

    await waitFor(() => expect(screen.getByText(/\$0\.2500/)).toBeInTheDocument());
  });

  it("resets run state when New Session is clicked while idle", async () => {
    render(<Chat />);

    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(busCallback).not.toBeNull());

    // Let the run finish so the page is genuinely idle before clicking New
    // Session - Task 9 adds a confirm-guard for the "still active" case,
    // which is covered separately and would otherwise intercept this click.
    act(() => {
      busCallback?.({
        type: "run_status",
        data: { id: "run-1", status: "completed", at: Date.now() },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /new session/i }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "second" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(2));
  });
});
