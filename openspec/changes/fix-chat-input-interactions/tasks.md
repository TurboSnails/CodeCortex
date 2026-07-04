## 1. Clear input after send (chat-input-send-reset)

- [x] 1.1 In `dashboard/client/src/components/chat/useRunChat.ts`, call `setFollowUp("")` on success inside `start()`, mirroring the existing behavior in `send()` (`:414`)
- [x] 1.2 Add/extend a test in `useRunChat.test.tsx` asserting `followUp` is cleared after a successful `start()` call, and left untouched if `start()` throws

## 2. Allow plain-text paste (chat-input-paste-passthrough)

- [x] 2.1 In `dashboard/client/src/hooks/chat/useAttachments.ts`, update `onPaste` to only call `e.preventDefault()` and process files when `clipboardData?.files?.length` is greater than 0; otherwise return without intercepting the event
- [x] 2.2 Verify `ChatInput.tsx`'s combined `onPaste` handler (`handleChange` + `attachments.onPaste`) still behaves correctly for text-only paste now that `preventDefault()` is no longer unconditionally called
- [x] 2.3 Add/extend a test covering: text-only paste inserts text (default browser action, not prevented), image-only paste creates an attachment and prevents default, mixed clipboard (image + text) creates an attachment

## 3. Lock input during an active turn (chat-input-turn-lock)

- [x] 3.1 In `dashboard/client/src/components/chat/useRunChat.ts`, add a derived `isResponding` boolean (true while `isLive` and the latest envelope is the user's own just-sent message, an in-flight `tool_use`, or a still-`_streaming` assistant message; false otherwise) and export it from `UseRunChatReturn`
- [x] 3.2 In `ChatTab.tsx`, add `isResponding` to the `disabled` prop passed to `ChatInput` alongside the existing `busy`/`isAutoAdvancePending` checks
- [x] 3.3 Confirm this doesn't regress the existing `isAutoAdvancePending` disabling behavior for workflow modes (OpenSpec/Superpower/Superflow)
- [x] 3.4 Add/extend a test in `useRunChat.test.tsx` asserting `isResponding` is true immediately after `start()`/`send()`, stays true through streaming envelopes, and becomes false once a completed assistant message arrives
- [x] 3.5 Add/extend a test in `ChatInput.test.tsx` (or `ChatTab.test.tsx`) asserting the textarea and send button are disabled while `isResponding` is true and re-enabled once the turn completes

## 4. Verification

- [x] 4.1 Run `npm run test:client` and confirm all suites pass
- [x] 4.2 Manually verify in the browser: send a first message in a brand-new session and confirm the input clears (verified via driven Playwright session against the real dev server + a live Claude Code run)
- [x] 4.3 Manually verify: copy text from elsewhere and paste it into the chat input with Ctrl+V/Cmd+V (verified via driven Playwright session using the real OS clipboard and a trusted Cmd+V key event)
- [x] 4.4 Manually verify: while Claude is streaming a reply, confirm the input box and send button are visibly disabled and re-enable once the reply finishes (verified via driven Playwright session against a live Claude Code run)
