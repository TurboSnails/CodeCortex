# CodeCortex Planning & Review Improvements

**Date:** 2026-07-01
**Status:** Approved

## Context

CodeCortex 的规划层（task group 4）和多模型审核层（task group 5）已完成 v1 实现，但存在三处已知缺口：

1. 规划层生成的 tasks 存储在 `~/.codecortex/plans/`，与 OpenSpec 工具链完全脱节，无法被 `/opsx:apply` 识别
2. tasks.md 在被外部修改（如用户直接编辑、CC 修改）后，UI 侧边栏不会自动刷新，需手动操作
3. 多模型审核只展示最新结果，历史审核被覆盖无从回溯

本 spec 补全这三处缺口，不引入其他变更。

## Goals / Non-Goals

**Goals:**
- 当被监控项目目录下存在 `openspec/` 时，规划层直接在该项目的 `openspec/changes/` 目录生成标准 change 文件结构（**shallow files**：生成可读、可被 OpenSpec CLI 发现的目录结构，但不保证能被 `/opsx:apply` 直接消费——如果需要消费，用户需自行补全 `## What Changes` 段落）
- 当被监控项目无 `openspec/` 时，回退到 `~/.codecortex/plans/` 当前行为（向后兼容）
- tasks.md 被任意外部修改后，dashboard UI 侧边栏自动刷新，无需用户手动操作
- 在 SessionDetail 新增 "Reviews" 标签页，支持分页加载（无限滚动），展示该 session 的全部历史审核结果
- `plan-watcher` 在 server 进程退出时清理所有 watcher

**Non-Goals:**
- 不自动打勾（不通过 CC PostToolUse 事件推断任务完成，那属于 AI 匹配，误判率高）
- 不改变现有 `/opsx:apply` 或 OpenSpec CLI 的行为
- 不做跨 session 的审核聚合视图
- 不在 spec 中描述 `/opsx:apply` 工作流（shallow 集成下用户自行决定）

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
- `plans_dir` 列保留，含义不变（指向 `~/.codecortex/plans` 全路径）

**`session_reviews` 表无需改动**（已有 `id, session_id, provider, model, review, created_at`）。

新增 DB stmt：
```js
listReviews: db.prepare(
  'SELECT * FROM session_reviews WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'
)
```

**分页约定：**
- `LIMIT` 默认 20，最大 50
- `OFFSET` 默认 0
- response 包含 `total`（全表计数）和 `hasMore`（`offset + limit < total`）

---

### 2. OpenSpec 集成

#### 2a. 位置探测逻辑

新文件 `server/lib/openspec-plan.js`：

```js
function detectPlanLocation(cwd, sessionId) {
  const openspecDir = path.join(cwd, 'openspec');
  if (fs.existsSync(openspecDir)) {
    const slug = makeSlug(sessionId);
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

**`makeSlug(sessionId)`:**
```
<YYYY-MM-DD>-codecortex-<sessionId前8位>-<sessionId后4位hash base36>
```
hash 段防止同项目同日的 sessionId 前 8 位碰撞（应对 v1 用户的潜在冲突）。

#### 2b. 文件生成逻辑

```js
function generateOpenSpecChange(changeDir, sessionId, description, tasks) {
  fs.mkdirSync(changeDir, { recursive: true });
  const changeName = path.basename(changeDir);
  const today = new Date().toISOString().slice(0, 10);

  // .openspec.yaml
  fs.writeFileSync(path.join(changeDir, '.openspec.yaml'),
    `schema: spec-driven\ncreated: ${today}\nsession_id: ${sessionId}\n`
  );

  // proposal.md — shallow format; ## What Changes 是 task 列表而非 capability 列表
  const taskList = tasks.map(t => `- ${t}`).join('\n');
  fs.writeFileSync(path.join(changeDir, 'proposal.md'),
    `## Why\n\n${description}\n\n## What Changes\n\n${taskList}\n`
  );

  // tasks.md — 复用 v1 header 格式（# Plan: <changeName>），保证老 row 的 fallback 解析路径也能工作
  const checkboxes = tasks.map(t => `- [ ] ${t}`).join('\n');
  fs.writeFileSync(path.join(changeDir, 'tasks.md'),
    `# Plan: ${changeName}\n\n${checkboxes}\n`
  );
}
```

**关键决策：tasks.md 复用 v1 header。** 原因是 v1 写 `tasks.md` 时用 `# Plan: <changeName>` 头，v2 standalone 模式下读老 row 的 fallback 路径也会读到这个头——保持一致让 `readTasksFromFile` 的 regex 永远只关心 `- [ ] ...` 行，**不依赖 header**。`parseTasks` 是写时用、读时不用，所以这个改动只影响生成侧。

#### 2c. `routes/plan.js` POST handler 变更

```
POST /api/plan/:sessionId:
  1. 查 sessions 表获取 session.cwd
  2. 解析 description → tasks[]
  3. detectPlanLocation(cwd, sessionId) → { type, changeDir }
  4. generateOpenSpecChange(changeDir, sessionId, description, tasks)
  5. tasks_path = path.join(changeDir, 'tasks.md')
  6. INSERT INTO session_plans: (session_id, change_name, plans_dir, plan_type, change_dir, created_at)
  7. 启动文件监听: planWatcher.watch(sessionId, tasks_path, wss)
  8. 返回 { changeName, tasks, planType, changeDir }
```

---

### 3. 文件监听器

新文件 `server/lib/plan-watcher.js`：

```js
const fs = require("fs");
const { broadcast: defaultBroadcast } = require("../websocket");
const { parseTasksFromFileContent } = require("./openspec-plan");

const watchers = new Map(); // sessionId → { watcher, timer }

// Internal: register a watcher with a custom broadcast fn (for tests).
// Public callers (routes/plan.js) use watch() which defaults to websocket.broadcast.
function watchWith(sessionId, tasksPath, broadcastFn) {
  if (watchers.has(sessionId)) return; // 防重复

  let timer = null;
  const watcher = fs.watch(tasksPath, { persistent: false }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      // Re-check session is still watched (could have been unwatched during debounce)
      if (!watchers.has(sessionId)) return;
      const content = fs.readFileSync(tasksPath, "utf8");
      const tasks = parseTasksFromFileContent(content);
      broadcastFn("plan_updated", { sessionId, tasks });
    }, 200);
  });

  watcher.on("error", () => unwatch(sessionId));
  watchers.set(sessionId, { watcher, getTimer: () => timer });
}

function watch(sessionId, tasksPath) {
  watchWith(sessionId, tasksPath, defaultBroadcast);
}

function unwatch(sessionId) {
  const entry = watchers.get(sessionId);
  if (!entry) return;
  try { entry.watcher.close(); } catch {}
  watchers.delete(sessionId);
}

function unwatchAll() {
  for (const sessionId of [...watchers.keys()]) {
    unwatch(sessionId);
  }
}

module.exports = { watch, watchWith, unwatch, unwatchAll };
```

`parseTasksFromFileContent` 提取到 `server/lib/openspec-plan.js` 中共享。

**调用点：**
- `routes/plan.js` POST 成功后 → `planWatcher.watch(sessionId, tasksPath)`
- `routes/hooks.js` Stop 事件处理后 → `planWatcher.unwatch(sessionId)`
- `server/index.js` 进程退出 handler → `planWatcher.unwatchAll()`

**已知限制：** 服务器重启后 watcher 不会自动恢复。重启后用户仍可通过手动点击 checkbox 触发更新；外部文件改动的自动推送需等下次 POST /api/plan 才会重新激活。这是 v1 可接受的限制，不在本次实现范围内。

**注意：** `fs.watch()` 在 macOS 上对文件改动可靠；`persistent: false` 确保 watcher 不阻止进程退出。

---

### 4. 审核历史

#### 4a. 新增 API

`routes/review.js`：

```
GET /api/review/:sessionId/history?offset=0&limit=20
  → 参数校验：offset >= 0, 1 <= limit <= 50（默认 offset=0, limit=20）
  → stmts.listReviews(sessionId, limit, offset)
  → total = db.prepare('SELECT COUNT(*) FROM session_reviews WHERE session_id = ?').get(sessionId).count
  → hasMore = (offset + reviews.length) < total
  → 返回 { reviews: ReviewResult[], total: number, hasMore: boolean }
```

**route ordering 重要**：`/history` 必须在 `/:sessionId` 之前注册。

**response 格式：**
```ts
{
  reviews: ReviewResult[],   // 降序，最新在前
  total: number,             // 全表计数
  hasMore: boolean           // offset + reviews.length < total
}
```

#### 4b. `api.ts` 新增

```ts
review: {
  ...existing,
  getHistory: (sessionId: string, opts?: { offset?: number; limit?: number }) =>
    get<ReviewHistoryResponse>(
      `/api/review/${sessionId}/history?${new URLSearchParams({
        offset: String(opts?.offset ?? 0),
        limit: String(opts?.limit ?? 20),
      })}`
    ),
}
```

#### 4c. `ReviewsTab.tsx`（新文件）

```tsx
Props: { sessionId: string; onCountChange?: (n: number) => void }

State:
  reviews: ReviewResult[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  total: number
  expandedId: number | null
  lastEmittedCount: number (useRef)

初始加载: useEffect → api.review.getHistory(sessionId, { offset: 0, limit: 20 })
  → 成功: setReviews + setTotal + setHasMore
  → onCountChange 仅在 lastEmittedCount !== total 时触发（去重）

分页加载: 监听 sentinel ref 的 IntersectionObserver
  → api.review.getHistory(sessionId, { offset: reviews.length, limit: 20 })
  → append (注意去重，按 id)

WS 订阅: review_ready → setReviews((prev) => {
    const next = [newReview, ...prev];
    emitCountIfChanged(next.length); // 用 ref 去重
    return next;
  });

emitCountIfChanged(n) {
  if (lastEmittedCount.current !== n) {
    lastEmittedCount.current = n;
    onCountChange?.(n);
  }
}

渲染:
  空状态: "暂无审核记录"
  列表: 每条记录
    [时间戳] [provider/model badge]    [▼/▲ 展开按钮]
    ─────────────────────────────────────────────────
    <MarkdownContent text={review} />  （仅展开时可见）
  底部 sentinel: <div ref={sentinelRef} /> 触发加载更多
  loadingMore: spinner
  !hasMore: "已加载全部 N 条"
```

**关键修复：**
- 删掉 `useEffect(() => onCountChange?.(reviews.length), [reviews.length])`——这是 H1 修复点，也是 M2 重复 emit 的根源
- WS handler 用 setState callback 在内部 emit count，避免 stale closure

#### 4d. `SessionDetail.tsx` 变更

- 新增 "Reviews" tab
- 导入 `ReviewsTab`
- Tab badge：`reviewCount > 0` 时显示数字角标
- badge 数量来源：`ReviewsTab` 内部用 ref 去重 emit；`SessionDetail` 仅在 onCountChange 触发时更新 `reviewCount` state

---

## Testing

**Server：**
- `plan-watcher.test.js`：mock `fs.watch`，验证 debounce + WS broadcast + error 清理 + `unwatchAll`
- `openspec-plan.test.js`：验证有/无 `openspec/` 目录时的路径选择 + 文件内容生成 + slug 唯一性
- `routes/plan.test.js`：新增 `plan_type` / `change_dir` 字段断言；保留所有老 v1 测试（确保 backward compat 路径通过）
- `routes/review.test.js`：新增 `/history` 端点断言（空列表、单页、多页、hasMore 边界）

**Client：**
- `ReviewsTab.test.tsx`：mock api + WS，验证列表渲染、prepend、去重 emit、展开/折叠、空状态、分页加载、滚动到 sentinel 触发下一页
- `SessionDetail` 快照：更新基准（新增 Reviews tab）

---

## Risks

- `fs.watch()` 在 Linux/WSL 下对 NFS 挂载目录可能不可靠 → 可接受（本工具目标平台是 macOS）
- `ALTER TABLE` 在旧 DB 上重复执行会报错 → 用 `try/catch` 包裹，列已存在时忽略错误
- slug 碰撞已通过 hash 后缀缓解，但理论同秒+同 sessionId 前 8 位仍可能冲突 → 极低概率，个人工具可接受
- 无限滚动在用户快速滚到底部时可能触发多次请求 → 用 `loadingMore` 状态做并发门控
- `unwatchAll` 若在 in-flight 回调期间调用，watcher 已被 close 但 `setTimeout` 仍会 fire → 在 callback 内检查 `watchers.has(sessionId)` 再 emit
