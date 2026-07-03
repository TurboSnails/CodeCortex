import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { extractWorkflowMarkers, useWorkflowMarkers } from "../useWorkflowMarkers";
import type { Envelope } from "../types";

const WORKFLOW_MODE = "openspec" as const;

describe("extractWorkflowMarkers", () => {
  it("extracts CONTINUE and strips the marker", () => {
    const text = "Done exploring.\n<!-- __WORKFLOW:CONTINUE__ -->";
    const result = extractWorkflowMarkers(text);
    expect(result.cleaned).toBe("Done exploring.\n");
    expect(result.marker).toEqual({ kind: "continue" });
  });

  it("extracts PAUSE and strips the marker", () => {
    const text = "Taking a break.\n<!-- __WORKFLOW:PAUSE__ -->";
    const result = extractWorkflowMarkers(text);
    expect(result.cleaned).toBe("Taking a break.\n");
    expect(result.marker).toEqual({ kind: "pause" });
  });

  it("extracts DONE and strips the marker", () => {
    const text = "All finished.\n<!-- __WORKFLOW:DONE__ -->";
    const result = extractWorkflowMarkers(text);
    expect(result.cleaned).toBe("All finished.\n");
    expect(result.marker).toEqual({ kind: "done" });
  });

  it("extracts ERROR with message", () => {
    const text = "Failed.\n<!-- __WORKFLOW:ERROR:missing spec__ -->";
    const result = extractWorkflowMarkers(text);
    expect(result.cleaned).toBe("Failed.\n");
    expect(result.marker).toEqual({ kind: "error", message: "missing spec" });
  });

  it("returns null when no marker", () => {
    const text = "Just a normal reply.";
    const result = extractWorkflowMarkers(text);
    expect(result.cleaned).toBe(text);
    expect(result.marker).toBeNull();
  });

  it("returns null for a marker missing the trailing __", () => {
    const text = "Bad marker\n<!-- __WORKFLOW:CONTINUE -->";
    const result = extractWorkflowMarkers(text);
    expect(result.cleaned).toBe(text);
    expect(result.marker).toBeNull();
  });

  it("returns null for an ERROR marker with message missing the trailing __", () => {
    const text = "Bad error marker\n<!-- __WORKFLOW:ERROR:missing spec -->";
    const result = extractWorkflowMarkers(text);
    expect(result.cleaned).toBe(text);
    expect(result.marker).toBeNull();
  });

  it("returns null for a marker missing the leading __", () => {
    const text = "Bad marker\n<!-- WORKFLOW:CONTINUE__ -->";
    const result = extractWorkflowMarkers(text);
    expect(result.cleaned).toBe(text);
    expect(result.marker).toBeNull();
  });

  it("uses the last marker when multiple appear", () => {
    const text = "A\n<!-- __WORKFLOW:PAUSE__ -->\nB\n<!-- __WORKFLOW:CONTINUE__ -->";
    const result = extractWorkflowMarkers(text);
    expect(result.marker).toEqual({ kind: "continue" });
  });
});

describe("useWorkflowMarkers", () => {
  it("in normal mode, strips markers, returns marker null, and preserves isComplete/latestAssistantKey", () => {
    const envelopes: Envelope[] = [
      {
        type: "assistant",
        message: { content: "Step 1\n<!-- __WORKFLOW:PAUSE__ -->" },
      },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, "normal"));
    expect(result.current.marker).toBeNull();
    expect(result.current.isComplete).toBe(true);
    expect(result.current.latestAssistantKey).toBeNull();
    const cleaned = (result.current.cleanedEnvelopes[0] as { message?: { content?: string } }).message?.content;
    expect(cleaned).toBe("Step 1\n");
  });

  it("handles string content and strips markers", () => {
    const envelopes: Envelope[] = [
      {
        type: "assistant",
        message: { content: "Step 1\n<!-- __WORKFLOW:PAUSE__ -->" },
      },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.marker).toEqual({ kind: "pause" });
    expect(result.current.latestAssistantKey).toBe(0);
    const cleaned = (result.current.cleanedEnvelopes[0] as { message?: { content?: string } }).message?.content;
    expect(cleaned).toBe("Step 1\n");
  });

  it("handles content block arrays and last marker wins", () => {
    const envelopes: Envelope[] = [
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "<!-- __WORKFLOW:DONE__ -->" },
            { type: "text", text: "Keep going\n<!-- __WORKFLOW:CONTINUE__ -->" },
          ],
        },
      },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.marker).toEqual({ kind: "continue" });
    const blocks = (result.current.cleanedEnvelopes[0] as { message?: { content?: { type: string; text?: string }[] } }).message?.content;
    expect(blocks?.[0]?.text).toBe("");
    expect(blocks?.[1]?.text).toBe("Keep going\n");
  });

  it("passes non-assistant envelopes through unchanged", () => {
    const envelopes: Envelope[] = [{ type: "user", message: { content: "hello" } }];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.marker).toBeNull();
    expect(result.current.latestAssistantKey).toBeNull();
    expect(result.current.cleanedEnvelopes).toEqual(envelopes);
  });

  it("defaults to pause when the latest assistant envelope has no marker", () => {
    const envelopes: Envelope[] = [
      { type: "assistant", message: { content: "Just a normal reply." } },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.marker).toEqual({ kind: "pause" });
    expect(result.current.latestAssistantKey).toBe(0);
  });

  it("ignores a previous marker when the latest assistant envelope has no marker", () => {
    const envelopes: Envelope[] = [
      { type: "assistant", message: { content: "Step 1\n<!-- __WORKFLOW:DONE__ -->" } },
      { type: "assistant", message: { content: "Step 2 with no marker." } },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.marker).toEqual({ kind: "pause" });
    expect(result.current.latestAssistantKey).toBe(1);
  });

  it("returns isComplete true for a complete assistant envelope", () => {
    const envelopes: Envelope[] = [
      { type: "assistant", message: { content: "Just a normal reply." } },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.isComplete).toBe(true);
  });

  it("returns isComplete false while the latest assistant envelope is streaming", () => {
    const envelopes: Envelope[] = [
      { type: "assistant", message: { content: "Still stream", _streaming: true } },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.marker).toEqual({ kind: "pause" });
    expect(result.current.isComplete).toBe(false);
  });

  it("returns isComplete true once the latest assistant envelope finishes streaming", () => {
    const envelopes: Envelope[] = [
      { type: "assistant", message: { content: "Done", _streaming: false } },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.isComplete).toBe(true);
  });

  it("returns the index of the latest assistant envelope as latestAssistantKey", () => {
    const envelopes: Envelope[] = [
      { type: "user", message: { content: "hello" } },
      { type: "assistant", message: { content: "Step 1\n<!-- __WORKFLOW:CONTINUE__ -->" } },
      { type: "assistant", message: { content: "Step 2\n<!-- __WORKFLOW:DONE__ -->" } },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.latestAssistantKey).toBe(2);
    expect(result.current.marker).toEqual({ kind: "done" });
  });

  it("returns isComplete false when there are no assistant envelopes", () => {
    const envelopes: Envelope[] = [
      { type: "user", message: { content: "hello" } },
      { type: "result", result: "ok" },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.isComplete).toBe(false);
  });
});
