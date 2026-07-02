# CodeCortex

Claude Code 的本地可视化驾驶舱。基于 [hoangsonww/Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor)（MIT）扩展，提供从 session 监控、交互式对话、配置管理到告警通知的一站式体验。

---

## 快速开始

### 前提条件

- Node.js ≥ 18
- Claude Code CLI（`claude`）已安装并登录

### 安装

```bash
cd dashboard
npm install
npm run install-hooks   # 写入 ~/.claude/settings.json，自动转发 hooks 事件
```

前端生产构建（可选；开发模式会自动处理）：

```bash
cd client && npm install && npm run build && cd ..
```

### 启动

```bash
# 开发模式（server + client dev 并发，热重载）
npm run dev

# 生产模式
npm run build
npm start
```

打开浏览器访问 **http://localhost:4820**。

> **注意**：hooks 指向本项目的 `dashboard/scripts/hook-handler.js` 绝对路径。如果移动了项目目录，重新运行 `npm run install-hooks` 更新路径。

---

## 主要功能

### 1. Session 实时监控

无需额外配置。启动 dashboard 后，新开任意 `claude` session 即可看到实时事件流：

- **Dashboard 首页**：当前活跃 session、agent 状态、最近事件、系统健康
- **Kanban 看板**：按状态（working / waiting / completed / error）拖拽查看 agents
- **Sessions 列表**：所有历史 session，支持搜索、过滤、分页
- **Activity Feed**：实时事件流，支持按事件类型、工具名、session 过滤
- **Analytics**：token 用量、成本、session 结果分布、活跃时段热力图等可视化图表

历史 session 会在服务器启动时从 `~/.claude/projects/` 自动导入。

### 2. 交互式 Chat / Run

除了被动监听，还可以直接在 dashboard 里驱动 Claude Code：

- **/chat**：IDE 风格工作区，包含文件浏览器、Git 面板、工具详情、底部终端/问题面板、状态栏
  - 实时流式对话（用户/助手/工具调用/工具结果）
  - 内联权限确认卡片，结构化展示待执行的工具输入（Edit 显示 diff、Bash 显示命令等）
  - `/` 斜杠自动补全，支持内置命令、用户命令、本地安装的 Skills
  - `@` 文件引用自动补全
  - 会话中可直接查看 git diff、stage/unstage、commit
- **/run**：启动并管理 Claude Code 子进程
  - Conversation 模式：多轮对话，支持 follow-up
  - Headless 模式：单轮提示，批量执行
  - 支持 `--resume <session_id>` 恢复已有会话
  - 实时查看工具调用、成本、耗时、结果

### 3. Claude Config 浏览器

访问 `/cc-config` 浏览和管理 Claude Code 的全部配置面：

- Skills、Agents、Slash Commands、Output Styles（可读可写）
- Plugins、MCP Servers、Hooks、Settings（只读，避免与 CLI 并发写入冲突）
- Memory（CLAUDE.md 与项目级记忆文件）
- Marketplaces、Keybindings、Statusline

写入操作会自动创建时间戳备份，支持撤销到历史版本。

### 4. 规划层（Planning）

1. 启动一个新 Claude Code session
2. Dashboard 右下角出现引导卡片：**"New session: xxx"**
3. 填写任务描述（支持编号列表，如 `1. 写测试\n2. 实现\n3. 部署`），点击 **Plan it**
4. 任务会被解析为 `tasks.md` 保存至 `~/.codecortex/plans/<session_id>/tasks.md`
5. Session 详情页的 agents 标签页会出现带进度条的任务面板
6. 在 session 里手动勾选 `tasks.md` 中的任务（`- [x]`），面板会同步

不填也没关系——点 **Skip** 直接开始，其余功能不受影响。

### 5. 多模型代码审核

打开 **Settings → Multi-Model Code Review** 配置：

| 字段 | 说明 |
|---|---|
| 审核模式 | Off（手动）/ Ask（停止时询问）/ Auto（自动触发） |
| 提供商 | Gemini / GPT / Kimi / MiniMax / 自定义 |
| Model | 模型名称，如 `gemini-1.5-flash`、`gpt-4o-mini`、`moonshot-v1-8k` |
| API Key | 对应提供商的 API Key |
| Base URL | 仅 Custom 模式使用，填写 OpenAI-compatible 接口地址 |

填写后点击 **Save**，配置持久化到 `~/.codecortex/config.json`。

使用方式：

- **手动模式（Off）**：进入 Session 详情 → agents 标签页 → 点击 **Review diff** 按钮
- **询问模式（Ask）**：CC 完成一轮（非提问式消息）后自动弹出确认对话框，选 Yes 触发审核
- **自动模式（Auto）**：每次 CC 停止时（非提问式消息）自动调用审核，结果浮动展示

审核时发送的是当前 session 工作目录的 `git diff HEAD`。系统通过 `last_assistant_message` 判断 CC 是在提问还是完成了任务。

### 6. 告警与 Webhook 通知

**Settings → Alerts** 支持规则化告警：

- 事件模式匹配（如 Bash 工具执行、session 异常停止）
- Token 用量阈值
- Session 不活跃超时
- Agent 状态持续时间过长

告警可通过 Webhook 推送到外部系统。`/settings` 与 `/webhooks` 支持 14+ 种通知目标（Slack、Telegram、PagerDuty、Opsgenie 等）。

**Settings → Notifications** 可开启浏览器桌面通知，在 session 开始/完成/出错或子 agent 创建时弹窗。

### 7. Workflows 工作流洞察

`/workflows` 展示 Workflow 工具运行的完整编排视图：

- 阶段（phase）进度条与子 agent 层级
- 子 agent 调用关系图
- Token/成本按阶段汇总
- 实时运行中的 workflow 自动刷新进度

### 8. Tabby 桌面宠物

**Settings → Tabby** 开启后，屏幕右下角会出现一只会随 session 事件做出反应的小猫，为长时间运行提供视觉反馈。

---

## 远程/移动端访问

服务器默认只绑定 `127.0.0.1`（localhost），不暴露到局域网。

如需从手机或其他设备访问，推荐使用 [Tailscale](https://tailscale.com/)：

1. 在运行 dashboard 的机器和手机上都安装 Tailscale 并登录
2. 手机浏览器访问 `http://<Tailscale-机器名>:4820`

无需修改任何服务器配置，访问控制由 Tailscale ACL 管理。

---

## 目录结构

```
dashboard/         ← 完整 dashboard 项目（forked from Claude-Code-Agent-Monitor）
  server/          ← Express + SQLite 后端
    lib/
      run-spawner.js      ← 子进程管理与权限提示拦截
      cc-discovery.js     ← Claude Code 配置发现
      review.js           ← 多模型审核核心
      alerts.js           ← 告警规则引擎
      workflow-ingest.js  ← Workflow 工具日志解析
    routes/
      run.js         ← /api/run 交互式对话
      sessions.js    ← session CRUD
      agents.js      ← agent CRUD
      events.js      ← 事件查询
      cc-config.js   ← 配置浏览器 API
      plan.js        ← 规划层 API
      review.js      ← 审核 API
      alerts.js      ← 告警 API
      webhooks.js    ← Webhook 目标管理
      workflows.js   ← Workflow 洞察 API
      analytics.js   ← 统计图表 API
      hooks.js       ← hook 事件接收
  client/          ← React + Vite 前端
    src/
      pages/             ← 各页面（Chat、Run、Sessions、Workflows 等）
      components/
        chat/            ← IDE 风格聊天工作区
        conversation/    ← 对话/工具调用渲染
        workflows/       ← Workflow 视图
      lib/
        api.ts           ← API 客户端
        types.ts         ← 共享类型
  scripts/
    hook-handler.js  ← CC hooks 转发脚本
    install-hooks.js ← 写入 ~/.claude/settings.json

gateway/           ← TypeScript 网关参考实现（hooks + WebSocket，可独立运行）
  README.md

openspec/          ← 本项目的 OpenSpec 变更文档（规划 + 设计 + 任务）
```

---

## 常见问题

**Q: hooks 安装在哪里？**

`~/.claude/settings.json` 的 `hooks` 字段。服务器每次启动时自动更新，也可手动运行：

```bash
npm run install-hooks
```

**Q: 移动了项目目录，hooks 失效了？**

重新运行 `npm run install-hooks`，它会用新路径覆盖旧配置。

**Q: 审核 API 报错 "Review API key not configured"？**

打开 Settings → Multi-Model Code Review，填写 API Key 并保存。

**Q: 规划的 tasks.md 存在哪里？**

`~/.codecortex/plans/<session_id>/tasks.md`。可以直接用编辑器打开并勾选完成状态（`- [x]`），面板会同步。

**Q: 如何卸载 hooks？**

手动编辑 `~/.claude/settings.json`，删除 `hooks` 字段中包含 `hook-handler.js` 的所有条目。

**Q: `/chat` 页面不显示文件树或 Git 面板？**

确认已选择工作目录（CWD）。首次进入 `/chat` 时顶部会显示 CWD 选择器；也可以在状态栏切换。

**Q: 可以禁止 dashboard 自动安装 hooks 吗？**

可以。启动前设置环境变量 `SKIP_HOOK_INSTALL=1`：

```bash
SKIP_HOOK_INSTALL=1 npm run dev
```

---

## 开发

```bash
# 后端测试
cd dashboard && npm run test:server

# 前端测试
cd dashboard && npm run test:client

# MCP 类型检查与构建
cd dashboard && npm run mcp:typecheck && npm run mcp:build
```

---

## License

MIT（基于 [Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor) 修改）
