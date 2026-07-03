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
    const text = "Failed.\n<!-- __WORKFLOW:ERROR:missing spec -->";
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

  it("uses the last marker when multiple appear", () => {
    const text = "A\n<!-- __WORKFLOW:PAUSE__ -->\nB\n<!-- __WORKFLOW:CONTINUE__ -->";
    const result = extractWorkflowMarkers(text);
    expect(result.marker).toEqual({ kind: "continue" });
  });
});

describe("useWorkflowMarkers", () => {
  it("in normal mode, does not strip markers and returns marker null", () => {
    const envelopes: Envelope[] = [
      {
        type: "assistant",
        message: { content: "Step 1\n<!-- __WORKFLOW:PAUSE__ -->" },
      },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, "normal"));
    expect(result.current.marker).toBeNull();
    const cleaned = (result.current.cleanedEnvelopes[0] as { message?: { content?: string } }).message?.content;
    expect(cleaned).toBe("Step 1\n<!-- __WORKFLOW:PAUSE__ -->");
    expect(result.current.cleanedEnvelopes).toBe(envelopes);
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
    expect(blocks?.[0].text).toBe("");
    expect(blocks?.[1].text).toBe("Keep going\n");
  });

  it("passes non-assistant envelopes through unchanged", () => {
    const envelopes: Envelope[] = [{ type: "user", message: { content: "hello" } }];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.marker).toBeNull();
    expect(result.current.cleanedEnvelopes).toEqual(envelopes);
  });

  it("defaults to pause when the latest assistant envelope has no marker", () => {
    const envelopes: Envelope[] = [
      { type: "assistant", message: { content: "Just a normal reply." } },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.marker).toEqual({ kind: "pause" });
  });

  it("ignores a previous marker when the latest assistant envelope has no marker", () => {
    const envelopes: Envelope[] = [
      { type: "assistant", message: { content: "Step 1\n<!-- __WORKFLOW:DONE__ -->" } },
      { type: "assistant", message: { content: "Step 2 with no marker." } },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.marker).toEqual({ kind: "pause" });
  });

  it("returns null when there are no assistant envelopes", () => {
    const envelopes: Envelope[] = [
      { type: "user", message: { content: "hello" } },
      { type: "result", result: "ok" },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes, WORKFLOW_MODE));
    expect(result.current.marker).toBeNull();
  });
});
