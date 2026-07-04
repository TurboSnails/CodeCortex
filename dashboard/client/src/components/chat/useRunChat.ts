/**
 * @file useRunChat.ts
 * @description Reusable hook that owns a single dashboard-run handle, consumes
 * stream-json envelopes over the WebSocket event bus, and exposes start/send/stop
 * actions plus an optional permission-request placeholder for later Tasks 4-5.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api } from "../../lib/api";
import type { PermissionMode, RunHandle, RunMode } from "../../lib/api";
import { eventBus } from "../../lib/eventBus";
import type {
  RunInputAckPayload,
  RunStatusPayload,
  RunStreamPayload,
  SendPayload,
  WSMessage,
} from "../../lib/types";
import type {
  Envelope,
  PermissionRequestEnvelope,
  StreamEventEnvelope,
  StreamingAssistantBlock,
  StreamingAssistantMessage,
  UserMessage,
} from "./types";

export interface UseRunChatOptions {
  cwd: string;
  initialMode?: RunMode;
  initialPermissionMode?: PermissionMode;
  initialModel?: string;
}

export interface UseRunChatReturn {
  handle: RunHandle | null;
  envelopes: Envelope[];
  displayEnvelopes: Envelope[];
  busy: "start" | "send" | "stop" | "permission" | null;
  error: string | null;
  followUp: string;
  setFollowUp: (v: string) => void;
  start: (prompt: string, opts?: { resumeSessionId?: string }) => Promise<void>;
  send: (input: string | SendPayload) => Promise<void>;
  stop: () => Promise<void>;
  activePermissionRequest: PermissionRequestEnvelope | null;
  respondToPermission: (approved: boolean, remember?: boolean) => Promise<void>;
  isLive: boolean;
  isResponding: boolean;
  reset: () => void;
}

function findLastStreamingAssistant(prev: Envelope[]): number {
  for (let i = prev.length - 1; i >= 0; i--) {
    const env = prev[i] as { type?: string; message?: { _streaming?: boolean } };
    if (env?.type === "assistant" && env.message?._streaming) return i;
  }
  return -1;
}

function findAssistantByMessageId(prev: Envelope[], id: string | undefined): number {
  if (!id) return findLastStreamingAssistant(prev);
  for (let i = prev.length - 1; i >= 0; i--) {
    const env = prev[i] as { type?: string; message?: { id?: string } };
    if (env?.type === "assistant" && env.message?.id === id) return i;
  }
  return findLastStreamingAssistant(prev);
}

function mutateAssistantAt(
  prev: Envelope[],
  idx: number,
  fn: (m: StreamingAssistantMessage["message"]) => StreamingAssistantMessage["message"]
): Envelope[] {
  if (idx < 0) return prev;
  const env = prev[idx] as StreamingAssistantMessage;
  const next = [...prev];
  next[idx] = {
    ...env,
    message: fn(env.message || ({ content: [] } as StreamingAssistantMessage["message"])),
  };
  return next;
}

export function mergeEnvelope(prev: Envelope[], envelope: Envelope): Envelope[] {
  if (!envelope || typeof envelope !== "object") return prev;
  const env = envelope as { type?: string };

  if (env.type === "stream_event") {
    const sse = envelope as StreamEventEnvelope;
    const evt = sse.event;
    if (!evt) return prev;

    if (evt.type === "message_start") {
      const placeholder: StreamingAssistantMessage = {
        type: "assistant",
        message: {
          id: evt.message?.id,
          content: [],
          _streaming: true,
        },
      };
      return [...prev, envelope, placeholder as unknown as Envelope];
    }

    if (evt.type === "content_block_start") {
      const idx = findAssistantByMessageId(prev, evt.message?.id);
      if (idx < 0) return prev;
      const blockIdx = evt.index ?? 0;
      return mutateAssistantAt(prev, idx, (msg) => {
        const blocks = [...(msg.content || [])];
        blocks[blockIdx] = { ...(evt.content_block as { type: string }) } as StreamingAssistantBlock;
        return { ...msg, content: blocks };
      });
    }

    if (evt.type === "content_block_delta") {
      const idx = findAssistantByMessageId(prev, evt.message?.id);
      if (idx < 0) return prev;
      const blockIdx = evt.index ?? 0;
      return mutateAssistantAt(prev, idx, (msg) => {
        const blocks = [...(msg.content || [])];
        const block = (blocks[blockIdx] || {}) as StreamingAssistantBlock;
        const next = { ...block } as StreamingAssistantBlock;
        const delta = evt.delta;
        if (delta?.type === "text_delta") {
          (next as { text?: string }).text =
            ((next as { text?: string }).text || "") + (delta.text || "");
          if (!next.type) (next as { type: string }).type = "text";
        } else if (delta?.type === "thinking_delta") {
          (next as { thinking?: string }).thinking =
            ((next as { thinking?: string }).thinking || "") + (delta.thinking || "");
          if (!next.type) (next as { type: string }).type = "thinking";
        } else if (delta?.type === "input_json_delta") {
          next._partialJson = (next._partialJson || "") + (delta.partial_json || "");
          try {
            (next as { input?: unknown }).input = JSON.parse(next._partialJson);
          } catch {
            /* still incomplete JSON - leave previous parsed value */
          }
        }
        blocks[blockIdx] = next;
        return { ...msg, content: blocks };
      });
    }

    if (evt.type === "content_block_stop") {
      // No state change needed: deltas have already accumulated into the
      // streaming assistant block; this event only signals the end of a block.
      return prev;
    }

    if (evt.type === "message_stop") {
      const idx = findAssistantByMessageId(prev, evt.message?.id);
      if (idx < 0) return prev;
      return mutateAssistantAt(prev, idx, (msg) => ({ ...msg, _streaming: false }));
    }

    if (evt.type === "message_delta") {
      return [...prev, envelope];
    }

    return prev;
  }

  if (env.type === "assistant") {
    const finalMsg = envelope as { message?: { id?: string; _streaming?: boolean } };
    const idx = findAssistantByMessageId(prev, finalMsg.message?.id);
    if (idx >= 0) {
      const prevEnv = prev[idx] as StreamingAssistantMessage;
      const next = [...prev];
      if (prevEnv.message?._streaming) {
        const incoming = envelope as { message?: Record<string, unknown> };
        const incomingMsg = (incoming.message || {}) as Record<string, unknown>;
        const accumulatedContent = prevEnv.message?.content || [];
        const incomingContent = (incomingMsg as { content?: { type: string }[] }).content;
        const content =
          Array.isArray(incomingContent) && incomingContent.length > accumulatedContent.length
            ? incomingContent
            : accumulatedContent;
        next[idx] = {
          ...envelope,
          message: { ...incomingMsg, content, _streaming: true },
        } as Envelope;
      } else {
        next[idx] = envelope;
      }
      return next;
    }
    return [...prev, envelope];
  }

  return [...prev, envelope];
}

/**
 * Smooth out claude's bursty stream by dripping text/thinking deltas a few
 * characters per frame. Without this, short responses (where claude emits
 * the entire reply in one or two `text_delta` chunks) appear all-at-once.
 */
export function useTypewriterEnvelopes(envelopes: Envelope[]): Envelope[] {
  const lengthsRef = useRef<Map<string, number>>(new Map());
  const envRef = useRef<Envelope[]>(envelopes);
  envRef.current = envelopes;
  const [tick, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const tickFnRef = useRef<(() => void) | null>(null);

  if (!tickFnRef.current) {
    tickFnRef.current = function tickFn() {
      const envs = envRef.current;
      const lengths = lengthsRef.current;
      let needsAnother = false;
      let mutated = false;
      for (let ei = 0; ei < envs.length; ei++) {
        const env = envs[ei];
        if (!env || (env as { type?: string }).type !== "assistant") continue;
        const e = env as StreamingAssistantMessage;
        const streaming = !!e.message?._streaming;
        const blocks = e.message?.content || [];
        for (let bi = 0; bi < blocks.length; bi++) {
          const b = blocks[bi];
          if (!b) continue;
          let key: string;
          let target: string;
          if (b.type === "text") {
            key = `${ei}:${bi}:t`;
            target = (b as { text?: string }).text || "";
          } else if (b.type === "thinking") {
            key = `${ei}:${bi}:th`;
            target = (b as { thinking?: string }).thinking || "";
          } else {
            continue;
          }
          const cur = lengths.get(key) ?? 0;
          if (cur >= target.length) continue;
          if (streaming) {
            const remaining = target.length - cur;
            const step = Math.max(2, Math.ceil(remaining / 24));
            lengths.set(key, Math.min(target.length, cur + step));
            needsAnother = true;
            mutated = true;
          } else {
            lengths.set(key, target.length);
            mutated = true;
          }
        }
      }
      if (mutated) setTick((t) => (t + 1) & 0xffff);
      rafRef.current = needsAnother
        ? requestAnimationFrame(tickFnRef.current as FrameRequestCallback)
        : null;
    };
  }

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tickFnRef.current as FrameRequestCallback);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (rafRef.current == null && envelopes.length > 0) {
      rafRef.current = requestAnimationFrame(tickFnRef.current as FrameRequestCallback);
    }
  }, [envelopes]);

  useEffect(() => {
    if (envelopes.length === 0 && lengthsRef.current.size > 0) {
      lengthsRef.current.clear();
    }
  }, [envelopes.length]);

  return useMemo(() => {
    const lengths = lengthsRef.current;
    return envelopes.map((env, ei) => {
      if (!env || (env as { type?: string }).type !== "assistant") return env;
      const e = env as StreamingAssistantMessage;
      const blocks = e.message?.content || [];
      let changed = false;
      const nextBlocks = blocks.map((b, bi) => {
        if (b.type === "text") {
          const full = (b as { text?: string }).text || "";
          const len = lengths.get(`${ei}:${bi}:t`) ?? full.length;
          if (len < full.length) {
            changed = true;
            return { ...b, text: full.slice(0, len) };
          }
        } else if (b.type === "thinking") {
          const full = (b as { thinking?: string }).thinking || "";
          const len = lengths.get(`${ei}:${bi}:th`) ?? full.length;
          if (len < full.length) {
            changed = true;
            return { ...b, thinking: full.slice(0, len) };
          }
        }
        return b;
      });
      if (!changed) return env;
      return {
        ...e,
        message: { ...e.message, content: nextBlocks },
      } as unknown as Envelope;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelopes, tick]);
}

export function useRunChat(options: UseRunChatOptions): UseRunChatReturn {
  const [handle, setHandle] = useState<RunHandle | null>(null);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState<"start" | "send" | "stop" | "permission" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePermissionRequest, setActivePermissionRequest] =
    useState<PermissionRequestEnvelope | null>(null);

  const followUpRef = useRef("");
  useEffect(() => {
    followUpRef.current = followUp;
  }, [followUp]);

  const displayEnvelopes = useTypewriterEnvelopes(envelopes);

  useEffect(() => {
    return eventBus.subscribe((msg: WSMessage) => {
      if (msg.type === "run_stream") {
        const p = msg.data as RunStreamPayload;
        if (handle && p.id === handle.id) {
          flushSync(() => {
            setEnvelopes((prev) => {
              const merged = mergeEnvelope(prev, p.envelope as Envelope);
              const env = p.envelope as { type?: string };
              if (env.type === "permission_request") {
                setActivePermissionRequest(p.envelope as PermissionRequestEnvelope);
              }
              return merged;
            });
          });
        }
      } else if (msg.type === "run_status") {
        const p = msg.data as RunStatusPayload;
        if (handle && p.id === handle.id) {
          setHandle((h) =>
            h
              ? {
                  ...h,
                  status: p.status,
                  endedAt: p.at,
                  exitCode: p.exitCode ?? h.exitCode,
                  sessionId: p.sessionId ?? h.sessionId,
                  error: p.error ?? h.error,
                }
              : h
          );
          if (p.status === "completed" || p.status === "error" || p.status === "killed") {
            setActivePermissionRequest(null);
          }
        }
      } else if (msg.type === "run_input_ack") {
        const p = msg.data as RunInputAckPayload;
        if (handle && p.id === handle.id) {
          setEnvelopes((prev) => [
            ...prev,
            { type: "user", message: { content: followUpRef.current || "" } } as UserMessage,
          ]);
        }
      }
    });
  }, [handle]);

  const start = useCallback(
    async (prompt: string, opts?: { resumeSessionId?: string }) => {
      if (!prompt.trim() || busy) return;
      setBusy("start");
      setError(null);
      setEnvelopes([]);
      setActivePermissionRequest(null);
      try {
        const result = await api.run.start({
          prompt,
          mode: opts?.resumeSessionId ? "conversation" : (options.initialMode ?? "conversation"),
          cwd: options.cwd,
          model: options.initialModel,
          permissionMode: options.initialPermissionMode ?? "acceptEdits",
          resumeSessionId: opts?.resumeSessionId,
        });
        setHandle(result);
        setEnvelopes([{ type: "user", message: { content: prompt } } as UserMessage]);
        setFollowUp("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "start failed");
      } finally {
        setBusy(null);
      }
    },
    [busy, options.cwd, options.initialMode, options.initialPermissionMode]
  );

  const send = useCallback(
    async (input: string | SendPayload) => {
      if (!handle || busy) return;
      const payload: SendPayload =
        typeof input === "string"
          ? { text: input.trim(), attachments: [] }
          : input;
      if (!payload.text && payload.attachments.length === 0) return;
      setBusy("send");
      setError(null);
      setActivePermissionRequest(null);
      try {
        await api.run.send(handle.id, payload.text, payload.attachments);
        setFollowUp("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "send failed");
      } finally {
        setBusy(null);
      }
    },
    [handle, busy]
  );

  const stop = useCallback(async () => {
    if (!handle || busy) return;
    setBusy("stop");
    try {
      await api.run.kill(handle.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "stop failed");
    } finally {
      setBusy(null);
    }
  }, [handle, busy]);

  const respondToPermission = useCallback(
    async (approved: boolean, _remember?: boolean) => {
      if (!handle || !activePermissionRequest || busy) return;
      setBusy("permission");
      setError(null);
      try {
        await api.run.respondToPermission(handle.id, {
          requestId: activePermissionRequest.id,
          approved,
        });
        setActivePermissionRequest(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "permission response failed");
      } finally {
        setBusy(null);
      }
    },
    [handle, activePermissionRequest, busy]
  );

  const isLive = handle?.status === "spawning" || handle?.status === "running";

  // `isLive` reflects whether the underlying Claude Code subprocess is alive for
  // the whole session (it never toggles between turns - see run-spawner.js status
  // transitions), so it can't be used to gate "is the assistant currently
  // replying". Derive that separately from the shape of the latest envelope.
  const isResponding = useMemo(() => {
    if (!isLive) return false;
    const last = envelopes[envelopes.length - 1] as
      | { type?: string; message?: { _streaming?: boolean } }
      | undefined;
    if (!last) return false;
    if (last.type === "user" || last.type === "tool_use") return true;
    if (last.type === "assistant") return !!last.message?._streaming;
    return false;
  }, [isLive, envelopes]);

  const reset = useCallback(() => {
    setHandle(null);
    setEnvelopes([]);
    setFollowUp("");
    setBusy(null);
    setError(null);
    setActivePermissionRequest(null);
  }, []);

  return {
    handle,
    envelopes,
    displayEnvelopes,
    busy,
    error,
    followUp,
    setFollowUp,
    start,
    send,
    stop,
    activePermissionRequest,
    respondToPermission,
    isLive,
    isResponding,
    reset,
  };
}
