import { WebSocket, WebSocketServer } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Broadcaster } from "../src/broadcaster.js";
import type { HookEvent } from "../src/types.js";

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.once("open", () => resolve()));
}

function waitForMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    socket.once("message", (data) => resolve(data.toString()));
  });
}

describe("Broadcaster", () => {
  let wss: WebSocketServer;
  let port: number;
  let broadcaster: Broadcaster;

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    const address = wss.address();
    port = typeof address === "object" && address ? address.port : 0;
    broadcaster = new Broadcaster(wss);
  });

  afterEach(() => {
    wss.close();
  });

  it("delivers a hook event to all connected clients", async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(client);
    // give the server a tick to register the connection
    await new Promise((resolve) => setTimeout(resolve, 20));

    const event: HookEvent = {
      session_id: "s1",
      transcript_path: "/tmp/t.jsonl",
      cwd: "/work",
      hook_event_name: "SessionStart",
      source: "startup",
    };

    const received = waitForMessage(client);
    broadcaster.broadcast(event);

    const message = await received;
    expect(JSON.parse(message)).toEqual(event);

    client.close();
  });

  it("does not deliver to clients that have already closed", async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(client);
    await new Promise((resolve) => setTimeout(resolve, 20));
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const event: HookEvent = {
      session_id: "s1",
      transcript_path: "/tmp/t.jsonl",
      cwd: "/work",
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "done",
    };

    expect(() => broadcaster.broadcast(event)).not.toThrow();
  });
});
