## ADDED Requirements

### Requirement: Tool details display
The right auxiliary panel SHALL include a "Tool" tab that displays the full input and current output of the active Tool call.

#### Scenario: Tool call active
- **WHEN** the assistant emits a `tool_use` envelope
- **THEN** the right panel switches to the Tool tab and shows the tool name, input parameters, and pending status

#### Scenario: Tool result received
- **WHEN** the corresponding `tool_result` envelope arrives
- **THEN** the Tool tab updates to display the output or error

### Requirement: Permission context display
When a permission request is active, the Tool tab SHALL display contextual information about the requested action, including the command string, target file path, and any available output preview.

#### Scenario: Bash permission request
- **WHEN** a `permission_request` is shown for a Bash command
- **THEN** the Tool tab displays the command and the last known working directory

#### Scenario: Edit permission request
- **WHEN** a `permission_request` is shown for an `edit` Tool
- **THEN** the Tool tab displays the target file path and a diff preview of the proposed change

### Requirement: Permission approval actions
The Tool tab SHALL provide Approve and Reject actions for active permission requests.

#### Scenario: Approve from Tool tab
- **WHEN** the user clicks Approve in the Tool tab
- **THEN** the system sends the approval response and the permission request disappears

#### Scenario: Reject from Tool tab
- **WHEN** the user clicks Reject in the Tool tab
- **THEN** the system sends the rejection response and the permission request disappears

### Requirement: Tool history
The Tool tab SHALL retain a short history of recent Tool calls in the current session for quick reference.

#### Scenario: View recent tools
- **WHEN** there are completed Tool calls in the current session
- **THEN** the Tool tab shows a collapsible list of recent tools with their names and results
