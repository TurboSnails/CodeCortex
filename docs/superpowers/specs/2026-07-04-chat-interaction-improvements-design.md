# Chat Interaction Improvements Design

**Date:** 2026-07-04
**Topic:** Reduce chrome density, make workflow modes discoverable, add safe confirmation UX, and fix a dead-state architecture bug on `/chat`.
**Approach:** One shared run-state source of truth as the foundation, plus four independent, additive interaction improvements built on top of it.

---

## 1. Goal

`/chat` (`dashboard/client/src/pages/Chat.tsx` + `components/chat/`) has grown into a full IDE-style workspace (Activity Bar, resizable Explorer/Git/Tool-Details/Bottom panels, a four-mode automated workflow selector) around what is fundamentally a chat surface. This design addresses five concrete, related problems surfaced during interactive exploration of the page:

1. Every panel defaults to visible regardless of whether the user is purely chatting or actively driving code — there's no way to collapse everything down to "just the conversation" for a session.
2. The OpenSpec/Superpower/Superflow modes silently auto-run multi-step slash-command chains with no way to see what a mode will do before picking it.
3. "New Session" resets everything with no confirmation, and the one native-dialog confirmation that does exist (mode switching) uses a hardcoded, non-localized `window.confirm`.
4. The Git panel is fully duplicated between the left sidebar and the right panel.
5. (Discovered during design) `Chat.tsx` and `ChatTab.tsx` each instantiate their own independent `useRunChat(...)`, so the page-level copy (`Chat.tsx`'s) never actually receives live run data — this silently breaks the status-bar TokenMeter, the BottomPanel, the "auto-expand on Bash output" effect, and blocks a correct "is a run active" check for problem 3.

## Non-Goals

- No redesign of the message-bubble rendering, markdown/tool-call rendering, or attachments/voice-input UX (`ChatMessageList.tsx`, `ToolCallBlock`, `useAttachments.ts`, `useVoiceInput.ts` are untouched).
- No changes to the workflow auto-advance *logic* itself (`useWorkflowMarkers.ts`, `workflowConfig.ts` step chains) — only how those chains are surfaced to the user before they're picked.
- No mobile/touch-specific fallback for the new hover preview (the existing `Tip` component is desktop-hover-only already, elsewhere in the app; not a regression).
- No change to server-side run/session semantics (`run-spawner.js`, `routes/run.js`).

---

## 2. Shared Run-State Architecture Fix (foundation)

### Problem

`Chat.tsx`'s `ChatWorkspace` component calls `useRunChat({ sessionId, cwd, initialModel })` for its own purposes (feeding `ChatStatusBar`, `BottomPanel`, and a file-highlighting effect). `ChatTab.tsx` *separately* calls `useRunChat({ sessionId, cwd })` internally, and it is that second instance whose `start()`/`send()` actually get invoked (via `ChatInput`). `useRunChat`'s internal event-bus subscription filters incoming `run_stream`/`run_status`/`run_input_ack` messages by `handle && p.id === handle.id` (`useRunChat.ts:328,344,362`); since `Chat.tsx`'s own `handle` is never set (its `start()` is never called), its copy of `envelopes`/`isLive` stays permanently empty/`false`.

Confirmed side effects of this:
- `ChatStatusBar`'s `TokenMeter` never reflects real usage.
- `BottomPanel` never shows Bash output.
- The "auto-expand bottom panel when Bash runs" effect (`Chat.tsx:179-191`) can never fire.
- Also confirmed in passing: `UseRunChatOptions.sessionId` is accepted by the hook's type but never read anywhere in the hook body — it's a dead parameter.

### Fix

- Move the single `useRunChat(...)` call up into `ChatWorkspace` (`Chat.tsx`). This becomes the one source of truth for run state on the page.
- Add a `reset()` action to `UseRunChatReturn`, clearing `handle`, `envelopes`, `followUp`, `busy`, `error`, and `activePermissionRequest` back to their initial values.
- Change `ChatTab`'s props from `{ sessionId, cwd, className }` to `{ runChat: UseRunChatReturn, cwd, className }`. `ChatTab` no longer calls `useRunChat` itself — it consumes the object passed down. Drop the now-unused `sessionId` prop from `ChatTab` entirely (and the dead `sessionId` field from `UseRunChatOptions`).
- `Chat.tsx`'s "New Session" handler calls `runChat.reset()` in addition to generating a new `sessionId`. `sessionId` is kept purely to key `<ChatTab key={sessionId}>`, so `ChatTab`'s own local UI state (selected mode, workflow progress, cached slash commands) still resets via remount, while run state resets explicitly via `reset()`.

### Data flow after the fix

```
Chat.tsx (ChatWorkspace)
  └─ const runChat = useRunChat({ cwd, initialModel })   <- single instance
       │
       ├─ ChatStatusBar   (envelopes, model, sessionId)  <- now real data
       ├─ BottomPanel     (envelopes)                     <- now real data
       ├─ file-highlight effect (envelopes)                <- now fires correctly
       ├─ New Session handler: runChat.reset() + new sessionId
       │
       └─ <ChatTab key={sessionId} runChat={runChat} cwd={cwd} />
              └─ consumes runChat.{handle, displayEnvelopes, busy, error,
                            followUp, setFollowUp, start, send, stop,
                            activePermissionRequest, respondToPermission,
                            isLive, isResponding}
```

### Test impact

`ChatTab.test.tsx` and `ChatTab.workflow.test.tsx` currently mock `api`/`eventBus` and rely on `ChatTab`'s internal `useRunChat` call. They need to switch to constructing a `runChat` object (either via `renderHook(() => useRunChat(...))` in the same mocked-api harness, or a hand-built object matching `UseRunChatReturn`) and passing it in as a prop. `Chat.tsx`-level tests (if any cover the status bar/bottom panel) should gain coverage asserting they now receive live envelope data.

---

## 3. Focus Mode

### Problem

Both "pure chat" and "deep code-review" usage are common, but there's no fast way to collapse the surrounding chrome for the former without losing your panel layout for the latter.

### Design

- `ChatWorkspaceContext` gains `focusMode: boolean` and a `preFocusSnapshot: { left: boolean; right: boolean; bottom: boolean } | null`.
- A `toggleFocusMode()` action:
  - **Entering** focus: snapshot current `leftSidebar.visible`, `rightPanel.visible`, `bottomPanel.visible` into `preFocusSnapshot`, then hide all three (and hide the `ActivityBar` itself, so the chat area goes full-width — a "Zen mode" rather than a partial collapse).
  - **Exiting** focus: restore the three visibility flags from `preFocusSnapshot` exactly (not just "show defaults"), then clear the snapshot.
- UI: a header button next to "New Session" / "History" in `Chat.tsx` (icon-only or icon+label, e.g. `Maximize2`/`Minimize2` from `lucide-react`), plus a `Cmd+Shift+F` shortcut wired through `useChatShortcuts.ts` (does not collide with existing bindings: `Cmd+B`, `Cmd+Shift+E`, `Cmd+Shift+G`→now Git-panel-right per §5, `Cmd+J`, `Cmd+Shift+M`, `Esc`).
- While in Focus mode, the only way back is the same button/shortcut — no partial re-opening of individual panels, to avoid ending up in a confusing half-focused state.

---

## 4. Workflow-Mode Hover Preview

### Problem

The four mode pills (普通/OpenSpec/Superpower/Superflow) give no indication of what picking a mode actually does until you've already picked it and started sending messages.

### Design

- Reuse the existing `Tip` component (`components/Tip.tsx`) — a hover tooltip already used elsewhere in the app, handles portal rendering and edge-avoidance, takes a plain `raw` string.
- In `ChatModeSelector.tsx`, wrap each non-`normal` mode pill in `<Tip raw={previewFor(mode)}>`.
- `previewFor(mode)` derives its text from `getWorkflowSteps(mode)` (`workflowConfig.ts`), e.g. for OpenSpec: `"自动执行：explore → propose → apply → archive（每步完成后自动推进到下一步）"`.
- The `normal` pill passes no `raw`, so `Tip` transparently renders just the children (existing no-op behavior) — no special-casing needed.

---

## 5. Unified Confirm Dialog, New-Session Guard, and i18n Cleanup

### Problem

- "New Session" resets everything unconditionally, with no confirmation even mid-run or with unsent draft text.
- The one confirmation that exists today (switching workflow mode mid-workflow) uses a raw `window.confirm(...)` with a hardcoded Chinese string explicitly marked `TODO(i18n)` in the source (`ChatTab.tsx:376`).
- A couple of workflow status strings are similarly hardcoded Chinese with the same `TODO(i18n)` marker (the "paused" banner and the "pendingAutoAdvance" banner in `ChatTab.tsx`).

### Design

- New shared `ConfirmDialog` component (themed modal, not native `confirm()`): props for `title`, `message`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`, and an optional `destructive` flag for red-accented confirm styling.
- Replace `ChatTab.tsx`'s `window.confirm(...)` mode-switch guard with `ConfirmDialog`, gated by a local `pendingModeSwitch: ChatMode | null` state.
- `Chat.tsx`'s "New Session" button: because of the §2 fix, `runChat.isLive` and `runChat.followUp` are now real. Guard logic: if `runChat.isLive` is true (an active run) or `runChat.followUp.trim()` is non-empty (unsent draft), show `ConfirmDialog` before resetting; otherwise reset immediately with no interruption.
- i18n cleanup bundled into the same touch: add proper `zh`/`en` keys for the mode-switch confirmation text and the two hardcoded workflow banners, replacing the `TODO(i18n)` markers.

---

## 6. Git Panel Consolidation

### Problem

The left-sidebar "Source Control" view and the right-panel "Git" tab render the exact same `<GitPanel>` with identical props — full duplication, two entry points to the same thing.

### Design

- Keep Git only in the right panel (already positioned as the "context/detail" area alongside Tool Details and File Preview).
- Remove the Git item from `ActivityBar.tsx` — left sidebar keeps only Explorer and Settings.
- Repoint the existing `Cmd+Shift+G` shortcut (`useChatShortcuts.ts`) from `setLeftView("git")` to `setRightTab("git")`.

---

## 7. Testing

- §2 (architecture fix): highest-risk section; needs rewritten `ChatTab.test.tsx`/`ChatTab.workflow.test.tsx` fixtures plus new coverage asserting `Chat.tsx`-level components (`ChatStatusBar`, `BottomPanel`) receive live envelope data and that `reset()` clears state on New Session.
- §3 (Focus mode): new tests for `toggleFocusMode()` snapshot/restore correctness (including "focus with only some panels open" and "toggle off with no prior snapshot").
- §4 (hover preview): a render test per non-normal mode asserting `Tip`'s `raw` prop content is derived correctly from `getWorkflowSteps`.
- §5 (confirm dialog + i18n): tests for both guard conditions (`isLive`, non-empty `followUp`) independently and combined; i18n key presence in both locale files.
- §6 (Git consolidation): update existing `ActivityBar`/shortcut tests to reflect the removed item and repointed shortcut.
- Full `npm run test:client` pass, plus a screenshot-snapshot review (`screens.snapshot.test.tsx`) since panel layout changes are visible.

## Risks / Trade-offs

- [§2 changes data flow for every consumer of run state on the page] → Mitigated by keeping the change purely structural (same hook, same return shape, just called one level up) and by the explicit `reset()` replacing implicit remount-based reset for run state specifically.
- [§3 Focus mode hiding the ActivityBar entirely, rather than a partial collapse] → Deliberate: avoids a confusing state where some panels are "still visible" mid-focus; single button/shortcut is the only in/out.
- [§5 New-Session guard depends on §2 being correct] → Sequencing dependency, not a risk in itself, but §5's guard is meaningless without §2 landing first (tasks.md should order them accordingly).

## Open Questions

None outstanding — all five sections were walked through and confirmed during brainstorming.
