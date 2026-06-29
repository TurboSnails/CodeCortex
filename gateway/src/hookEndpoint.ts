import type { FastifyInstance } from "fastify";
import type { SessionRegistry } from "./sessionRegistry.js";
import type { HookEvent, HookEventName } from "./types.js";

const VALID_EVENT_NAMES: HookEventName[] = ["SessionStart", "PreToolUse", "PostToolUse", "Stop"];

interface BroadcastTarget {
  broadcast(event: HookEvent): void;
}

function isHookEvent(payload: unknown): payload is HookEvent {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.session_id === "string" &&
    typeof candidate.cwd === "string" &&
    VALID_EVENT_NAMES.includes(candidate.hook_event_name as HookEventName)
  );
}

export function registerHookRoutes(
  app: FastifyInstance,
  registry: SessionRegistry,
  broadcaster: BroadcastTarget,
): void {
  app.setErrorHandler((_error, _request, reply) => {
    reply.code(400).send({ error: "invalid hook event payload" });
  });

  app.post("/hooks", async (request, reply) => {
    const payload = request.body;
    if (!isHookEvent(payload)) {
      return reply.code(400).send({ error: "invalid hook event payload" });
    }

    registry.applyEvent(payload);
    broadcaster.broadcast(payload);
    return reply.code(200).send({ ok: true });
  });
}
