## ADDED Requirements

### Requirement: Plain-text paste is not intercepted
The chat input SHALL allow the browser's default paste behavior for clipboard content that contains no files, inserting pasted text at the cursor position like any standard text field.

#### Scenario: Pasting copied text
- **WHEN** a user copies plain text (e.g. via Ctrl+V / Cmd+V) from another application and pastes it into the chat input
- **THEN** the text is inserted into the chat input at the cursor position

#### Scenario: Pasting an image
- **WHEN** a user pastes clipboard content that contains an image file
- **THEN** the image is added as an attachment and the default paste action is suppressed

#### Scenario: Pasting mixed content
- **WHEN** a user pastes clipboard content that contains both an image file and text
- **THEN** the image is added as an attachment (existing behavior for file-bearing clipboard content is unchanged)
