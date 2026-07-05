# Chat 消息展示体验提升 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升 Chat 页面消息列表的视觉和交互体验，包括流式输出、代码块、工具卡片、思维块、滚动体验的精细打磨。

**Architecture:** 纯增量修改，不改变数据流和组件边界。所有改动集中在 `ChatMessageList.tsx`、`ThinkingBlock.tsx`、`ToolCallBlock.tsx`、`MarkdownContent.tsx` 和 `index.css` 五个文件。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + lucide-react

---

## Global Constraints

- 不修改 `useRunChat`、`workflowConfig`、`ChatWorkspaceContext` 等核心状态文件
- 所有动画尊重 `prefers-reduced-motion` 媒体查询
- 快照测试变更后需运行 `cd client && npx vitest run -u` 更新基准
- 提交格式：`git commit -m "feat(chat): <描述>"` + Co-Authored-By

---

## 文件结构

| 文件 | 改动内容 |
|------|---------|
| `dashboard/client/src/components/chat/ChatMessageList.tsx` | 流式 indicator 增强、工具调用卡片化、消息时间戳、滚动守卫 |
| `dashboard/client/src/components/chat/ThinkingBlock.tsx` | 折叠/展开状态 |
| `dashboard/client/src/components/conversation/ToolCallBlock.tsx` | 工具结果滚动、长结果折叠 |
| `dashboard/client/src/components/conversation/MarkdownContent.tsx` | 代码块复制按钮 |
| `dashboard/client/src/index.css` | char-fade-in 动画、滚动条样式 |

---

## Task 1: 流式输出体验增强

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatMessageList.tsx:142-187` (StreamingIndicator)
- Modify: `dashboard/client/src/index.css`

**Interfaces:**
- Consumes: `StreamingAssistantMessage` from `types.ts`
- Produces: 视觉更新，无 API 变更

- [ ] **Step 1: 在 `index.css` 中添加字符淡入动画**

打开 `dashboard/client/src/index.css`，在文件末尾添加：

```css
@keyframes char-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.markdown-char-fade {
  animation: char-fade-in 80ms ease-out;
}

/* 滚动条样式 */
.message-tool-result-scroll {
  max-height: 240px;
  overflow-y: auto;
}

.message-tool-result-scroll::-webkit-scrollbar {
  width: 4px;
}

.message-tool-result-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.message-tool-result-scroll::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 2px;
}
```

- [ ] **Step 2: 更新 `StreamingIndicator` 组件**

打开 `dashboard/client/src/components/chat/ChatMessageList.tsx`，找到 `StreamingIndicator` 函数（约 line 142），替换为以下实现：

```tsx
function StreamingIndicator({ env }: { env: Envelope | null }) {
  if (!isStreamingAssistant(env)) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <PulsingDots />
        Claude is thinking…
      </div>
    );
  }

  const blocks = env.message?.content || [];
  const last = blocks[blocks.length - 1];

  if (!last) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <PulsingDots />
        Claude is thinking…
      </div>
    );
  }

  if (last.type === "thinking") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-violet-300">
        <Sparkles className="w-3 h-3" />
        Thinking…
      </div>
    );
  }

  if (last.type === "text") {
    // 显示前40字符预览
    const preview = (last.text || "").slice(-40);
    return (
      <span className="inline-block text-sm text-gray-200">
        <span className="animate-pulse text-gray-400">▍</span>
        {preview && <span className="text-gray-500 ml-1 text-xs">{preview}</span>}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <PulsingDots />
      Claude is thinking…
    </div>
  );
}
```

- [ ] **Step 3: 运行测试验证**

```bash
cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatMessageList.test.tsx --reporter=verbose 2>&1 | head -40
```

Expected: PASS（或快照差异，后续步骤处理）

- [ ] **Step 4: 提交**

```bash
git add dashboard/client/src/components/chat/ChatMessageList.tsx dashboard/client/src/index.css
git commit -m "feat(chat): enhance streaming indicator with text preview and improved animation"
```

---

## Task 2: 代码块复制按钮

**Files:**
- Modify: `dashboard/client/src/components/conversation/MarkdownContent.tsx`
- Modify: `dashboard/client/src/index.css`

**Interfaces:**
- Consumes: `MarkdownContent` 已有组件
- Produces: 新增 `CopyButton` 交互

- [ ] **Step 1: 在 `MarkdownContent.tsx` 中添加复制按钮逻辑**

打开 `dashboard/client/src/components/conversation/MarkdownContent.tsx`，查看当前代码块渲染方式，然后找到渲染 `<pre>` 或代码块的 JSX，修改为：

```tsx
// 在组件顶部添加 state
const [copiedId, setCopiedId] = useState<string | null>(null);

// 添加 copy 函数
const handleCopy = async (code: string, id: string) => {
  try {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  } catch {
    // clipboard 不可用时静默失败
  }
};
```

找到渲染 `<pre><code>` 的代码块（约在 `dangerouslySetInnerHTML` 或 children 方式渲染处），将其包裹在一个 `relative` 的 div 中，并添加复制按钮：

```tsx
// 找到类似这样的结构
<pre>
  <code>{children}</code>
</pre>

// 替换为：
<pre className="relative group">
  <code>{children}</code>
  <button
    type="button"
    onClick={() => handleCopy(codeString, uniqueId)}
    className="absolute top-2 right-2 p-1.5 rounded bg-surface-3 hover:bg-surface-2 opacity-0 group-hover:opacity-100 transition-opacity"
    aria-label="Copy code"
  >
    {copiedId === uniqueId ? (
      <Check className="w-3.5 h-3.5 text-green-400" />
    ) : (
      <Copy className="w-3.5 h-3.5 text-gray-400" />
    )}
  </button>
  {lang && (
    <span className="absolute top-2 left-3 text-[10px] text-gray-500 font-mono">
      {lang}
    </span>
  )}
</pre>
```

需要从 `lucide-react` 导入 `Copy` 和 `Check` 图标。

- [ ] **Step 2: 添加语言标签样式**

在 `index.css` 中补充：

```css
/* 代码块语言标签 */
pre .lang-badge {
  position: absolute;
  top: 0.5rem;
  left: 0.75rem;
  font-size: 10px;
  color: #6b7280;
  font-family: monospace;
  pointer-events: none;
}
```

- [ ] **Step 3: 运行测试**

```bash
cd dashboard/client && npx vitest run src/components/conversation/__tests__/MarkdownContent.test.tsx --reporter=verbose 2>&1 | head -50
```

- [ ] **Step 4: 提交**

```bash
git add dashboard/client/src/components/conversation/MarkdownContent.tsx dashboard/client/src/index.css
git commit -m "feat(chat): add copy button and language badge to code blocks"
```

---

## Task 3: 工具调用卡片化

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatMessageList.tsx` (约 line 238-247)

**Interfaces:**
- Consumes: `Envelope` 类型，`isToolUseEnvelope` 已有
- Produces: 视觉变更，无 API 变更

- [ ] **Step 1: 更新工具调用渲染分支**

在 `ChatMessageList.tsx` 中找到 `isToolUseEnvelope` 的渲染分支（约 line 238-247）：

```tsx
// 当前代码：
if (isToolUseEnvelope(env)) {
  return (
    <div key={i} className="flex justify-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
        <Wrench className="w-3 h-3" />
        {env.name}
      </div>
    </div>
  );
}
```

替换为：

```tsx
if (isToolUseEnvelope(env)) {
  // 暂时保留简单 chip 形态；完整卡片化在 Task 6 结合工具状态接入
  return (
    <div key={i} className="flex justify-center">
      <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 shadow-sm">
        <Wrench className="w-3 h-3" />
        {env.name}
      </div>
    </div>
  );
}
```

（注：完整卡片化含状态色和耗时 badge 需要接入 `useRunChat` 的 envelope 数据，当前信封中无耗时字段，留待后续迭代。）

- [ ] **Step 2: 提交**

```bash
git add dashboard/client/src/components/chat/ChatMessageList.tsx
git commit -m "style(chat): enhance tool use chip with card-like styling"
```

---

## Task 4: 思维块折叠

**Files:**
- Modify: `dashboard/client/src/components/chat/ThinkingBlock.tsx`
- Modify: `dashboard/client/src/components/chat/ChatMessageList.tsx` (约 line 100-103)

**Interfaces:**
- Consumes: `ThinkingBlock` props `{ text: string }`
- Produces: 新增 `collapsed` 状态和展开动画

- [ ] **Step 1: 更新 `ThinkingBlock.tsx`**

打开 `dashboard/client/src/components/chat/ThinkingBlock.tsx`，替换为：

```tsx
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ThinkingBlockProps {
  text: string;
}

export function ThinkingBlock({ text }: ThinkingBlockProps) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-violet-300 hover:bg-violet-500/10 transition-colors"
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        )}
        <span className="text-[10px] uppercase tracking-wider opacity-70">
          {collapsed ? "💭 已隐藏思考过程" : "💭 思考过程"}
        </span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 text-sm text-gray-400 leading-relaxed animate-char-fade">
          {text}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 更新 `ChatMessageList.tsx` 中的 thinking 渲染**

约 line 100-103，找到：

```tsx
} else if (b.type === "thinking") {
  rendered.push(
    <ThinkingBlock key={i} text={(b as { thinking?: string }).thinking || ""} />,
  );
}
```

替换为（去掉 key 中的 `i`，改用类型安全的 key）：

```tsx
} else if (b.type === "thinking") {
  rendered.push(
    <ThinkingBlock key={`thinking-${i}`} text={(b as { thinking?: string }).thinking || ""} />,
  );
}
```

- [ ] **Step 3: 测试**

```bash
cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatMessageList.test.tsx --reporter=verbose 2>&1 | head -60
```

预期：快照可能有微小差异（wrapper div 变化），用 `-u` 更新基准。

- [ ] **Step 4: 提交**

```bash
git add dashboard/client/src/components/chat/ThinkingBlock.tsx dashboard/client/src/components/chat/ChatMessageList.tsx
git commit -m "feat(chat): make thinking blocks collapsible by default"
```

---

## Task 5: 消息时间戳

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatMessageList.tsx`

**Interfaces:**
- Consumes: `Envelope` 类型，新增 `timestamp` 字段（通过 `envelope.ts` 中的时间）
- Produces: 视觉变更，无 API 变更

- [ ] **Step 1: 添加时间戳状态**

在 `ChatMessageList.tsx` 组件顶部添加 helper：

```tsx
function formatTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
```

找到用户消息渲染（约 line 217-224）：

```tsx
if (isUserEnvelope(env)) {
  return (
    <div key={i} className="flex justify-end group">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
        {getUserText(env)}
      </div>
      {/* 时间戳 hover 显示 */}
      {(env as { timestamp?: number }).timestamp && (
        <span className="absolute bottom-1 right-3 text-[10px] text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatTime((env as { timestamp?: number }).timestamp)}
        </span>
      )}
    </div>
  );
}
```

（注：`Envelope` 类型中若无 `timestamp` 字段，需确认上游 `useRunChat` 是否在 `displayEnvelopes` 中注入了时间信息。如果无时间字段，此 Task 跳过，改在 UI 上显示虚拟时间差（如 "2 min ago"）。）

- [ ] **Step 2: 提交**

```bash
git add dashboard/client/src/components/chat/ChatMessageList.tsx
git commit -m "feat(chat): add hover timestamp to messages"
```

---

## Task 6: 工具结果滚动和长结果折叠

**Files:**
- Modify: `dashboard/client/src/components/conversation/ToolCallBlock.tsx`
- Modify: `dashboard/client/src/index.css`

**Interfaces:**
- Consumes: `toolResult: TranscriptContent` prop
- Produces: 视觉变更，无 API 变更

- [ ] **Step 1: 查看并更新 `ToolCallBlock.tsx`**

打开 `dashboard/client/src/components/conversation/ToolCallBlock.tsx`，了解当前结构。

找到渲染工具结果的 JSX，添加滚动和折叠逻辑：

```tsx
import { useState } from "react";
import { ChevronDown } from "lucide-react";

// 在组件内添加：
const [resultCollapsed, setResultCollapsed] = useState(false);
const outputText = toolResult?.output || "";
const isLongResult = outputText.length > 500;
const displayText = isLongResult && resultCollapsed
  ? outputText.slice(0, 500) + "…"
  : outputText;
```

将工具结果渲染部分包裹为：

```tsx
<div className={`message-tool-result-scroll ${isLongResult ? "max-h-[240px]" : ""}`}>
  <pre className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono">
    {displayText}
  </pre>
</div>
{isLongResult && (
  <button
    type="button"
    onClick={() => setResultCollapsed((c) => !c)}
    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 mt-1"
  >
    <ChevronDown className={`w-3 h-3 transition-transform ${resultCollapsed ? "-rotate-90" : ""}`} />
    {resultCollapsed ? `展开剩余 ${outputText.length - 500} 字符` : "收起"}
  </button>
)}
```

- [ ] **Step 2: 提交**

```bash
git add dashboard/client/src/components/conversation/ToolCallBlock.tsx dashboard/client/src/index.css
git commit -m "feat(chat): add scroll and collapse for long tool results"
```

---

## Task 7: 滚动守卫（Smart Scroll）

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatMessageList.tsx`

**Interfaces:**
- Consumes: `useRef` + `useEffect` + `scrollIntoView`
- Produces: 新增 `isNearBottom` 状态和「滚动到底部」按钮

- [ ] **Step 1: 添加滚动检测逻辑**

在 `ChatMessageList` 组件中（约 line 204-209），找到当前的 `bottomRef useEffect`：

```tsx
// 当前：
const bottomRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (typeof bottomRef.current?.scrollIntoView === "function") {
    bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }
}, [envelopes.length, activePermissionRequest?.id]);
```

替换为：

```tsx
const bottomRef = useRef<HTMLDivElement>(null);
const containerRef = useRef<HTMLDivElement>(null);
const [isNearBottom, setIsNearBottom] = useState(true);
const [showScrollButton, setShowScrollButton] = useState(false);

// 检测滚动位置
const handleScroll = () => {
  const el = containerRef.current;
  if (!el) return;
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  const near = distFromBottom < 100;
  setIsNearBottom(near);
  setShowScrollButton(!near && envelopes.length > 2);
};

// 自动滚动（仅当在底部附近时）
useEffect(() => {
  if (isNearBottom && typeof bottomRef.current?.scrollIntoView === "function") {
    bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }
}, [envelopes.length, activePermissionRequest?.id, isNearBottom]);
```

找到最外层 `div`（约 line 215），添加 `ref` 和 `onScroll`：

```tsx
// 找到：
<div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">

// 替换为：
<div
  ref={containerRef}
  onScroll={handleScroll}
  className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
>
```

在 `bottomRef` 之后添加「滚动到底部」悬浮按钮：

```tsx
{showScrollButton && (
  <button
    type="button"
    onClick={() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowScrollButton(false);
    }}
    className="fixed bottom-24 right-6 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-2 border border-border text-xs text-gray-300 shadow-lg hover:bg-surface-3 transition-colors"
    aria-label="Scroll to bottom"
  >
    <ChevronDown className="w-3 h-3" />
    滚动到底部
  </button>
)}
```

需要导入 `ChevronDown`。

- [ ] **Step 2: 提交**

```bash
git add dashboard/client/src/components/chat/ChatMessageList.tsx
git commit -m "feat(chat): add smart scroll guard with jump-to-bottom button"
```

---

## Task 8: 全量快照更新和验证

- [ ] **Step 1: 运行全量测试**

```bash
cd dashboard/client && npx vitest run src/components/chat/__tests__/ --reporter=verbose 2>&1 | tail -30
```

- [ ] **Step 2: 更新快照**

```bash
cd dashboard/client && npx vitest run -u 2>&1 | tail -20
```

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "test(chat): update snapshots for message display improvements"
```

---

## 实施顺序

1. Task 1 → 流式输出（最高用户感知）
2. Task 2 → 代码块复制（日常高频）
3. Task 3 → 工具卡片（视觉增强，较小改动）
4. Task 4 → Thinking 折叠（减少视觉噪音）
5. Task 5 → 时间戳（轻量，依赖上游是否有 timestamp）
6. Task 6 → 工具结果滚动（解决长输出痛点）
7. Task 7 → 滚动守卫（显著减少阅读干扰）
8. Task 8 → 快照更新

每个 Task 独立可测试，全部完成后统一更新快照。
