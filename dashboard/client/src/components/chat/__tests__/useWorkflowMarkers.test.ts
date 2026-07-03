import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { extractWorkflowMarkers, useWorkflowMarkers } from "../useWorkflowMarkers";
import type { Envelope } from "../types";

describe("extractWorkflowMarkers", () => {
  it("extracts CONTINUE and strips the marker", () => {
    const text = "Done exploring.\n<!-- __WORKFLOW:CONTINUE__ -->";
    const result = extractWorkflowMarkers(text);
    expect(result.cleaned).toBe("Done exploring.\n");
    expect(result.marker).toEqual({ kind: "continue" });
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
  it("handles string content and strips markers", () => {
    const envelopes: Envelope[] = [
      {
        type: "assistant",
        message: { content: "Step 1\n<!-- __WORKFLOW:PAUSE__ -->" },
      },
    ];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes));
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
    const { result } = renderHook(() => useWorkflowMarkers(envelopes));
    expect(result.current.marker).toEqual({ kind: "continue" });
    const blocks = (result.current.cleanedEnvelopes[0] as { message?: { content?: { type: string; text?: string }[] } }).message?.content;
    expect(blocks?.[0].text).toBe("");
    expect(blocks?.[1].text).toBe("Keep going\n");
  });

  it("passes non-assistant envelopes through unchanged", () => {
    const envelopes: Envelope[] = [{ type: "user", message: { content: "hello" } }];
    const { result } = renderHook(() => useWorkflowMarkers(envelopes));
    expect(result.current.marker).toBeNull();
    expect(result.current.cleanedEnvelopes).toEqual(envelopes);
  });
});
