## Why

The `/chat` page's input box has three confirmed interaction bugs that make it feel unreliable in daily use: the very first message of every session leaves stale text sitting in the box after sending, plain-text clipboard paste is silently blocked, and users can submit a second message while Claude is still streaming the previous reply with no feedback about what happens to it. None of these are design trade-offs — each traces to a specific missing condition in existing code.

## What Changes

- `useRunChat.ts`'s `start()` (used for every session's first message) now clears `followUp` on success, matching the existing behavior of `send()`.
- `useAttachments.ts`'s `onPaste` only calls `preventDefault()` when the clipboard actually contains files; plain-text paste falls through to the browser's default paste behavior instead of being unconditionally cancelled.
- `ChatInput.tsx` disables the textarea and send button while the assistant's reply is actively streaming (`isLive`), re-enabling once the turn completes. Users can no longer submit input mid-turn; there is no queueing or interleaved-send behavior.

## Capabilities

### New Capabilities
- `chat-input-send-reset`: the chat input is guaranteed to clear after any successful send, including a session's first message.
- `chat-input-paste-passthrough`: pasting plain text into the chat input inserts it normally; only clipboard content containing files is intercepted for attachment handling.
- `chat-input-turn-lock`: the chat input is locked (disabled) for the duration of an in-flight assistant turn and unlocked when the turn ends.

### Modified Capabilities
(none — no existing spec covers chat input behavior; all three are net-new capability specs)

## Impact

- **Files**: `dashboard/client/src/components/chat/useRunChat.ts`, `dashboard/client/src/hooks/chat/useAttachments.ts`, `dashboard/client/src/components/chat/ChatInput.tsx`.
- **Tests**: existing suites in `dashboard/client/src/components/chat/__tests__/useRunChat.test.tsx` and `ChatInput.test.tsx` will need new cases for these three behaviors.
- **No API or schema changes** — purely client-side interaction fixes.
