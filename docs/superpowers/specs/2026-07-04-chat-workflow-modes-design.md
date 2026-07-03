# Chat Workflow Mode Selector Design

**Date:** 2026-07-04  
**Topic:** Add workflow-mode selection buttons to `/chat` for OpenSpec, Superpower, and spec-superflow flows.  
**Approach:** Protocol-driven workflow automation with explicit `__WORKFLOW:*__` markers emitted by skills.

---

## 1. Goal

Add a mode selector above the chat input on `http://localhost:5173/chat` that lets the user pick one of four modes:

1. **普通模式** (normal): default conversational chat.
2. **OpenSpec 模式**: run `/opsx:explore` → `/opsx:propose` → `/opsx:apply` → `/opsx:archive`.
3. **Superpower 模式**: run `/brainstorm` → `/write-plan` → `/execute-plan`.
4. **Superflow 模式**: run the combined `brainstorm` → `propose` → `apply` → `archive` pipeline.

The selector must guide the user through the chosen workflow, show progress, and automatically advance to the next step when a skill signals it is safe to continue.

---

## 2. Protocol Design

Skills communicate their intent to the dashboard by emitting a machine-readable marker at the end of their assistant reply. The marker is an HTML comment so it does not pollute the rendered output.

```text
<!-- __WORKFLOW:CONTINUE__ -->
<!-- __WORKFLOW:PAUSE__ -->
<!-- __WORKFLOW:DONE__ -->
<!-- __WORKFLOW:ERROR:message__ -->
```

| Marker | Meaning | Frontend action |
|---|---|---|
| `CONTINUE` | Current step finished; safe to auto-advance. | Send the next step's command. |
| `PAUSE` | Current step needs user input. | Stop auto-advance; wait for user message. |
| `DONE` | Entire workflow finished. | Show completion, reset mode to `normal`. |
| `ERROR:message` | Step failed. | Show error, stop workflow, offer retry/cancel. |

Rules:
- The frontend scans every incoming `assistant` text block for markers.
- Markers are stripped before rendering.
- If multiple markers appear, the last one wins.
- If a complete assistant reply contains no marker, default to `PAUSE`.

---

## 3. Workflow Definitions

### 3.1 OpenSpec Mode

| # | Step | Command prefix | Expected marker |
|---|---|---|---|
| 1 | explore | `/opsx:explore` | `PAUSE` if more clarification is needed, otherwise `CONTINUE` |
| 2 | propose | `/opsx:propose` | `CONTINUE` |
| 3 | apply | `/opsx:apply` | `CONTINUE` |
| 4 | archive | `/opsx:archive` | `DONE` or `ERROR` |

### 3.2 Superpower Mode

| # | Step | Command prefix | Expected marker |
|---|---|---|---|
| 1 | brainstorm | `/brainstorm` | `PAUSE` or `CONTINUE` |
| 2 | write-plan | `/write-plan` | `CONTINUE` |
| 3 | execute-plan | `/execute-plan` | `DONE` or `ERROR` |

### 3.3 Superflow Mode

| # | Step | Command prefix | Expected marker |
|---|---|---|---|
| 1 | brainstorm | `/brainstorm` | `PAUSE` or `CONTINUE` |
| 2 | propose | `/opsx:propose` | `CONTINUE` |
| 3 | apply | `/opsx:apply` | `CONTINUE` |
| 4 | archive | `/opsx:archive` | `DONE` or `ERROR` |

---

## 4. UI Components

### 4.1 `ChatModeSelector`
- Location: directly above `ChatInput`, inside `ChatTab`.
- Four pill buttons: 普通 / OpenSpec / Superpower / Superflow.
- Active mode is highlighted; inactive modes are muted.
- While a workflow is running, switching modes is disabled.

### 4.2 `WorkflowProgress`
- Location: to the right of the mode selector or directly above the input.
- Shows the current step and the full step sequence.
- Completed steps get a checkmark, current step is highlighted, future steps are dimmed.
- Includes a "取消工作流" button.

### 4.3 `WorkflowStepHint`
- Shown above the input when the workflow is paused or about to auto-continue.
- Examples:
  - "当前步骤已完成，下一步将自动执行 /opsx:propose。"
  - "当前步骤需要你的输入，请继续描述需求或回答问题。"

### 4.4 `ChatInput` Placeholder
- Normal: "Ask Claude…"
- OpenSpec: "描述你想探索/变更的需求，我将按 OpenSpec 流程推进"
- Superpower: "描述你想实现的功能，我将按 brainstorm → plan → execute 推进"
- Superflow: "描述你想端到端交付的变更"

---

## 5. State Machine

Add a `workflow` state to `ChatTab`:

```ts
type ChatMode = "normal" | "openspec" | "superpower" | "superflow";

type WorkflowState =
  | { kind: "idle" }
  | { kind: "running"; mode: ChatMode; step: string; autoContinue: boolean }
  | { kind: "paused"; mode: ChatMode; step: string; reason: string }
  | { kind: "error"; mode: ChatMode; step: string; message: string }
  | { kind: "done"; mode: ChatMode };
```

State transitions:
- `idle` → `running` when the user selects a non-normal mode and sends the first message.
- `running` → `paused` when a `PAUSE` marker is received.
- `running` → `running` (next step) when a `CONTINUE` marker is received.
- `running` → `done` when a `DONE` marker is received.
- `running` | `paused` → `error` when an `ERROR` marker or run error is received.
- any → `idle` when the user cancels the workflow or the workflow finishes.

---

## 6. Data Flow

1. The user selects a mode and types the initial request.
2. `ChatTab` combines the request with the first step's slash command:
   ```text
   /opsx:explore build a user auth module
   ```
3. `useRunChat.start(combinedPrompt)` spawns the `claude` process.
4. The dashboard streams `assistant` envelopes over the WebSocket.
5. A new hook `useWorkflowMarkers(envelopes)` extracts markers and returns the latest instruction.
6. `ChatTab` reacts to the instruction:
   - `CONTINUE`: look up the next command, wait ~500 ms for UX, then call `send(nextCommand)`.
   - `PAUSE`: show the pause hint and wait for user input.
   - `DONE`: show success, reset mode to `normal`.
   - `ERROR`: show error, offer retry/cancel.
7. When the user sends a message while paused, the message is forwarded as a normal follow-up (no slash prefix).

---

## 7. Skill / Command File Changes

### 7.1 Project-local skills and commands

Append the appropriate marker to the output of:

- `.claude/skills/openspec-explore/SKILL.md`
- `.claude/skills/openspec-propose/SKILL.md`
- `.claude/skills/openspec-apply-change/SKILL.md`
- `.claude/skills/openspec-archive-change/SKILL.md`
- `.claude/commands/opsx/explore.md`
- `.claude/commands/opsx/propose.md`
- `.claude/commands/opsx/apply.md`
- `.claude/commands/opsx/archive.md`

Example addition at the end of a skill instruction:

```markdown
When you have finished this step, output exactly one of:

<!-- __WORKFLOW:CONTINUE__ -->
<!-- __WORKFLOW:PAUSE__ -->
<!-- __WORKFLOW:DONE__ -->
<!-- __WORKFLOW:ERROR:brief reason__ -->
```

### 7.2 External superpowers plugin skills

The superpowers skills are installed as Claude plugins, for example under:

```text
/Users/hassan/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/
```

Files to patch:

- `brainstorming/SKILL.md`
- `writing-plans/SKILL.md`
- `executing-plans/SKILL.md`

Because plugin files are outside the repo and may be overwritten on plugin update, the first implementation will patch the local copies directly. A future improvement can wrap these skills with project-local `.claude/skills/` files to avoid modifying the plugin.

### 7.3 Environment readiness

Before implementation, verify the following are installed:

- `openspec` CLI (used by `/opsx:*` commands).
- `superpowers` marketplace plugin (used by `/brainstorm`, `/write-plan`, `/execute-plan`).

If either is missing, install it before proceeding to implementation.

---

## 8. Error Handling and Edge Cases

| Scenario | Behavior |
|---|---|
| No marker in reply | Default to `PAUSE`; show a soft notice. |
| Multiple markers | Last marker wins. |
| Run exits with error | `workflow.kind = "error"`; show `stderrTail`; offer retry/cancel. |
| User refreshes page | Workflow state is lost (MVP); future work can persist to `sessionStorage`. |
| Mode switch while running | Block with a confirmation dialog. |
| Permission request during workflow | Pause auto-advance; resume after user approves/rejects. |
| Empty user input | Do not start workflow; show inline validation. |
| Retry current step | Re-run the same combined prompt with `useRunChat.start()`. |
| Skip current step | Allowed only for non-terminal steps; `archive` cannot be skipped. |

---

## 9. Testing Plan

### 9.1 Unit tests

- `ChatModeSelector` renders all four modes and calls `onChange`.
- `WorkflowProgress` highlights the active step.
- `extractWorkflowMarkers(text)` returns the latest marker and the cleaned text.
- Workflow reducer handles all state transitions correctly.

### 9.2 Integration tests

- Selecting OpenSpec and sending a message produces `/opsx:explore ...`.
- Receiving `<!-- __WORKFLOW:CONTINUE__ -->` sends `/opsx:propose ...`.
- Receiving `<!-- __WORKFLOW:ERROR:x -->` stops the workflow and shows the error.

### 9.3 Manual end-to-end tests

Run the full flows in the local dashboard (`npm run dev`):

1. OpenSpec: explore → propose → apply → archive.
2. Superpower: brainstorm → write-plan → execute-plan.
3. Superflow: brainstorm → propose → apply → archive.

Verify:
- Progress bar updates at each step.
- Auto-advance works on `CONTINUE`.
- Pause works on `PAUSE`.
- Cancel resets the workflow.
- Permission requests pause the workflow.

### 9.4 Recovery tests

- Simulate missing marker → verify default `PAUSE`.
- Simulate run crash → verify error UI and retry.
- Simulate permission rejection → verify error or pause.
- Simulate network/WebSocket drop → verify error state and retry.

---

## 10. Files to Modify

### Frontend

- `dashboard/client/src/components/chat/ChatTab.tsx`
- `dashboard/client/src/components/chat/ChatInput.tsx`
- `dashboard/client/src/components/chat/useRunChat.ts`
- New: `dashboard/client/src/components/chat/ChatModeSelector.tsx`
- New: `dashboard/client/src/components/chat/WorkflowProgress.tsx`
- New: `dashboard/client/src/components/chat/useWorkflowMarkers.ts`
- New: `dashboard/client/src/components/chat/workflowConfig.ts`

### Skills / Commands

- `.claude/skills/openspec-explore/SKILL.md`
- `.claude/skills/openspec-propose/SKILL.md`
- `.claude/skills/openspec-apply-change/SKILL.md`
- `.claude/skills/openspec-archive-change/SKILL.md`
- `.claude/commands/opsx/explore.md`
- `.claude/commands/opsx/propose.md`
- `.claude/commands/opsx/apply.md`
- `.claude/commands/opsx/archive.md`
- `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/brainstorming/SKILL.md`
- `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/writing-plans/SKILL.md`
- `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/executing-plans/SKILL.md`

### Tests

- New: `dashboard/client/src/components/chat/__tests__/ChatModeSelector.test.tsx`
- New: `dashboard/client/src/components/chat/__tests__/WorkflowProgress.test.tsx`
- New: `dashboard/client/src/components/chat/__tests__/useWorkflowMarkers.test.ts`

---

## 11. Out of Scope (MVP)

- Persisting workflow state across page reloads.
- Allowing users to define custom workflows in settings.
- Branching workflows or conditional steps.
- Editing skill output templates without modifying skill files.

These can be added once the protocol-driven MVP is stable.

---

## 12. Approval

This design was reviewed and approved section-by-section in the brainstorming session on 2026-07-04.
