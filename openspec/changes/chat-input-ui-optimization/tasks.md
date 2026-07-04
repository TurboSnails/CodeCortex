## 1. IME 组合状态修复

- [ ] 1.1 在 `ChatInput.tsx` 的 `handleKeyDown` 中，为 Enter 发送逻辑增加 `!e.nativeEvent.isComposing` 条件判断（ChatInput.tsx:250）

## 2. 快捷键下拉菜单

- [ ] 2.1 新建 `dashboard/client/src/components/chat/input/ShortcutDropdown.tsx`，包含按钮图标和 `<dialog>` 弹出层
- [ ] 2.2 在 `ChatInput.tsx` 中引入 `ShortcutDropdown` 组件，放在发送按钮左侧
- [ ] 2.3 从 `ChatInput.tsx` 中移除 `<InputHintBar />` 的渲染（ChatInput.tsx:355）
- [ ] 2.4 验证下拉菜单在桌面和移动端均正常显示和关闭

## 3. 顶部「新会话」和「历史记录」按钮

- [ ] 3.1 在 `Chat.tsx` 的 `ChatWorkspace` 组件中，新增两个 `useState`：分别控制「新会话」和「历史记录」弹框的显示状态
- [ ] 3.2 在页面标题栏右侧、CWD 选择器左侧，新增「新会话」按钮（图标可用 `Plus` 或 `RefreshCw`）
- [ ] 3.3 在页面标题栏右侧、CWD 选择器左侧，新增「历史记录」按钮（图标可用 `History`）
- [ ] 3.4 实现「新会话」点击逻辑：生成新 `sessionId` 并触发 `ChatTab` 重新挂载（通过 `key={sessionId}` 驱动）
- [ ] 3.5 新建 `dashboard/client/src/components/chat/SessionHistoryDialog.tsx`，实现历史会话列表弹框（调用 `api.sessions.list`）
- [ ] 3.6 在 `Chat.tsx` 中条件渲染 `SessionHistoryDialog`，通过 `onSelect` 回调切换会话
- [ ] 3.7 验证新会话按钮会清空聊天记录，历史记录弹框能正确加载和切换会话

## 4. 收尾与验证

- [ ] 4.1 运行 `npm run test:client` 确保现有测试通过
- [ ] 4.2 人工验证：中文输入法下按 Enter 不会发送消息
- [ ] 4.3 人工验证：快捷键下拉菜单正常打开/关闭
- [ ] 4.4 人工验证：新会话和历史记录按钮功能正常
