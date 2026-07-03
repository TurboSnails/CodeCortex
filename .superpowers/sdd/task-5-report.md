# Task 5 Report: Integrate Workflow State and Auto-Advance into ChatTab

## Summary

Implemented the central workflow integration in `ChatTab.tsx`. The component now maintains a workflow state machine, renders `ChatModeSelector` and `WorkflowProgress`, injects the first workflow step's command prefix on the initial send, and auto-advances/pauses/finishes based on markers returned by `useWorkflowMarkers`.

## Files Changed

- `dashboard/client/src/components/chat/ChatTab.tsx` — main implementation
- `dashboard/client/src/pages/__tests__/__snapshots__/screens.snapshot.test.tsx.snap` — updated intentional baselines
- `.superpowers/sdd/progress.md` — SDD ledger update (pre-existing local modification)

`ChatInput.tsx` required no changes; it already accepts a `placeholder` prop.

## Implementation Notes

### Resolved discrepancy in the brief

The task brief's Step 2 called `useWorkflowMarkers(displayEnvelopes)` with a single argument, but the actual hook signature is `useWorkflowMarkers(envelopes, mode)` and the important notes explicitly state the hook requires a `mode` parameter. I used the correct signature:

```tsx
const { marker, cleanedEnvelopes } = useWorkflowMarkers(displayEnvelopes, mode);
```

### Omitted unused type import

The brief imported `type WorkflowMarker`, but `noUnusedLocals` is enabled in `tsconfig.json` and the type is never referenced explicitly in the module. I omitted the import to avoid a TypeScript error.

### `autoAdvanceRef`

The brief sets `autoAdvanceRef.current = true` before scheduling the auto-advance timeout but never resets it to `false`. I followed the brief exactly, but note that the ref therefore does not currently provide a cancellation path beyond React's effect cleanup clearing the timeout.

### Attachments on first workflow send

The brief's idle-workflow branch concatenates the step command with `payload.text` and calls `start(combined)`. Because `start()` accepts only a string prompt, any attachments in the first payload are dropped. This matches the brief's exact code.

### Normal-mode behavior preserved

When `mode === "normal"`, `useWorkflowMarkers` returns `marker: null` and `cleanedEnvelopes: displayEnvelopes`, so existing send/render logic is unchanged apart from rendering the `ChatModeSelector` above the message list.

## Test Commands and Results

### Chat-area tests

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx vitest run src/components/chat/__tests__
```

Result: **13 test files passed, 108 tests passed**.

### Full client suite

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npm test
```

First run: 2 snapshot failures in `screens.snapshot.test.tsx` due to intentional UI changes (added `ChatModeSelector` and changed placeholder to "Ask Claude…").

Updated baselines:

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx vitest run src/pages/__tests__/screens.snapshot.test.tsx -u
```

Second run: **42 test files passed, 377 tests passed**.

## Commit

```
019e695 feat(chat): integrate workflow state and auto-advance in ChatTab
```

## Self-Review

- [x] Workflow state machine added (`idle` | `running` | `paused` | `error` | `done`).
- [x] `ChatModeSelector` and `WorkflowProgress` rendered.
- [x] First workflow send injects the first step's command prefix.
- [x] Auto-advance on `CONTINUE`, pause on `PAUSE`, finish on `DONE`, error on `ERROR`.
- [x] `useWorkflowMarkers` called with `mode` parameter.
- [x] `ChatMessageList` uses `cleanedEnvelopes`.
- [x] Normal-mode behavior preserved.
- [x] Paused user follow-up forwarded unchanged (no slash prefix).
- [x] Mode-switch confirmation dialog shown while workflow is running.
- [x] Chat-area and full client tests pass.

## Concerns

1. The brief contains a minor inconsistency around the `useWorkflowMarkers` call signature; I used the actual hook signature with the `mode` argument.
2. `autoAdvanceRef` is never reset to `false`, so its in-timeout guard is effectively a one-way flag. This matches the brief but may need refinement in future tasks.
3. First workflow send drops attachments because `start()` only accepts a string prompt.
4. Two screen snapshots were intentionally updated to reflect the new mode selector and placeholder text.

---

## Review-Fix Follow-Up

Date: 2026-07-04

Addressed reviewer feedback on the Task 5 implementation.

### Changes Made

- **Fixed TypeScript TS2339 in `ChatTab.tsx`**: the effect dependency array previously read `workflow.kind`, `workflow.mode`, and `workflow.stepId`, which failed on the `{ kind: "idle" }` branch. Replaced with `[marker, workflow, send]` so TypeScript no longer needs to narrow across the dependency array.
- **Restored original normal-mode placeholder**: normal mode now uses `canSend ? t("chat.followUpPlaceholder") : t("chat.startPlaceholder")` again; `getPlaceholder(mode)` is only used for non-normal modes.
- **Removed unused `autoAdvanceRef`**: deleted the ref declaration and the dead `if (!autoAdvanceRef.current) return;` guard inside the auto-advance timeout.
- **Added `// TODO(i18n)` comment** above the hardcoded Chinese `window.confirm` dialog.
- **Updated snapshot baselines** for the restored placeholder text.

### Files Changed

- `dashboard/client/src/components/chat/ChatTab.tsx`
- `dashboard/client/src/pages/__tests__/__snapshots__/screens.snapshot.test.tsx.snap`

### Verification

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx tsc --noEmit
```

Result: no errors in `ChatTab.tsx`. Pre-existing TypeScript errors remain in unrelated files:
- `src/components/chat/__tests__/useWorkflowMarkers.test.ts(94,12)`
- `src/components/chat/__tests__/useWorkflowMarkers.test.ts(95,12)`
- `src/components/chat/__tests__/workflowConfig.test.ts(6,3)`
- `src/components/chat/workflowConfig.ts(49,10)`

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard
npm run test:client
```

Result: **42 test files passed, 377 tests passed**.

### Commit

```
7538097 fix(chat): address Task 5 review feedback for ChatTab workflow integration
```

---

## TypeScript Error Fix Follow-Up

Date: 2026-07-04

Fixed the remaining pre-existing TypeScript errors in the new chat workflow files.

### Changes Made

- `dashboard/client/src/components/chat/__tests__/useWorkflowMarkers.test.ts`
  - Added optional chaining to content-block assertions (`blocks?.[0]?.text`, `blocks?.[1]?.text`) to satisfy `noUncheckedIndexedAccess`.

- `dashboard/client/src/components/chat/__tests__/workflowConfig.test.ts`
  - Added a test that verifies `getPlaceholder(mode.id)` returns a string for every `CHAT_MODES` entry, making the previously unused `getPlaceholder` import necessary.

- `dashboard/client/src/components/chat/workflowConfig.ts`
  - Guarded `steps[idx + 1]` in `getNextCommand` with a null check to satisfy `noUncheckedIndexedAccess`.

### Verification

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx tsc --noEmit
```

Result: **0 errors**.

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard
npm run test:client
```

Result: **42 test files passed, 378 tests passed** (+1 from the new placeholder test).

### Commit

```
5f1990a fix(chat): resolve pre-existing TypeScript errors in workflow config files
```

---

## Third Reviewer Feedback Follow-Up

Date: 2026-07-04

Addressed the third round of reviewer feedback focused on marker handling, streaming safety, and state simplification.

### Changes Made

- **`useWorkflowMarkers` now returns `isComplete`**:
  - Added an `isComplete` boolean to the hook's return value.
  - `isComplete` is `true` only when the latest assistant envelope exists and is not streaming (`message._streaming !== true`).
  - In normal mode, `isComplete` is always `true` because markers are not processed.

- **`ChatTab` only acts on markers from complete replies**:
  - The marker effect now returns early unless `isComplete` is `true`.
  - This prevents the effect from toggling workflow state mid-stream or resetting auto-advance timers on typewriter frames.

- **Removed the 600 ms auto-advance timeout**:
  - `CONTINUE` markers now send the next command immediately on a complete reply.
  - This eliminates the race with streaming content and the cancel/stop action.

- **Removed unread `autoContinue` field**:
  - Dropped `autoContinue: boolean` from the `WorkflowState` type and from all `setWorkflow` calls.

- **Documented first-send attachment limitation**:
  - Added a `// TODO` comment above the idle-workflow first-send branch noting that `start()` accepts only a string, so attachments are dropped.

- **Updated `useWorkflowMarkers` tests**:
  - Added tests verifying `isComplete` is `true` for complete assistant envelopes, `false` while streaming, `true` after streaming finishes, and `false` when there are no assistant envelopes.

### Files Changed

- `dashboard/client/src/components/chat/useWorkflowMarkers.ts`
- `dashboard/client/src/components/chat/ChatTab.tsx`
- `dashboard/client/src/components/chat/__tests__/useWorkflowMarkers.test.ts`

### Verification

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx tsc --noEmit
```

Result: **0 errors**.

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard
npm run test:client
```

Result: **43 test files passed, 387 tests passed**.

### Commit

```
5d079ab fix(chat): act on workflow markers only from complete assistant replies
```

---

## Fourth Reviewer Feedback Follow-Up

Date: 2026-07-04

Addressed the fourth round of reviewer feedback focused on duplicate auto-advance sends, workflow state consistency on start failure, and a streaming/typewriter test gap.

### Changes Made

- **Fixed duplicate auto-advance sends**:
  - `useWorkflowMarkers` now returns a stable `latestAssistantKey` (the index of the latest assistant envelope in the input array).
  - `ChatTab` tracks `lastHandledKey` (a `number | null` ref) instead of comparing marker object identity.
  - The marker effect only acts when `lastHandledKey.current !== latestAssistantKey`, so new `marker` objects produced by `useTypewriterEnvelopes` on every animation frame no longer re-trigger `send(nextCommand)` for the same assistant reply.

- **Reset last-handled key on idle**:
  - `lastHandledKey.current` is reset to `null` whenever `workflow.kind === "idle"`, ensuring a subsequent workflow starts with a clean guard.

- **Fixed first-workflow start failure state handling**:
  - Added an effect that watches `useRunChat.error`. When an API call fails while `workflow.kind === "running"`, the workflow is returned to `idle`.
  - This prevents the workflow from remaining in the `running` state if `start(combined)` rejects, without duplicating the error banner already surfaced by `useRunChat`.

- **Updated `useWorkflowMarkers` tests**:
  - Added `latestAssistantKey` assertions to existing tests (normal mode returns `null`, assistant at index 0 returns `0`, latest assistant wins, etc.).
  - Added a dedicated test verifying `latestAssistantKey` equals the index of the latest assistant envelope.

- **Added integration tests in `ChatTab.workflow.test.tsx`**:
  - Added a test that streams a `CONTINUE` marker via `stream_event` envelopes, ends the message, advances fake timers to exercise the typewriter, and asserts `mockSend` is called exactly once.
  - Added a test verifying that a rejected first-workflow `start()` returns the workflow to idle while still surfacing the `useRunChat` error banner.

### Files Changed

- `dashboard/client/src/components/chat/useWorkflowMarkers.ts`
- `dashboard/client/src/components/chat/__tests__/useWorkflowMarkers.test.ts`
- `dashboard/client/src/components/chat/ChatTab.tsx`
- `dashboard/client/src/components/chat/__tests__/ChatTab.workflow.test.tsx`

### Verification

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx tsc --noEmit
```

Result: **0 errors**.

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npm test
```

Result: **43 test files passed, 390 tests passed**.

### Commit

```
decd073 fix(chat): stable workflow auto-advance key, start-failure idle reset, streaming test
```

---

## Second Reviewer Feedback Follow-Up

Date: 2026-07-04

Addressed the second round of reviewer feedback focused on auto-advance stability, error handling, and integration tests.

### Changes Made

- **Fixed auto-advance duplicate handling in `ChatTab.tsx`**:
  - Added a `lastHandledMarker` ref that tracks the most recently acted-on marker.
  - The marker effect now returns early when `lastHandledMarker.current === marker`, preventing the effect from re-firing on the same `CONTINUE` marker after `setWorkflow` creates a new workflow object.
  - This eliminates the possibility of scheduling a second timer and sending the next command prematurely.

- **Improved auto-advance error handling**:
  - Replaced the silent `.catch(() => {})` in the `CONTINUE` branch with a proper transition to `workflow.kind = "error"` carrying the error message.

- **Surfaced workflow errors in the UI**:
  - Added a red error banner for `workflow.kind === "error"` in `ChatTab.tsx`.
  - Hid `WorkflowProgress` when the workflow reaches an error or done state.

- **Added integration tests for ChatTab workflow behavior**:
  - Created `dashboard/client/src/components/chat/__tests__/ChatTab.workflow.test.tsx`.
  - Tests cover:
    - First step command injection when sending in a non-normal mode.
    - `CONTINUE` marker auto-advance to the next step.
    - `PAUSE` marker pausing the workflow and user resuming.
    - `DONE` marker finishing the workflow.
    - `ERROR` marker stopping the workflow and showing the error.
    - Cancel button stopping the workflow.
  - Tests mock `api` and the `eventBus` WebSocket callback, letting the real `useRunChat` hook drive state.

### Files Changed

- `dashboard/client/src/components/chat/ChatTab.tsx`
- `dashboard/client/src/components/chat/__tests__/ChatTab.workflow.test.tsx`

### Verification

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx tsc --noEmit
```

Result: **0 errors**.

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard
npm run test:client
```

Result: **43 test files passed, 384 tests passed**.

### Commit

```
887c05d fix(chat): integrate workflow state and auto-advance with duplicate guard and tests
```

---

## Fifth Reviewer Feedback Follow-Up

Date: 2026-07-04

Addressed the fifth round of reviewer feedback focused on restoring the 600 ms auto-advance delay, cleaning up the pending timeout, and hardening the streaming test.

### Changes Made

- **Restored the 600 ms auto-advance delay in `ChatTab.tsx`**:
  - The `CONTINUE` branch now schedules `send(nextCommand)` and the transition to the next step inside a `setTimeout(..., 600)`.
  - `lastHandledKey.current` is set immediately when acting, so a single `CONTINUE` marker still triggers only one auto-advance even though `displayEnvelopes` changes on every typewriter tick.
  - Added an `autoAdvanceTimeout` ref and a `useEffect` cleanup function that clears the pending timeout, preventing stale sends when the user switches modes or cancels while the delay is pending.

- **Fixed fake-timer leak in the streaming test**:
  - Wrapped the `vi.useFakeTimers()` block in `try/finally { vi.useRealTimers(); }` in `ChatTab.workflow.test.tsx` so an early assertion failure cannot leak fake timers into later tests.

- **Narrowed effect dependencies where possible**:
  - The start-failure error effect (`ChatTab.tsx:109-115`) now depends on `[error, workflow.kind]` instead of `[error, workflow]`.
  - The marker effect still requires the full `workflow` object in its dependency array; narrowing to `workflow.kind`, `workflow.mode`, and `workflow.stepId` reintroduces TS2339 on the `{ kind: "idle" }` branch, so it was left as `workflow` per the brief's guidance not to fight the type checker.
  - `marker` is intentionally omitted from the marker effect dependency array. It is derived from the same envelopes that produce `isComplete` and `latestAssistantKey`, but its object identity changes on every typewriter frame; including it would clear the pending 600 ms timeout before it fires.

- **Updated streaming test timing**:
  - Advanced the fake timers by 700 ms (instead of 500 ms) so the restored 600 ms delay has time to elapse before asserting on `mockSend`.

### Files Changed

- `dashboard/client/src/components/chat/ChatTab.tsx`
- `dashboard/client/src/components/chat/__tests__/ChatTab.workflow.test.tsx`

### Verification

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx tsc --noEmit
```

Result: **0 errors**.

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npm test
```

Result: **43 test files passed, 390 tests passed**.

### Commit

```
312883b fix(chat): restore 600 ms workflow auto-advance delay and clean up timeout
```

---

## Final Whole-Branch Review Fix-Up

Date: 2026-07-04

Addressed the three Important findings from the final whole-branch review of the chat workflow mode selector.

### Changes Made

#### 1. Unconditional marker stripping in `useWorkflowMarkers`

File: `dashboard/client/src/components/chat/useWorkflowMarkers.ts`

- The hook now parses and strips markers from assistant envelopes in every mode, not only workflow modes.
- In `normal` mode it returns `marker: null` and preserves `isComplete: true` / `latestAssistantKey: null`, while still returning `cleanedEnvelopes` with markers removed.
- In workflow modes the marker-driving behavior (`latestAssistantKey`, `isComplete`, default-to-PAUSE) is unchanged.

#### 2. Workflow step hint banner

File: `dashboard/client/src/components/chat/ChatTab.tsx`

- Added a small hint banner between `WorkflowProgress` and `ChatMessageList` (just above the input area).
- When `workflow.kind === "paused"` it shows: `当前步骤需要你的输入，请继续描述需求或回答问题。`
- When the workflow is running and the 600 ms `CONTINUE` auto-advance timer is pending, it shows: `当前步骤已完成，下一步将自动执行 {command}。` using the pending next-step command.
- Added `// TODO(i18n)` comments for the hardcoded Chinese strings.

#### 3. Workflow error state with Retry / Cancel

File: `dashboard/client/src/components/chat/ChatTab.tsx`

- API failures during `start()` or `send()` now transition the workflow to `workflow.kind = "error"` carrying `mode`, `stepId`, and the error message, instead of resetting to `idle`.
- The existing workflow error banner now includes inline **Retry** and **Cancel** buttons.
- **Retry**: transitions back to `running` and re-runs the failed action. First-step failures re-run `start(combined)` using the original user input stored in `lastWorkflowInputRef`; subsequent failures re-run `send(currentStepCommand)`.
- **Cancel**: calls `stop()`, resets the workflow to `idle`, and resets the mode to `normal`.
- `ERROR` markers reuse the same retry/cancel logic.
- Tracked the last workflow action (`start` vs `send`) in `lastWorkflowActionRef` so retry can reconstruct the correct call.
- Added `pendingAutoAdvance` state and cleared it in the effect cleanup so the auto-advance hint is only shown while the 600 ms timer is actually pending.

#### 4. Test updates

- `dashboard/client/src/components/chat/__tests__/useWorkflowMarkers.test.ts`
  - Updated the normal-mode test to assert markers are stripped while `marker`, `isComplete`, and `latestAssistantKey` remain as specified.

- `dashboard/client/src/components/chat/__tests__/ChatTab.workflow.test.tsx`
  - Updated the first-workflow start-failure test to assert the new error state and the presence of Retry/Cancel buttons.

### Files Changed

- `dashboard/client/src/components/chat/useWorkflowMarkers.ts`
- `dashboard/client/src/components/chat/ChatTab.tsx`
- `dashboard/client/src/components/chat/__tests__/useWorkflowMarkers.test.ts`
- `dashboard/client/src/components/chat/__tests__/ChatTab.workflow.test.tsx`

### Verification

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client
npx tsc --noEmit
```

Result: **0 errors**.

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard
npm run test:client
```

Result: **43 test files passed, 390 tests passed**.

### Commit

```
1516151 fix(chat): final review fixes for workflow mode selector
```
