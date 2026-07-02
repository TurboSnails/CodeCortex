## ADDED Requirements

### Requirement: IDE layout structure
The `/chat` page SHALL render an IDE-style workspace consisting of an Activity Bar on the far left, a left sidebar panel, a main chat area, a right auxiliary panel, a collapsible bottom panel, and a status bar at the bottom.

#### Scenario: Default layout
- **WHEN** the user navigates to `/chat`
- **THEN** the page displays all workspace regions with the chat area occupying the remaining space between panels

#### Scenario: Panel collapse
- **WHEN** the user toggles the left sidebar or right panel
- **THEN** the collapsed region hides and the chat area expands to fill the space

### Requirement: Activity Bar
The Activity Bar SHALL provide icons to switch the left sidebar content between Explorer, Git, and Settings views.

#### Scenario: Switch sidebar view
- **WHEN** the user clicks an Activity Bar icon
- **THEN** the left sidebar displays the corresponding panel and the selected icon receives an active visual indicator

### Requirement: Status bar with context metrics
The status bar SHALL display the current working directory, active model, total input tokens, context window usage percentage, estimated cost, and WebSocket connection status.

#### Scenario: Live token update
- **WHEN** a streaming response updates token usage
- **THEN** the status bar reflects the new totals within one second

#### Scenario: Context warning
- **WHEN** context usage exceeds 80%
- **THEN** the percentage indicator changes to an amber color; at 95% it changes to red

### Requirement: Bottom output panel
The bottom panel SHALL display a read-only log of Bash tool invocations and their outputs, defaulting to collapsed and auto-expanding when new output arrives.

#### Scenario: Auto-expand on output
- **WHEN** a Bash tool produces output while the bottom panel is collapsed
- **THEN** the panel expands to show the latest output

#### Scenario: Manual toggle
- **WHEN** the user presses `Cmd+J`
- **THEN** the bottom panel toggles between open and closed

### Requirement: Keyboard shortcuts
The workspace SHALL support VS Code-style keyboard shortcuts for common actions.

#### Scenario: Open Explorer
- **WHEN** the user presses `Cmd+Shift+E`
- **THEN** the left sidebar switches to the Explorer view and expands if collapsed

#### Scenario: Toggle sidebar
- **WHEN** the user presses `Cmd+B`
- **THEN** the left sidebar toggles visibility

#### Scenario: Stop running session
- **WHEN** the user presses `Esc` while a session is running
- **THEN** the running session stops
