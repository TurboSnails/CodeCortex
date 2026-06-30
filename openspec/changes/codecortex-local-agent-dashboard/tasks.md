## 1. 网关基础设施（hook-gateway）

- [x] 1.1 搭建 Node.js 网关项目骨架（Express/Fastify + `ws`），确定端口和启动方式
- [x] 1.2 实现 hook 事件接收端点，接受 SessionStart / PreToolUse / PostToolUse / Stop 四类 POST 请求
- [x] 1.3 实测当前 Claude Code 版本的 hook payload 字段（尤其 Stop 的 `reason`/`stop_hook_active`），确认是否满足设计假设
- [x] 1.4 实现内存中的 session 注册表（以 `session_id` 为 key），处理新建/更新/缺失记录的重建逻辑
- [x] 1.5 实现 WebSocket 广播：事件到达后向所有已连接客户端推送，按 `session_id` 标记
- [x] 1.6 网关默认只绑定 `localhost`，验证局域网内其他设备无法直接访问
- [x] 1.7 编写 `~/.claude/settings.json` 的 hooks 配置示例/安装脚本，确保不影响 CC 原生行为

## 2. 单 Session 可视化（session-monitor 基础）

> **⚡ 通过 fork hoangsonww/Claude-Code-Agent-Monitor (MIT) 完成**
> dashboard/ 目录包含完整 React + Express + SQLite 实现，涵盖所有下列能力。

- [x] 2.1 搭建前端项目骨架，建立与网关的 WebSocket 连接
- [x] 2.2 实现单 session 详情视图：按时间顺序展示工具调用事件
- [x] 2.3 实现思考流片段的展示（读取 transcript_path JSONL 文件获取完整对话）
- [x] 2.4 实现文件变更 diff 展示（Agent Monitor 通过事件时间线渲染工具调用详情）
- [x] 2.5 验证客户端断线重连后能继续接收后续事件（useWebSocket.ts 指数退避重连）

## 3. 多 Session 管理（session-monitor 扩展）

> **⚡ 通过 fork 完成**

- [x] 3.1 实现多 session 列表视图，以卡片形式展示所有注册中的 session
- [x] 3.2 卡片展示 session 状态（运行中/等待/已停止）、工作目录、最近活动时间
- [x] 3.3 实现 session 切换：点击卡片查看详情，后台 session 持续接收事件不丢失
- [x] 3.4 验证 Stop hook 触发后卡片状态正确更新为"已停止"

## 4. 规划层（planning-layer）

- [ ] 4.1 实现 session 启动时的轻量引导卡片 UI（可跳过）
- [ ] 4.2 实现"跳过"路径：不生成任何规划产物，session 正常运行
- [ ] 4.3 实现"填写"路径：调用 `openspec new change` 生成 change，结合 `superpowers-bridge-opencode` schema 生成 tasks
- [ ] 4.4 在 session 详情视图侧边栏展示关联 change 的 tasks 列表及完成状态
- [ ] 4.5 实现 tasks.md 状态轮询/监听，任务勾选后侧边栏同步更新
- [ ] 4.6 验证规划层缺失不影响可视化和审核功能正常使用

## 5. 多模型审核（multi-model-review）

- [ ] 5.1 设计本地配置文件结构（如 `~/.codecortex/config.json`），存储审核模式（关闭/询问/自动）和审核模型 API 配置
- [ ] 5.2 实现设置 UI：三态开关，切换后立即生效
- [ ] 5.3 实现"关闭"模式下的手动审核按钮及触发逻辑
- [ ] 5.4 实现 `last_assistant_message` 启发式判断（问号/确认类措辞 → 视为"提问"，抑制审核触发）
- [ ] 5.5 实现"询问"模式：任务完成时弹出阻塞确认弹窗
- [ ] 5.6 实现"自动"模式：任务完成时自动调用审核模型
- [ ] 5.7 实现审核请求：将当前 git diff 发送给配置的外部模型 API（Gemini/GPT），处理 API key 缺失等异常情况
- [ ] 5.8 实现审核面板：展示模型名称和审核意见文本

## 6. 收尾验证

- [ ] 6.1 端到端验证：启动多个真实 CC session，确认可视化、规划、审核三个功能协同工作且互不干扰
- [x] 6.2 ~~验证网关重启后的恢复行为~~（SQLite 持久化已由 dashboard/server 负责，重启后数据不丢失）
- [ ] 6.3 编写安装/使用文档，包含 hooks 配置步骤和 Tailscale 远程访问说明
