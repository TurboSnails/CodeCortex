## Context

当前 Chat 页面 (`dashboard/client/src/pages/Chat.tsx`) 的输入区域布局如下：

```
┌─────────────────────────────────────────────────┐
│ ChatMessageList                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│ [textarea          ] [🎤] [发送]               │
│ 发送 ⏎ · 换行 ⇧⏎ · 强制发送 ⌘⏎ · 命令 / ...  │
└─────────────────────────────────────────────────┘
```

`InputHintBar` 组件直接在输入框下方渲染一整行内联文字，在窄屏上挤占宝贵的垂直空间。页面顶部只有标题和 CWD 选择器，缺少会话管理入口。

三个优化目标：
1. 将 `InputHintBar` 替换为输入框右侧的一个图标下拉菜单
2. 修复 IME 组合状态下 Enter 误触发发送
3. 顶部新增「新会话」和「历史记录」按钮

## Goals / Non-Goals

**Goals:**
- 输入框区域更紧凑，垂直空间用于内容而非提示文字
- 中文 IME 环境下不会误发送消息
- 用户可在当前页面快速新建会话或查看历史会话

**Non-Goals:**
- 不改变后端 API 或数据模型
- 不重构 `useRunChat` 或 `ChatWorkspaceContext` 的状态管理结构
- 不实现完整的会话管理（新建/删除/重命名），仅提供快速入口

## Decisions

### D1：快捷键下拉菜单的实现方式

**选择：** 在 `ChatInput.tsx` 的输入框容器右侧（语音按钮和发送按钮的左侧）添加一个 `?` 图标按钮，点击后用原生 `<dialog>` 元素弹出浮层显示快捷键列表。

**理由：**
- `<dialog>` 是浏览器原生弹窗，支持 `showModal()` / `show()`，自动处理焦点管理和 ESC 关闭，无需引入第三方库
- 弹出层样式与现有 `/` 和 `@` 自动补全弹出层风格一致（`z-30`、`shadow-lg`）
- 按钮放在输入框同一行，不新增独立行

**替代方案考虑：**
- `<select>` 原生下拉框：样式难以与现有 UI 统一，且不支持富内容（图标+文字）
- 自定义 `position: absolute` div：需要手动处理焦点、点击外部关闭、ESC 键，与 `<dialog>` 相比无优势

**实现位置：** 新建 `dashboard/client/src/components/chat/input/ShortcutDropdown.tsx`，在 `ChatInput` 的 JSX 中引入。

---

### D2：IME 组合状态检测

**选择：** 在 `ChatInput.tsx:handleKeyDown` 的 Enter 发送判断中增加 `!e.nativeEvent.isComposing` 条件。

```tsx
// 修改前
if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {

// 修改后
if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
```

**理由：**
- `isComposing` 是 W3C 标准 InputEvent 属性，浏览器原生支持
- 仅改一行，不影响其他逻辑，无副作用
- `isComposing` 为 `true` 时表示正处于 IME 组合状态（如中文选字），此时不应触发发送

**替代方案考虑：**
- `keyCode === 229`：已废弃，部分浏览器行为不一致
- 手动维护 `composing` 状态标志：增加不必要的状态管理复杂度

---

### D3：顶部「新会话」按钮的行为

**选择：** 点击后完全重置 `ChatWorkspace` 中的 `sessionId` state，并额外清空 `useRunChat` 中的 `displayEnvelopes`（通过让 `ChatTab` 重新挂载实现）。

**实现方式：**
- 在 `Chat.tsx` 的 `ChatWorkspace` 组件中，给 `ChatTab` 外层包一个 `key={sessionId}`，每次 `sessionId` 变化时 React 会自动卸载旧实例并挂载新实例，从而完全重置聊天状态。
- 新 `sessionId` 使用 `crypto.randomUUID()` 生成。

**理由：**
- `key` 驱动重新挂载是最干净的重置方式，无需逐个清理 `useRunChat` 内部状态
- 不需要向 `useRunChat` 传递额外的 `onReset` 回调

---

### D4：顶部「历史记录」弹框

**选择：** 在 `Chat.tsx` 中新增一个 `useState` 控制弹框显隐，使用 `useEffect` 监听会话列表 API，结果通过 `<dialog>` 渲染。

**实现位置：** 新建 `dashboard/client/src/components/chat/SessionHistoryDialog.tsx`，在 `ChatWorkspace` 中条件渲染。

**理由：**
- `Sessions.tsx` 已有完整的会话列表查询逻辑（`api.sessions.list`），复用其 API 调用
- `<dialog>` 弹框符合 D1 的技术选型统一
- 弹框内点击会话项时，调用方通过 `onSelect` 回调切换到对应会话

**弹框内容：**
- 标题栏：「历史记录」+ 关闭按钮
- 列表：每个会话项显示 `updatedAt` 和会话首条消息摘要
- 点击项 → 触发 `onSelect(sessionId)` 回调 → 父组件关闭弹框并切换会话

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `isComposing` 在某些老旧浏览器上行为不一致 | 该系统面向现代浏览器（Chrome/Edge/Firefox/Safari 均已支持），风险极低 |
| 下拉弹框在窄屏（手机）上体验差 | 弹框最大宽度 `max-w-sm`，在超窄屏上自动贴边，内容可滚动 |
| 新建会话后旧聊天记录完全消失，无确认提示 | 确实如此——因为需求明确要求清空聊天记录。如果未来需要确认，可加 `window.confirm` |
