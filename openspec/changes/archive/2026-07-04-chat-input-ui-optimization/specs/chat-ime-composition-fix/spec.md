## ADDED Requirements

### Requirement: IME composition guard on Enter key

When the user is composing text via an Input Method Editor (IME) — such as Chinese Pinyin input — pressing Enter to confirm a composition candidate SHALL NOT trigger message sending.

#### Scenario: Normal Enter sends message
- **WHEN** the user types in the input field without an active IME composition session and presses Enter (without modifiers)
- **THEN** the message SHALL be sent

#### Scenario: Enter during IME composition does not send
- **WHEN** the user is in the middle of an IME composition session (isComposing is true) and presses Enter
- **THEN** the message SHALL NOT be sent
- **AND** the IME composition session SHALL continue normally

#### Scenario: Enter after IME composition confirm sends
- **WHEN** the user finishes an IME composition session (isComposing becomes false) and presses Enter
- **THEN** the message SHALL be sent
