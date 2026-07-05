## ADDED Requirements

### Requirement: Shortcut dropdown button

The chat input bar SHALL display a single icon button on the right side of the input row (between the voice button and the send button). Clicking the button SHALL open a floating modal dialog showing all available keyboard shortcuts.

#### Scenario: Button renders in input bar
- **WHEN** the ChatInput component is mounted
- **THEN** a keyboard shortcut button (icon: `?` or `KeyboardIcon`) SHALL appear in the input row, to the left of the send button

#### Scenario: Dropdown opens on click
- **WHEN** the user clicks the shortcut button
- **THEN** a `<dialog>` element SHALL open displaying a formatted list of shortcuts: Send ⏎, Newline ⇧⏎, Force send ⌘⏎, Commands /, Files @, Recall history ↑↓

#### Scenario: Dropdown closes on outside click or ESC
- **WHEN** the dropdown is open and the user presses ESC or clicks outside the dialog
- **THEN** the dialog SHALL close

#### Scenario: Dropdown is accessible
- **WHEN** the shortcut button is focused
- **THEN** pressing Enter or Space SHALL open the dropdown
- **AND** the dialog SHALL have `role="dialog"` and `aria-label="Keyboard shortcuts"`

---

### Requirement: InputHintBar removal

The inline shortcut hint bar that currently renders below the input textarea SHALL be removed from the layout.

#### Scenario: Hint bar no longer renders
- **WHEN** the ChatInput component is mounted
- **THEN** the `<InputHintBar />` component SHALL NOT be rendered
