## Why

The `/chat` IDE workspace's permission-approval flow currently intercepts Claude Code's terminal permission prompts by hijacking a PTY and regex-scanning raw ANSI text (`server/lib/run-spawner.js`'s `scanPermissionPrompt`). This yields `tool_name: "unknown"`, no structured `tool_input`, and a fuzzy 250-character text slice as the only description — so the UI can never show what an Edit will actually change, what a Bash command actually is, or which tool is asking. Meanwhile `ToolCallBlock.tsx` (used for *already-executed* tool calls) already renders rich per-tool diffs and syntax highlighting, because that path consumes Claude Code's structured `stream-json` envelopes instead of scraped text. Separately, the chat's `/` autocomplete only surfaces markdown-file slash commands (`.claude/commands/*.md`) even though the server already has a working `readSkills()` reader for installed Skills (`.claude/skills/*/SKILL.md`) that is simply never merged into the command list — so real, invokable Skills (including plugin-provided ones) are invisible from chat.

## What Changes

- Replace fuzzy PTY-text-scraping permission envelopes with structured `tool_use` correlation: `run-spawner.js` already parses Claude Code's `stream-json` envelopes and receives the real `tool_name` + `tool_input` for every pending tool call before the terminal Y/n permission prompt appears. The spawner now captures that structured tool_use and uses it to enrich the `permission_request` envelope broadcast to the client, instead of relying on a 250-character text slice and `tool_name: "unknown"`.
- **BREAKING (internal only)**: `PermissionRequestEnvelope` (`client/src/components/chat/types.ts`) changes shape — `description`/`command`/`path` (the latter two never actually populated today) are replaced by a structured `tool_name: string` + `tool_input: unknown` matching the shape already used by executed `tool_use` envelopes. No public API contract changes; this is an internal stream-envelope shape used only by the chat UI.
- Keep the existing PTY/pipe transport and terminal-prompt interception logic (`scanPermissionPrompt`, `PERMISSION_MARKERS`) for actually answering Y/n on the child's stdin; only the *content* of the `permission_request` envelope changes from scraped text to structured data. PTY removal is deferred until a later change if desired.
- The globally-installed `PreToolUse` hook (`scripts/hook-handler.js`, `scripts/install-hooks.js`) is explicitly **not modified** — it stays fire-and-forget for every Claude Code session on the host, per `dashboard/CLAUDE.md`'s "Hooks: keep fail-safe and non-blocking behavior" rule. The new structured data capture is scoped entirely to the stream-json envelopes `run-spawner.js` already receives for processes it spawns.
- `PermissionPrompt.tsx` (inline chat card) and `ToolDetails.tsx` (right panel) are updated to reuse `ToolCallBlock.tsx`'s existing per-tool-type rendering (icons, Edit diff, Bash highlighting, Grep params) for the pending `tool_input`, instead of dumping raw description text.
- `server/lib/cc-discovery.js`'s command-discovery is extended to merge `readSkills()` output into the list consumed by `api.ccConfig.commands`, tagged with a `source: "skill"` badge distinct from `user`/`project`/`builtin`, so Skills appear in the chat's `/` autocomplete (`ChatInput.tsx`, `ChatTab.tsx`).
- Fix `ChatToast.tsx`'s dead ternary (`kind: latest.source === "git" ? "error" : "error"`) so success-kind toasts are actually reachable.

## Capabilities

### New Capabilities
- `chat-permission-protocol`: structured permission-request envelopes built by correlating terminal Y/n prompts with the most recent pending `tool_use` envelope, including tool-specific rendering of pending permission requests (diff for Edit, highlighted command for Bash, etc.).
- `chat-command-discovery`: unified `/` autocomplete source in the chat UI that merges markdown slash commands and installed Skills (user, project, and plugin scoped) into one ranked, badge-labeled list.

### Modified Capabilities
- None — no existing `openspec/specs/*` capability currently covers chat permission handling or command discovery; both are new.

## Impact

- **Server**: `server/lib/run-spawner.js` (capture pending `tool_use` envelopes and enrich `permission_request` with `tool_name`/`tool_input`), `server/lib/cc-discovery.js` (skills merged into commands), `server/routes/cc-config.js` (response shape for the merged list).
- **Client**: `client/src/components/chat/types.ts` (`PermissionRequestEnvelope` shape), `PermissionPrompt.tsx`, `ToolDetails.tsx`, `ChatMessageList.tsx` (pass-through of new fields), `ChatInput.tsx` / `ChatTab.tsx` (skill-sourced autocomplete entries), `ChatToast.tsx` (dead-branch fix).
- **Dependency**: no new external dependencies; the structured data is already available in the existing stream-json envelope stream.
- **Runtime behavior**: no new `claude` argv flags; the change is entirely inside how `run-spawner.js` interprets the envelopes it already receives.
- **Testing**: `npm run test:server` (run-spawner, cc-discovery), `npm run test:client` (PermissionPrompt, ToolDetails, ChatInput, screen snapshots per `dashboard/CLAUDE.md`'s testing policy).

## Out of Scope (deferred)

Ideas surfaced from ccpocket/claudecodeui during exploration but not committed to this change: voice input, image attachments in chat, offline message queueing, mobile-stacked responsive panel layout for the IDE workspace. These may become separate future changes.
