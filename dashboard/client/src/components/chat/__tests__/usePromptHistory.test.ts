import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { usePromptHistory } from "../../../hooks/chat/usePromptHistory";

function withFakeStorage() {
  const map = new Map<string, string>();
  const fake = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
  // Replace localStorage on the existing JSDOM window without replacing
  // `window` itself — replacing `window` breaks React DOM's reconciler
  // ("Should not already be working").
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true, writable: true });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", { value: fake, configurable: true, writable: true });
  }
  return map;
}

describe("usePromptHistory", () => {
  beforeEach(() => withFakeStorage());

  it("pushes a single entry", () => {
    const { result } = renderHook(() => usePromptHistory());
    act(() => result.current.push("hello"));
    expect(result.current.entries).toEqual(["hello"]);
    expect(result.current.size).toBe(1);
  });

  it("dedupes adjacent duplicates", () => {
    const { result } = renderHook(() => usePromptHistory());
    act(() => { result.current.push("a"); result.current.push("a"); });
    expect(result.current.entries).toEqual(["a"]);
  });

  it("FIFO drops after 500", () => {
    const { result } = renderHook(() => usePromptHistory());
    act(() => { for (let i = 0; i < 501; i++) result.current.push(`m-${i}`); });
    expect(result.current.size).toBe(500);
    expect(result.current.entries[0]).toBe("m-1");
    expect(result.current.entries[result.current.entries.length - 1]).toBe("m-500");
  });

  it("navigate(-1) returns newest from tail", () => {
    const { result } = renderHook(() => usePromptHistory());
    act(() => { result.current.push("x"); result.current.push("y"); });
    let recalled: string | null = null;
    act(() => { recalled = result.current.navigate(-1); });
    expect(recalled).toBe("y");
  });

  it("navigate(1) past end returns null", () => {
    const { result } = renderHook(() => usePromptHistory());
    act(() => { result.current.push("x"); result.current.navigate(-1); result.current.navigate(-1); });
    let recalled: string | null = "seed";
    act(() => { recalled = result.current.navigate(1); });
    expect(recalled).toBeNull();
  });

  it("commit updates the most recent recalled entry", () => {
    const { result } = renderHook(() => usePromptHistory());
    act(() => { result.current.push("a"); result.current.push("b"); result.current.navigate(-1); });
    act(() => result.current.commit("b-edited"));
    act(() => result.current.push("c"));
    expect(result.current.entries).toEqual(["a", "b-edited", "c"]);
  });
});
