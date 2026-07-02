## Context

当前 `dashboard/client/src/pages/Chat.tsx` 渲染的是一个独立的聊天卡片组件 `ChatTab`，包含消息列表、输入框、自动补全和行内权限审批。虽然 `dashboard/client/src/pages/Run.tsx` 已经具备 Token 计量、model 选择、run switcher 等高级功能，但 `/chat` 页面尚未把这些能力整合进来。

参考 VS Code / Cursor 的商业级 IDE 体验，用户期望 `/chat` 成为一个完整的工作台：左侧浏览文件、右侧查看 Tool 与 Git 上下文、底部查看命令输出、底部状态栏显示模型与 Token 消耗。这样用户在审批 Claude Code 的 Bash / Edit / Write 请求时，无需跳转到其他页面即可掌握完整上下文。

本次设计覆盖前端布局、状态管理、后端 API、安全边界和错误处理策略。

## Goals / Non-Goals

**Goals:**

- 把 `/chat` 改造成 IDE 式三栏工作区，视觉风格向 VS Code / Cursor 靠拢。
- 新增文件浏览器和文件只读预览面板。
- 新增 Git 状态 / diff / stage / unstage / commit / push 面板。
- 新增 Tool Details 面板，展示当前 Tool 调用详情，并在权限审批时显示影响范围。
- 把 `/run` 的 Token / 上下文 / Cost 计量抽取为可复用组件，下沉到 `/chat` 状态栏。
- 新增 VS Code 风格快捷键与底部状态栏。
- 新增后端 API 支持文件树、文件内容读取、Git 操作。

**Non-Goals:**

- 不支持移动端优先布局（后续再扩展）。
- 不实现多 session tab（Phase 2）。
- 不实现文件编辑功能（Phase 2）。
- 不实现 Command Palette（Phase 2）。
- 不实现独立的用户命令执行终端；自定义命令仍由 Claude Code Bash tool 执行。
- 不修改 `/run` 页面的现有行为。

## Decisions

### 1. 布局：Activity Bar + 三栏 + 底部面板 + 状态栏

**决策**：采用 VS Code 经典布局：最左侧 Activity Bar 切换左侧面板，中间主区域放聊天，右侧辅助面板，底部可折叠输出面板，最底部状态栏。

**理由**：
- 与 VS Code / Cursor 一致，降低用户学习成本。
- 聊天区保持足够宽度，不会因为文件树或 Git 面板被过度挤压。
- 底部面板默认折叠，不影响聊天垂直空间。

**替代方案**：
- 方案 B（聊天为主，侧边可折叠）：会削弱 IDE 感，频繁切换面板打断心流。
- 方案 C（右侧面板放终端）：终端和 Git 共享空间，切换成本高。

### 2. 状态管理：React Context + useReducer

**决策**：使用 React Context + `useReducer` 管理 workspace 状态，不引入 Zustand。

**理由**：
- 项目当前没有 Zustand，已有 `eventBus` 和局部 state 模式。
- 本 change 的状态虽然跨组件，但更新频率可控，Context + reducer 足够。
- 避免增加运行时依赖和打包体积。

**替代方案**：
- Zustand：更优雅，但需要新依赖，收益不大。

### 3. 文件树：后端递归 API + 前端树组件

**决策**：后端提供 `GET /api/files/tree?cwd=&depth=` 返回完整树结构；前端用受控组件渲染，支持展开/折叠。

**理由**：
- 一次性返回树比多次请求更高效。
- 深度参数 `depth` 控制初始加载范围，避免大项目首屏过载。

**替代方案**：
- 懒加载子目录：更节省流量，但首次点击有延迟；可在 Phase 2 优化。

### 4. Git 操作：后端封装 git CLI

**决策**：后端新增 `/api/git/*` 路由，直接调用 `child_process.spawn('git', ...)`。

**理由**：
- 与 Cursor 的 Git 面板行为一致。
- push 操作需要 UI 二次确认，其他本地操作放行。

**替代方案**：
- 让 Claude Code 通过 Bash tool 执行 git：用户已经在聊天中可以做这件事，但效率低，不适合面板交互。

### 5. 底部面板：只读输出面板

**决策**：底部面板只展示 Claude Code Bash tool 的输入/输出历史，不接受用户直接输入命令。

**理由**：
- 符合用户要求“自定义命令执行交给 Claude Code 库本身控制”。
- 避免在 dashboard 中引入额外的命令执行权限边界。
- 实现简单，可以先快速上线。

**替代方案**：
- node-pty 真终端：体验更好，但安全/生命周期复杂，Phase 2 再考虑。

### 6. Token 计量：从 Run.tsx 抽取

**决策**：把 `Run.tsx` 中的 `computeTokens` 和 `TokenMeter` 抽取到 `dashboard/client/src/components/chat/` 下作为独立组件，在 `/chat` 状态栏复用。

**理由**：
- 避免重复实现，保持计量逻辑一致。
- `/chat` 和 `/run` 的 envelope 结构相同（都基于 `useRunChat`）。

### 7. 权限审批：在 Tool Details 面板显示上下文

**决策**：权限审批不再只是中间聊天区的简单卡片，而是在右侧 Tool Details 面板显示完整信息，包括命令、diff 预览、输出样例。

**理由**：
- 大屏下右侧有充足空间展示上下文。
- 减少用户误批风险。

### 8. 错误处理：Toast + Problems 面板 + 内联错误

**决策**：
- 后端 API 错误用右下角 Toast 通知。
- 汇总错误到底部 Problems 面板（`Cmd+Shift+M`）。
- 文件读取失败、Git diff 失败等在对应面板内联显示占位。

**理由**：
- 符合 IDE 习惯，不遮挡聊天主流程。
- 多错误场景可集中查看。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 大项目文件树渲染卡顿 | 限制默认 `depth=3`，支持虚拟滚动（Phase 2），大文件夹延迟展开。 |
| Git 操作误触导致代码丢失 | commit 前显示 diff；push 强制二次确认；所有 Git API 受 `tokenGuard` 保护。 |
| 布局在较小桌面屏幕上拥挤 | 设置各面板最小宽度；Activity Bar 和右侧面板可折叠。 |
| 多面板状态同步复杂 | 使用单一 WorkspaceContext，所有面板读取同一份状态。 |
| 新增后端路由扩大攻击面 | 仅暴露必要操作；文件路径校验必须在 cwd 内；Git push 需确认。 |

## Migration Plan

- 本 change 为纯增量，不修改现有 `/run`、`/sessions`、后端 hook 逻辑。
- `/chat` 页面替换为新布局，旧 `ChatTab` 组件可保留作为内部聊天组件复用。
- 新后端路由在 `/api` 下注册，遵循现有安全中间件。
- 不需要数据库 migration。
- 回滚：若新布局有严重问题，可快速回滚 `Chat.tsx` 到旧版本（保留新后端路由通常无副作用）。

## Open Questions

1. 文件树默认展开深度是 2 还是 3？是否需要根据项目大小动态调整？
2. Git status 轮询频率多少合适？是否用 WebSocket 推送 Git 变更？
3. Toast 通知是否引入轻量库（如 `sonner`），还是纯 CSS 自研？
4. 是否需要为新布局做 feature flag，方便 A/B 灰度？
5. 状态栏 context 百分比条颜色阈值（80% 黄色 / 95% 红色）是否与 `/run` 保持一致？
