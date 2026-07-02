## ADDED Requirements

### Requirement: File tree rendering
The Explorer panel SHALL display a hierarchical file tree for the current working directory, supporting expand/collapse folders and indicating the currently selected file.

#### Scenario: Load file tree
- **WHEN** the user opens the Explorer view
- **THEN** the system fetches and displays the directory tree starting at the current `cwd`

#### Scenario: Expand folder
- **WHEN** the user clicks a collapsed folder
- **THEN** the folder expands to show its immediate children

#### Scenario: Collapse folder
- **WHEN** the user clicks an expanded folder
- **THEN** the folder collapses and hides its children

### Requirement: File preview
The system SHALL open a read-only preview of a file in the right auxiliary panel when the user clicks a file in the Explorer.

#### Scenario: Preview file
- **WHEN** the user clicks a file in the Explorer
- **THEN** the right panel switches to the File Preview tab and displays the file content with syntax highlighting

#### Scenario: Preview error
- **WHEN** the selected file cannot be read
- **THEN** the File Preview tab displays an inline error message instead of content

### Requirement: Drag-to-reference files
The user SHALL be able to drag a file from the Explorer into the chat input to insert an `@path` reference.

#### Scenario: Drag file to input
- **WHEN** the user drags a file and drops it into the chat input
- **THEN** the input value includes `@path/to/file` at the cursor position

### Requirement: Current-operation file highlight
The Explorer SHALL visually highlight any file that is the subject of the current Tool call or permission request.

#### Scenario: Tool targets file
- **WHEN** a `read`, `write`, or `edit` Tool call references `src/utils.ts`
- **THEN** `src/utils.ts` in the Explorer receives a highlight style until the operation completes
