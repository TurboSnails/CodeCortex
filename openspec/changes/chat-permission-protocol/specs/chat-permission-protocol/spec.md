## ADDED Requirements

### Requirement: Structured permission request data
When a `claude` process spawned by the dashboard for a chat/run session requests permission to use a tool mid-session, the system SHALL deliver the real tool name and structured tool input to the client, derived from the most recent pending `tool_use` stream-json envelope rather than text scraped from terminal output.

#### Scenario: Edit tool permission request carries old/new content
- **WHEN** Claude requests permission to run an `Edit` tool call mid-session
- **THEN** the `permission_request` envelope broadcast to the client includes `tool_name: "Edit"` and a `tool_input` containing the real `file_path`, `old_string`, and `new_string` for that edit, taken from the pending `tool_use` envelope

#### Scenario: Bash tool permission request carries the exact command
- **WHEN** Claude requests permission to run a `Bash` tool call mid-session
- **THEN** the `permission_request` envelope includes `tool_name: "Bash"` and a `tool_input` containing the exact command string Claude intends to run, taken from the pending `tool_use` envelope

#### Scenario: Permission prompt without a captured tool_use falls back to text
- **WHEN** Claude emits a terminal Y/n permission prompt but no pending `tool_use` envelope was captured
- **THEN** the system falls back to the existing text-based `description` and `tool_name: "unknown"`, preserving current behavior

### Requirement: Permission interception scoped to dashboard-spawned processes only
The structured permission-prompt mechanism SHALL apply only to `claude` processes spawned by the dashboard's run/chat feature, and SHALL NOT modify or depend on the globally-installed `PreToolUse` hook used by all Claude Code sessions on the host. The mechanism works entirely within the stream-json envelopes `run-spawner.js` already receives for sessions it starts.

#### Scenario: Unrelated terminal session is unaffected
- **WHEN** a user runs `claude` directly in a terminal, outside the dashboard, on a machine where the dashboard's hooks are installed
- **THEN** that session's tool permission prompts behave exactly as before this change, with no blocking on the dashboard's browser UI

#### Scenario: Dashboard is not running
- **WHEN** the dashboard server process is not running and a chat/run session was somehow still spawned by it
- **THEN** this is not a supported state — dashboard-spawned sessions only exist while the dashboard server is running

### Requirement: Browser-driven approve/reject round-trip
The system SHALL allow a user to approve or reject a pending structured permission request from the chat UI, and the decision SHALL be delivered back to the waiting `claude` process.

#### Scenario: User approves a pending permission request
- **WHEN** a permission request is pending and the user clicks Approve in the chat UI
- **THEN** the waiting `claude` process receives an approval decision and proceeds to execute the tool call

#### Scenario: User rejects a pending permission request
- **WHEN** a permission request is pending and the user clicks Reject in the chat UI
- **THEN** the waiting `claude` process receives a denial decision and does not execute the tool call

### Requirement: Tool-specific rendering of pending permission requests
The chat UI SHALL render a pending permission request's `tool_input` using the same per-tool-type presentation (diff view for Edit, syntax-highlighted command for Bash, etc.) already used for executed tool calls, in both the inline chat card and the right-panel tool details view.

#### Scenario: Pending Edit shows a diff before approval
- **WHEN** a pending permission request has `tool_name: "Edit"`
- **THEN** the inline permission card and the right-panel tool details view both render a side-by-side old/new diff of the proposed edit, using the same rendering as an already-executed Edit tool call

#### Scenario: Pending Bash shows the command
- **WHEN** a pending permission request has `tool_name: "Bash"`
- **THEN** the inline permission card renders the exact command with the same syntax highlighting used for executed Bash tool calls
