## Context

`run-spawner.js` spawns `claude` as a child process (PTY when `node-pty` is available, plain stdio pipes otherwise) with `--output-format stream-json --verbose --include-partial-messages`. Conversation-mode runs additionally use `--input-format stream-json` with a persistent stdin. Mid-session permission prompts are currently intercepted via the PTY path: raw ANSI bytes are regex-scanned (`PERMISSION_MARKERS`, a "Y/n"-style pattern) and a ~250-character text window before the match is sent to the client as `description`. `tool_name` is hardcoded `"unknown"`; `command`/`path` fields exist on the TypeScript type but are never populated anywhere in the server.

Correction discovered during the spike phase: the `--permission-prompt-tool` CLI flag delegates to an MCP tool, but a spike against the installed `claude` binary (v2.1.197) showed that an MCP server configured via `--mcp-config` is never initialized before the tool lookup happens; the run exits with the permission-prompt tool "not found". That path is therefore not viable without undocumented timing hacks or a globally-registered plugin.

However, the spike also revealed that **Claude Code emits the structured `tool_use` stream-json envelope before the terminal Y/n prompt appears**. For example, a Write request produced:

```json
{ "type": "tool_use", "name": "Write", "input": { "file_path": "/tmp/codecortex-spike-test.txt", "content": "hello world" } }
```

before any permission prompt. This means the real `tool_name` + `tool_input` is already flowing through the existing parser; the spawner simply needs to capture the most recent unresolved `tool_use` and attach it to the `permission_request` envelope it builds when the terminal prompt is detected.

## Goals / Non-Goals

**Goals:**
- Permission requests carry real `tool_name` + structured `tool_input` (matching the shape already used by executed `tool_use` stream-json envelopes) instead of scraped text.
- Permission interception is scoped per-run (only processes `run-spawner.js` spawns for chat/run sessions); no change to the globally-installed `PreToolUse` hook or its fire-and-forget behavior.
- The chat UI's pending-permission card visually reuses `ToolCallBlock.tsx`'s existing per-tool rendering (Edit diff, Bash highlighting, etc.) rather than a bespoke renderer.
- Installed Skills appear in the `/` autocomplete alongside markdown slash commands, clearly badged as a distinct source.

**Non-Goals:**
- Not using `--permission-prompt-tool` / `--mcp-config` or building any MCP server — the spike showed this CLI path does not work reliably with dynamically configured stdio MCP servers in this version of Claude Code.
- Not changing `PreToolUse`/other globally-installed hooks' behavior or installer.
- Not removing the PTY transport branch or the terminal-prompt scanner (`scanPermissionPrompt`) in this change — we still need them to answer Y/n on the child's stdin. Only the *content* of the broadcast `permission_request` envelope changes.
- Not implementing voice input, image attachments, offline queueing, or mobile-responsive panel stacking (deferred per proposal).
- Not modifying permission behavior for headless (`-p`) one-shot runs — this change targets the same conversation-mode chat/run sessions where the current PTY-scrape problem manifests.

## Decisions

**1. Correlate terminal prompts with the most recent pending `tool_use` envelope.** The existing `createLineParser` in `run-spawner.js` already receives structured `tool_use` envelopes before the terminal Y/n prompt appears. We capture each unresolved `tool_use` on the per-run `handle` and, when `scanPermissionPrompt` detects a permission prompt, use that captured data (`tool_name` + `tool_input`) to build the `permission_request` envelope. This avoids the failed `--permission-prompt-tool` / MCP approach entirely and reuses data already present in the stream.

**2. Keep terminal-prompt answering on the existing PTY/pipe transport.** The Y/n prompt is still rendered by Claude to the child terminal; `scanPermissionPrompt` and the existing Approve/Reject response logic (writing `"y\n"` / `"n\n"` to the transport) remain unchanged. We only change the *metadata* broadcast to the browser, not the mechanism that actually answers Claude.

**3. Correlation strategy: latest unresolved `tool_use`.** In the common case Claude asks for one tool at a time. For multi-tool batches, the terminal prompt typically follows the last tool_use in the batch; using the most recent unresolved `tool_use` is a pragmatic heuristic. If a more robust correlation is needed later, we can match by `id` or sequence index, but the current envelope shape from the parser already includes `id` on `tool_use` blocks.

**4. Envelope shape mirrors executed tool_use.** `PermissionRequestEnvelope` drops `description`/`command`/`path` in favor of `tool_name: string` + `tool_input: unknown`, matching `ContentBlock`'s `tool_use` shape. This lets `PermissionPrompt.tsx` / `ToolDetails.tsx` hand the same object straight to `ToolCallBlock.tsx`'s existing per-tool rendering.

**5. PTY branch removal is explicitly deferred.** Because we still answer terminal prompts by writing to the child stdin/PTY, removing the PTY transport would break permission handling. PTY removal becomes a future change only if Claude Code gains a true stdin-based permission control protocol.

**6. Skills merge happens at the discovery layer, not the client.** `cc-discovery.js` already exports a working `readSkills()`; extend the function backing `api.ccConfig.commands` to concatenate skills (mapped to the same `{name, description/preview, scope}` shape, tagged `source: "skill"`) rather than teaching the client to call two endpoints and merge client-side. Keeps `ChatTab.tsx`'s existing single-fetch-and-merge-with-builtins logic unchanged.

## Risks / Trade-offs

- **[Risk] Correlating by "latest unresolved tool_use" can mis-attribute in rare multi-tool batches** -> Mitigation: include the tool_use `id` in the captured envelope and, if the stream parser later exposes a sequence index or batch marker, upgrade the correlation. For now, the common single-tool-prompt case is unambiguous.
- **[Risk] Permission prompts that are not preceded by a `tool_use` envelope (e.g. aggregated multi-turn prompts) would still fall back to `tool_name: "unknown"` and a text description** -> Mitigation: keep the existing text-window fallback inside `scanPermissionPrompt`; if no pending `tool_use` is captured, behave exactly as today.
- **[Risk] `tool_use` envelopes and terminal prompts can be interleaved with partial-message streaming events** -> Mitigation: the parser already delivers complete `tool_use` envelopes; capture them in the same `createLineParser` callback, not from `stream_event` deltas.
- **[Risk] Removing the text-based `description` field from `PermissionRequestEnvelope` could break any consumer other than the chat UI** -> Mitigation: `PermissionRequestEnvelope` is an internal stream envelope used only by the chat subsystem; search the server/client code to confirm no other consumer before deleting the field.

## Open Questions

1. Should we keep a short human-readable `description` field in `PermissionRequestEnvelope` alongside `tool_name`/`tool_input`, for backwards compatibility with any custom consumers? (Leaning: no — the UI should derive description from tool_input; but worth a quick code search.)
2. Is there an existing timeout/abandonment mechanism for a pending permission request today? If not, is adding one in-scope here or a separate follow-up change?
3. Should the `mcp/` documentation drift (`CLAUDE.md` repo map + `package.json` workspaces referencing a non-existent directory) be fixed as part of this change, or filed separately? (Leaning: separate — unrelated to chat permission UX.)
4. Are there permission prompts (e.g. for MCP server auth or agent delegation) that do not have a preceding `tool_use` envelope in the same stream? If so, those will continue to use the text fallback.
