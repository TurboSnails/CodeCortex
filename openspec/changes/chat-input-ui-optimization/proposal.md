## Why

当前 Chat 页面存在三个交互体验问题：
1. 输入框底部的快捷键提示栏占用了垂直空间，且样式不够紧凑；
2. 使用中文输入法时，按 Enter 确认选字会误触发消息发送；
3. 顶部缺少快速新建会话和查看历史会话的入口，用户需要通过页面导航才能访问。

这些问题影响日常使用效率，需要在当前界面内直接解决。

## What Changes

- **快捷键提示改为下拉菜单**：将输入框底部的内联快捷键文字（`发送 ⏎ · 换行 ⇧⏎ · 强制发送 ⌘⏎ · 命令 / · 文件 @ · 调用历史 ↑↓`）替换为输入框右侧的一个图标按钮，点击后弹出浮层展示所有快捷键。
- **修复 IME 组合状态下的误发送**：在 `ChatInput.tsx` 的 `handleKeyDown` 中，发送逻辑增加 `!e.nativeEvent.isComposing` 判断，避免在中文输入法选字过程中按 Enter 发送消息。
- **顶部右侧新增两个操作按钮**：
  - **新会话**：清空当前聊天记录并生成新的 `sessionId`，重置整个对话状态。
  - **历史记录**：弹出悬浮弹框显示会话历史列表，用户可点击切换到历史会话。

## Capabilities

### New Capabilities

- `chat-shortcut-dropdown`：将输入框快捷键提示从内联文字改为下拉浮层，包含触发按钮和弹出菜单。
- `chat-ime-composition-fix`：修复中文 IME 环境下 Enter 键误触发发送的问题。
- `chat-header-actions`：在 Chat 页面顶部标题栏右侧新增「新会话」和「历史记录」两个操作按钮。

### Modified Capabilities

（无 — 均为纯 UI 调整，不涉及后端 API 或数据模型变更）

## Impact

- **UI 层**：仅影响 `dashboard/client/src/components/chat/ChatInput.tsx`、`dashboard/client/src/components/chat/input/InputHintBar.tsx`、`dashboard/client/src/pages/Chat.tsx` 三个文件。
- **i18n**：`InputHintBar` 当前使用 `chat-input` 命名空间的翻译 key，新 UI 同样需要保持兼容或做小调整。
- **状态管理**：`Chat.tsx` 中 `sessionId` state 需要增加重置逻辑；历史会话弹框可复用现有的 `Sessions.tsx` 数据接口。
