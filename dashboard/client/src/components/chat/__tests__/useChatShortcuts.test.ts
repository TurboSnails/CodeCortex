import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useChatShortcuts } from "../useChatShortcuts";

function fireShortcut(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey: true, shiftKey: true, ...opts }));
}

describe("useChatShortcuts", () => {
  it("Cmd+Shift+G opens the Git tab in the right panel, not the left sidebar", () => {
    const setLeftView = vi.fn();
    const setRightTab = vi.fn();
    renderHook(() =>
      useChatShortcuts({
        toggleLeftSidebar: vi.fn(),
        setLeftView,
        toggleRightPanel: vi.fn(),
        setRightTab,
        toggleBottomPanel: vi.fn(),
        setBottomTab: vi.fn(),
      })
    );

    fireShortcut("g");

    expect(setRightTab).toHaveBeenCalledWith("git");
    expect(setLeftView).not.toHaveBeenCalled();
  });

  it("Cmd+Shift+F toggles focus mode", () => {
    const toggleFocusMode = vi.fn();
    renderHook(() =>
      useChatShortcuts({
        toggleLeftSidebar: vi.fn(),
        setLeftView: vi.fn(),
        toggleRightPanel: vi.fn(),
        setRightTab: vi.fn(),
        toggleBottomPanel: vi.fn(),
        setBottomTab: vi.fn(),
        toggleFocusMode,
      })
    );

    fireShortcut("f");

    expect(toggleFocusMode).toHaveBeenCalledTimes(1);
  });
});
