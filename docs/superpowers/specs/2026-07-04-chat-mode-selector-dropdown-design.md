# Chat Mode Selector Dropdown Design

**Date:** 2026-07-04  
**Topic:** Move the chat mode selector (普通 / OpenSpec / Superpower / SuperFlow) from above the message list into a compact dropdown on the input hint bar.  
**Approach:** Convert `ChatModeSelector` to a dropdown and embed it in `InputHintBar`.

---

## 1. Goal

Relocate the four chat-mode buttons so they sit at the right end of the input hint bar (the row showing "Send · ⏎ · Newline · ⇧⏎ …"), collapsing them into a single dropdown to save space.

---

## 2. Current State

- `ChatModeSelector.tsx` renders four pill buttons in a horizontal row.
- `ChatTab.tsx` renders `<ChatModeSelector />` above `<ChatMessageList />` and `<ChatInput />`.
- `InputHintBar.tsx` renders shortcut hints as a single text row below the input box.

---

## 3. Proposed Changes

### 3.1 `ChatModeSelector.tsx`

Convert from a row of four pill buttons into a dropdown component.

- Keep the existing Props interface (`mode`, `onChange`).
- Display the currently selected mode label on the trigger button.
- Clicking the trigger toggles a dropdown menu listing all four modes.
- Selecting a mode calls `onChange` and closes the dropdown.
- Clicking outside the dropdown closes it.
- Keep the active/inactive color scheme aligned with the existing pill buttons.
- Add appropriate ARIA attributes (`role="combobox"`, `aria-expanded`, `aria-haspopup="listbox"`, options with `role="option"` and `aria-selected`).

### 3.2 `InputHintBar.tsx`

Change from a single text row to a flex row:

- Left side: existing shortcut hints, unchanged.
- Right side: render `<ChatModeSelector mode={...} onChange={...} />`.
- Ensure vertical centering and avoid text wrapping conflicts on narrow screens.

### 3.3 `ChatTab.tsx`

- Remove the existing `<ChatModeSelector />` call that sits above the message list.
- Pass `mode` and `setMode` (with the workflow-running confirmation guard) down to `InputHintBar`.
- Keep the workflow confirmation logic intact: if a workflow is not idle, switching modes must still trigger the confirmation dialog and call `cancelWorkflow()` before changing the mode.

### 3.4 `ChatModeSelector.test.tsx`

Update the existing tests:

- Verify the trigger shows the currently selected mode label.
- Verify clicking the trigger opens the dropdown and lists all four modes.
- Verify selecting a mode calls `onChange` with the correct mode ID.
- Verify the active option is highlighted.
- Verify clicking outside closes the dropdown.

---

## 4. Behavior Preserved

- Workflow mode switching confirmation remains in `ChatTab`.
- Workflow progress, paused/running banners, and error banners stay in their current positions.
- Mode state (`mode`, `setMode`) and workflow state continue to live in `ChatTab`.

---

## 5. Visual Notes

- Trigger button: small, rounded, border, using the active-mode indigo color when focused/hover.
- Dropdown panel: `bg-surface-1`, `border-border`, rounded shadow, same styling language as the slash-command/file autocomplete panels.
- On narrow screens the hint text may wrap; the selector stays pinned to the right.

---

## 6. Files Modified

- `dashboard/client/src/components/chat/ChatModeSelector.tsx`
- `dashboard/client/src/components/chat/input/InputHintBar.tsx`
- `dashboard/client/src/components/chat/ChatTab.tsx`
- `dashboard/client/src/components/chat/__tests__/ChatModeSelector.test.tsx`
