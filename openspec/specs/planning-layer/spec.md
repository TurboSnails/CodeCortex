# planning-layer Specification

## Purpose
TBD - created by archiving change codecortex-local-agent-dashboard. Update Purpose after archive.
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

