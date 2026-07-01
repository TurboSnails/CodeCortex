# planning-layer Specification

## Purpose
定义 CodeCortex 规划层的行为：在 session 启动时提供可选的规划引导，根据项目是否具备 `openspec/` 目录选择 OpenSpec change 路径或 standalone 回退路径生成 tasks，并在外部修改 `tasks.md` 后通过文件监听自动同步到 UI。
## Requirements
### Requirement: Optional Planning Prompt on Session Start
UI SHALL 在检测到新 session 启动时展示一个可跳过的轻量规划引导卡片，提示用户简要描述任务目标；用户可以选择填写或直接跳过进入正常 session。

#### Scenario: 用户跳过规划
- **WHEN** 引导卡片出现，用户点击"直接开始"
- **THEN** session 正常运行，不生成任何规划产物，后续也不再为同一 session 重复弹出引导

#### Scenario: 用户填写任务描述
- **WHEN** 用户在引导卡片中输入任务描述并提交
- **THEN** 系统基于该描述生成一个 OpenSpec change（复用 `openspec new change` 流程），并将生成的 tasks 关联到当前 session

### Requirement: Task Progress Sidebar
当一个 session 关联了 OpenSpec tasks 时，session 详情视图 SHALL 在侧边栏展示该 change 的 tasks 列表及完成状态。

#### Scenario: 任务列表展示
- **WHEN** session 已关联一个 OpenSpec change
- **THEN** 侧边栏显示该 change 的 tasks.md 中所有任务项及其完成/未完成状态

#### Scenario: 任务状态更新
- **WHEN** tasks.md 中某个任务项被标记为完成
- **THEN** 侧边栏对应任务项在下一次刷新时显示为已完成，无需用户手动同步

### Requirement: No Forced Planning
系统 SHALL NOT 阻止用户在未填写规划的情况下启动或继续 session；规划层始终是可选的增强，不是前置门槛。

#### Scenario: 跳过规划后仍可正常使用其他功能
- **WHEN** 用户跳过了规划引导
- **THEN** 该 session 仍然完整享受可视化监控和多模型审核功能，不受规划层缺失的影响

### Requirement: OpenSpec-Aware Plan Location Detection
规划层 SHALL 在创建 plan 时探测 session 的 cwd；若 cwd 下存在 `openspec/` 目录，规划层 MUST 将 plan 写入该目录的 `openspec/changes/<slug>/` 子目录（`type=openspec`），否则 MUST 回退到 `~/.codecortex/plans/<sessionId>/`（`type=standalone`），保证向后兼容。

#### Scenario: cwd 含 openspec/ 目录时使用 OpenSpec 路径
- **WHEN** session 的 cwd 下存在 `openspec/` 目录，POST `/api/plan/:sessionId` 被调用
- **THEN** 系统在 `<cwd>/openspec/changes/<slug>/` 下生成 `.openspec.yaml` + `proposal.md` + `tasks.md`，并把 `session_plans` 行的 `plan_type` 写为 `openspec`、`change_dir` 写为该目录的绝对路径

#### Scenario: cwd 不含 openspec/ 目录时回退到 standalone
- **WHEN** session 的 cwd 下不存在 `openspec/` 目录
- **THEN** 系统在 `~/.codecortex/plans/<sessionId>/` 下生成 tasks.md，并把 `session_plans` 行的 `plan_type` 写为 `standalone`、`change_dir` 写为该目录的绝对路径

### Requirement: Standard OpenSpec Change File Generation
当 `plan_type=openspec` 时，规划层 MUST 生成标准 OpenSpec change 目录布局：`.openspec.yaml`（含 `schema: spec-driven`、当天 `created` 日期、`session_id` 字段）、`proposal.md`（含 `## Why` + 描述 + `## What Changes` + 任务列表）、`tasks.md`（含 `# Plan: <changeName>` v1 兼容 header + checkbox 任务列表）。`tasks.md` 头部 MUST 沿用 v1 的 `# Plan:` 格式以保证 legacy 回退解析路径可读。

#### Scenario: openspec 模式下三个文件全部生成
- **WHEN** 规划层在 `plan_type=openspec` 模式下生成 change
- **THEN** `.openspec.yaml`、`proposal.md`、`tasks.md` 三个文件均存在且内容符合上述结构

#### Scenario: changeDir 不存在时递归创建
- **WHEN** 目标 changeDir 路径包含不存在的中间目录
- **THEN** 系统 MUST 通过 `fs.mkdirSync({ recursive: true })` 递归创建后再写文件，操作 MUST NOT 失败

### Requirement: Slug Uniqueness Per Session Per Day
规划层 MUST 使用 slug 格式 `YYYY-MM-DD-codecortex-<sessionId 前 8 字符>-<4 字符 base36 hash>`（其中 hash 由完整 sessionId 派生）来命名 OpenSpec change 目录，以保证同一天同一项目下不同 sessionId 不会冲突（即使前 8 字符相同）。

#### Scenario: 不同 sessionId 产生不同 slug
- **WHEN** 两个 sessionId 前 8 字符相同但后续字符不同（例如 `aaaaaaaa-1111` 与 `aaaaaaaa-2222`）
- **THEN** 系统 MUST 为它们生成不同的 slug

#### Scenario: 相同 sessionId 在不同日期产生不同 slug
- **WHEN** 同一 sessionId 在不同日期调用
- **THEN** 系统 MUST 在 slug 的日期部分反映当天日期

### Requirement: External tasks.md Modification Auto-Sync
规划层 MUST 在 `POST /api/plan/:sessionId` 成功后启动 `fs.watch` 监听生成的 `tasks.md` 文件（`persistent: false`）。当文件被任意外部修改（用户手动编辑、CC 修改、其它工具修改）时，服务器 MUST 在 200ms debounce 后重新解析 checkbox 行，并通过 WebSocket 向所有已连接客户端广播 `{ type: "plan_updated", data: { sessionId, tasks } }` 事件，UI 侧边栏据此自动刷新，无需用户手动操作。

#### Scenario: 外部勾选 task 触发自动刷新
- **WHEN** `tasks.md` 中某个 `- [ ]` 被外部改为 `- [x]`
- **THEN** 服务器 MUST 在 200ms 内广播 `plan_updated` 事件，且事件 payload 中该 task 的 `done` 字段为 `true`

#### Scenario: 同一 sessionId 不注册重复 watcher
- **WHEN** 对同一 sessionId 多次调用 `planWatcher.watch`
- **THEN** 第二次及之后的调用 MUST 是 no-op，不创建新的 FSWatcher

#### Scenario: Stop hook 后停止监听
- **WHEN** 触发 session 的 Stop hook
- **THEN** 系统 MUST 调用 `planWatcher.unwatch(sessionId)` 关闭对应的 FSWatcher，避免资源泄漏

#### Scenario: 文件被删除时 self-clean
- **WHEN** 监听的 `tasks.md` 文件被外部删除或被 teardown 流程清理
- **THEN** 系统 MUST 静默 unwatch 自身而非抛出未捕获异常

### Requirement: Legacy Plan Path Fallback
对于在本次实现之前已存在的 `session_plans` 行（`change_dir IS NULL`），GET/PATCH `/api/plan/:sessionId` MUST 回退到 `<plans_dir>/<session_id>/tasks.md` 路径读取和修改，保证旧数据可读。

#### Scenario: legacy 行使用 plans_dir 拼接路径
- **WHEN** 读取的 `session_plans` 行 `change_dir` 为 NULL
- **THEN** 系统 MUST 使用 `path.join(plan.plans_dir, plan.session_id, 'tasks.md')` 作为文件路径
