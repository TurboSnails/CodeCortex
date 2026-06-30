## Why

CodeCortex 的规划层（task group 4）和多模型审核层（task group 5）已完成 v1，但有三处缺口：
规划层生成的 plans 存储在 `~/.codecortex/plans/`，与 OpenSpec 工具链脱节；tasks.md 被外部修改后 dashboard 侧边栏不会自动刷新；多模型审核只展示最新结果、历史被覆盖。本次补全这三处缺口。

## What Changes

- **OpenSpec 集成**：规划层在 `POST /api/plan/:sessionId` 时探测 session cwd；存在 `openspec/` 时，在 `<cwd>/openspec/changes/<slug>/` 生成标准 change 文件结构（`.openspec.yaml` + `proposal.md` + `tasks.md`），否则回退到 `~/.codecortex/plans/<sessionId>/`（向后兼容）。
- **tasks.md 自动同步**：服务器在 plan 创建后启动 `fs.watch` 监听 `tasks.md`；任何外部修改（debounce 200ms）会重新解析 checkbox 行并通过 WebSocket 广播 `plan_updated` 事件给所有已连接客户端。
- **审核历史**：新增 `GET /api/review/:sessionId/history` 端点分页返回该 session 全部历史审核结果（limit 1-50, offset ≥ 0），并在 SessionDetail 新增 `ReviewsTab` 标签页列出历史结果（时间戳、provider/model badge、可展开 markdown 内容）。

## Capabilities

### New Capabilities

无新增顶层 capability。本次实现是对现有 capability 的增量补全。

### Modified Capabilities

- `planning-layer`：新增 OpenSpec 集成（位置探测 + 标准文件生成）、tasks.md 外部改动自动同步（fs.watch + WS 广播）。
- `multi-model-review`：新增审核历史 API（`/history` 端点）和 SessionDetail 内的 ReviewsTab 展示。

## Impact

**Server（dashboard/server/）：**
- 新增 `lib/openspec-plan.js`：`toSlug`/`makeSlug`/`parseTasks`/`parseTasksFromFileContent`/`detectPlanLocation`/`generateOpenSpecChange`。
- 新增 `lib/plan-watcher.js`：`watch`/`unwatch` 包装 `fs.watch` + 200ms debounce + WS 广播。
- `db.js`：`session_plans` 表新增 `plan_type` (`openspec` | `standalone`) 和 `change_dir` 列；`session_reviews` 新增 `listReviews`（分页）和 `countReviews`（总数）预编译语句。
- `routes/plan.js`：POST handler 改用 `detectPlanLocation` + `generateOpenSpecChange`，写入新字段并启动 `planWatcher.watch`。
- `routes/hooks.js`：Stop 事件处理后调用 `planWatcher.unwatch(sessionId)`。
- `routes/review.js`：新增 `GET /:sessionId/history` 端点。

**Client（dashboard/client/）：**
- `lib/types.ts`：新增 `ReviewHistoryResponse` 类型。
- `lib/api.ts`：`api.review.getHistory(sessionId)` 新增。
- `src/components/ReviewsTab.tsx`：新组件，初始加载 + WS `review_ready` 订阅 + 列表渲染 + 展开/折叠。
- `src/pages/SessionDetail.tsx`：新增 "Reviews" tab，整合 `ReviewsTab` + badge 显示审核总数。

**Test：**
- `server/__tests__/openspec-plan.test.js`：覆盖 `parseTasks` / `parseTasksFromFileContent` / `toSlug` / `makeSlug` / `detectPlanLocation` / `generateOpenSpecChange`。
- `server/__tests__/plan-watcher.test.js`：覆盖 broadcast、debounce、duplicate guard、unwatch。
- `server/__tests__/plan.test.js`、`server/__tests__/review.test.js`：新增字段和 `/history` 端点断言。
- `client/src/components/__tests__/ReviewsTab.test.tsx`：覆盖列表渲染、prepend、展开/折叠、空状态。
- `client/src/pages/__tests__/screens.snapshot.test.tsx.snap`：更新基准。
