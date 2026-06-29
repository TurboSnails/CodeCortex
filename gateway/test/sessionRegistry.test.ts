import { describe, expect, it } from "vitest";
import { SessionRegistry } from "../src/sessionRegistry.js";
import type { HookEvent } from "../src/types.js";

function sessionStart(sessionId: string, cwd: string): HookEvent {
  return {
    session_id: sessionId,
    transcript_path: "/tmp/transcript.jsonl",
    cwd,
    hook_event_name: "SessionStart",
    source: "startup",
  };
}

function stop(sessionId: string, cwd: string): HookEvent {
  return {
    session_id: sessionId,
    transcript_path: "/tmp/transcript.jsonl",
    cwd,
    hook_event_name: "Stop",
    stop_hook_active: false,
    last_assistant_message: "Done.",
  };
}

function postToolUse(sessionId: string, cwd: string): HookEvent {
  return {
    session_id: sessionId,
    transcript_path: "/tmp/transcript.jsonl",
    cwd,
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: "echo hi" },
    tool_response: { stdout: "hi" },
    tool_use_id: "tool_1",
    duration_ms: 10,
  };
}

describe("SessionRegistry", () => {
  it("creates a new running record when a SessionStart event arrives", () => {
    const registry = new SessionRegistry();

    const record = registry.applyEvent(sessionStart("s1", "/work/dir"));

    expect(record).toEqual({
      sessionId: "s1",
      cwd: "/work/dir",
      status: "running",
      lastEventAt: record.lastEventAt,
    });
    expect(registry.get("s1")).toEqual(record);
  });

  it("marks an existing session as stopped on a Stop event", () => {
    const registry = new SessionRegistry();
    registry.applyEvent(sessionStart("s1", "/work/dir"));

    const record = registry.applyEvent(stop("s1", "/work/dir"));

    expect(record.status).toBe("stopped");
  });

  it("recreates a registry record for an unknown session_id instead of throwing", () => {
    const registry = new SessionRegistry();

    const record = registry.applyEvent(postToolUse("unknown-session", "/work/dir"));

    expect(record.sessionId).toBe("unknown-session");
    expect(record.status).toBe("running");
    expect(registry.get("unknown-session")).toEqual(record);
  });

  it("lists all registered sessions", () => {
    const registry = new SessionRegistry();
    registry.applyEvent(sessionStart("s1", "/work/dir-1"));
    registry.applyEvent(sessionStart("s2", "/work/dir-2"));

    const sessions = registry.list();

    expect(sessions.map((s) => s.sessionId).sort()).toEqual(["s1", "s2"]);
  });
});
