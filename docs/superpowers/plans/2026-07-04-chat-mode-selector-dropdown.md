# Chat Mode Selector Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the chat mode selector from above the message list into a compact dropdown on the input hint bar.

**Architecture:** Convert `ChatModeSelector` from four pill buttons into a dropdown component, embed it inside `InputHintBar` on the right side, and remove the old selector placement from `ChatTab` while preserving the workflow-switching confirmation guard.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, React Testing Library, lucide-react icons.

## Global Constraints

- Preserve existing workflow confirmation behavior when switching modes while a workflow is running.
- Keep `ChatModeSelectorProps` interface unchanged (`mode`, `onChange`).
- Maintain existing color scheme and typography sizing.
- Dropdown must not be clipped by the chat card's `overflow-hidden`; open upward from the hint bar.
- Update only `ChatModeSelector.test.tsx` for tests; no new test files are required.

---

## File Structure

| File | Responsibility |
|---|---|
| `dashboard/client/src/components/chat/ChatModeSelector.tsx` | Renders a single trigger button and an upward-opening dropdown list of modes. |
| `dashboard/client/src/components/chat/input/InputHintBar.tsx` | Holds the keyboard hints on the left and the mode selector on the right. |
| `dashboard/client/src/components/chat/ChatTab.tsx` | Removes the old selector placement and wires `mode` / `onModeChange` into `InputHintBar`. |
| `dashboard/client/src/components/chat/__tests__/ChatModeSelector.test.tsx` | Tests the new dropdown behavior. |

---

### Task 1: Convert `ChatModeSelector` to a dropdown

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatModeSelector.tsx`
- Test: `dashboard/client/src/components/chat/__tests__/ChatModeSelector.test.tsx`

**Interfaces:**
- Consumes: `CHAT_MODES`, `ChatMode` from `./workflowConfig`.
- Produces: `ChatModeSelectorProps` unchanged; `ChatModeSelector` now renders a trigger + dropdown.

- [ ] **Step 1: Write the failing test**

Replace `ChatModeSelector.test.tsx` with tests for the dropdown:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatModeSelector } from "../ChatModeSelector";

describe("ChatModeSelector", () => {
  it("renders current mode label on trigger", () => {
    render(<ChatModeSelector mode="normal" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("普通");
  });

  it("opens dropdown and lists all modes", async () => {
    render(<ChatModeSelector mode="normal" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "普通" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "OpenSpec" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Superpower" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Superflow" })).toBeInTheDocument();
  });

  it("calls onChange when a different mode is selected", async () => {
    const onChange = vi.fn();
    render(<ChatModeSelector mode="normal" onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "OpenSpec" }));
    expect(onChange).toHaveBeenCalledWith("openspec");
  });

  it("highlights the active option", async () => {
    render(<ChatModeSelector mode="openspec" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "OpenSpec" })).toHaveAttribute("aria-selected", "true");
  });

  it("closes dropdown when clicking outside", async () => {
    const { container } = render(<ChatModeSelector mode="normal" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.click(container.ownerDocument.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatModeSelector.test.tsx
```

Expected: FAIL — roles `combobox`, `listbox`, `option` are not found.

- [ ] **Step 3: Write minimal implementation**

Replace `ChatModeSelector.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CHAT_MODES, type ChatMode } from "./workflowConfig";

export interface ChatModeSelectorProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
}

export function ChatModeSelector({ mode, onChange }: ChatModeSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = CHAT_MODES.find((m) => m.id === mode) ?? CHAT_MODES[0];

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Chat mode"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-500"
      >
        {selected.label}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Chat mode"
          className="absolute z-40 right-0 bottom-full mb-1 min-w-[120px] rounded-md border border-border bg-surface-1 shadow-lg shadow-black/40 py-1"
        >
          {CHAT_MODES.map((m) => (
            <li
              key={m.id}
              role="option"
              aria-selected={m.id === mode}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className={`px-3 py-1.5 text-xs cursor-pointer ${
                m.id === mode
                  ? "bg-indigo-600/20 text-indigo-200"
                  : "text-gray-300 hover:bg-surface-2 hover:text-gray-200"
              }`}
            >
              {m.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatModeSelector.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/components/chat/ChatModeSelector.tsx dashboard/client/src/components/chat/__tests__/ChatModeSelector.test.tsx
git commit -m "feat(chat): convert mode selector into a dropdown"
```

---

### Task 2: Embed the selector in `InputHintBar`

**Files:**
- Modify: `dashboard/client/src/components/chat/input/InputHintBar.tsx`

**Interfaces:**
- Consumes: `ChatModeSelector` from `../ChatModeSelector`; `ChatMode` from `../workflowConfig`.
- Produces: `InputHintBarProps` with `mode: ChatMode` and `onModeChange: (mode: ChatMode) => void`.

- [ ] **Step 1: Write the failing test**

No dedicated test file exists for `InputHintBar`; verify through the existing `ChatModeSelector.test.tsx` and by rendering `ChatTab` in Task 3. For this task, update the component and rely on TypeScript / existing snapshots.

- [ ] **Step 2: Update `InputHintBar.tsx`**

Replace the file with:

```tsx
import { useTranslation } from "react-i18next";
import { ChatModeSelector } from "../ChatModeSelector";
import type { ChatMode } from "../workflowConfig";

export interface InputHintBarProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export function InputHintBar({ mode, onModeChange }: InputHintBarProps) {
  const { t } = useTranslation("chat-input");
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1 text-[10px] text-gray-500">
      <div className="whitespace-normal md:whitespace-nowrap">
        <span>{t("hint.send", "Send")}</span>{" "}
        <kbd className="kbd">⏎</kbd>{" "}
        <span>· {t("hint.newline", "Newline")}</span>{" "}
        <kbd className="kbd">⇧⏎</kbd>{" "}
        <span>· {t("hint.forceSend", "Force send")}</span>{" "}
        <kbd className="kbd">⌘⏎</kbd>{" "}
        <span>· {t("hint.commands", "Commands")}</span>{" "}
        <kbd className="kbd">/</kbd>{" "}
        <span>· {t("hint.files", "Files")}</span>{" "}
        <kbd className="kbd">@</kbd>{" "}
        <span>· {t("hint.recall", "Recall history")}</span>{" "}
        <kbd className="kbd">↑↓</kbd>
      </div>
      <ChatModeSelector mode={mode} onChange={onModeChange} />
    </div>
  );
}
```

- [ ] **Step 3: Run client typecheck/tests**

Run:
```bash
cd dashboard/client && npx tsc --noEmit
```

Expected: PASS — TypeScript accepts the new props.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/components/chat/input/InputHintBar.tsx
git commit -m "feat(chat): add mode selector dropdown to input hint bar"
```

---

### Task 3: Remove old selector placement from `ChatTab`

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatTab.tsx`

**Interfaces:**
- Consumes: `InputHintBarProps` from `./input/InputHintBar`; existing `mode` / `setMode` state and `workflow` / `cancelWorkflow` from `ChatTab`.
- Produces: `ChatTab` renders `InputHintBar` with `mode` and `onModeChange` instead of the standalone selector.

- [ ] **Step 1: Add a guarded mode-change handler**

Inside `ChatTab`, after `cancelWorkflow` is defined, add:

```tsx
const handleModeChange = (next: ChatMode) => {
  if (workflow.kind !== "idle") {
    const ok = window.confirm("当前工作流尚未完成，切换模式将取消进度。是否继续？");
    if (!ok) return;
    cancelWorkflow();
  }
  setMode(next);
};
```

- [ ] **Step 2: Remove the old `ChatModeSelector` block**

Delete these lines from the JSX:

```tsx
<ChatModeSelector
  mode={mode}
  onChange={(next) => {
    if (workflow.kind !== "idle") {
      const ok = window.confirm("当前工作流尚未完成，切换模式将取消进度。是否继续？");
      if (!ok) return;
      cancelWorkflow();
    }
    setMode(next);
  }}
/>
```

- [ ] **Step 3: Update `InputHintBar` call site**

Change:

```tsx
<InputHintBar />
```

to:

```tsx
<InputHintBar mode={mode} onModeChange={handleModeChange} />
```

- [ ] **Step 4: Run tests**

Run:
```bash
cd dashboard/client && npx vitest run src/components/chat/__tests__
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/components/chat/ChatTab.tsx
git commit -m "feat(chat): remove standalone mode selector, wire dropdown via InputHintBar"
```

---

### Task 4: Verify UI and update snapshots if needed

**Files:**
- Review: `dashboard/client/src/pages/__tests__/screens.snapshot.test.tsx` outputs.

**Interfaces:**
- Consumes: Updated `ChatTab` rendering.
- Produces: Regenerated snapshot baselines if the intentional UI change affects snapshots.

- [ ] **Step 1: Run snapshot tests**

```bash
cd dashboard/client && npx vitest run src/pages/__tests__/screens.snapshot.test.tsx
```

- [ ] **Step 2: Review diffs**

If snapshots fail, inspect the diff to confirm only the intended mode-selector relocation appears.

- [ ] **Step 3: Regenerate baselines intentionally**

If the diff is correct:

```bash
cd dashboard/client && npx vitest run src/pages/__tests__/screens.snapshot.test.tsx -u
```

- [ ] **Step 4: Commit snapshot updates**

```bash
git add dashboard/client/src/pages/__tests__/__snapshots__
git commit -m "test(chat): update snapshots for relocated mode selector"
```

---

## Self-Review

1. **Spec coverage:**
   - Dropdown component — Task 1.
   - Embed in InputHintBar right side — Task 2.
   - Remove old placement from ChatTab — Task 3.
   - Preserve workflow confirmation — included in `handleModeChange` in Task 3.
   - Update tests — Task 1 and Task 4.

2. **Placeholder scan:** No TBD/TODO/"implement later"/"similar to Task N" patterns.

3. **Type consistency:** `ChatModeSelectorProps` unchanged; `InputHintBarProps` introduces `mode: ChatMode` and `onModeChange: (mode: ChatMode) => void`; `ChatTab` passes matching values.

No gaps found.
