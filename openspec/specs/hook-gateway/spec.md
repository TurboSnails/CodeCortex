# hook-gateway Specification

## Purpose
定义 Claude Code 与 dashboard 之间的本地 hook 接入契约：在不侵入 CC 进程的前提下，接收 SessionStart / PreToolUse / PostToolUse / Stop 等事件，维护 session 注册表，并通过 WebSocket 实时广播给 UI。
## Requirements
### Requirement: Hook Event Ingestion
网关 SHALL 暴露一个本地 HTTP 端点，接收 Claude Code 的 hooks 事件（SessionStart、PreToolUse、PostToolUse、Stop），且不修改或拦截 Claude Code 进程本身。

#### Scenario: 接收 SessionStart 事件
- **WHEN** Claude Code 启动一个新 session 并触发 SessionStart hook
- **THEN** 网关接收到事件并在 session 注册表中创建一条新记录，记录 `session_id` 和工作目录

#### Scenario: 网关未运行时 Claude Code 不受影响
- **WHEN** 网关进程未启动或已崩溃，CC 触发任意 hook
- **THEN** CC 的正常执行不受阻塞或影响（hook 调用失败被静默处理）

### Requirement: Session Registry
网关 SHALL 在内存中维护一个 session 注册表，以 `session_id` 为 key，记录 session 的状态（运行中/已停止）、工作目录、最近事件时间戳。

#### Scenario: 多个 session 并发注册
- **WHEN** 两个独立的 CC session 几乎同时触发 SessionStart
- **THEN** 网关在注册表中创建两条独立记录，互不覆盖

#### Scenario: 网关重启后状态重建
- **WHEN** 网关进程重启，此前注册的 session 记录全部丢失
- **THEN** 后续到达的 hook 事件（如 PostToolUse）会基于其 `session_id` 在注册表中重新创建记录，而不是报错

### Requirement: Real-time Event Broadcast
网关 SHALL 通过 WebSocket 将接收到的 hook 事件实时广播给所有已连接的 UI 客户端，事件需携带 `session_id` 以便客户端按 session 过滤。

#### Scenario: UI 客户端接收实时事件
- **WHEN** CC 触发 PostToolUse hook，网关接收到事件
- **THEN** 所有已连接的 WebSocket 客户端在 1 秒内收到该事件的广播消息

#### Scenario: 客户端断线重连
- **WHEN** UI 客户端的 WebSocket 连接断开后重新连接
- **THEN** 网关接受新连接并继续推送后续事件，不要求重放历史事件

### Requirement: Localhost-only Binding
网关 SHALL 默认只绑定 `localhost`，不暴露到所有网络接口，远程访问由用户自行通过 VPN/隧道工具实现。

#### Scenario: 默认绑定行为
- **WHEN** 网关以默认配置启动
- **THEN** 网关只监听 `127.0.0.1`，局域网内其他设备无法直接通过 IP 访问

