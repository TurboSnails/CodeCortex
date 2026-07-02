## 1. Backend API Foundation

- [x] 1.1 Create `dashboard/server/routes/files.js` with `GET /api/files/tree` and `GET /api/files/content`
- [x] 1.2 Create `dashboard/server/routes/git.js` with `/api/git/status`, `/api/git/diff`, `/api/git/stage`, `/api/git/unstage`, `/api/git/commit`, `/api/git/push`
- [x] 1.3 Register new routes in `dashboard/server/index.js` under `/api/files` and `/api/git`
- [x] 1.4 Add path traversal guard to file APIs (must resolve within cwd)
- [x] 1.5 Add tests for file tree and git routes

## 2. Shared Components and State

- [x] 2.1 Create `ChatWorkspaceContext` with reducer for layout/panel/Git/file state
- [x] 2.2 Extract `TokenMeter` and `computeTokens` from `Run.tsx` into reusable components/hooks
- [x] 2.3 Create `ActivityBar` component with icon buttons and active state
- [x] 2.4 Create `ResizablePanel` wrapper for left/right/bottom panels
- [x] 2.5 Add VS Code-style keyboard shortcut handler hook (`useChatShortcuts`)

## 3. Workspace Layout Shell

- [x] 3.1 Refactor `Chat.tsx` to render IDE layout: Activity Bar + sidebar + chat + right panel + bottom + status bar
- [x] 3.2 Integrate existing `ChatTab` into the main chat area without breaking its behavior
- [x] 3.3 Implement collapsible left sidebar and right panel with smooth transitions
- [x] 3.4 Implement collapsible bottom panel with auto-expand on Bash tool output
- [x] 3.5 Add keyboard shortcut support for `Cmd+B`, `Cmd+J`, `Cmd+Shift+E`, `Cmd+Shift+G`, `Esc`

## 4. File Explorer

- [x] 4.1 Create `FileTree` component with recursive folder/file rendering
- [x] 4.2 Connect Explorer to `GET /api/files/tree`
- [x] 4.3 Implement expand/collapse state in `FileTree`
- [x] 4.4 Create `FilePreview` component using existing `CodeBlock` for syntax highlighting
- [x] 4.5 Connect file click to File Preview tab in right panel
- [x] 4.6 Implement drag-and-drop from file tree to chat input as `@path`
- [x] 4.7 Highlight files targeted by current tool_use or permission_request

## 5. Git Panel

- [x] 5.1 Create `GitPanel` component with status list and diff viewer
- [x] 5.2 Connect Git status to `POST /api/git/status`
- [x] 5.3 Implement file selection and diff loading via `POST /api/git/diff`
- [x] 5.4 Implement stage/unstage actions
- [x] 5.5 Implement commit with message input and validation
- [x] 5.6 Implement push with confirmation modal
- [x] 5.7 Add IDE-style error display for Git operation failures

## 6. Tool Details Panel

- [x] 6.1 Create `ToolDetails` component for right panel Tool tab
- [x] 6.2 Display active `tool_use` input parameters and pending status
- [x] 6.3 Update Tool tab when `tool_result` arrives
- [x] 6.4 Enhance permission request display with command/diff/output preview
- [x] 6.5 Wire Approve/Reject actions from Tool Details panel to existing permission flow
- [x] 6.6 Add recent tool calls history within the session

## 7. Status Bar

- [x] 7.1 Create `ChatStatusBar` component fixed at bottom
- [x] 7.2 Display cwd, model, connection status, and session ID
- [x] 7.3 Integrate extracted `TokenMeter` with context percentage and color thresholds
- [x] 7.4 Add model selector dropdown in status bar
- [x] 7.5 Ensure status bar updates live with streaming envelopes

## 8. Bottom Output Panel

- [x] 8.1 Create `OutputPanel` component to display Bash tool input/output history
- [x] 8.2 Subscribe to `tool_use`/`tool_result` envelopes for bash commands
- [x] 8.3 Auto-expand bottom panel when new bash output arrives
- [x] 8.4 Add manual toggle and clear output action

## 9. Error Handling and Polish

- [x] 9.1 Implement toast notification system for async errors
- [x] 9.2 Create `ProblemsPanel` in bottom panel for aggregated errors
- [x] 9.3 Add inline error placeholders for file preview and Git diff failures
- [x] 9.4 Ensure all new components use consistent VS Code/Cursor styling
- [x] 9.5 Verify responsive behavior down to 1280px width

## 10. Testing and Verification

- [x] 10.1 Run `npm run test:server` after adding file/git routes
- [x] 10.2 Run `npm run test:client` and update snapshots if UI changes are intentional
- [x] 10.3 Add unit tests for `TokenMeter` extraction and `ChatWorkspaceContext` reducer
- [x] 10.4 Manually verify `/chat` layout, file explorer, Git panel, Tool Details, and status bar
- [x] 10.5 Verify security: path traversal blocked, git push requires confirmation
