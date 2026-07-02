## 1. Spike: validate data source (done — pivot to tool_use correlation)

- [x] 1.1 Confirm that `--permission-prompt-tool` + `--mcp-config` does NOT work for dynamically configured stdio MCP servers in this Claude Code version
- [x] 1.2 Confirm that structured `tool_use` envelopes are emitted BEFORE terminal Y/n permission prompts and contain full `tool_name` + `tool_input`
- [x] 1.3 Decide whether to keep the existing PTY/pipe transport and terminal prompt scanner (yes — still needed to answer Y/n on child stdin)
- [x] 1.4 Update proposal/design/specs/tasks to reflect the tool_use-correlation pivot

## 2. Server: capture pending tool_use and enrich permission_request

- [x] 2.1 In `run-spawner.js`, capture each `tool_use` stream-json envelope on the per-run `handle` before it is broadcast, clearing the capture when a matching `tool_result` arrives
- [x] 2.2 Update `scanPermissionPrompt()` to use the captured pending `tool_use` (`tool_name`, `tool_input`) when building the `permission_request` envelope, falling back to the existing text-window behavior if no pending tool_use is available
- [x] 2.3 Ensure the `permission_request` envelope is broadcast over the existing WebSocket (`run_stream` / `run_permission_request`) with the new shape
- [x] 2.4 Add/update server tests for tool_use capture and enriched permission_request envelope

## 3. Client: structured permission envelope

- [x] 3.1 Update `PermissionRequestEnvelope` in `client/src/components/chat/types.ts` to `{ type, id, tool_name, tool_input }`, optionally keeping `description` as a backwards-compatible fallback field
- [x] 3.2 Update `useRunChat.ts` / wherever `permission_request` envelopes are consumed to pass the new shape through unchanged
- [x] 3.3 Update `PermissionPrompt.tsx` to render `tool_input` via the same per-tool rendering `ToolCallBlock.tsx` uses (extract/share the relevant rendering logic rather than duplicating it)
- [x] 3.4 Update `ToolDetails.tsx`'s permission-request branch to use the same shared rendering instead of the old `command`/`path` fields
- [x] 3.5 Update/add tests in `client/src/components/chat/__tests__/PermissionPrompt.test.tsx` for the new envelope shape and tool-specific rendering (Edit diff, Bash command)

## 4. Skills in `/` autocomplete

- [x] 4.1 Extend `server/lib/cc-discovery.js` so the function backing `api.ccConfig.commands` merges `readSkills()` output into the returned list, mapped to `{name, description (from preview), scope}` with a new `source: "skill"` tag
- [x] 4.2 Update `server/routes/cc-config.js` / `server/openapi-extra/cc-config.js` response typing/docs to reflect the new `source` value
- [x] 4.3 Update `ChatSlashCommand`'s `source` union in `client/src/components/chat/ChatInput.tsx` to include `"skill"`, and add a distinct badge style for it
- [x] 4.4 Verify `ChatTab.tsx`'s existing merge-with-builtins logic requires no changes (skills arrive pre-merged from the server)
- [x] 4.5 Add/update server test coverage for the merged commands+skills discovery function

## 5. Small fix

- [x] 5.1 Fix `ChatToast.tsx`'s dead ternary (`kind: latest.source === "git" ? "error" : "error"`) so a real success path is reachable, and identify/wire an actual success-triggering call site (or leave the type but confirm no regression if none exists yet)

## 6. Verification

- [x] 6.1 Run `npm run test:server` — tool_use capture, permission envelope, cc-discovery skills merge
- [x] 6.2 Run `npm run test:client` — PermissionPrompt, ToolDetails, ChatInput, and regenerate `screens.snapshot.test.tsx` baselines if the permission card's visual output intentionally changed (review diff before accepting, per `dashboard/CLAUDE.md`)
- [ ] 6.3 Manually verify in a live chat session: trigger an Edit permission request and confirm a real diff renders before approval; trigger a Bash permission request and confirm the real command renders; confirm reject actually blocks tool execution
- [ ] 6.4 Manually verify an unrelated terminal `claude` session (outside the dashboard) still prompts normally and is unaffected
