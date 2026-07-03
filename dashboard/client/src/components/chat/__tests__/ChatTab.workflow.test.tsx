import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ChatTab } from "../ChatTab";
import { ChatWorkspaceProvider } from "../ChatWorkspaceContext";
import { api } from "../../../lib/api";
import type { RunHandle } from "../../../lib/api";
import type { Envelope } from "../types";

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

const mockStart = vi.mocked(api.run.start);
const mockSend = vi.mocked(api.run.send);
const mockKill = vi.mocked(api.run.kill);
const mockRespondToPermission = vi.mocked(api.run.respondToPermission);

function renderChatTab(props = { sessionId: "sess-1", cwd: "/tmp" }) {
  return render(
    <ChatWorkspaceProvider>
      <ChatTab {...props} />
    </ChatWorkspaceProvider>
  );
}

function makeHandle(status: RunHandle["status"] = "running"): RunHandle {
  return {
    id: "run-1",
    pid: 123,
    mode: "conversation",
    cwd: "/tmp",
    model: null,
    permissionMode: "acceptEdits",
    effort: null,
    prompt: "hello",
    argv: [],
    resumeSessionId: null,
    status,
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

function publishEnvelope(handleId: string, envelope: Envelope) {
  act(() => {
    busCallback?.({
      type: "run_stream",
      data: { id: handleId, envelope },
    });
  });
}

describe("ChatTab workflow mode", () => {
  beforeEach(() => {
    busCallback = null;
    vi.clearAllMocks();
  });

  it("injects the first step command when sending in a non-normal mode", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());

    renderChatTab();

    fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "add login" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore add login" }))
    );
    expect(screen.getByText("explore")).toBeInTheDocument();
  });

  it("auto-advances to the next step on a CONTINUE marker", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());
    mockSend.mockResolvedValueOnce({ messageId: "msg-2" });

    renderChatTab();

    fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "build feature" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore build feature" })));
    expect(screen.getByText("explore")).toBeInTheDocument();
    await waitFor(() => expect(busCallback).not.toBeNull());

    publishEnvelope("run-1", {
      type: "assistant",
      message: { content: [{ type: "text", text: "ok <!-- __WORKFLOW:CONTINUE__ -->" }] },
    });

    await waitFor(
      () => expect(mockSend).toHaveBeenCalledWith("run-1", "/opsx:propose", []),
      { timeout: 1500 }
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(screen.getByText("propose")).toBeInTheDocument();
  });

  it("pauses the workflow on a PAUSE marker and lets the user resume", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());
    mockSend.mockResolvedValueOnce({ messageId: "msg-2" });

    renderChatTab();

    fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "plan api" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore plan api" })));
    await waitFor(() => expect(busCallback).not.toBeNull());

    publishEnvelope("run-1", {
      type: "assistant",
      message: { content: [{ type: "text", text: "waiting <!-- __WORKFLOW:PAUSE__ -->" }] },
    });

    await waitFor(() => expect(screen.getByText("explore")).toBeInTheDocument());
    expect(mockSend).not.toHaveBeenCalled();

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "continue" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith("run-1", "continue", []));
  });

  it("finishes the workflow on a DONE marker", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());

    renderChatTab();

    fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "finish" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore finish" })));
    expect(screen.getByLabelText("Cancel workflow")).toBeInTheDocument();
    await waitFor(() => expect(busCallback).not.toBeNull());

    publishEnvelope("run-1", {
      type: "assistant",
      message: { content: [{ type: "text", text: "all done <!-- __WORKFLOW:DONE__ -->" }] },
    });

    await waitFor(() => expect(screen.queryByLabelText("Cancel workflow")).not.toBeInTheDocument());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("stops and shows an error on an ERROR marker", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());

    renderChatTab();

    fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "boom" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore boom" })));
    await waitFor(() => expect(busCallback).not.toBeNull());

    publishEnvelope("run-1", {
      type: "assistant",
      message: { content: [{ type: "text", text: "failed <!-- __WORKFLOW:ERROR:bad step__ -->" }] },
    });

    await waitFor(() => expect(screen.getByText("bad step")).toBeInTheDocument());
    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Cancel workflow")).not.toBeInTheDocument();
  });

  it("stops the workflow when cancel is clicked", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());
    mockKill.mockResolvedValueOnce({ ok: true });

    renderChatTab();

    fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "cancel me" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore cancel me" })));
    expect(screen.getByLabelText("Cancel workflow")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Cancel workflow"));

    await waitFor(() => expect(mockKill).toHaveBeenCalledWith("run-1"));
    expect(screen.queryByLabelText("Cancel workflow")).not.toBeInTheDocument();
  });

  it("enters an error state with Retry/Cancel when the first-workflow start fails", async () => {
    mockStart.mockRejectedValueOnce(new Error("backend down"));

    renderChatTab();

    fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "fail me" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore fail me" }))
    );
    // The generic useRunChat error banner is suppressed when the workflow is
    // already showing its own error banner with Retry / Cancel.
    await waitFor(() => expect(screen.getAllByText("backend down")).toHaveLength(1));
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Cancel workflow")).not.toBeInTheDocument();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("auto-advances exactly once after a streamed message with a CONTINUE marker ends", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());
    mockSend.mockResolvedValueOnce({ messageId: "msg-2" });

    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      renderChatTab();

      fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "stream feature" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() =>
        expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore stream feature" }))
      );
      await waitFor(() => expect(busCallback).not.toBeNull());

      const streamText =
        "ok <!-- __WORKFLOW:CONTINUE__ --> and here is a lot more text that keeps the typewriter running for several frames after the marker is already visible";

      act(() => {
        busCallback?.({
          type: "run_stream",
          data: {
            id: "run-1",
            envelope: { type: "stream_event", event: { type: "message_start", message: { id: "m1" } } } as Envelope,
          },
        });
      });

      act(() => {
        busCallback?.({
          type: "run_stream",
          data: {
            id: "run-1",
            envelope: {
              type: "stream_event",
              event: {
                type: "content_block_start",
                index: 0,
                message: { id: "m1" },
                content_block: { type: "text" },
              },
            } as Envelope,
          },
        });
      });

      act(() => {
        busCallback?.({
          type: "run_stream",
          data: {
            id: "run-1",
            envelope: {
              type: "stream_event",
              event: {
                type: "content_block_delta",
                index: 0,
                message: { id: "m1" },
                delta: { type: "text_delta", text: streamText },
              },
            } as Envelope,
          },
        });
      });

      act(() => {
        busCallback?.({
          type: "run_stream",
          data: {
            id: "run-1",
            envelope: {
              type: "stream_event",
              event: { type: "message_stop", message: { id: "m1" } },
            } as Envelope,
          },
        });
      });

      // Let the typewriter drip out the remaining text and then let the 600 ms
      // auto-advance delay elapse. Even though displayEnvelopes changes on every
      // animation frame, the latestAssistantKey guard must prevent duplicate
      // auto-advance sends.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });

      await waitFor(() => expect(mockSend).toHaveBeenCalledWith("run-1", "/opsx:propose", []));
      expect(mockSend).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a paused user follow-up with the original input", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());
    mockSend.mockRejectedValueOnce(new Error("send failed"));
    mockSend.mockResolvedValueOnce({ messageId: "msg-3" });

    renderChatTab();

    fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "plan api" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore plan api" }))
    );
    await waitFor(() => expect(busCallback).not.toBeNull());

    publishEnvelope("run-1", {
      type: "assistant",
      message: { content: [{ type: "text", text: "waiting <!-- __WORKFLOW:PAUSE__ -->" }] },
    });

    await waitFor(() => expect(screen.getByText("explore")).toBeInTheDocument());

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "add oauth" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith("run-1", "add oauth", []));
    await waitFor(() => expect(screen.getByText("send failed")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(2));
    expect(mockSend).toHaveBeenLastCalledWith("run-1", "add oauth", []);
  });

  it("disables input while a workflow auto-advance is pending", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());
    mockSend.mockResolvedValueOnce({ messageId: "msg-2" });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderChatTab();

      fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "build feature" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() =>
        expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore build feature" }))
      );
      await waitFor(() => expect(busCallback).not.toBeNull());

      publishEnvelope("run-1", {
        type: "assistant",
        message: { content: [{ type: "text", text: "ok <!-- __WORKFLOW:CONTINUE__ -->" }] },
      });

      await waitFor(() => expect(screen.getByRole("textbox")).toBeDisabled());
      expect(screen.getByText(/下一步将自动执行/)).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });

      await waitFor(() => expect(mockSend).toHaveBeenCalledWith("run-1", "/opsx:propose", []));
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses auto-advance while a permission request is active and resumes after approval", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());
    mockSend.mockResolvedValueOnce({ messageId: "msg-2" });
    mockRespondToPermission.mockResolvedValueOnce({ ok: true });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderChatTab();

      fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "build feature" } });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() =>
        expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore build feature" }))
      );
      await waitFor(() => expect(busCallback).not.toBeNull());

      publishEnvelope("run-1", {
        type: "assistant",
        message: { content: [{ type: "text", text: "ok <!-- __WORKFLOW:CONTINUE__ -->" }] },
      });

      // Permission request arrives before the 600 ms auto-advance timer fires.
      publishEnvelope("run-1", {
        type: "permission_request",
        id: "perm-1",
        tool_name: "Bash",
        description: "Allow bash command?",
      });

      const approveButtons = screen.getAllByRole("button", { name: /approve/i });
      expect(approveButtons[0]).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });

      expect(mockSend).not.toHaveBeenCalled();

      fireEvent.click(approveButtons[0]!);

      await waitFor(() => expect(mockSend).toHaveBeenCalledWith("run-1", "/opsx:propose", []));
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(screen.getByText("propose")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses the workflow by default when a complete assistant reply has no marker and lets the user resume", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());
    mockSend.mockResolvedValueOnce({ messageId: "msg-2" });

    renderChatTab();

    fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "plan api" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/opsx:explore plan api" })));
    await waitFor(() => expect(busCallback).not.toBeNull());

    publishEnvelope("run-1", {
      type: "assistant",
      message: { content: [{ type: "text", text: "I need more details about the API." }] },
    });

    expect(mockSend).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/当前步骤需要你的输入/)).toBeInTheDocument());
    expect(screen.getByText("explore")).toBeInTheDocument();

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "use REST" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith("run-1", "use REST", []));
  });
});
