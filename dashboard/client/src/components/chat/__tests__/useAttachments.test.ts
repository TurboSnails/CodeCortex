import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAttachments } from "../../../hooks/chat/useAttachments";

class FakeFile {
  constructor(public name: string, public size: number, public type: string) {}
}

beforeEach(() => {
  // jsdom doesn't implement FileReader; replace with a stub
  class StubReader {
    result: string | ArrayBuffer | null = "data:image/png;base64,AAA";
    onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
    readAsDataURL() {
      queueMicrotask(() => this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>));
    }
  }
  Object.defineProperty(globalThis, "FileReader", { value: StubReader, configurable: true });
  // crypto.randomUUID polyfill if missing
  if (!("randomUUID" in globalThis.crypto)) {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: () => `id-${Math.random().toString(36).slice(2)}`,
      configurable: true,
    });
  }
});

describe("useAttachments", () => {
  it("rejects files larger than 5MiB", () => {
    const { result } = renderHook(() => useAttachments({ onError: () => {} }));
    const big = new FakeFile("big.png", 6 * 1024 * 1024, "image/png");
    const file = { ...big } as unknown as File;
    act(() => result.current.onPick({ 0: file, length: 1, item: () => file } as unknown as FileList));
    expect(result.current.items).toEqual([]);
  });

  it("rejects the 9th image when 8 already attached", async () => {
    const { result } = renderHook(() => useAttachments({ onError: () => {} }));
    for (let i = 0; i < 9; i++) {
      const f = new FakeFile(`f${i}.png`, 100, "image/png");
      const file = { ...f } as unknown as File;
      await act(async () => {
        result.current.onPick({ 0: file, length: 1, item: () => file } as unknown as FileList);
        await Promise.resolve();
      });
    }
    expect(result.current.items.length).toBe(8);
  });

  it("buildPayload returns {text, attachments} and clears items", async () => {
    const { result } = renderHook(() => useAttachments({ onError: () => {} }));
    const f = new FakeFile("a.png", 100, "image/png");
    const file = { ...f } as unknown as File;
    await act(async () => {
      result.current.onPick({ 0: file, length: 1, item: () => file } as unknown as FileList);
      await Promise.resolve();
    });
    let payload: import("../../../lib/types").SendPayload | null = null;
    act(() => { payload = result.current.buildPayload("hi"); });
    expect(payload).not.toBeNull();
    expect(payload!.text).toBe("hi");
    expect(payload!.attachments.length).toBe(1);
    expect(result.current.items.length).toBe(0);
  });

  it("onPaste reads clipboard files", async () => {
    const { result } = renderHook(() => useAttachments({ onError: () => {} }));
    const f = new FakeFile("clip.png", 100, "image/png");
    const file = { ...f } as unknown as File;
    const e = { clipboardData: { files: { 0: file, length: 1, item: () => file } } } as unknown as ClipboardEvent;
    const prevent = vi.fn();
    await act(async () => {
      result.current.onPaste({ ...e, preventDefault: prevent } as unknown as ClipboardEvent);
      await Promise.resolve();
    });
    expect(prevent).toHaveBeenCalled();
    expect(result.current.items.length).toBe(1);
  });

  it("onDrop prevents default and accepts the image", async () => {
    const { result } = renderHook(() => useAttachments({ onError: () => {} }));
    const f = new FakeFile("drop.png", 100, "image/png");
    const file = { ...f } as unknown as File;
    const e = { dataTransfer: { files: { 0: file, length: 1, item: () => file } } } as unknown as DragEvent;
    const prevent = vi.fn();
    await act(async () => {
      result.current.onDrop({ ...e, preventDefault: prevent } as unknown as DragEvent);
      await Promise.resolve();
    });
    expect(prevent).toHaveBeenCalled();
    expect(result.current.items.length).toBe(1);
  });

  it("remove deletes by id", async () => {
    const { result } = renderHook(() => useAttachments({ onError: () => {} }));
    const f = new FakeFile("a.png", 100, "image/png");
    const file = { ...f } as unknown as File;
    await act(async () => {
      result.current.onPick({ 0: file, length: 1, item: () => file } as unknown as FileList);
      await Promise.resolve();
    });
    const id = result.current.items[0]!.id;
    act(() => result.current.remove(id));
    expect(result.current.items).toEqual([]);
  });
});
