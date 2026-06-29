import Fastify, { type FastifyInstance } from "fastify";
import { WebSocketServer } from "ws";
import { Broadcaster } from "./broadcaster.js";
import { registerHookRoutes } from "./hookEndpoint.js";
import { SessionRegistry } from "./sessionRegistry.js";

export interface GatewayApp {
  app: FastifyInstance;
  registry: SessionRegistry;
  wss: WebSocketServer;
}

export async function createGatewayApp(): Promise<GatewayApp> {
  const app = Fastify();
  const registry = new SessionRegistry();
  const wss = new WebSocketServer({ noServer: true });
  const broadcaster = new Broadcaster(wss);

  registerHookRoutes(app, registry, broadcaster);

  app.server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  app.addHook("onClose", (_instance, done) => {
    wss.close();
    done();
  });

  return { app, registry, wss };
}
