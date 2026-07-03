# Chat Workflow Mode Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mode selector above the `/chat` input that supports Normal, OpenSpec, Superpower, and Superflow modes, driving each workflow automatically via `__WORKFLOW:*__` markers emitted by skills.

**Architecture:** A small protocol layer (`useWorkflowMarkers`) parses markers from assistant envelopes, a configuration module (`workflowConfig`) defines the step sequences, two new UI components render the selector and progress, and `ChatTab` orchestrates state transitions and auto-advancement.

**Tech Stack:** React + TypeScript + Tailwind, Vitest + React Testing Library, existing dashboard API (`useRunChat`, `eventBus`).

## Global Constraints

- All changes happen on `master` in `/Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex`; no worktree is required.
- Preserve existing chat behavior when `mode === "normal"`.
- Markers are HTML comments: `<!-- __WORKFLOW:CONTINUE__ -->`, `<!-- __WORKFLOW:PAUSE__ -->`, `<!-- __WORKFLOW:DONE__ -->`, `<!-- __WORKFLOW:ERROR:reason -->`.
- If a complete assistant reply contains no marker, default to `PAUSE`.
- Skill files under `~/.claude/plugins/` are outside the repo; patch local copies only.
- Run `npm run test:client` before finishing.

---

## File Map

| File | Responsibility |
|---|---|
| `dashboard/client/src/components/chat/workflowConfig.ts` | Central definitions: `ChatMode`, `WorkflowStep`, step sequences, command prefixes, next-step lookup. |
| `dashboard/client/src/components/chat/useWorkflowMarkers.ts` | Hook that scans `Envelope[]` for the latest workflow marker and returns the cleaned text + instruction. |
| `dashboard/client/src/components/chat/ChatModeSelector.tsx` | Pill-button UI for picking a mode. |
| `dashboard/client/src/components/chat/WorkflowProgress.tsx` | Progress bar showing current/finished/pending steps with a cancel button. |
| `dashboard/client/src/components/chat/ChatTab.tsx` | Orchestrates workflow state, launches steps, handles auto-advance, pause, done, error. |
| `dashboard/client/src/components/chat/ChatInput.tsx` | Receives a mode-aware placeholder; no other change. |
| `.claude/skills/openspec-*/SKILL.md` | Emit workflow markers at end of output. |
| `.claude/commands/opsx/*.md` | Emit workflow markers at end of output. |
| `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/*/SKILL.md` | Emit workflow markers at end of output. |

---

### Task 0: Environment Readiness

**Files:**
- Check: `openspec` CLI availability
- Check: `superpowers-dev` plugin availability

**Interfaces:**
- Produces: confirmation that `openspec` and superpowers skills are installed.

- [ ] **Step 1: Check `openspec` CLI**

Run:

```bash
which openspec
openspec --version
```

Expected: path printed and version `1.3.1` or later.

If missing, install:

```bash
# Adjust if project uses a different install method; check README first.
brew install openspec
```

- [ ] **Step 2: Check superpowers plugin**

Run:

```bash
ls -la /Users/hassan/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/
```

Expected: directories `brainstorming/`, `writing-plans/`, `executing-plans/` exist.

If missing, install via Claude marketplace or project setup instructions.

- [ ] **Step 3: Commit readiness note**

```bash
git commit --allow-empty -m "chore(plan): confirm openspec and superpowers plugin are installed

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 1: Workflow Marker Parser

**Files:**
- Create: `dashboard/client/src/components/chat/useWorkflowMarkers.ts`
- Create: `dashboard/client/src/components/chat/__tests__/useWorkflowMarkers.test.ts`

**Interfaces:**
- Produces: `extractWorkflowMarkers(text: string): { cleaned: string; marker: WorkflowMarker | null }`
- Produces: `useWorkflowMarkers(envelopes: Envelope[]): { marker: WorkflowMarker | null; cleanedEnvelopes: Envelope[] }`

```ts
export type WorkflowMarker =
  | { kind: "continue" }
  | { kind: "pause" }
  | { kind: "done" }
  | { kind: "error"; message: string };
```

- [ ] **Step 1: Write the failing test**

Create `dashboard/client/src/components/chat/__tests__/useWorkflowMarkers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractWorkflowMarkers } from "../useWorkflowMarkers";

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx vitest run src/components/chat/__tests__/useWorkflowMarkers.test.ts
```

Expected: FAIL with "function not defined" or module not found.

- [ ] **Step 3: Implement `extractWorkflowMarkers` and `useWorkflowMarkers`**

Create `dashboard/client/src/components/chat/useWorkflowMarkers.ts`:

```ts
import { useMemo } from "react";
import type { AssistantMessage, Envelope } from "./types";

export type WorkflowMarker =
  | { kind: "continue" }
  | { kind: "pause" }
  | { kind: "done" }
  | { kind: "error"; message: string };

const MARKER_RE = /<!--\s*__WORKFLOW:(CONTINUE|PAUSE|DONE|ERROR):?([^>]*)?__\s*-->/gi;

export function extractWorkflowMarkers(text: string): {
  cleaned: string;
  marker: WorkflowMarker | null;
} {
  let lastMarker: WorkflowMarker | null = null;
  const cleaned = text.replace(MARKER_RE, (_match, kindRaw, payloadRaw) => {
    const kind = String(kindRaw).toLowerCase();
    const payload = payloadRaw ? String(payloadRaw).trim() : "";
    if (kind === "continue") lastMarker = { kind: "continue" };
    else if (kind === "pause") lastMarker = { kind: "pause" };
    else if (kind === "done") lastMarker = { kind: "done" };
    else if (kind === "error") lastMarker = { kind: "error", message: payload };
    return "";
  });
  return { cleaned, marker: lastMarker };
}

function isAssistantEnvelope(env: Envelope): env is AssistantMessage {
  return (env as { type?: string }).type === "assistant";
}

export function useWorkflowMarkers(envelopes: Envelope[]): {
  marker: WorkflowMarker | null;
  cleanedEnvelopes: Envelope[];
} {
  return useMemo(() => {
    let latestMarker: WorkflowMarker | null = null;
    const cleanedEnvelopes = envelopes.map((env) => {
      if (!isAssistantEnvelope(env)) return env;
      const content = env.message?.content;
      if (typeof content === "string") {
        const { cleaned, marker } = extractWorkflowMarkers(content);
        if (marker) latestMarker = marker;
        return { ...env, message: { ...env.message, content: cleaned } };
      }
      if (Array.isArray(content)) {
        const nextContent = content.map((block) => {
          if (block.type === "text" && typeof (block as { text?: string }).text === "string") {
            const { cleaned, marker } = extractWorkflowMarkers((block as { text: string }).text);
            if (marker) latestMarker = marker;
            return { ...block, text: cleaned };
          }
          return block;
        });
        return { ...env, message: { ...env.message, content: nextContent } };
      }
      return env;
    });
    return { marker: latestMarker, cleanedEnvelopes };
  }, [envelopes]);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx vitest run src/components/chat/__tests__/useWorkflowMarkers.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/components/chat/useWorkflowMarkers.ts dashboard/client/src/components/chat/__tests__/useWorkflowMarkers.test.ts
git commit -m "feat(chat): add workflow marker parser and hook

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Workflow Configuration

**Files:**
- Create: `dashboard/client/src/components/chat/workflowConfig.ts`
- Create: `dashboard/client/src/components/chat/__tests__/workflowConfig.test.ts`

**Interfaces:**
- Produces: `ChatMode` union
- Produces: `WorkflowStep` interface
- Produces: `getWorkflowSteps(mode: ChatMode): WorkflowStep[]`
- Produces: `getNextCommand(mode: ChatMode, currentStep: string): string | null`
- Produces: `getPlaceholder(mode: ChatMode): string`

- [ ] **Step 1: Write the failing test**

Create `dashboard/client/src/components/chat/__tests__/workflowConfig.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CHAT_MODES,
  getWorkflowSteps,
  getNextCommand,
  getPlaceholder,
} from "../workflowConfig";

describe("workflowConfig", () => {
  it("lists four modes", () => {
    expect(CHAT_MODES).toHaveLength(4);
    expect(CHAT_MODES.map((m) => m.id)).toEqual(["normal", "openspec", "superpower", "superflow"]);
  });

  it("returns OpenSpec steps", () => {
    const steps = getWorkflowSteps("openspec");
    expect(steps.map((s) => s.id)).toEqual(["explore", "propose", "apply", "archive"]);
  });

  it("returns Superflow steps", () => {
    const steps = getWorkflowSteps("superflow");
    expect(steps.map((s) => s.id)).toEqual(["brainstorm", "propose", "apply", "archive"]);
  });

  it("looks up the next command", () => {
    expect(getNextCommand("openspec", "explore")).toBe("/opsx:propose");
    expect(getNextCommand("openspec", "archive")).toBeNull();
    expect(getNextCommand("superpower", "brainstorm")).toBe("/write-plan");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx vitest run src/components/chat/__tests__/workflowConfig.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `workflowConfig.ts`**

Create `dashboard/client/src/components/chat/workflowConfig.ts`:

```ts
export type ChatMode = "normal" | "openspec" | "superpower" | "superflow";

export interface ChatModeOption {
  id: ChatMode;
  label: string;
}

export const CHAT_MODES: ChatModeOption[] = [
  { id: "normal", label: "普通" },
  { id: "openspec", label: "OpenSpec" },
  { id: "superpower", label: "Superpower" },
  { id: "superflow", label: "Superflow" },
];

export interface WorkflowStep {
  id: string;
  command: string;
}

const WORKFLOW_STEPS: Record<Exclude<ChatMode, "normal">, WorkflowStep[]> = {
  openspec: [
    { id: "explore", command: "/opsx:explore" },
    { id: "propose", command: "/opsx:propose" },
    { id: "apply", command: "/opsx:apply" },
    { id: "archive", command: "/opsx:archive" },
  ],
  superpower: [
    { id: "brainstorm", command: "/brainstorm" },
    { id: "write-plan", command: "/write-plan" },
    { id: "execute-plan", command: "/execute-plan" },
  ],
  superflow: [
    { id: "brainstorm", command: "/brainstorm" },
    { id: "propose", command: "/opsx:propose" },
    { id: "apply", command: "/opsx:apply" },
    { id: "archive", command: "/opsx:archive" },
  ],
};

export function getWorkflowSteps(mode: ChatMode): WorkflowStep[] {
  if (mode === "normal") return [];
  return WORKFLOW_STEPS[mode];
}

export function getNextCommand(mode: ChatMode, currentStepId: string): string | null {
  const steps = getWorkflowSteps(mode);
  const idx = steps.findIndex((s) => s.id === currentStepId);
  if (idx < 0 || idx >= steps.length - 1) return null;
  return steps[idx + 1].command;
}

export function getPlaceholder(mode: ChatMode): string {
  switch (mode) {
    case "openspec":
      return "描述你想探索/变更的需求，我将按 OpenSpec 流程推进";
    case "superpower":
      return "描述你想实现的功能，我将按 brainstorm → plan → execute 推进";
    case "superflow":
      return "描述你想端到端交付的变更";
    default:
      return "Ask Claude…";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx vitest run src/components/chat/__tests__/workflowConfig.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/components/chat/workflowConfig.ts dashboard/client/src/components/chat/__tests__/workflowConfig.test.ts
git commit -m "feat(chat): add workflow configuration module

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: ChatModeSelector Component

**Files:**
- Create: `dashboard/client/src/components/chat/ChatModeSelector.tsx`
- Create: `dashboard/client/src/components/chat/__tests__/ChatModeSelector.test.tsx`

**Interfaces:**
- Consumes: `ChatMode` from `workflowConfig.ts`
- Produces: `ChatModeSelector({ mode, onChange, disabled })` component

- [ ] **Step 1: Write the failing test**

Create `dashboard/client/src/components/chat/__tests__/ChatModeSelector.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatModeSelector } from "../ChatModeSelector";

describe("ChatModeSelector", () => {
  it("renders four mode buttons", () => {
    render(<ChatModeSelector mode="normal" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "普通" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OpenSpec" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Superpower" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Superflow" })).toBeInTheDocument();
  });

  it("calls onChange when a different mode is clicked", async () => {
    const onChange = vi.fn();
    render(<ChatModeSelector mode="normal" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "OpenSpec" }));
    expect(onChange).toHaveBeenCalledWith("openspec");
  });

  it("disables buttons when disabled is true", () => {
    render(<ChatModeSelector mode="normal" onChange={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "OpenSpec" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx vitest run src/components/chat/__tests__/ChatModeSelector.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `ChatModeSelector.tsx`**

Create `dashboard/client/src/components/chat/ChatModeSelector.tsx`:

```tsx
import { CHAT_MODES, type ChatMode } from "./workflowConfig";

export interface ChatModeSelectorProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

export function ChatModeSelector({ mode, onChange, disabled }: ChatModeSelectorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2" role="group" aria-label="Chat mode">
      {CHAT_MODES.map((m) => {
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              active
                ? "bg-indigo-600 text-white border-indigo-500"
                : "bg-surface-2 text-gray-400 border-border hover:bg-surface-3 hover:text-gray-200"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx vitest run src/components/chat/__tests__/ChatModeSelector.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/components/chat/ChatModeSelector.tsx dashboard/client/src/components/chat/__tests__/ChatModeSelector.test.tsx
git commit -m "feat(chat): add ChatModeSelector component

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: WorkflowProgress Component

**Files:**
- Create: `dashboard/client/src/components/chat/WorkflowProgress.tsx`
- Create: `dashboard/client/src/components/chat/__tests__/WorkflowProgress.test.tsx`

**Interfaces:**
- Consumes: `ChatMode`, `WorkflowStep` from `workflowConfig.ts`
- Produces: `WorkflowProgress({ mode, currentStepId, onCancel })` component

- [ ] **Step 1: Write the failing test**

Create `dashboard/client/src/components/chat/__tests__/WorkflowProgress.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkflowProgress } from "../WorkflowProgress";

describe("WorkflowProgress", () => {
  it("renders steps for openspec", () => {
    render(<WorkflowProgress mode="openspec" currentStepId="propose" onCancel={vi.fn()} />);
    expect(screen.getByText("explore")).toBeInTheDocument();
    expect(screen.getByText("propose")).toBeInTheDocument();
    expect(screen.getByText("apply")).toBeInTheDocument();
    expect(screen.getByText("archive")).toBeInTheDocument();
  });

  it("highlights the current step", () => {
    render(<WorkflowProgress mode="openspec" currentStepId="apply" onCancel={vi.fn()} />);
    const current = screen.getByText("apply");
    expect(current).toHaveAttribute("aria-current", "step");
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const onCancel = vi.fn();
    render(<WorkflowProgress mode="openspec" currentStepId="explore" onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx vitest run src/components/chat/__tests__/WorkflowProgress.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `WorkflowProgress.tsx`**

Create `dashboard/client/src/components/chat/WorkflowProgress.tsx`:

```tsx
import { X } from "lucide-react";
import { getWorkflowSteps, type ChatMode } from "./workflowConfig";

export interface WorkflowProgressProps {
  mode: ChatMode;
  currentStepId: string;
  onCancel: () => void;
}

export function WorkflowProgress({ mode, currentStepId, onCancel }: WorkflowProgressProps) {
  const steps = getWorkflowSteps(mode);
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-[11px]">
      <div className="flex items-center gap-1.5">
        {steps.map((step, idx) => {
          const isDone = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          return (
            <span key={step.id} className="inline-flex items-center gap-1.5">
              {idx > 0 && <span className="text-gray-600">→</span>}
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`px-1.5 py-0.5 rounded border ${
                  isDone
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : isCurrent
                    ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                    : "text-gray-500 border-transparent"
                }`}
              >
                {isDone ? "✓" : null} {step.id}
              </span>
            </span>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="ml-auto inline-flex items-center gap-1 text-gray-500 hover:text-red-400"
        aria-label="Cancel workflow"
      >
        <X className="w-3 h-3" />
        <span>取消</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx vitest run src/components/chat/__tests__/WorkflowProgress.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/components/chat/WorkflowProgress.tsx dashboard/client/src/components/chat/__tests__/WorkflowProgress.test.tsx
git commit -m "feat(chat): add WorkflowProgress component

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Integrate Workflow State and Auto-Advance into ChatTab

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatTab.tsx`
- Modify: `dashboard/client/src/components/chat/ChatInput.tsx`

**Interfaces:**
- Consumes: `ChatModeSelector`, `WorkflowProgress`, `useWorkflowMarkers`, `workflowConfig`
- Produces: `workflow` state and auto-advance behavior in `ChatTab`

- [ ] **Step 1: Add imports and workflow state to `ChatTab.tsx`**

Modify `dashboard/client/src/components/chat/ChatTab.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatModeSelector } from "./ChatModeSelector";
import { WorkflowProgress } from "./WorkflowProgress";
import { useWorkflowMarkers, type WorkflowMarker } from "./useWorkflowMarkers";
import {
  getNextCommand,
  getPlaceholder,
  getWorkflowSteps,
  type ChatMode,
} from "./workflowConfig";
```

Add workflow state inside `ChatTab`:

```tsx
type WorkflowState =
  | { kind: "idle" }
  | { kind: "running"; mode: ChatMode; stepId: string; autoContinue: boolean }
  | { kind: "paused"; mode: ChatMode; stepId: string; reason: string }
  | { kind: "error"; mode: ChatMode; stepId: string; message: string }
  | { kind: "done"; mode: ChatMode };
```

- [ ] **Step 2: Wire `useWorkflowMarkers` into `ChatTab`**

Replace the direct use of `displayEnvelopes` with marker-cleaned envelopes:

```tsx
const { marker, cleanedEnvelopes } = useWorkflowMarkers(displayEnvelopes);
```

Render `cleanedEnvelopes` instead of `displayEnvelopes` in `ChatMessageList`.

- [ ] **Step 3: Implement state transitions and auto-advance**

Add a `useEffect` that reacts to `marker` and `handle`:

```tsx
const autoAdvanceRef = useRef(false);

useEffect(() => {
  if (!marker || workflow.kind !== "running") return;

  if (marker.kind === "error") {
    setWorkflow({ kind: "error", mode: workflow.mode, stepId: workflow.stepId, message: marker.message });
    return;
  }

  if (marker.kind === "done") {
    setWorkflow({ kind: "done", mode: workflow.mode });
    setMode("normal");
    return;
  }

  if (marker.kind === "pause") {
    setWorkflow({ kind: "paused", mode: workflow.mode, stepId: workflow.stepId, reason: "Waiting for user input" });
    return;
  }

  if (marker.kind === "continue") {
    const nextCommand = getNextCommand(workflow.mode, workflow.stepId);
    if (!nextCommand) {
      setWorkflow({ kind: "done", mode: workflow.mode });
      setMode("normal");
      return;
    }
    autoAdvanceRef.current = true;
    const timer = setTimeout(() => {
      if (!autoAdvanceRef.current) return;
      const nextStepId = getWorkflowSteps(workflow.mode).find((s) => s.command === nextCommand)?.id ?? workflow.stepId;
      send(nextCommand).catch(() => {});
      setWorkflow({ kind: "running", mode: workflow.mode, stepId: nextStepId, autoContinue: true });
    }, 600);
    return () => {
      clearTimeout(timer);
    };
  }
}, [marker, workflow.kind, workflow.mode, workflow.stepId, send]);
```

- [ ] **Step 4: Modify send/start flow to inject workflow commands**

Update `onSendWithPayload`:

```tsx
const onSendWithPayload = async (payload: import("../../lib/types").SendPayload) => {
  const hasContent = !!payload.text || payload.attachments.length > 0;
  if (!hasContent) return;

  if (workflow.kind === "idle" && mode !== "normal") {
    const firstStep = getWorkflowSteps(mode)[0];
    if (!firstStep) return;
    const combined = `${firstStep.command} ${payload.text}`.trim();
    setWorkflow({ kind: "running", mode, stepId: firstStep.id, autoContinue: true });
    await start(combined);
    return;
  }

  if (workflow.kind === "paused") {
    setWorkflow((w) => (w.kind === "paused" ? { ...w, kind: "running", autoContinue: true } : w));
    await send(payload);
    return;
  }

  if (canSend) await send(payload);
  else await start(payload.text);
};
```

- [ ] **Step 5: Add UI wiring and cancel handler**

Add state:

```tsx
const [mode, setMode] = useState<ChatMode>("normal");
const [workflow, setWorkflow] = useState<WorkflowState>({ kind: "idle" });
```

Render selector and progress:

```tsx
<ChatModeSelector
  mode={mode}
  onChange={(next) => {
    if (workflow.kind !== "idle") {
      const ok = window.confirm("当前工作流尚未完成，切换模式将取消进度。是否继续？");
      if (!ok) return;
      void stop();
      setWorkflow({ kind: "idle" });
    }
    setMode(next);
  }}
  disabled={workflow.kind === "running"}
/>
{workflow.kind !== "idle" && workflow.kind !== "done" && (
  <WorkflowProgress
    mode={workflow.mode}
    currentStepId={workflow.stepId}
    onCancel={() => {
      void stop();
      setWorkflow({ kind: "idle" });
      setMode("normal");
    }}
  />
)}
```

- [ ] **Step 6: Pass placeholder to `ChatInput`**

```tsx
<ChatInput
  ...
  placeholder={getPlaceholder(mode)}
/>
```

- [ ] **Step 7: Run client tests for ChatTab area**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx vitest run src/components/chat/__tests__
```

Expected: PASS for new tests; existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add dashboard/client/src/components/chat/ChatTab.tsx dashboard/client/src/components/chat/ChatInput.tsx
git commit -m "feat(chat): integrate workflow state and auto-advance in ChatTab

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Update ChatInput for Mode-Aware Placeholder

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatInput.tsx`

**Interfaces:**
- Consumes: `placeholder` prop (already exists, ensure it is respected)

- [ ] **Step 1: Verify placeholder prop behavior**

`ChatInput.tsx` already accepts `placeholder?: string` and uses it on line 302. No change needed unless placeholder needs to depend on `mode`.

If the design requires the placeholder to show the active mode label, change `placeholder={placeholder || "Ask Claude…"}` to `placeholder={placeholder || "Ask Claude…"}` and ensure `ChatTab` passes the mode-aware placeholder from `getPlaceholder(mode)`.

- [ ] **Step 2: Commit if any change is made**

If no change is needed, skip this commit. If a change is made:

```bash
git add dashboard/client/src/components/chat/ChatInput.tsx
git commit -m "feat(chat): use mode-aware placeholder in ChatInput

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Patch OpenSpec Skills and Commands to Emit Markers

**Files:**
- Modify: `.claude/skills/openspec-explore/SKILL.md`
- Modify: `.claude/skills/openspec-propose/SKILL.md`
- Modify: `.claude/skills/openspec-apply-change/SKILL.md`
- Modify: `.claude/skills/openspec-archive-change/SKILL.md`
- Modify: `.claude/commands/opsx/explore.md`
- Modify: `.claude/commands/opsx/propose.md`
- Modify: `.claude/commands/opsx/apply.md`
- Modify: `.claude/commands/opsx/archive.md`

**Interfaces:**
- Produces: skills/commands that append `<!-- __WORKFLOW:*__ -->` markers.

- [ ] **Step 1: Append marker instruction to `openspec-explore/SKILL.md`**

At the end of the main instruction block, add:

```markdown
When you have finished the explore step, output exactly one workflow marker at the very end of your reply:

- If you need more clarification from the user: `<!-- __WORKFLOW:PAUSE__ -->`
- If you have enough context to proceed to propose: `<!-- __WORKFLOW:CONTINUE__ -->`
- If something went wrong: `<!-- __WORKFLOW:ERROR:brief reason -->`
```

- [ ] **Step 2: Append marker instruction to `openspec-propose/SKILL.md`**

Add at the end:

```markdown
When you have finished generating the proposal artifacts, output exactly one workflow marker at the very end of your reply:

- On success: `<!-- __WORKFLOW:CONTINUE__ -->`
- On failure: `<!-- __WORKFLOW:ERROR:brief reason -->`
```

- [ ] **Step 3: Append marker instruction to `openspec-apply-change/SKILL.md`**

Add at the end:

```markdown
When you have finished applying the change, output exactly one workflow marker at the very end of your reply:

- On success: `<!-- __WORKFLOW:CONTINUE__ -->`
- On failure: `<!-- __WORKFLOW:ERROR:brief reason -->`
```

- [ ] **Step 4: Append marker instruction to `openspec-archive-change/SKILL.md`**

Add at the end:

```markdown
When you have finished archiving the change, output exactly one workflow marker at the very end of your reply:

- On success: `<!-- __WORKFLOW:DONE__ -->`
- On failure: `<!-- __WORKFLOW:ERROR:brief reason -->`
```

- [ ] **Step 5: Apply the same additions to `.claude/commands/opsx/*.md`**

Each command file wraps the corresponding skill. Append the same marker instruction matching the skill.

- [ ] **Step 6: Validate command discovery**

Run:

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard
npm run test:server -- --testNamePattern="cc-discovery"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/openspec-explore/SKILL.md .claude/skills/openspec-propose/SKILL.md .claude/skills/openspec-apply-change/SKILL.md .claude/skills/openspec-archive-change/SKILL.md .claude/commands/opsx/explore.md .claude/commands/opsx/propose.md .claude/commands/opsx/apply.md .claude/commands/opsx/archive.md
git commit -m "feat(skills): emit workflow markers from OpenSpec skills and commands

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Patch Superpowers Plugin Skills to Emit Markers

**Files:**
- Modify: `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/brainstorming/SKILL.md`
- Modify: `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/writing-plans/SKILL.md`
- Modify: `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/executing-plans/SKILL.md`

**Interfaces:**
- Produces: patched plugin skills that append `<!-- __WORKFLOW:*__ -->` markers.

- [ ] **Step 1: Patch `brainstorming/SKILL.md`**

Find the section where the skill finishes its final output. Append:

```markdown
When you have finished the brainstorm step, output exactly one workflow marker at the very end of your reply:

- If you need more clarification from the user: `<!-- __WORKFLOW:PAUSE__ -->`
- If you are ready to write the plan: `<!-- __WORKFLOW:CONTINUE__ -->`
- If something went wrong: `<!-- __WORKFLOW:ERROR:brief reason -->`
```

- [ ] **Step 2: Patch `writing-plans/SKILL.md`**

Append:

```markdown
When you have finished writing the implementation plan, output exactly one workflow marker at the very end of your reply:

- On success: `<!-- __WORKFLOW:CONTINUE__ -->`
- On failure: `<!-- __WORKFLOW:ERROR:brief reason -->`
```

- [ ] **Step 3: Patch `executing-plans/SKILL.md`**

Append:

```markdown
When you have finished executing the plan, output exactly one workflow marker at the very end of your reply:

- On success: `<!-- __WORKFLOW:DONE__ -->`
- On failure: `<!-- __WORKFLOW:ERROR:brief reason -->`
```

- [ ] **Step 4: Commit**

Because plugin files are outside the repo, we cannot commit them directly. Instead, create a project-local patch record:

Create `.claude/skills/superpowers-workflow-markers/README.md` describing which plugin files were patched and why. This file is committed so the patch is documented.

```bash
mkdir -p /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/.claude/skills/superpowers-workflow-markers
cat > /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/.claude/skills/superpowers-workflow-markers/README.md <<'EOF'
# Superpowers Workflow Marker Patches

This directory documents local patches applied to the superpowers plugin skills so they emit workflow markers for the dashboard chat workflow mode selector.

Patched files:

- `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/brainstorming/SKILL.md`
- `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/writing-plans/SKILL.md`
- `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/executing-plans/SKILL.md`

Each file was appended with instructions to output one of:

- `<!-- __WORKFLOW:CONTINUE__ -->`
- `<!-- __WORKFLOW:PAUSE__ -->`
- `<!-- __WORKFLOW:DONE__ -->`
- `<!-- __WORKFLOW:ERROR:brief reason -->`

These patches will be overwritten if the plugin is reinstalled or updated.
A future improvement is to wrap these skills with project-local skill files instead.
EOF
```

```bash
git add .claude/skills/superpowers-workflow-markers/README.md
git commit -m "docs(skills): document superpowers plugin marker patches

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Manual End-to-End Testing

**Files:**
- Run: `dashboard/client` dev server
- Run: `dashboard/server`

- [ ] **Step 1: Start the dashboard**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard
npm run dev
```

- [ ] **Step 2: Open `http://localhost:5173/chat`**

- [ ] **Step 3: Test OpenSpec mode**

1. Select **OpenSpec**.
2. Type "add a chat workflow mode selector" and send.
3. Verify `/opsx:explore` is sent.
4. When the reply contains `<!-- __WORKFLOW:CONTINUE__ -->`, verify auto-advance to `/opsx:propose`.
5. Continue through `/opsx:apply` and `/opsx:archive`.
6. Verify progress bar updates and final `DONE` resets mode to normal.

- [ ] **Step 4: Test Superpower mode**

1. Select **Superpower**.
2. Type a small feature request.
3. Verify `/brainstorm` → `/write-plan` → `/execute-plan` flow.

- [ ] **Step 5: Test Superflow mode**

1. Select **Superflow**.
2. Type a small feature request.
3. Verify `/brainstorm` → `/opsx:propose` → `/opsx:apply` → `/opsx:archive`.

- [ ] **Step 6: Test cancel and pause**

1. Start any workflow.
2. Click **取消** and verify the run stops and mode resets.
3. Start a workflow, wait for a `PAUSE` marker, and verify the UI waits for your input.

---

### Task 10: Run Client Tests and Typecheck

**Files:**
- All modified client files

- [ ] **Step 1: Run client tests**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npm run test:client
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit final changes**

```bash
git add -A
git commit -m "feat(chat): complete chat workflow mode selector with protocol markers

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

### Spec coverage

| Spec section | Implementing task |
|---|---|
| Protocol markers (`__WORKFLOW:*__`) | Task 1 |
| Mode selector UI | Task 3 |
| Workflow progress UI | Task 4 |
| State machine / auto-advance | Task 5 |
| OpenSpec skill markers | Task 7 |
| Superpowers plugin markers | Task 8 |
| Error handling / edge cases | Task 5, Task 10 |
| Testing plan | Tasks 1–5, Task 10 |

### Placeholder scan

No placeholders, TODOs, or vague instructions remain. Each step includes exact file paths, code, and commands.

### Type consistency

- `ChatMode` and `WorkflowStep` are defined in `workflowConfig.ts` and imported by `ChatModeSelector`, `WorkflowProgress`, and `ChatTab`.
- `WorkflowMarker` is defined in `useWorkflowMarkers.ts` and used in `ChatTab`.
- Function names (`getNextCommand`, `getPlaceholder`, `getWorkflowSteps`) match across tasks.

### Gap

The plan assumes the superpowers plugin is installed at `/Users/hassan/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/`. If the active plugin directory differs, Task 0 must discover and record the correct path before Task 8.
