## Context

`dashboard/client/src/components/chat/ChatInput.tsx` is a shared input component used by `ChatTab` (and transitively `Chat.tsx`). It delegates state to `useRunChat.ts` (`followUp`, `start`, `send`, `isLive`, `busy`) and to `useAttachments.ts` for paste/drop/file handling. All three bugs live in these existing hooks/components; none require new state containers or architectural changes.

## Goals / Non-Goals

**Goals:**
- Input box is empty immediately after any successful send, whether it was the first message of a session or a follow-up.
- Pasting plain text behaves like a normal browser paste; only clipboard payloads containing files are diverted to attachment handling.
- The textarea and send button are disabled for the full duration of an in-flight assistant turn (from send until the turn completes), not just for the brief in-flight API call.

**Non-Goals:**
- No message queueing, interrupt, or "send while streaming" affordance — mid-turn input is simply blocked (per user decision during exploration).
- No changes to slash-command/@-file autocomplete, voice input, or attachment upload flows.
- No changes to the workflow auto-advance system (`ChatTab.tsx`'s `pendingAutoAdvance`), which already disables input via `isAutoAdvancePending`.

## Decisions

1. **Clear `followUp` inside `start()`, mirroring `send()`.** `useRunChat.ts`'s `send()` already calls `setFollowUp("")` on success (`:414`); `start()` never did. Fixing it at the source (the hook) rather than in `ChatTab.tsx` keeps both entry points consistent for any future caller of `useRunChat`.
   - Alternative considered: clear `followUp` in `ChatTab.onSendWithPayload` right after calling `start()`. Rejected because it would clear the field even if `start()` throws (the current `send()` behavior correctly only clears on success), and it duplicates logic the hook already owns.

2. **Guard `preventDefault()` in `useAttachments.onPaste` on presence of files.** Check `clipboardData.files.length > 0` before calling `preventDefault()`. When there are no files, return early and let the browser perform its default paste of text into the focused textarea.
   - Alternative considered: manually read `clipboardData.getData("text")` and insert it via `onChange`, always calling `preventDefault()`. Rejected as unnecessary extra surface (cursor-position math, IME edge cases) when the browser's default paste already does this correctly — we only need to stop overriding it.

3. **Derive a new `isResponding` signal in `useRunChat` and add it to `ChatInput`'s `disabled` condition — not raw `isLive`.** `handle.status` (`spawning`→`running`→`completed`/`error`/`killed`, per `run-spawner.js`) reflects whether the underlying Claude Code subprocess is alive for the whole session; it never toggles per turn. `isLive` (`spawning || running`) is already used today to swap Send→Stop for the entire live session (`ChatInput.tsx:335`), confirming it means "session alive," not "currently generating." Wiring `disabled` to raw `isLive` would permanently disable the textarea after a session's first message.
   Instead, `useRunChat` computes `isResponding`: true while `isLive` and the most recent envelope is the user's own just-sent message, an in-flight `tool_use`, or a still-`_streaming` assistant message; false once a completed (non-streaming) assistant message is the latest envelope. `ChatInput`'s `disabled` gains `isResponding` (not `isLive`).
   - Alternative considered: reuse `isLive` directly. Rejected per above — confirmed via `run-spawner.js`'s status-transition points, which only fire on spawn/error/complete/kill, never between turns.
   - Alternative considered: reuse `useWorkflowMarkers`'s `isComplete`. Rejected — it's hardcoded to always return `true` for `mode === "normal"` (the common case), so it can't distinguish an in-progress reply from an idle one outside workflow modes.
   - Alternative considered: disable at the `textarea` level only, leaving the send button enabled but no-op. Rejected — a clickable-but-inert send button is confusing; disabling both matches existing patterns elsewhere in the component (e.g. during `busy`).

## Risks / Trade-offs

- [Adding `isResponding` to `disabled` also blocks input during the workflow-mode auto-advance window] → Already covered: `isAutoAdvancePending` is already in the same condition, and `isResponding` only adds coverage for the plain-chat streaming window that was previously *not* blocked; no regression for workflow modes.
- [`isResponding`'s envelope-based heuristic could stay stuck `true` if a turn ends in a shape not covered by the three matched cases (user / tool_use / streaming-assistant)] → Mitigated by defaulting to `false` for any other last-envelope type (e.g. a settled non-streaming assistant message, or no envelopes yet), so unknown/settled states fail open (input enabled) rather than fail locked.
- [Users accustomed to typing ahead while Claude replies lose that ability] → Accepted trade-off per explicit product decision (block over queue/interrupt) made during exploration; revisit if it proves too restrictive in practice.
- [Paste fix could regress image-paste if a clipboard event has both text and files] → Mitigated by keying off `files.length > 0` (existing behavior already only extracted image files and ignored any text), so mixed clipboards keep going through the attachment path unchanged.

## Migration Plan

No migration needed — client-only bug fixes, no data model or API changes. Ship behind normal test + manual verification (see tasks.md); no feature flag required given the small, isolated blast radius.

## Open Questions

None outstanding — scope and behavior were confirmed during exploration (see conversation prior to this change).
