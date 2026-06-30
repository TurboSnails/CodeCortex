# CodeCortex

Claude Code 的本地可视化驾驶舱。基于 [hoangsonww/Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor)（MIT）扩展，新增：

- **规划层**：session 启动时弹出引导卡片，生成 tasks.md 并在侧边栏追踪进度
- **多模型审核**：三态开关（关/询问/自动），支持 Gemini / GPT / Kimi / MiniMax

---

## 快速开始

### 前提条件

- Node.js ≥ 18
- Claude Code CLI（`claude`）已安装并登录

### 安装

```bash
cd dashboard
npm install
cd client && npm install && npm run build && cd ..
```

### 启动

```bash
# 开发模式（server + client dev 并发，热重载）
npm run dev

# 生产模式
npm start
```

首次启动时服务器会自动写入 `~/.claude/settings.json`，把 hooks 配置好：

```json
"hooks": {
  "SessionStart": [{ "hooks": [{ "type": "command", "command": "node .../hook-handler.js SessionStart" }] }],
  "PreToolUse":   [{ ... }],
  "PostToolUse":  [{ ... }],
  "Stop":         [{ ... }]
}
```

打开浏览器访问 **http://localhost:4820**。

> **注意**：hooks 指向本项目的 `dashboard/scripts/hook-handler.js` 绝对路径。如果移动了项目目录，重新运行 `npm run install-hooks` 更新路径。

---

## 主要功能

### Session 可视化（任务组 2-3）

无需任何额外配置。启动 dashboard 后，新开任意 `claude` session 即可在 Kanban 看板、Session 列表、Activity Feed 中看到实时事件流。

历史 session 会在服务器启动时从 `~/.claude/projects/` 自动导入。

### 规划层（任务组 4）

1. 启动一个新 Claude Code session
2. Dashboard 右下角出现引导卡片：**"New session: xxx"**
3. 填写任务描述（支持编号列表，如 `1. 写测试\n2. 实现\n3. 部署`），点击 **Plan it**
4. 任务会被解析为 tasks.md 保存至 `~/.codecortex/plans/<session_id>/tasks.md`
5. Session 详情页的 agents 标签页会出现带进度条的任务面板
6. 在 session 里手动勾选 tasks.md 中的任务（`- [x]`），面板会在下次请求时同步

不填也没关系——点 **Skip** 直接开始，其余功能不受影响。

### 多模型审核（任务组 5）

#### 配置

打开 `http://localhost:4820` → **Settings**（左侧导航最下方）→ **Multi-Model Code Review**：

| 字段 | 说明 |
|---|---|
| 审核模式 | Off（手动）/ Ask（CC 停止时弹窗询问）/ Auto（自动触发） |
| 提供商 | Gemini / GPT / Kimi / MiniMax / 自定义 |
| Model | 模型名称，如 `gemini-1.5-flash`、`gpt-4o-mini`、`moonshot-v1-8k` |
| API Key | 对应提供商的 API Key |
| Base URL | 仅 Custom 模式使用，填写 OpenAI-compatible 接口地址 |

填写后点击 **Save**，配置持久化到 `~/.codecortex/config.json`。

#### 使用

- **手动模式（Off）**：进入 Session 详情 → agents 标签页 → 点击 **Review diff** 按钮
- **询问模式（Ask）**：CC 完成一轮（非提问式消息）后自动弹出确认对话框，选 Yes 触发审核
- **自动模式（Auto）**：每次 CC 停止时（非提问式消息）自动调用审核，结果浮动展示

审核时发送的是当前 session 工作目录的 `git diff HEAD`。

#### 判断逻辑

系统通过 `last_assistant_message` 字段判断 CC 是在提问还是完成了任务：

- 以 `?` 或 `？` 结尾 → 判定为提问，不触发审核
- 包含 "do you want / shall I / 请问 / 需要我" 等词组 → 判定为提问
- 其他情况 → 判定为完成，触发审核（取决于审核模式）

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
      review.js    ← 多模型审核核心（isQuestion + callModel + triggerIfAppropriate）
    routes/
      plan.js      ← 规划层 API（POST/GET /api/plan/:sessionId）
      review.js    ← 审核 API（config + trigger + latest）
  client/          ← React + Vite 前端
    src/
      components/
        PlanningPrompt.tsx  ← session 启动引导卡片
        PlanPanel.tsx       ← tasks 侧边栏
        ReviewSettings.tsx  ← 审核模式 + 模型配置
        ReviewPrompt.tsx    ← "询问"模式弹窗
        ReviewPanel.tsx     ← 审核结果浮动卡片
        ReviewTrigger.tsx   ← Session 详情内嵌手动触发按钮
  scripts/
    hook-handler.js  ← CC hooks 转发脚本
    install-hooks.js ← 写入 ~/.claude/settings.json
gateway/           ← TypeScript 网关参考实现（hooks + WebSocket，可独立运行）
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
