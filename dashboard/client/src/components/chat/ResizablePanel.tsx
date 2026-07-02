/**
 * @file ResizablePanel.tsx
 * @description Collapsible panel wrapper for the IDE-style /chat layout. Supports
 * a fixed default width, a collapse toggle, and a simple drag handle to resize.
 */

import { useState, useCallback, useRef } from "react";
import { PanelLeftClose, PanelRightClose } from "lucide-react";

interface ResizablePanelProps {
  side: "left" | "right";
  visible: boolean;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  onToggle: () => void;
  children: React.ReactNode;
  header?: React.ReactNode;
}

export function ResizablePanel({
  side,
  visible,
  defaultWidth,
  minWidth = 180,
  maxWidth = 480,
  onToggle,
  children,
  header,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const draggingRef = useRef(false);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startX = e.clientX;
      const startWidth = width;

      const onMouseMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
        const next = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
        setWidth(next);
      };

      const onMouseUp = () => {
        draggingRef.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [width, minWidth, maxWidth, side]
  );

  if (!visible) return null;

  const ToggleIcon = side === "left" ? PanelLeftClose : PanelRightClose;

  return (
    <div
      className="flex flex-col border-border bg-surface-1 flex-shrink-0 h-full overflow-hidden"
      style={{ width, borderRightWidth: side === "left" ? 1 : 0, borderLeftWidth: side === "right" ? 1 : 0 }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border min-h-[40px]">
        {header && <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{header}</span>}
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-surface-2"
          title={side === "left" ? "Hide sidebar" : "Hide panel"}
        >
          <ToggleIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      <div
        className={`absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/30 z-10 ${
          side === "left" ? "right-0" : "left-0"
        }`}
        style={{ [side === "left" ? "right" : "left"]: 0 }}
        onMouseDown={startResize}
      />
    </div>
  );
}
