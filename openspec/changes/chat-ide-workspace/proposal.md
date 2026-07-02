## Why

当前 `/chat` 是一个功能完整的聊天页面，但本质上仍是一个独立的聊天卡片。随着用户希望把 CodeCortex 作为本地大屏场景下的专业 IDE 替代，聊天必须升级为包含文件浏览、Git 操作、Tool 上下文、Token 计量的完整工作台。参考 VS Code / Cursor 的商业级 IDE 体验，将 `/chat` 重构为 IDE 式工作区，能显著降低用户在审批 Tool 调用、查看文件变更、追踪上下文消耗时的认知负担。

## What Changes

- 将 `/chat` 从单卡片聊天页重构为 IDE 式三栏工作区：左侧 Activity Bar + 面板、中间聊天区、右侧辅助面板、底部可折叠面板、底部状态栏。
- 新增文件浏览器面板：基于 cwd 展示文件树，支持点击预览、拖拽生成 `@path` 引用、当前操作文件高亮。
- 新增右侧面板，集成三个 tab：Tool Details（当前 Tool 调用详情）、File Preview（文件只读预览）、Git（Git 状态与 diff）。
- 新增底部输出面板：默认折叠，Claude Code Bash tool 有输出时自动展开，显示命令执行历史。
- 把现有 `/run` 页的 Token / 上下文 / Cost 计量下沉到 `/chat` 状态栏，并在状态栏展示 model、cwd、连接状态。
- 增强权限审批卡片：在 Tool Details 区域显示待审批命令的影响范围、diff 预览、输出样例。
- 引入 VS Code 风格快捷键：`Cmd+Shift+E` 打开 Explorer、`Cmd+Shift+G` 打开 Git、`Cmd+B` 切换侧边栏、`Cmd+J` 切换底部面板、`Esc` 停止运行。
- 新增后端 API：`/api/files/tree`、`/api/files/content`、`/api/git/status`、`/api/git/diff`、`/api/git/stage`、`/api/git/unstage`、`/api/git/commit`、`/api/git/push`（push 需二次确认）。
- 错误处理采用 IDE 风格：右下角 Toast 通知、底部 Problems 面板、内联错误占位。

## Capabilities

### New Capabilities

- `chat-workspace-layout`: IDE 式布局、Activity Bar、面板系统、状态栏、Token/上下文/Cost 计量、VS Code 风格快捷键、Command Palette 预留。
- `chat-file-explorer`: 文件树浏览、文件只读预览、`@path` 拖拽引用、当前操作文件高亮。
- `chat-git-panel`: 右侧面板 Git tab，包含 status、diff、stage/unstage、commit，push 需二次确认。
- `chat-tool-details`: 右侧面板 Tool Details tab，展示当前 Tool 调用完整信息，并在权限审批时显示上下文和 diff 预览。

### Modified Capabilities

- 无现有 spec 需要修改需求。现有 `/run` 页的 Token 计量逻辑仅做组件抽取复用，行为不变。

## Impact

- **前端**：新增/修改 `dashboard/client/src/pages/Chat.tsx`、`dashboard/client/src/components/chat/*`，新增 `FileTree`、`FilePreview`、`GitPanel`、`ToolDetails`、`StatusBar`、`BottomPanel`、`ActivityBar` 等组件。
- **后端**：新增 `dashboard/server/routes/files.js`、`dashboard/server/routes/git.js`，在 `dashboard/server/index.js` 注册。
- **API**：新增 REST API，遵循现有 `tokenGuard` 与 `hostGuard` 安全控制。
- **依赖**：不引入新的运行时依赖；状态管理使用现有 React Context + `eventBus` 模式。
- **安全**：文件浏览限制在 cwd 内；Git push 通过 UI 二次确认；自定义命令执行仍由 Claude Code 自身权限模型控制，不做额外执行入口。
