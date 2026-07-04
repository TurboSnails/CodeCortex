## ADDED Requirements

### Requirement: New session button

The Chat page header SHALL include a "New Session" button that, when clicked, clears all current chat messages and resets to a fresh conversation.

#### Scenario: Clicking new session resets conversation
- **WHEN** the user clicks the "New Session" button in the page header
- **THEN** a new `sessionId` SHALL be generated
- **AND** all messages in the ChatMessageList SHALL be cleared
- **AND** the input field SHALL be cleared
- **AND** the conversation state SHALL be fully reset

---

### Requirement: History session dialog

The Chat page header SHALL include a "History" button that opens a floating dialog listing all past sessions. Clicking a session in the list switches the current view to that session.

#### Scenario: History button opens dialog
- **WHEN** the user clicks the "History" button in the page header
- **THEN** a `<dialog>` element SHALL open displaying a list of past sessions from the API (`api.sessions.list`)

#### Scenario: Session list displays correctly
- **WHEN** the history dialog is open
- **THEN** each session item SHALL display the session's `updatedAt` timestamp
- **AND** each session item SHALL display the first user message preview (if available)

#### Scenario: Clicking a session switches to it
- **WHEN** the user clicks on a session item in the history dialog
- **THEN** the dialog SHALL close
- **AND** the current chat view SHALL switch to display the selected session's messages

#### Scenario: History dialog closes without action
- **WHEN** the history dialog is open and the user presses ESC or clicks outside
- **THEN** the dialog SHALL close without changing the current session

---

### Requirement: Header layout

The Chat page header layout SHALL include two action buttons (New Session and History) positioned to the right of the title and CWD selector.

#### Scenario: Buttons are visible and accessible
- **WHEN** the Chat page is loaded
- **THEN** the "New Session" and "History" buttons SHALL be visible in the header area
- **AND** both buttons SHALL have accessible labels and hover states
