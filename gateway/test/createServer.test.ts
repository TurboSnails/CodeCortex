import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createGatewayApp } from "../src/createServer.js";

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => socket.once("open", () => resolve()));
}

function waitForMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => socket.once("message", (data) => resolve(data.toString())));
}

describe("createGatewayApp", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("binds only to 127.0.0.1, never 0.0.0.0", async () => {
    const created = await createGatewayApp();
    app = created.app;

    await app.listen({ host: "127.0.0.1", port: 0 });

    const address = app.server.address();
    expect(typeof address === "object" && address?.address).toBe("127.0.0.1");
  });

  it("delivers a hook event posted over HTTP to a WebSocket client on the same server", async () => {
    const created = await createGatewayApp();
    app = created.app;
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(client);

    const received = waitForMessage(client);

    await fetch(`http://127.0.0.1:${port}/hooks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: "s1",
        transcript_path: "/tmp/t.jsonl",
        cwd: "/work",
        hook_event_name: "SessionStart",
        source: "startup",
      }),
    });

    const message = await received;
    expect(JSON.parse(message).session_id).toBe("s1");
    expect(created.registry.get("s1")?.status).toBe("running");

    client.close();
  });
});
