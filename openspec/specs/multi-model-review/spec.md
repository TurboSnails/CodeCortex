# multi-model-review Specification

## Purpose
TBD - created by archiving change codecortex-local-agent-dashboard. Update Purpose after archive.
## Requirements
### Requirement: Three-State Review Mode Toggle
系统 SHALL 提供一个全局配置项，控制多模型审核的触发方式，取值为「关闭」「询问」「自动」三态之一，默认值为「关闭」。

#### Scenario: 默认状态为关闭
- **WHEN** 系统首次启动且用户未做任何配置
- **THEN** 审核模式为「关闭」，不会自动触发任何审核行为

#### Scenario: 切换模式立即生效
- **WHEN** 用户在设置中将模式从「关闭」切换为「自动」
- **THEN** 此后所有 session 的 Stop 事件都按「自动」模式的行为处理，无需重启网关

### Requirement: Manual Review Trigger
当审核模式为「关闭」时，用户 SHALL 能够在 session 视图中手动点击按钮触发针对当前 diff 的审核。

#### Scenario: 手动触发审核
- **WHEN** 审核模式为「关闭」，用户点击"审核"按钮
- **THEN** 系统将当前 session 的 git diff 发送给配置的审核模型，并在审核面板展示返回意见

### Requirement: Ask-Before-Review Confirmation
当审核模式为「询问」时，session 触发 Stop hook 且 `last_assistant_message` 未被判定为"提问"时，SHALL 弹出阻塞式确认弹窗询问用户是否审核，而不是静默触发或静默跳过。

注：Claude Code 的 Stop hook payload 不含 `reason` 字段，也没有专门标识"等待权限"的字段（等待权限发生在 PreToolUse 阶段、不会触发 Stop）。判断是否为真正完成，依赖对 `last_assistant_message` 文本的启发式判断（如是否以问号结尾、是否包含"需要确认/请问"等措辞）。

#### Scenario: 完成类消息触发询问
- **WHEN** 审核模式为「询问」，CC 触发 Stop hook，且 `last_assistant_message` 未匹配"提问"启发式规则
- **THEN** UI 弹出阻塞确认弹窗，包含"是"和"否"两个选项

#### Scenario: 提问类消息不弹出询问
- **WHEN** 审核模式为「询问」，CC 触发 Stop hook，且 `last_assistant_message` 匹配"提问"启发式规则（如以问号结尾）
- **THEN** 不弹出审核询问弹窗

### Requirement: Automatic Review Trigger
当审核模式为「自动」时，session 触发 Stop hook 且 `last_assistant_message` 未被判定为"提问"时，SHALL 自动将 diff 发送审核，无需用户任何操作，审核结果到达后展示在审核面板。

#### Scenario: 自动审核触发
- **WHEN** 审核模式为「自动」，CC 触发 Stop hook，且 `last_assistant_message` 未匹配"提问"启发式规则
- **THEN** 系统自动调用配置的审核模型并在审核面板展示结果，不打断用户当前操作

### Requirement: Review Result Display
审核结果 SHALL 在专门的审核面板中展示，包含审核模型的名称和具体意见文本，且不影响 CC 的执行状态。

#### Scenario: 展示审核意见
- **WHEN** 审核模型返回结果
- **THEN** 审核面板显示该模型的名称和完整意见文本，用户可以选择忽略或据此手动调整代码

