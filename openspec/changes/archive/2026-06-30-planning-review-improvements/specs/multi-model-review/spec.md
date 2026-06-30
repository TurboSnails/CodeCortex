## ADDED Requirements

### Requirement: Review History API Endpoint
系统 SHALL 提供 `GET /api/review/:sessionId/history` 端点，按 `created_at DESC` 顺序分页返回该 session 的全部历史审核结果。响应 payload 形如 `{ reviews: ReviewResult[], total: number }`，其中 `ReviewResult` 包含 `id` / `model` / `review` / `createdAt` 四个字段。

#### Scenario: 默认分页参数返回前 20 条
- **WHEN** 调用 `GET /api/review/:sessionId/history` 不传 `limit` / `offset`
- **THEN** 系统 MUST 使用 `limit=20` 返回按 `created_at` 降序排列的最新 20 条审核记录，并返回 `total` 字段为该 session 的总审核记录数

#### Scenario: limit/offset 显式传入
- **WHEN** 调用 `GET /api/review/:sessionId/history?limit=10&offset=20`
- **THEN** 系统 MUST 跳过最新 20 条并返回接下来的 10 条（`OFFSET 20 LIMIT 10`）

#### Scenario: limit 边界约束
- **WHEN** 调用 `GET /api/review/:sessionId/history?limit=0` 或 `?limit=999`
- **THEN** 系统 MUST 把 limit clamp 到 `[1, 50]` 区间内

#### Scenario: 非法 limit/offset 返回 400
- **WHEN** 调用 `GET /api/review/:sessionId/history?limit=abc` 或 `?offset=-1`（导致 NaN）
- **THEN** 系统 MUST 返回 400 状态码和错误消息

### Requirement: Review History UI Tab
SessionDetail SHALL 提供一个名为 "Reviews" 的 tab 标签页，集中展示该 session 的全部历史审核结果。tab badge MUST 在审核总数 > 0 时显示数字角标（数字来自 `api.review.getHistory()` 响应中的 `total` 字段）。

#### Scenario: ReviewsTab 初始加载
- **WHEN** 用户切换到 "Reviews" tab
- **THEN** 组件 MUST 通过 `api.review.getHistory(sessionId)` 拉取历史数据并渲染；若返回空数组，组件 MUST 显示 "暂无审核记录" 空状态

#### Scenario: 实时订阅新审核
- **WHEN** WebSocket 推送 `review_ready` 事件
- **THEN** ReviewsTab MUST 把新结果 prepend 到列表顶部并自增审核总数

#### Scenario: 列表项展开/折叠
- **WHEN** 用户点击列表项的展开/折叠按钮
- **THEN** 该条目的 markdown 内容 MUST 切换显示/隐藏；其它已展开项 MUST 互不影响

#### Scenario: tab badge 显示审核数量
- **WHEN** session 已有 N 条（N>0）审核记录
- **THEN** SessionDetail 的 Reviews tab MUST 在 tab 标题处显示数字 N 角标

## REMOVED Requirements

无。
