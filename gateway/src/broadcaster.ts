import type { WebSocketServer } from "ws";
import type { HookEvent } from "./types.js";

export class Broadcaster {
  constructor(private readonly wss: WebSocketServer) {}

  broadcast(event: HookEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }
}
