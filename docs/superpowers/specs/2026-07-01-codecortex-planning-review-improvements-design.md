# CodeCortex Planning & Review Improvements

**Date:** 2026-07-01
**Status:** Draft

## Context

CodeCortex 的规划层（task group 4）和多模型审核层（task group 5）已完成 v1 实现，但存在三处已知缺口：

1. 规划层生成的 tasks 存储在 `~/.codecortex/plans/`，与 OpenSpec 工具链完全脱节，无法被 `/opsx:apply` 识别
2. tasks.md 在被外部修改（如用户直接编辑、CC 修改）后，UI 侧边栏不会自动刷新，需手动操作
3. 多模型审核只展示最新结果，历史审核被覆盖无从回溯

本 spec 补全这三处缺口，不引入其他变更。

## Goals / Non-Goals

**Goals:**
- 当被监控项目目录下存在 `openspec/` 时，规划层直接在该项目的 `openspec/changes/` 目录生成标准 change 文件结构
- 当被监控项目无 `openspec/` 时，回退到 `~/.codecortex/plans/` 当前行为（向后兼容）
- tasks.md 被任意外部修改后，dashboard UI 侧边栏自动刷新，无需用户手动操作
- 在 SessionDetail 新增 "Reviews" 标签页，展示该 session 的全部历史审核结果

**Non-Goals:**
- 不自动打勾（不通过 CC PostToolUse 事件推断任务完成，那属于 AI 匹配，误判率高）
- 不改变现有 `/opsx:apply` 或 OpenSpec CLI 的行为
- 不做跨 session 的审核聚合视图

---

## Design

### 1. 数据模型变更

**`session_plans` 表新增两列：**

```sql
ALTER TABLE session_plans ADD COLUMN plan_type TEXT DEFAULT 'standalone';
ALTER TABLE session_plans ADD COLUMN change_dir TEXT;
```

- `plan_type`: `'openspec'` 或 `'standalone'`
- `change_dir`: change 目录的绝对路径（openspec 模式下为 `<cwd>/openspec/changes/<slug>`，standalone 下为 `~/.codecortex/plans/<sessionId>`）
- `tasks_path` 保持不变，仍指向 `tasks.md` 绝对路径

**`session_reviews` 表无需改动**（已有 `id, session_id, provider, model, review, created_at`）。

新增 DB stmt：
```js
listReviews: db.prepare(
  'SELECT * FROM session_reviews WHERE session_id = ? ORDER BY created_at DESC LIMIT 50'
)
```

---

### 2. OpenSpec 集成

#### 2a. 位置探测逻辑

新文件 `server/lib/openspec-plan.js`：

```js
function detectPlanLocation(cwd, sessionId) {
  const openspecDir = path.join(cwd, 'openspec');
  if (fs.existsSync(openspecDir)) {
    const slug = '<YYYY-MM-DD>-codecortex-<sessionId[:8]>';
    return {
      type: 'openspec',
      changeDir: path.join(openspecDir, 'changes', slug),
    };
  }
  return {
    type: 'standalone',
    changeDir: path.join(os.homedir(), '.codecortex', 'plans', sessionId),
  };
}
```

slug 格式：`YYYY-MM-DD-codecortex-<sessionId 前 8 位>`，保证唯一、可溯源。

#### 2b. 文件生成逻辑

```js
function generateOpenSpecChange(changeDir, sessionId, description, tasks) {
  fs.mkdirSync(changeDir, { recursive: true });

  // .openspec.yaml
  fs.writeFileSync(path.join(changeDir, '.openspec.yaml'),
    `schema: spec-driven\ncreated: ${today}\nsession_id: ${sessionId}\n`
  );

  // proposal.md
  const taskList = tasks.map(t => `- ${t}`).join('\n');
  fs.writeFileSync(path.join(changeDir, 'proposal.md'),
    `## Why\n\n${description}\n\n## What Changes\n\n${taskList}\n`
  );

  // tasks.md
  const checkboxes = tasks.map(t => `- [ ] ${t}`).join('\n');
  fs.writeFileSync(path.join(changeDir, 'tasks.md'),
    `## Tasks\n\n${checkboxes}\n`
  );
}
```

#### 2c. `routes/plan.js` POST handler 变更

```
POST /api/plan/:sessionId:
  1. 查 sessions 表获取 session.cwd
  2. 解析 description → tasks[]
  3. detectPlanLocation(cwd, sessionId) → { type, changeDir }
  4. generateOpenSpecChange(changeDir, sessionId, description, tasks)
  5. tasks_path = path.join(changeDir, 'tasks.md')
  6. INSERT INTO session_plans: ..., plan_type, change_dir, tasks_path
  7. 启动文件监听: planWatcher.watch(sessionId, tasks_path, wss)
  8. 返回 { changeName, tasks, planType, changeDir }
```

---

### 3. 文件监听器

新文件 `server/lib/plan-watcher.js`：

```js
const watchers = new Map(); // sessionId → FSWatcher

function watch(sessionId, tasksPath, wss) {
  if (watchers.has(sessionId)) return; // 防重复
  const watcher = fs.watch(tasksPath, { persistent: false }, debounce(200, () => {
    const content = fs.readFileSync(tasksPath, 'utf8');
    const tasks = parseTasks(content); // 复用 routes/plan.js 中的 parseTasks
    broadcast(wss, { type: 'plan_updated', data: { sessionId, tasks } });
  }));
  watcher.on('error', () => unwatch(sessionId));
  watchers.set(sessionId, watcher);
}

function unwatch(sessionId) {
  watchers.get(sessionId)?.close();
  watchers.delete(sessionId);
}
```

`parseTasks` 提取到 `server/lib/openspec-plan.js` 中共享。

**调用点：**
- `routes/plan.js` POST 成功后 → `planWatcher.watch(sessionId, tasksPath, wss)`
- `routes/hooks.js` Stop 事件处理后 → `planWatcher.unwatch(sessionId)`

**已知限制：** 服务器重启后 watcher 不会自动恢复。重启后用户仍可通过手动点击 checkbox 触发更新；外部文件改动的自动推送需等下次 POST /api/plan 才会重新激活。这是 v1 可接受的限制，不在本次实现范围内。

**注意：** `fs.watch()` 在 macOS 上对文件改动可靠；`persistent: false` 确保 watcher 不阻止进程退出。

---

### 4. 审核历史

#### 4a. 新增 API

`routes/review.js`：

```
GET /api/review/:sessionId/history
  → stmts.listReviews(sessionId)
  → 返回 { reviews: ReviewResult[], total: number }
```

#### 4b. `api.ts` 新增

```ts
review: {
  ...existing,
  getHistory: (sessionId: string) =>
    get<{ reviews: ReviewResult[]; total: number }>(
      `/api/review/${sessionId}/history`
    ),
}
```

#### 4c. `ReviewsTab.tsx`（新文件）

```tsx
Props: { sessionId: string }

State:
  reviews: ReviewResult[]
  expandedId: string | null

初始加载: useEffect → api.review.getHistory(sessionId)

WS 订阅: review_ready → prepend 新结果到 reviews 顶部

渲染:
  空状态: "暂无审核记录"
  列表: 每条记录
    [时间戳] [provider/model badge]    [▼/▲ 展开按钮]
    ─────────────────────────────────────────────────
    <MarkdownContent text={review} />  （仅展开时可见）
```

#### 4d. `SessionDetail.tsx` 变更

- 新增 "Reviews" tab
- 导入 `ReviewsTab`
- Tab badge：`reviewCount > 0` 时显示数字角标
- badge 数量来源：`ReviewsTab` 内部维护 `reviews.length` 状态，通过 `onCountChange` 回调传给 `SessionDetail` 更新 tab badge；初始值从 `api.review.getHistory()` 响应的 `total` 字段读取

---

## Testing

**Server：**
- `plan-watcher.test.js`：mock `fs.watch`，验证 debounce + WS broadcast + error 清理
- `openspec-plan.test.js`：验证有/无 `openspec/` 目录时的路径选择 + 文件内容生成
- `routes/plan.test.js`：新增 `plan_type` / `change_dir` 字段断言
- `routes/review.test.js`：新增 `/history` 端点断言

**Client：**
- `ReviewsTab.test.tsx`：mock api + WS，验证列表渲染、prepend、展开/折叠、空状态
- `SessionDetail` 快照：更新基准（新增 Reviews tab）

---

## Risks

- `fs.watch()` 在 Linux/WSL 下对 NFS 挂载目录可能不可靠 → 可接受（本工具目标平台是 macOS）
- `ALTER TABLE` 在旧 DB 上重复执行会报错 → 用 `try/catch` 包裹，列已存在时忽略错误
- slug 中 sessionId 前 8 位碰撞概率极低，但理论上同一天同一项目同一人可能冲突 → 可接受（个人工具）
