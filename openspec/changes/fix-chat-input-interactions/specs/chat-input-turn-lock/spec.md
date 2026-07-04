## ADDED Requirements

### Requirement: Chat input is locked during an active assistant turn
The chat input textarea and send button SHALL be disabled for the entire duration that the assistant is actively processing or streaming a reply, not merely during the brief request/acknowledgement window, and SHALL be re-enabled once the turn completes.

#### Scenario: Assistant is streaming a reply
- **WHEN** the assistant is actively generating or streaming a response to the current turn
- **THEN** the chat input textarea and send button are disabled

#### Scenario: Turn completes
- **WHEN** the assistant's response finishes streaming and the run returns to an idle state
- **THEN** the chat input textarea and send button become enabled again

#### Scenario: User attempts to submit mid-turn
- **WHEN** a user tries to type or press Enter/click send while the assistant is actively replying
- **THEN** no additional message is sent to the running session, since the input remains disabled
