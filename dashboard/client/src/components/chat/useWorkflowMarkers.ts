import { useMemo } from "react";
import type { AssistantMessage, Envelope } from "./types";

export type WorkflowMarker =
  | { kind: "continue" }
  | { kind: "pause" }
  | { kind: "done" }
  | { kind: "error"; message: string };

const MARKER_RE = /<!--\s*__WORKFLOW:(CONTINUE|PAUSE|DONE|ERROR)(?::([^>]*?))?(__)?\s*-->/gi;

export function extractWorkflowMarkers(text: string): {
  cleaned: string;
  marker: WorkflowMarker | null;
} {
  let lastMarker: WorkflowMarker | null = null;
  const cleaned = text.replace(MARKER_RE, (_match, kindRaw, payloadRaw) => {
    const kind = String(kindRaw).toLowerCase();
    const payload = payloadRaw ? String(payloadRaw).trim() : "";
    if (kind === "continue") lastMarker = { kind: "continue" };
    else if (kind === "pause") lastMarker = { kind: "pause" };
    else if (kind === "done") lastMarker = { kind: "done" };
    else if (kind === "error") lastMarker = { kind: "error", message: payload };
    return "";
  });
  return { cleaned, marker: lastMarker };
}

function isAssistantEnvelope(env: Envelope): env is AssistantMessage {
  return (env as { type?: string }).type === "assistant";
}

export function useWorkflowMarkers(envelopes: Envelope[]): {
  marker: WorkflowMarker | null;
  cleanedEnvelopes: Envelope[];
} {
  return useMemo(() => {
    let latestMarker: WorkflowMarker | null = null;
    const cleanedEnvelopes = envelopes.map((env) => {
      if (!isAssistantEnvelope(env)) return env;
      const content = env.message?.content;
      if (typeof content === "string") {
        const { cleaned, marker } = extractWorkflowMarkers(content);
        if (marker) latestMarker = marker;
        return { ...env, message: { ...env.message, content: cleaned } };
      }
      if (Array.isArray(content)) {
        const nextContent = content.map((block) => {
          if (block.type === "text" && typeof (block as { text?: string }).text === "string") {
            const { cleaned, marker } = extractWorkflowMarkers((block as { text: string }).text);
            if (marker) latestMarker = marker;
            return { ...block, text: cleaned };
          }
          return block;
        });
        return { ...env, message: { ...env.message, content: nextContent } };
      }
      return env;
    });
    return { marker: latestMarker, cleanedEnvelopes };
  }, [envelopes]);
}
