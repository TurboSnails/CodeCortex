import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { ChatTab } from "../ChatTab";
import { ChatWorkspaceProvider } from "../ChatWorkspaceContext";
import { api } from "../../../lib/api";
import type { RunHandle } from "../../../lib/api";

vi.mock("../../../lib/api", () => ({
  api: {
    run: {
      start: vi.fn(),
      send: vi.fn(),
      kill: vi.fn(),
      respondToPermission: vi.fn(),
      files: vi.fn(),
    },
    ccConfig: {
      commands: vi.fn(() => Promise.resolve({ items: [] })),
    },
  },
}));

let busCallback: ((msg: unknown) => void) | null = null;
vi.mock("../../../lib/eventBus", () => ({
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

// ChatTab now wires attachment errors through the workspace's addProblem
// action (which the ChatToast container reads), so it must be rendered
// inside the workspace provider.
function renderChatTab(props: { cwd: string }) {
  return render(
    <ChatWorkspaceProvider>
      <ChatTab cwd={props.cwd} />
    </ChatWorkspaceProvider>
  );
}

describe("ChatTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    busCallback = null;
  });

  it("renders start prompt placeholder when no run is active", () => {
    renderChatTab({ cwd: "/tmp" });
    expect(screen.getByPlaceholderText(/Ask Claude/)).toBeInTheDocument();
  });

  it("renders a textarea for input", () => {
    renderChatTab({ cwd: "/tmp" });
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("has a send button disabled when input is empty", () => {
    renderChatTab({ cwd: "/tmp" });
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn).toBeDisabled();
  });

  it("allows typing in the textarea", () => {
    renderChatTab({ cwd: "/tmp" });
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "hello world" } });
    expect(textarea).toHaveValue("hello world");
  });

  it("enables send button when text is entered", () => {
    renderChatTab({ cwd: "/tmp" });
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "hello" } });
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn).not.toBeDisabled();
  });

  it("uses an externally-supplied runChat instead of creating its own", () => {
    const externalRunChat = {
      handle: null,
      envelopes: [],
      displayEnvelopes: [],
      busy: null,
      error: null,
      followUp: "external draft",
      setFollowUp: vi.fn(),
      start: vi.fn(),
      send: vi.fn(),
      stop: vi.fn(),
      activePermissionRequest: null,
      respondToPermission: vi.fn(),
      isLive: false,
      isResponding: false,
      reset: vi.fn(),
    };
    render(
      <ChatWorkspaceProvider>
        <ChatTab cwd="/tmp" runChat={externalRunChat} />
      </ChatWorkspaceProvider>
    );
    expect(screen.getByRole("textbox")).toHaveValue("external draft");
  });

  it("disables the input while the assistant is responding, and re-enables once the reply completes", async () => {
    const handle: RunHandle = {
      id: "run-1",
      status: "spawning",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
      model: null,
      effort: null,
      prompt: "hi",
      argv: [],
      pid: null,
      resumeSessionId: null,
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      signal: null,
      error: null,
      sessionId: null,
      envelopeCount: 0,
      stdoutTail: "",
      stderrTail: "",
    };
    (api.run.start as ReturnType<typeof vi.fn>).mockResolvedValueOnce(handle);

    renderChatTab({ cwd: "/tmp" });
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "hi" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send/i }));
    });

    await waitFor(() => expect(textarea).toBeDisabled());

    act(() => {
      busCallback?.({
        type: "run_stream",
        data: {
          id: "run-1",
          envelope: { type: "stream_event", event: { type: "message_start", message: { id: "m1" } } },
        },
      });
    });
    expect(textarea).toBeDisabled();

    act(() => {
      busCallback?.({
        type: "run_stream",
        data: {
          id: "run-1",
          envelope: { type: "stream_event", event: { type: "message_stop", message: { id: "m1" } } },
        },
      });
    });

    await waitFor(() => expect(textarea).not.toBeDisabled());
  });
});