import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registerHookRoutes } from "../src/hookEndpoint.js";
import { SessionRegistry } from "../src/sessionRegistry.js";
import type { HookEvent } from "../src/types.js";

class RecordingBroadcaster {
  events: HookEvent[] = [];
  broadcast(event: HookEvent): void {
    this.events.push(event);
  }
}

function buildApp() {
  const registry = new SessionRegistry();
  const broadcaster = new RecordingBroadcaster();
  const app = Fastify();
  registerHookRoutes(app, registry, broadcaster);
  return { app, registry, broadcaster };
}

describe("POST /hooks", () => {
  it("accepts a SessionStart event and registers the session", async () => {
    const { app, registry } = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/hooks",
      payload: {
        session_id: "s1",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/work",
        hook_event_name: "SessionStart",
        source: "startup",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(registry.get("s1")?.status).toBe("running");
  });

  it("broadcasts every accepted event to connected UI clients", async () => {
    const { app, broadcaster } = buildApp();

    await app.inject({
      method: "POST",
      url: "/hooks",
      payload: {
        session_id: "s1",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/work",
        hook_event_name: "Stop",
        stop_hook_active: false,
        last_assistant_message: "done",
      },
    });

    expect(broadcaster.events).toHaveLength(1);
    expect(broadcaster.events[0]?.hook_event_name).toBe("Stop");
  });

  it("returns 400 for a payload missing hook_event_name", async () => {
    const { app } = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/hooks",
      payload: { session_id: "s1", cwd: "/work" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("never lets a malformed payload crash the process (CC must not be blocked)", async () => {
    const { app } = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/hooks",
      payload: "not-json-shaped-properly",
    });

    expect(response.statusCode).toBe(400);
  });
});
