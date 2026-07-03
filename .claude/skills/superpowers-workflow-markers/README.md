# Superpowers Workflow Marker Patches

This directory documents local patches applied to the superpowers plugin skills so they emit workflow markers for the dashboard chat workflow mode selector.

Patched files:

- `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/brainstorming/SKILL.md`
- `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/writing-plans/SKILL.md`
- `~/.claude/plugins/cache/superpowers-dev/superpowers/6.1.1/skills/executing-plans/SKILL.md`

Each file was appended with instructions to output one of:

- `<!-- __WORKFLOW:CONTINUE__ -->`
- `<!-- __WORKFLOW:PAUSE__ -->`
- `<!-- __WORKFLOW:DONE__ -->`
- `<!-- __WORKFLOW:ERROR:brief reason -->`

These patches will be overwritten if the plugin is reinstalled or updated.
A future improvement is to wrap these skills with project-local skill files instead.
