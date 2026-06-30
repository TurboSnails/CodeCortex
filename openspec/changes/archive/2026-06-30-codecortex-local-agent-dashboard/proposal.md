## Why

使用 Claude Code 进行 agentic 编程时，计划和执行完全脱节：开发者看不到 CC 在做什么、任务跑偏时没有预警、多个 session 状态不透明、代码改完后质量难以把控。这套本地可视化驾驶舱通过非侵入式 hooks 集成，在不改变原生 Claude Code 体验的前提下，将可视化、规划、审核三个能力叠加进来。

## What Changes

- **新增本地网关（hook-gateway）**：接收 Claude Code 的 hooks 事件（SessionStart / PreToolUse / PostToolUse / Stop），通过 WebSocket 向 UI 实时推送，支持多 session 并发
- **新增 Session 监控 UI（session-monitor）**：实时展示工具调用序列、思考流、文件变更 diff；多 session 并列看板，每个 session 独立状态卡片
- **新增轻量规划层（planning-layer）**：启动 session 时弹出可跳过的引导卡片，填写后生成 tasks.md 并在 session 视图侧边栏持续追踪进度
- **新增多模型审核（multi-model-review）**：全局三态开关（关/询问/自动），支持将 git diff 发送给第二模型（Gemini / GPT 等）并在 UI 中展示审核意见

## Capabilities

### New Capabilities

- `hook-gateway`: 本地 HTTP + WebSocket 服务，接收 CC hooks 事件、维护 session 注册表、向 UI 推送实时事件流
- `session-monitor`: 实时 session 可视化看板，包含单 session 详情视图（工具调用、思考流、diff）和多 session 列表视图
- `planning-layer`: session 启动引导流程，轻量任务规划 UI，tasks 进度追踪侧边栏
- `multi-model-review`: 代码审核触发器，三态模式控制（关/询问/自动），审核结果展示面板

### Modified Capabilities

（无，本次为全新能力，无现有 spec 需要变更）

## Impact

- **Claude Code 配置**：需在 `~/.claude/settings.json` 注册 4 个 hooks（SessionStart、PreToolUse、PostToolUse、Stop），每个 hook 向网关 POST 事件，CC 本身不受任何侵入
- **本地进程**：新增一个持久运行的网关进程（独立于 CC），负责接收事件、维护状态、服务 WebSocket
- **外部 API**：多模型审核功能调用 Gemini / GPT API，需要用户自行配置 API key，功能可选
- **OpenSpec 集成**：规划层复用现有 `openspec/` 基础设施，proposal/tasks 文件作为规划状态的持久化载体
- **无数据库依赖**：session 状态全部在内存中，重启后通过 hooks 重新建立；tasks 持久化在文件系统
