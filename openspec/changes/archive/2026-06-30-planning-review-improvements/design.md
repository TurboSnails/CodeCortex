## Context

CodeCortex v1 已具备规划层（task group 4）和多模型审核层（task group 5），但存在三处缺口：
1. 规划产物（`tasks.md`）只写到 `~/.codecortex/plans/<sessionId>/`，与 OpenSpec CLI 工具链脱节，`/opsx:apply` 无法消费。
2. `tasks.md` 在被外部修改（用户编辑、CC 工具调用）后，dashboard 侧边栏依赖手动刷新或再次 PATCH 才会更新。
3. 多模型审核结果只在 `session_reviews` 表里追加，但 UI 端只展示 `latestReview`，历史结果无回溯入口。

本次实现是纯增量补全，不改动 v1 已有的规划流程语义、审核触发流程或 SessionDetail 整体布局。

## Goals / Non-Goals

**Goals:**
- 当被监控项目目录下存在 `openspec/` 时，规划层直接在该项目的 `openspec/changes/<slug>/` 下生成标准 change 文件
- 当被监控项目无 `openspec/` 时，回退到 `~/.codecortex/plans/<sessionId>/`（保持 v1 行为）
- tasks.md 被任意外部修改后，dashboard UI 侧边栏自动通过 WS 推送 `plan_updated` 事件刷新
- 在 SessionDetail 新增 "Reviews" tab 标签页展示该 session 的全部历史审核结果

**Non-Goals:**
- 不自动打勾（不通过 CC PostToolUse 事件推断任务完成，AI 匹配误判率高）
- 不改变现有 `/opsx:apply` 或 OpenSpec CLI 行为
- 不做跨 session 的审核聚合视图
- 不实现服务器重启后自动恢复 fs.watch（接受 v1 限制）

## Decisions

### 1. 数据模型：两列 + 两个新预编译语句

在 `session_plans` 表上 `ALTER TABLE` 增加 `plan_type TEXT DEFAULT 'standalone'` 和 `change_dir TEXT`。`tasks_path` 概念被弃用，由 `change_dir`（或 legacy `plans_dir`）拼接得到。

`ALTER TABLE` 在旧 DB 上重复执行会报错 → 用 `try/catch` 包裹，列已存在时忽略错误（已在 v1 多次升级中验证可行）。

`session_reviews` 表无需结构变更，仅新增两个预编译语句：
- `listReviews(sessionId, limit, offset)`：`SELECT * FROM session_reviews WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
- `countReviews(sessionId)`：`SELECT COUNT(*) AS count FROM session_reviews WHERE session_id = ?`

**备选方案 A**（拒绝）：新建独立 `review_history` 表 → 拒绝；`session_reviews` 本身已是历史表，分裂会引入一致性负担。

### 2. OpenSpec 位置探测：`detectPlanLocation(cwd, sessionId)`

独立模块 `server/lib/openspec-plan.js`，只依赖 `fs` / `path` / `os`，便于单元测试。
- 输入 `cwd`（来自 `sessions.cwd`）
- 若 `<cwd>/openspec` 存在 → `{ type: 'openspec', changeDir: <cwd>/openspec/changes/<slug> }`
- 否则 → `{ type: 'standalone', changeDir: <CODECORTEX_PLANS_DIR || ~/.codecortex/plans>/<sessionId> }`

**slug 格式**：`YYYY-MM-DD-codecortex-<sessionId 前 8 字符>-<4 字符 base36 hash>`
- 加 4 字符 hash 的原因：原设计仅前 8 字符，同一项目同一日期下两个 sessionId 前缀相同时会冲突。hash 由完整 sessionId 派生（前缀 + 后续字符），碰撞概率近零。
- hash 函数选择 base36 + 滚动 hash：实现简单、长度固定 4 字符、无外部依赖。

### 3. 文件生成：三个标准文件

`generateOpenSpecChange(changeDir, sessionId, description, tasks)`：
- `fs.mkdirSync(changeDir, { recursive: true })` 支持深层路径
- `.openspec.yaml`：`schema: spec-driven\ncreated: <YYYY-MM-DD>\nsession_id: <sessionId>\n`
- `proposal.md`：`## Why\n\n<description>\n\n## What Changes\n\n- <task>\n- <task>\n...`
- `tasks.md`：`# Plan: <changeName>\n\n- [ ] <task>\n- [ ] <task>\n...`

**关键决策：`tasks.md` 使用 v1 的 `# Plan:` 头部而非 v2 的 `## Tasks` 头部。**
原因：v1 row fallback path 在解析 tasks 时只检查 checkbox 行（`/^- \[[ x]\]/`），不依赖 header 格式。沿用 `# Plan:` 让 legacy 解析路径与新文件 100% 兼容。`parseTasksFromFileContent` 只看 checkbox 行的正则，不区分 header 来源。

### 4. 文件监听：`plan-watcher.js`

`fs.watch(tasksPath, { persistent: false }, callback)` + 200ms debounce：
- `persistent: false` 确保 watcher 不阻止 Node 进程退出
- 200ms debounce：避免编辑器保存（多次连续写）触发广播风暴
- 文件不存在（`readFileSync` 抛错）时 self-clean：调用 `unwatch(sessionId)` 并丢弃事件
- watcher `error` 事件同样调用 `unwatch`：保护调用者

**API 形态：**
```js
watch(sessionId, tasksPath, broadcastFn = defaultBroadcast)
unwatch(sessionId)
```

`broadcastFn` 作为参数注入（默认指向 `websocket.broadcast`），便于测试时注入 spy。

**已知限制（v1 接受）：**
- 服务器重启后 watcher 不会自动恢复。下次 `POST /api/plan` 时会重新激活。
- `fs.watch` 在 macOS 上对文件改动可靠；Linux/WSL 上对 NFS 挂载目录可能不可靠（不在本工具目标平台范围）。

### 5. 审核历史：分页 + 倒序

`GET /api/review/:sessionId/history?limit=&offset=`：
- `limit` clamp 到 `[1, 50]`（`Math.min(Math.max(parseInt(x, 10) || 20, 1), 50)`）
- `offset` clamp 到 `>= 0`
- NaN 检测 → 400 错误
- 返回 `{ reviews, total }`，reviews 按 `created_at DESC`

**为何默认 20**：与现有 `latestReview` 单条 API 保持轻量一致；上限 50 防止恶意大查询压垮 sqlite。

### 6. SessionDetail 集成

新增 "Reviews" tab：
- 通过 `ReviewsTab` 组件 + `api.review.getHistory()` 获取初始数据
- `ReviewsTab` 内部维护 `reviews` / `expandedId` / `count` 状态
- WS `review_ready` 事件 → prepend 新结果 + 增量更新 `count`
- `onCountChange` 回调把 count 传给 SessionDetail 用于 tab badge

**为何把 count 状态放在 ReviewsTab 内**：避免父组件重复管理分页与 WS 订阅，单一数据源。

## Risks / Trade-offs

- **fs.watch 可靠性** → 仅承诺 macOS 行为；测试用例已覆盖 broadcast 触发与 unwatch 清理。
- **ALTER TABLE 重复执行** → `try/catch` 包裹，列已存在时静默忽略。
- **slug 碰撞** → 8 字符前缀 + 4 字符 hash 同日同项目冲突概率近零（个人工具）。
- **plan-watcher 在 stop hook 前未触发 unwatch** → 进程退出时 `persistent: false` 不会阻塞退出，资源由 OS 回收。
- **limit/offset 解析边界** → 测试覆盖 NaN / 负数 / 0 / 超大值 clamp。
- **新事件 `plan_updated` 旧客户端不识别** → 客户端必须升级；不属于 breaking change（新字段而非移除字段）。

## Migration Plan

无 schema 迁移工具。ALTER TABLE 在应用启动时由 `db.js` 内 `try/catch` 包裹执行；`session_reviews` 表无需变更。

客户端无破坏性变化；`ReviewsTab` 是新增 tab，旧用户不受影响。
