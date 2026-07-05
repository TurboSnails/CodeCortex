# Chat 消息展示体验提升 — 设计方案

## 概述

目标：在现有架构基础上，通过精细的视觉和交互打磨，提升聊天消息的展示体验。所有改动均为增量式，不改变数据流，不新增文件。

**范围限定（YAGNI）**：不对会话管理、消息编辑、对话分支、引用等高级功能进行实现。

---

## 改动 1：流式输出体验

### 问题
当前流式输出使用静态 `PulsingDots` + "Claude is thinking…" 文字，流式文本仅有打字机光标，缺少细腻的视觉反馈。

### 方案
- **thinking 阶段**：显示紫色 Sparkles 图标 + "正在思考…" 文字（已有部分）
- **流式文本阶段**：打字机光标 `▍` 在文字末尾闪烁，字符通过 CSS 动画淡入（opacity 0→1，80ms），而非逐字符 React 重绘
- **工具调用阶段**：显示 Wrench 图标 chip（已有）
- **流式输出期间**：底部 streaming indicator 随最新文本块内容动态显示前 40 字符预览，让用户感知正在输出的内容

### 关键文件
- `ChatMessageList.tsx` — `StreamingIndicator` 组件
- `index.css` — 新增 `@keyframes char-fade-in`

---

## 改动 2：代码块交互

### 问题
代码块纯展示，无复制功能；无语言标识。

### 方案
- 代码块顶部右侧增加语言标签 badge（如 `typescript`、`bash`）
- 代码块右上角增加「复制」图标按钮，默认 `opacity-0`，hover 时 `opacity-100`
- 点击复制后按钮变为 checkmark，2 秒后恢复
- 复制逻辑调用 `navigator.clipboard.writeText`

### 关键文件
- `conversation/MarkdownContent.tsx` — 代码块渲染入口
- `index.css` — 复制按钮样式

---

## 改动 3：工具调用卡片

### 问题
工具调用仅显示为中央 chip，信息密度低，失败状态不够突出。

### 方案
- 工具调用从 chip 升级为小卡片：左侧 Wrench 图标，右侧显示工具名称
- 卡片边框颜色：进行中 = `border-amber-500/40`，成功 = `border-green-500/40`，失败 = `border-red-500/60` + 红色背景
- 工具名称支持多工具链的缩进展示（如 `Read → Edit` 成嵌套关系）

### 关键文件
- `ChatMessageList.tsx` — `isToolUseEnvelope` 分支渲染

---

## 改动 4：思维块（thinking）折叠

### 问题
thinking 内容默认展开，占用大量垂直空间，打断对话阅读流。

### 方案
- 思维块默认折叠，显示为：「💭 已隐藏思考过程」（紫色小条）
- hover 或点击展开，内容渐显（300ms ease-out）
- 折叠状态可记忆（session 内）

### 关键文件
- `ThinkingBlock.tsx` — 折叠状态控制
- `ChatMessageList.tsx` — thinking 块渲染入口

---

## 改动 5：消息时间戳

### 问题
消息无时间信息，用户无法感知对话节奏。

### 方案
- 每条消息底部右侧，hover 时显示时间戳（HH:mm 格式）
- 流式输出期间显示开始时间，输出完成后更新为完成时间
- 时间戳文字 `text-gray-600 text-[10px]`

### 关键文件
- `ChatMessageList.tsx` — 用户/助手消息渲染分支

---

## 改动 6：工具结果区域滚动

### 问题
长工具输出被截断或撑破布局。

### 方案
- 工具结果区域超过 240px 最大高度时显示独立滚动条
- 长结果（> 500 字符）默认折叠，显示「展开 N 字符结果」按钮
- 折叠/展开有过渡动画（200ms）

### 关键文件
- `ToolCallBlock.tsx` — 工具结果渲染
- `index.css` — 滚动条样式

---

## 改动 7：滚动守卫（Smart Scroll）

### 问题
当用户向上滚动查看历史时，自动滚动会打断阅读。

### 方案
- 引入滚动位置检测：维护 `isNearBottom` 状态（距离底部 < 100px 时为 true）
- 当 `isNearBottom = true` 时：新消息自动滚动
- 当 `isNearBottom = false` 时：显示「滚动到底部」悬浮按钮，点击后跳转
- 用户主动滚动行为不清除此状态，仅下次新消息时再次判断

### 关键文件
- `ChatMessageList.tsx` — `bottomRef` + `isNearBottom` 状态

---

## 测试策略

- `ChatMessageList` 已有快照测试，修改后运行 `cd client && npx vitest run -u` 更新基准
- 手动测试场景：
  1. 发送一条长代码请求，验证代码块复制按钮
  2. 观察流式输出时的视觉反馈
  3. 向上滚动查看历史，验证不自动跳回
  4. 触发一个耗时工具调用，验证状态颜色

---

## 优先级排序

1. 改动 1（流式体验）— 用户最高感知
2. 改动 2（代码块复制）— 开发日常高频
3. 改动 7（智能滚动）— 显著减少阅读干扰
4. 改动 4（thinking 折叠）— 减少视觉噪音
5. 改动 5（时间戳）— 轻量增强
6. 改动 6（结果滚动）— 解决长输出痛点
7. 改动 3（工具卡片）— 视觉增强
