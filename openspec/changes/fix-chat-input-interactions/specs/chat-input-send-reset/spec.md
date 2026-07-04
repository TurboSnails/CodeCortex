## ADDED Requirements

### Requirement: Chat input clears after a successful send
The chat input field SHALL be cleared immediately after any message is successfully sent, whether it is the first message that starts a new session or a follow-up message sent within an existing session.

#### Scenario: First message of a new session
- **WHEN** a user types a message into the chat input on a session with no active run and submits it
- **THEN** the session starts and the chat input is cleared

#### Scenario: Follow-up message in an existing session
- **WHEN** a user types a message into the chat input while a session already has an active run and submits it after the prior turn has completed
- **THEN** the message is sent and the chat input is cleared

#### Scenario: Send fails
- **WHEN** a user submits a message and the send request fails (network or server error)
- **THEN** the chat input retains the typed text so the user does not lose their draft
