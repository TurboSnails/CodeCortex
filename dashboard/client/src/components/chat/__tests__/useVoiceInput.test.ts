import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useVoiceInput } from "../../../hooks/chat/useVoiceInput";

class FakeRecognition {
  continuous = true;
  interimResults = true;
  lang = "";
  onresult: ((e: { results: { [k: number]: { 0: { transcript: string }; isFinal: boolean }; length: number } }) => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start() {}
  stop() { this.onend?.(); }
  abort() {}
}

function installRecognition() {
  const rec = new FakeRecognition();
  // Mutate the existing jsdom window in place so React's DOM prototype chain stays intact.
  (globalThis as any).window.SpeechRecognition = function () { return rec; };
  (globalThis as any).window.webkitSpeechRecognition = undefined;
  return rec;
}

function removeRecognition() {
  delete (globalThis as any).window.SpeechRecognition;
  delete (globalThis as any).window.webkitSpeechRecognition;
}

describe("useVoiceInput", () => {
  beforeEach(() => installRecognition());
  afterEach(() => removeRecognition());

  it("reports unavailable when SpeechRecognition is missing", () => {
    removeRecognition();
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.available).toBe(false);
  });

  it("toggles listening and reports state", () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.listening).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(false);
  });

  it("delivers interim text via onInterim", () => {
    const { result } = renderHook(() => useVoiceInput());
    const interim = vi.fn();
    act(() => result.current.onInterim(interim));
    act(() => result.current.toggle());
    const rec = (globalThis as any).__lastRec;
    act(() => rec?.onresult?.({ results: { 0: { 0: { transcript: "hello" }, isFinal: false }, length: 1 } }));
    expect(interim).toHaveBeenCalledWith("hello");
  });

  it("delivers final text via onFinal and clears interim", () => {
    const { result } = renderHook(() => useVoiceInput());
    const final = vi.fn();
    const interim = vi.fn();
    act(() => { result.current.onFinal(final); result.current.onInterim(interim); });
    act(() => result.current.toggle());
    const rec = (globalThis as any).__lastRec;
    act(() => rec?.onresult?.({ results: { 0: { 0: { transcript: "done" }, isFinal: true }, length: 1 } }));
    expect(final).toHaveBeenCalledWith("done");
    expect(result.current.interimText).toBe("");
  });

  it("disables after 3 consecutive errors", () => {
    const { result } = renderHook(() => useVoiceInput());
    act(() => result.current.toggle());
    const rec = (globalThis as any).__lastRec;
    act(() => { rec?.onerror?.({ error: "x" }); rec?.onerror?.({ error: "x" }); rec?.onerror?.({ error: "x" }); });
    expect(result.current.listening).toBe(false);
    // subsequent toggle has no effect because recognition is locked
    act(() => result.current.toggle());
    expect(result.current.listening).toBe(false);
  });
});