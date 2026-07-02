## ADDED Requirements

### Requirement: Git status display
The Git panel SHALL display the output of `git status` for the current working directory, listing modified, staged, and untracked files.

#### Scenario: Load Git status
- **WHEN** the user opens the Git panel
- **THEN** the system fetches and displays the current Git status

#### Scenario: Empty working tree
- **WHEN** the working tree is clean
- **THEN** the panel shows a message indicating no changes

### Requirement: Git diff display
The Git panel SHALL display the diff for a selected file from the status list.

#### Scenario: Select changed file
- **WHEN** the user clicks a modified file in the Git status list
- **THEN** the panel shows the diff for that file with additions and deletions highlighted

### Requirement: Stage and unstage files
The Git panel SHALL allow the user to stage and unstage individual files or all changes.

#### Scenario: Stage single file
- **WHEN** the user clicks the stage button next to a modified file
- **THEN** the file moves from the "Changes" section to the "Staged Changes" section and `git add` is executed

#### Scenario: Unstage single file
- **WHEN** the user clicks the unstage button next to a staged file
- **THEN** the file moves back to the "Changes" section and `git reset HEAD` is executed

### Requirement: Commit changes
The Git panel SHALL allow the user to enter a commit message and commit staged changes.

#### Scenario: Commit with message
- **WHEN** the user enters a non-empty commit message and clicks Commit
- **THEN** the system runs `git commit -m "message"` and refreshes the status

#### Scenario: Commit with no staged changes
- **WHEN** the user clicks Commit with no staged changes
- **THEN** the system shows an inline error and does not execute `git commit`

### Requirement: Push with confirmation
The Git panel SHALL require explicit user confirmation before executing `git push`.

#### Scenario: Push confirmation
- **WHEN** the user clicks the Push button
- **THEN** a confirmation dialog appears describing the action

#### Scenario: Confirmed push
- **WHEN** the user confirms the push dialog
- **THEN** the system runs `git push` and shows the result

#### Scenario: Cancelled push
- **WHEN** the user cancels the push dialog
- **THEN** no push command is executed
