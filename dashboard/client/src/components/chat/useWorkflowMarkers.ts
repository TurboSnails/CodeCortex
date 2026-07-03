import { useMemo } from "react";
import type { AssistantMessage, Envelope } from "./types";
import type { ChatMode } from "./workflowConfig";

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

export function useWorkflowMarkers(
  envelopes: Envelope[],
  mode: ChatMode
): {
  marker: WorkflowMarker | null;
  cleanedEnvelopes: Envelope[];
} {
  return useMemo(() => {
    if (mode === "normal") {
      return { marker: null, cleanedEnvelopes: envelopes };
    }

    // The spec treats a complete assistant reply with no marker as PAUSE,
    // so we only consider the latest assistant envelope.
    let latestAssistantIndex = -1;
    envelopes.forEach((env, index) => {
      if (isAssistantEnvelope(env)) latestAssistantIndex = index;
    });

    let latestMarker: WorkflowMarker | null = null;
    const cleanedEnvelopes = envelopes.map((env, index) => {
      if (!isAssistantEnvelope(env)) return env;

      const isLatestAssistant = index === latestAssistantIndex;
      const content = env.message?.content;

      if (typeof content === "string") {
        const { cleaned, marker } = extractWorkflowMarkers(content);
        if (isLatestAssistant) {
          latestMarker = marker ?? { kind: "pause" };
        }
        return { ...env, message: { ...env.message, content: cleaned } };
      }

      if (Array.isArray(content)) {
        let envelopeMarker: WorkflowMarker | null = null;
        const nextContent = content.map((block) => {
          if (block.type === "text" && typeof (block as { text?: string }).text === "string") {
            const { cleaned, marker } = extractWorkflowMarkers((block as { text: string }).text);
            if (marker) envelopeMarker = marker;
            return { ...block, text: cleaned };
          }
          return block;
        });
        if (isLatestAssistant) {
          latestMarker = envelopeMarker ?? { kind: "pause" };
        }
        return { ...env, message: { ...env.message, content: nextContent } };
      }

      if (isLatestAssistant) {
        latestMarker = { kind: "pause" };
      }
      return env;
    });

    return { marker: latestMarker, cleanedEnvelopes };
  }, [envelopes, mode]);
}
