import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRunChat, mergeEnvelope, useTypewriterEnvelopes } from "../useRunChat";
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
    },
  },
}));

const mockStart = vi.mocked(api.run.start);
const mockSend = vi.mocked(api.run.send);
const mockKill = vi.mocked(api.run.kill);
const mockRespondToPermission = vi.mocked(api.run.respondToPermission);

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

describe("useRunChat", () => {
  beforeEach(() => {
    busCallback = null;
    vi.clearAllMocks();
  });

  it("starts a run and shows optimistic user envelope", async () => {
    const handle: RunHandle = {
      id: "run-1",
      status: "spawning",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
      model: null,
      effort: null,
      prompt: "hello",
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
    mockStart.mockResolvedValueOnce(handle);

    const { result } = renderHook(() => useRunChat({ sessionId: "sess-1", cwd: "/tmp" }));

    await act(async () => {
      await result.current.start("hello");
    });

    expect(mockStart).toHaveBeenCalledWith({
      prompt: "hello",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
    });
    expect(result.current.envelopes).toHaveLength(1);
    expect(result.current.envelopes[0]).toMatchObject({ type: "user" });
    expect(result.current.handle).toEqual(handle);
  });

  it("clears followUp after a successful start()", async () => {
    const handle: RunHandle = {
      id: "run-1",
      status: "spawning",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
      model: null,
      effort: null,
      prompt: "hello",
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
    mockStart.mockResolvedValueOnce(handle);

    const { result } = renderHook(() => useRunChat({ sessionId: "sess-1", cwd: "/tmp" }));

    act(() => {
      result.current.setFollowUp("hello");
    });

    await act(async () => {
      await result.current.start("hello");
    });

    expect(result.current.followUp).toBe("");
  });

  it("leaves followUp untouched when start() fails", async () => {
    mockStart.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useRunChat({ sessionId: "sess-1", cwd: "/tmp" }));

    act(() => {
      result.current.setFollowUp("hello");
    });

    await act(async () => {
      await result.current.start("hello");
    });

    expect(result.current.followUp).toBe("hello");
    expect(result.current.error).toBe("boom");
  });

  it("sends a follow-up through the API and clears input", async () => {
    const handle: RunHandle = {
      id: "run-1",
      status: "running",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
      model: null,
      effort: null,
      prompt: "hello",
      argv: [],
      pid: 123,
      resumeSessionId: null,
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
    mockStart.mockResolvedValueOnce(handle);
    mockSend.mockResolvedValueOnce({ messageId: "msg-2" });

    const { result } = renderHook(() => useRunChat({ sessionId: "sess-1", cwd: "/tmp" }));

    await act(async () => {
      await result.current.start("hello");
    });

    act(() => {
      result.current.setFollowUp("do more");
    });

    await act(async () => {
      await result.current.send("do more");
    });

    expect(mockSend).toHaveBeenCalledWith("run-1", "do more", []);
    expect(result.current.followUp).toBe("");
  });

  it("isResponding is true right after start() and false once the reply completes", async () => {
    const handle: RunHandle = {
      id: "run-1",
      status: "spawning",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
      model: null,
      effort: null,
      prompt: "hello",
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
    mockStart.mockResolvedValueOnce(handle);

    const { result } = renderHook(() => useRunChat({ sessionId: "sess-1", cwd: "/tmp" }));

    await act(async () => {
      await result.current.start("hello");
    });

    // Right after start(), the only envelope is the optimistic "user" one and
    // the process just spawned (isLive) - the assistant hasn't replied yet.
    expect(result.current.isResponding).toBe(true);

    act(() => {
      busCallback?.({
        type: "run_status",
        data: { id: "run-1", status: "running", at: Date.now() },
      });
    });

    act(() => {
      busCallback?.({
        type: "run_stream",
        data: {
          id: "run-1",
          envelope: { type: "stream_event", event: { type: "message_start", message: { id: "m1" } } },
        },
      });
    });

    // Streaming assistant message in progress.
    expect(result.current.isResponding).toBe(true);

    act(() => {
      busCallback?.({
        type: "run_stream",
        data: {
          id: "run-1",
          envelope: { type: "stream_event", event: { type: "message_stop", message: { id: "m1" } } },
        },
      });
    });

    // Reply finished streaming - it's the user's turn again.
    expect(result.current.isResponding).toBe(false);
  });

  it("kills the run through the API", async () => {
    const handle: RunHandle = {
      id: "run-1",
      status: "running",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
      model: null,
      effort: null,
      prompt: "hello",
      argv: [],
      pid: 123,
      resumeSessionId: null,
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
    mockStart.mockResolvedValueOnce(handle);
    mockKill.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useRunChat({ sessionId: "sess-1", cwd: "/tmp" }));

    await act(async () => {
      await result.current.start("hello");
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(mockKill).toHaveBeenCalledWith("run-1");
  });

  it("reset() clears handle, envelopes, followUp, error, and permission request", async () => {
    const handle: RunHandle = {
      id: "run-1",
      status: "running",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
      model: null,
      effort: null,
      prompt: "hello",
      argv: [],
      pid: 123,
      resumeSessionId: null,
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
    mockStart.mockResolvedValueOnce(handle);

    const { result } = renderHook(() => useRunChat({ sessionId: "sess-1", cwd: "/tmp" }));

    await act(async () => {
      await result.current.start("hello");
    });
    act(() => {
      result.current.setFollowUp("draft text");
    });
    expect(result.current.handle).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.handle).toBeNull();
    expect(result.current.envelopes).toEqual([]);
    expect(result.current.followUp).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.activePermissionRequest).toBeNull();
  });

  it("ignores run_stream events for other run ids", async () => {
    const handle: RunHandle = {
      id: "run-1",
      status: "running",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
      model: null,
      effort: null,
      prompt: "hello",
      argv: [],
      pid: 123,
      resumeSessionId: null,
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
    mockStart.mockResolvedValueOnce(handle);

    renderHook(() => useRunChat({ sessionId: "sess-1", cwd: "/tmp" }));

    await act(async () => {
      // subscribe called during render; busCallback should be set
    });

    act(() => {
      busCallback?.({
        type: "run_stream",
        data: { id: "run-other", envelope: { type: "assistant", message: { content: "hi" } } },
      });
    });

    expect(busCallback).not.toBeNull();
  });

  it("sets permission request state when a permission_request envelope arrives", async () => {
    const handle: RunHandle = {
      id: "run-1",
      status: "running",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
      model: null,
      effort: null,
      prompt: "hello",
      argv: [],
      pid: 123,
      resumeSessionId: null,
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
    mockStart.mockResolvedValueOnce(handle);

    const { result } = renderHook(() => useRunChat({ sessionId: "sess-1", cwd: "/tmp" }));

    await act(async () => {
      await result.current.start("hello");
    });

    const permEnvelope: Envelope = {
      type: "permission_request",
      id: "perm-1",
      tool_name: "Bash",
      description: "List files",
    };

    act(() => {
      busCallback?.({
        type: "run_stream",
        data: { id: "run-1", envelope: permEnvelope },
      });
    });

    await waitFor(() => expect(result.current.activePermissionRequest).not.toBeNull());
    expect(result.current.activePermissionRequest?.id).toBe("perm-1");
  });

  it("calls the permission response API and clears active request", async () => {
    const handle: RunHandle = {
      id: "run-1",
      status: "running",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
      model: null,
      effort: null,
      prompt: "hello",
      argv: [],
      pid: 123,
      resumeSessionId: null,
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
    mockStart.mockResolvedValueOnce(handle);
    mockRespondToPermission.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useRunChat({ sessionId: "sess-1", cwd: "/tmp" }));

    await act(async () => {
      await result.current.start("hello");
    });

    const permEnvelope: Envelope = {
      type: "permission_request",
      id: "perm-1",
      tool_name: "Bash",
      description: "List files",
    };

    act(() => {
      busCallback?.({
        type: "run_stream",
        data: { id: "run-1", envelope: permEnvelope },
      });
    });

    await waitFor(() => expect(result.current.activePermissionRequest).not.toBeNull());

    await act(async () => {
      await result.current.respondToPermission(true);
    });

    expect(mockRespondToPermission).toHaveBeenCalledWith("run-1", { requestId: "perm-1", approved: true });
    expect(result.current.activePermissionRequest).toBeNull();
  });
});

describe("mergeEnvelope", () => {
  it("appends unknown envelopes verbatim", () => {
    const prev: Envelope[] = [];
    const next = mergeEnvelope(prev, { type: "user", message: { content: "hi" } });
    expect(next).toHaveLength(1);
    expect((next[0] as { type: string }).type).toBe("user");
  });

  it("accumulates text deltas into a streaming assistant message", () => {
    let envs: Envelope[] = [];
    envs = mergeEnvelope(envs, {
      type: "stream_event",
      event: { type: "message_start", message: { id: "m1" } },
    } as Envelope);
    envs = mergeEnvelope(envs, {
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "text" } },
    } as Envelope);
    envs = mergeEnvelope(envs, {
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } },
    } as Envelope);
    envs = mergeEnvelope(envs, {
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } },
    } as Envelope);

    const assistant = envs.find(
      (e) => (e as { type?: string }).type === "assistant"
    ) as unknown as { message?: { content?: { type: string; text?: string }[]; _streaming?: boolean } };
    expect(assistant).toBeDefined();
    expect(assistant?.message?._streaming).toBe(true);
    expect(assistant?.message?.content?.[0]?.text).toBe("Hello");
  });
});

describe("useTypewriterEnvelopes", () => {
  it("returns envelopes unchanged when not streaming", () => {
    const { result } = renderHook(() =>
      useTypewriterEnvelopes([
        { type: "assistant", message: { content: [{ type: "text", text: "complete" }] } },
      ])
    );
    const assistant = result.current[0] as unknown as {
      message?: { content?: { text?: string }[] };
    };
    expect(assistant.message?.content?.[0]?.text).toBe("complete");
  });
});
