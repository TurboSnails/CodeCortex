/**
 * @file useChatShortcuts.ts
 * @description VS Code-style keyboard shortcuts for the IDE-style /chat page.
 */

import { useEffect } from "react";
import type { LeftSidebarView, RightPanelTab, BottomPanelTab } from "./ChatWorkspaceContext";

interface ShortcutActions {
  toggleLeftSidebar: () => void;
  setLeftView: (view: LeftSidebarView) => void;
  toggleRightPanel: () => void;
  setRightTab: (tab: RightPanelTab) => void;
  toggleBottomPanel: () => void;
  setBottomTab: (tab: BottomPanelTab) => void;
  stopRun?: () => void;
  toggleFocusMode?: () => void;
}

export function useChatShortcuts(actions: ShortcutActions) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;

      // Cmd+B: toggle left sidebar
      if (meta && !shift && e.key.toLowerCase() === "b") {
        e.preventDefault();
        actions.toggleLeftSidebar();
        return;
      }

      // Cmd+Shift+E: Explorer
      if (meta && shift && e.key.toLowerCase() === "e") {
        e.preventDefault();
        actions.setLeftView("explorer");
        return;
      }

      // Cmd+Shift+G: Git
      if (meta && shift && e.key.toLowerCase() === "g") {
        e.preventDefault();
        actions.setLeftView("git");
        return;
      }

      // Cmd+J: toggle bottom panel
      if (meta && !shift && e.key.toLowerCase() === "j") {
        e.preventDefault();
        actions.toggleBottomPanel();
        return;
      }

      // Cmd+Shift+M: Problems
      if (meta && shift && e.key.toLowerCase() === "m") {
        e.preventDefault();
        actions.setBottomTab("problems");
        actions.toggleBottomPanel();
        return;
      }

      // Cmd+Shift+F: toggle Focus mode
      if (meta && shift && e.key.toLowerCase() === "f") {
        e.preventDefault();
        actions.toggleFocusMode?.();
        return;
      }

      // Esc: stop running session if provided
      if (e.key === "Escape" && actions.stopRun) {
        actions.stopRun();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions]);
}
