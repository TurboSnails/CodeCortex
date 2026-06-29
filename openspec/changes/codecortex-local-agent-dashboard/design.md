## Context

目标用户是开发者本人，未来可分享给同事，但每个人都是独立本地安装，没有多租户、没有云端 workspace、没有跨用户 session 隔离的需求。Claude Code 本身不做任何修改或包装；本方案完全通过 hooks 机制非侵入式接入，CC 挂了/UI 挂了互不影响。

项目内已存在 OpenSpec 基础设施（`openspec/schemas/superpowers-bridge-opencode/`），规划层应该复用而不是重建。

## Goals / Non-Goals

**Goals:**
- 通过 hooks 实时捕获 CC 的工具调用、思考流、session 生命周期事件，并在 UI 中可视化
- 支持同时监控多个 CC session
- 提供可跳过的轻量规划引导，复用 OpenSpec 生成 tasks 并在 session 视图中追踪进度
- 提供可选的多模型代码审核，三态全局开关控制触发时机
- 默认只绑定 localhost，远程/移动访问依赖用户自行用 Tailscale 等工具打通，不在本方案范围内重新实现隧道/认证

**Non-Goals:**
- 不包装或 spawn Claude Code 进程（不解析 CLI 的 stdin/stdout 或 NDJSON 协议），因此不涉及 interactive spawn vs Agent SDK 的计费权衡——本方案只是 hooks 的被动监听方
- 不做多用户/多租户支持，不做云端托管 workspace
- 不重新实现 Superpowers 或 OpenSpec 的执行逻辑，只做可视化和触发的薄层
- v1 不做移动原生 App，不做权限请求的远程转发（手机端通过浏览器访问本地网关即可，远程审批留待后续迭代）
- 不内置用户认证系统（本地单机场景下不需要）

## Decisions

### 1. 用 hooks 而不是包装 CLI
**决策**：完全基于 Claude Code 的 hooks（SessionStart / PreToolUse / PostToolUse / Stop）被动接收事件，不 spawn、不解析 CLI 协议。
**理由**：用户已有的 CC 使用方式（无论 interactive 还是脚本调用）完全不受影响；hooks 协议比 CLI 输出格式更稳定；网关挂掉不影响 CC 正常工作，天然满足"失败降级"。
**替代方案**：spawn CC 子进程解析 NDJSON——被否决，因为引入计费路径分歧（`-p`/SDK 走 credit 计费）和协议脆弱性，且与"不改变原生体验"的目标冲突。

### 2. 网关技术栈：Node.js + WebSocket
**决策**：本地网关用 Node.js（Express/Fastify + `ws`），不依赖外部数据库，session 状态保存在内存中。
**理由**：JS/TS 生态下网关和前端可共享类型定义，WebSocket 库成熟；本地单机场景不需要持久化数据库，重启后 session 通过下一次 hook 事件重新注册即可。
**替代方案**：Python/FastAPI——同样可行，但与前端共享类型成本更高，故优先 Node.js。

### 3. Session 身份与事件路由
**决策**：SessionStart hook payload 中的 `session_id` 作为 session 注册表的 key；所有后续 hook 事件携带同一 `session_id`，网关按 session 分组后通过 WebSocket 广播，UI 按 session 订阅。
**理由**：与 CC 原生的 session 概念对齐，不需要额外生成 ID。

### 4. 规划层：轻量引导 + 复用 OpenSpec
**决策**：session 启动时 UI 弹出可跳过的引导卡片；填写后，网关调用 `openspec new change` + 生成 proposal/tasks（参考 `superpowers-bridge-opencode` schema），tasks.md 的状态在 session 侧边栏实时展示并随 CC 执行勾选进度。
**理由**：避免重复造规划轮子，直接用项目里已有的 OpenSpec 工具链；轻量引导（可跳过）平衡了"防止跑偏"和"不增加摩擦"。

### 5. 多模型审核：三态全局开关
**决策**：全局配置（关闭 / 询问 / 自动）持久化在本地配置文件（如 `~/.codecortex/config.json`）。"关闭"需手动点击审核按钮；"询问"在 Stop hook 触发时弹出阻塞确认弹窗；"自动"直接将 git diff 发送给配置的审核模型（Gemini/GPT 等，API key 用户自备）。
**理由**：默认关闭保证不浪费 token、不强加额外延迟；"询问"用阻塞弹窗而非 toast，因为审核与否是有分量的决定，不应被当作可忽略的通知。
**实现要点**：Stop hook 的 `reason` 字段需要过滤——仅在任务真正完成时触发审核流程，排除等待 permission、用户中断等情况。

### 6. 远程/移动访问不自建隧道
**决策**：v1 不实现认证、不实现隧道穿透，网关默认只绑定 `localhost`；需要远程访问时由用户自行用 Tailscale/同等工具打通局域网。
**理由**：自建认证和隧道是显著的安全面和工程量，且与"个人/同事本地安装"的场景不匹配；Tailscale 类工具已经解决得很好。

## Risks / Trade-offs

- **[风险] hooks payload 信息粒度可能不够丰富（如没有完整 diff 内容）** → 缓解：网关在收到 PostToolUse 事件后，直接读取对应 workspace 的 git diff，而不是完全依赖 hook payload
- **[风险] Stop hook 在等待 permission 时触发，导致审核误触发** → 缓解：依据 hook payload 的 `reason`/`stop_hook_active` 等字段过滤，需在实现前以当前 Claude Code 版本验证字段可用性
- **[风险] 网关重启导致内存中的 session 状态丢失** → 缓解：可接受，因为下一次 hook 触发会重新注册 session；历史事件时间线丢失是 v1 的已知限制
- **[风险] 本地网关无认证，一旦通过 Tailscale 等暴露到局域网，同网段内其他设备可访问** → 缓解：文档明确提示默认仅 localhost 绑定，远程访问的访问控制责任交给 Tailscale ACL，不在本方案内置认证
- **[风险] 多模型审核引入外部 API 调用成本和延迟** → 缓解：默认关闭，用户主动选择开启，且需自备 API key

## Migration Plan

无需迁移——这是全新增量能力，不影响任何现有系统或数据。

## Open Questions

- Claude Code 当前版本 hooks payload 的具体字段（尤其 Stop hook 的 `reason`）需要在实现前实测确认
- 规划层生成的 OpenSpec change 应该写入被监控项目自身的 `openspec/` 目录，还是 CodeCortex 工具独立维护的目录——待实现时根据被监控项目是否已有 `openspec/` 决定
- 前端框架（React/Svelte/其他）留待 tasks 阶段细化，不影响本设计的架构决策
