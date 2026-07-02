## ADDED Requirements

### Requirement: Installed Skills appear in chat slash-command autocomplete
The chat `/` autocomplete SHALL include installed Skills (user-scoped and project-scoped `.claude/skills/*/SKILL.md`) alongside markdown-file slash commands, so users can discover and insert real invokable capabilities from the chat input.

#### Scenario: Project-scoped skill appears in autocomplete
- **WHEN** a project has a skill defined at `<project>/.claude/skills/<name>/SKILL.md` and the user types `/` followed by a matching prefix in the chat input
- **THEN** the skill appears in the autocomplete list alongside slash commands

#### Scenario: Skill entries are visually distinguishable from commands
- **WHEN** the autocomplete list contains both a markdown slash command and a Skill
- **THEN** each entry is labeled with a source badge that distinguishes Skills (e.g. `skill`) from `user`/`project`/`builtin` markdown commands

#### Scenario: Inserting a skill from autocomplete
- **WHEN** the user selects a Skill entry from the autocomplete list
- **THEN** the chat input inserts the skill's invocation token the same way a slash command insertion works today (name inserted at the trigger position, cursor placed after)
