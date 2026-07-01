# session-monitor Specification

## Purpose
定义 dashboard 对多 session 的实时监控视图：提供 session 列表卡片（状态、工作目录）和单个 session 详情页（工具调用序列、思考流、文件 diff），并保证切换查看的 session 不会影响其他 session 的事件接收。
## Requirements
### Requirement: Single Session Detail View
UI SHALL 提供单个 session 的详情视图，实时展示工具调用序列、思考流文本片段、以及文件变更的 diff。

#### Scenario: 工具调用实时展示
- **WHEN** CC 执行一次工具调用（如 Edit、Bash）
- **THEN** session 详情视图在事件到达后立即追加显示该工具调用的名称和关键参数

#### Scenario: 文件变更 diff 展示
- **WHEN** PostToolUse 事件对应一次文件写入操作
- **THEN** UI 读取对应工作目录的 git diff 并在详情视图中渲染变更内容

### Requirement: Multi-Session List View
UI SHALL 提供一个多 session 列表视图，以卡片形式并列展示所有当前注册的 session，每张卡片显示 session 状态（运行中/等待/已停止）和工作目录。

#### Scenario: 新 session 出现在列表中
- **WHEN** 一个新的 CC session 触发 SessionStart
- **THEN** 多 session 列表视图中出现一张新卡片，无需手动刷新

#### Scenario: session 状态变化反映在卡片上
- **WHEN** 某个 session 触发 Stop hook
- **THEN** 对应卡片的状态从"运行中"更新为"已停止"

### Requirement: Session Selection Without Disruption
用户 SHALL 能够从多 session 列表中选择查看任意一个 session 的详情，切换查看的 session 不影响其他 session 的事件持续接收和记录。

#### Scenario: 切换查看的 session
- **WHEN** 用户在列表中点击另一个 session 卡片
- **THEN** 详情视图切换到该 session 的事件流，原 session 在后台继续接收事件且不丢失数据

