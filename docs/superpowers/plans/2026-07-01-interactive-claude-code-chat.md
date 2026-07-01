# Interactive Claude Code Chat Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive "Chat" tab to `SessionDetail` that spawns or resumes a local Claude Code process for the current session, streams assistant/tool output, accepts follow-up turns, and surfaces mid-session permission requests as clickable Approve/Reject buttons in the UI.

**Architecture:** Reuse the existing `run-spawner.js` subprocess machinery and `/api/run` REST surface. Extract the streaming envelope state machine from `Run.tsx` into a reusable `useRunChat` hook, then build a `ChatTab` component embedded in `SessionDetail`. Clickable mid-session permission prompts require wrapping the `claude` child process in a PTY (`node-pty`) because the CLI does not expose permission requests through the `stream-json` protocol; the PTY spike before Tasks 4–5 will determine the exact interception strategy.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide icons, WebSocket event bus, Node.js `child_process`, Claude Code CLI (`--output-format stream-json --input-format stream-json`).

## Global Constraints

- Preserve existing behavior unless explicitly changed; the current `/run` page must continue to work unchanged for users who prefer it.
- All server routes under `/api/run` keep the existing loopback same-origin guard (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`).
- `cwd` for any spawned `claude` process must be absolute and exist at request time.
- Only one live dashboard run may drive a given Claude Code `session_id` at a time; re-attaching to an already-driven session opens the existing run handle.
- The dashboard remains local-first: no cloud auth, no remote proxy, no persistent log streaming to third parties.
- UI copy is i18n-ready; new keys live under `dashboard/client/public/locales/*/sessions.json` and `run.json`.
- Every task ends with a green test/command and a fresh commit.

## Pre-requisite: Verify Claude Code permission envelope protocol

**Status: COMPLETED. Claude Code CLI does NOT emit structured `permission_request` envelopes in `stream-json` mode.**

### Spike results

Ran the manual spike on the target machine (same machine hosting the dashboard):

```bash
mkdir /tmp/cc-perm-spike && cd /tmp/cc-perm-spike
echo '{"type":"message","role":"user","content":[{"type":"text","text":"run ls -la"}]}' | \
  claude --input-format stream-json --output-format stream-json --include-partial-messages --verbose --permission-mode default \
  2>stderr.log > stdout.log
```

Findings:
- `--permission-mode ask` is rejected by the CLI. Allowed choices are: `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`.
- Under `--permission-mode default`, `run ls -la` executed as a `tool_use` / `tool_result` pair with no interactive prompt.
- The complete envelope type taxonomy from `stdout.log` contains only standard stream-json envelopes: `stream_event`, `content_block_delta`, `system`, `thinking_delta`, `text_delta`, `input_json_delta`, `message`, `content_block_stop`, `content_block_start`, `assistant`, `text`, `thinking`, `tool_use`, `tool_result`, `result`, `user`, `signature_delta`, `message_stop`, `message_delta`, `message_start`. **No `permission_request`, `prompt`, `confirm`, or similar envelope was emitted.**
- A follow-up file-edit request (`Edit test-edit.txt to say "modified by claude"`) also produced no structured permission envelope.

**Conclusion:** Mid-session permission prompts from Claude Code CLI are not exposed through the `stream-json` protocol. They are rendered through terminal interaction (stdin/stdout), which can only be intercepted by wrapping the `claude` child process in a PTY.

### Impact on this plan

- **Tasks 1–3 proceed as written.** They build the chat UI, message list, input bar, and `SessionDetail` integration. They do not depend on permission buttons.
- **Tasks 4–5 are blocked until the PTY spike below succeeds.** The endpoint, client API, and `PermissionPrompt` components from Tasks 4–5 require a way to inject `Y/n` answers into the terminal stream. Do not start Tasks 4–5 unless the PTY spike produces a working interception strategy.
- **If the PTY spike fails**, the chat UI will still be useful for read-only / non-destructive prompts, but clickable Approve/Reject buttons cannot be delivered without a different approach (e.g., driving Claude through its API instead of the CLI).

## Follow-up spike: PTY-based permission interception (required before Tasks 4–5)

Before Tasks 4 and 5, evaluate whether `node-pty` (or an equivalent pseudo-terminal wrapper) can intercept Claude Code's terminal-based permission prompts and inject `Y` / `n` / `a` answers.

### Spike acceptance criteria

1. Spawn `claude --input-format stream-json --output-format stream-json --include-partial-messages --verbose --permission-mode default` through `node-pty` in conversation mode.
2. Send a prompt that triggers a destructive operation (e.g. `Edit /tmp/cc-pty-spike/file.txt to say "changed"` or `run rm /tmp/cc-pty-spike/file.txt`).
3. Detect the permission prompt text in the PTY output stream (look for text containing `Y/n`, `yes/no`, `Allow`, or `Approve`).
4. Programmatically inject `Y\n` (or the appropriate confirmation) into the PTY stdin and verify that Claude proceeds to execute the tool.
5. Verify that the stream-json envelopes are still readable from the PTY output (they will be interleaved with ANSI/prompt text) and that the raw prompt text can be filtered out.

**If the spike succeeds:** document the exact prompt pattern, the injection sequence, and how to separate stream-json envelopes from terminal noise. Then update Tasks 4–5 to route permission responses through the PTY instead of a non-existent `permission_response` envelope, and proceed.

**If the spike fails:** stop implementation here. Report the blocker to the user and consider alternative architectures (e.g., using the Anthropic API directly, or documenting that permission prompts must be handled in the terminal).

## File Structure

| File | Responsibility |
|------|----------------|
| `dashboard/client/src/components/chat/types.ts` | Shared stream-json envelope types and permission shapes for the chat subsystem. |
| `dashboard/client/src/components/chat/useRunChat.ts` | Hook that owns a single run handle, envelope state, WS subscription, start/send/stop. |
| `dashboard/client/src/components/chat/ChatInput.tsx` | Bottom input bar with send, file `@`-mentions, and slash-command autocomplete. |
| `dashboard/client/src/components/chat/ChatMessageList.tsx` | Scrollable message list: user turns, assistant text/thinking, tool use/result cards. |
| `dashboard/client/src/components/chat/PermissionPrompt.tsx` | Inline card for an active permission request with Approve / Reject / Always actions. |
| `dashboard/client/src/components/chat/ChatTab.tsx` | Container wiring the above pieces together for the SessionDetail tab. |
| `dashboard/client/src/pages/SessionDetail.tsx` | Adds the "chat" tab to `DetailTab` and renders `<ChatTab>` in the tab panel. |
| `dashboard/client/src/pages/Run.tsx` | Refactored to import envelope types and `useRunChat` from the chat subsystem. |
| `dashboard/client/src/lib/api.ts` | Adds `api.run.respondToPermission` and `PermissionResponseArgs` type. |
| `dashboard/client/src/lib/types.ts` | Adds `run_permission_request` / `run_permission_response` WS payload types. |
| `dashboard/server/lib/run-spawner.js` | Adds `sendPermissionResponse(id, requestId, approved)` and exports it. |
| `dashboard/server/routes/run.js` | Adds `POST /api/run/:id/permission` route backed by `run-spawner`. |
| `dashboard/server/__tests__/run-spawner.test.js` | Existing test file; extend with permission response coverage. |
| `dashboard/client/src/components/chat/__tests__/useRunChat.test.tsx` | Unit tests for the hook: start, send, stop, envelope merge, permission state. |
| `dashboard/client/src/components/chat/__tests__/ChatTab.test.tsx` | Component test: renders messages, sends follow-up, shows permission card. |


### Task 1: Extract shared envelope types and `useRunChat` hook

**Files:**
- Create: `dashboard/client/src/components/chat/types.ts`
- Create: `dashboard/client/src/components/chat/useRunChat.ts`
- Modify: `dashboard/client/src/pages/Run.tsx` (import shared types/hook instead of local definitions)
- Test: `dashboard/client/src/components/chat/__tests__/useRunChat.test.tsx`

**Interfaces:**
- `useRunChat(options: { sessionId: string; cwd: string; initialPermissionMode?: PermissionMode })` returns `{ handle, envelopes, displayEnvelopes, busy, error, followUp, setFollowUp, start, send, stop, activePermissionRequest, respondToPermission, isLive }`.
- `Envelope` union now includes `PermissionRequestEnvelope` so later tasks can render permission cards.

- [ ] **Step 1: Write the failing test**

Create `dashboard/client/src/components/chat/__tests__/useRunChat.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRunChat } from "../useRunChat";

const mockApiRun = {
  start: vi.fn(),
  send: vi.fn(),
  kill: vi.fn(),
  respondToPermission: vi.fn(),
};

vi.mock("../../../lib/api", () => ({
  api: {
    run: mockApiRun,
  },
}));

const mockSubscribe = vi.fn((cb) => {
  (globalThis as any).__wsCallback = cb;
  return () => {};
});

vi.mock("../../../lib/eventBus", () => ({
  eventBus: {
    subscribe: mockSubscribe,
    connected: true,
    onConnection: vi.fn(() => () => {}),
  },
}));

describe("useRunChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a run and shows optimistic user envelope", async () => {
    mockApiRun.start.mockResolvedValueOnce({
      id: "run-1",
      status: "spawning",
      sessionId: "sess-1",
      cwd: "/tmp",
      mode: "conversation",
      permissionMode: "acceptEdits",
    });

    const { result } = renderHook(() =>
      useRunChat({ sessionId: "sess-1", cwd: "/tmp" })
    );

    await act(async () => {
      await result.current.start("hello");
    });

    expect(mockApiRun.start).toHaveBeenCalledWith({
      prompt: "hello",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
    });
    expect(result.current.envelopes).toHaveLength(1);
    expect(result.current.envelopes[0]).toMatchObject({ type: "user" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd dashboard/client
npx vitest run src/components/chat/__tests__/useRunChat.test.tsx
```

Expected: FAIL with module not found for `../useRunChat`.

- [ ] **Step 3: Create shared types**

Create `dashboard/client/src/components/chat/types.ts`:

```typescript
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking?: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean };

export interface AssistantMessage {
  type: "assistant";
  message?: {
    content?: ContentBlock[] | string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

export interface UserMessage {
  type: "user";
  message?: { content?: ContentBlock[] | string };
}

export interface SystemInitEnvelope {
  type: "system";
  subtype: "init";
  session_id?: string;
  model?: string;
  cwd?: string;
  tools?: string[];
  permissionMode?: string;
}

export interface ResultEnvelope {
  type: "result";
  subtype?: string;
  is_error?: boolean;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  result?: string;
  session_id?: string;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface PermissionRequestEnvelope {
  type: "permission_request";
  id: string;
  tool_name: string;
  description: string;
  command?: string;
  path?: string;
}

export type Envelope =
  | AssistantMessage
  | UserMessage
  | SystemInitEnvelope
  | ResultEnvelope
  | PermissionRequestEnvelope
  | { type: string; [k: string]: unknown };
```

- [ ] **Step 4: Create `useRunChat` hook skeleton**

Create `dashboard/client/src/components/chat/useRunChat.ts` with the public interface:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { eventBus } from "../../lib/eventBus";
import type { RunHandle, RunMode, PermissionMode } from "../../lib/api";
import type {
  Envelope,
  PermissionRequestEnvelope,
  UserMessage,
} from "./types";

export interface UseRunChatOptions {
  sessionId: string;
  cwd: string;
  initialMode?: RunMode;
  initialPermissionMode?: PermissionMode;
}

export interface UseRunChatReturn {
  handle: RunHandle | null;
  envelopes: Envelope[];
  busy: boolean;
  error: string | null;
  followUp: string;
  setFollowUp: (v: string) => void;
  start: (prompt: string, opts?: { resumeSessionId?: string }) => Promise<void>;
  send: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  activePermissionRequest: PermissionRequestEnvelope | null;
  respondToPermission: (approved: boolean, remember?: boolean) => Promise<void>;
  isLive: boolean;
}

export function useRunChat(options: UseRunChatOptions): UseRunChatReturn {
  // Implementation follows in next step.
}
```

- [ ] **Step 5: Port streaming logic from `Run.tsx`**

Copy the existing `mergeEnvelope`, streaming delta handling, and `useTypewriterEnvelopes` from `Run.tsx` into `useRunChat.ts`. Keep the function names and behavior identical so `Run.tsx` can delegate to the hook later. The key state shape is:

```typescript
const [handle, setHandle] = useState<RunHandle | null>(null);
const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
const [followUp, setFollowUp] = useState("");
const [busy, setBusy] = useState<"start" | "send" | "stop" | null>(null);
const [error, setError] = useState<string | null>(null);
const [activePermissionRequest, setActivePermissionRequest] =
  useState<PermissionRequestEnvelope | null>(null);
const followUpRef = useRef("");
```

The WebSocket subscription in `useEffect` handles:
- `run_stream`: merge envelope, and if it is `type === "permission_request"`, set `activePermissionRequest`.
- `run_status`: update handle status; on `completed`/`error`/`killed` clear `activePermissionRequest`.
- `run_input_ack`: optimistically append user envelope.

- [ ] **Step 6: Implement start / send / stop / respondToPermission**

```typescript
const start = useCallback(
  async (prompt: string, opts?: { resumeSessionId?: string }) => {
    if (!prompt.trim() || busy) return;
    setBusy("start");
    setError(null);
    setEnvelopes([]);
    setActivePermissionRequest(null);
    try {
      const result = await api.run.start({
        prompt,
        mode: opts?.resumeSessionId ? "conversation" : (options.initialMode ?? "conversation"),
        cwd: options.cwd,
        permissionMode: options.initialPermissionMode ?? "acceptEdits",
        resumeSessionId: opts?.resumeSessionId,
      });
      setHandle(result);
      setEnvelopes([{ type: "user", message: { content: prompt } } as UserMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "start failed");
    } finally {
      setBusy(null);
    }
  },
  [busy, options.cwd, options.initialMode, options.initialPermissionMode]
);

const send = useCallback(
  async (text: string) => {
    if (!handle || !text.trim() || busy) return;
    setBusy("send");
    setError(null);
    try {
      await api.run.send(handle.id, text);
      setFollowUp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "send failed");
    } finally {
      setBusy(null);
    }
  },
  [handle, busy]
);

const stop = useCallback(async () => {
  if (!handle || busy) return;
  setBusy("stop");
  try {
    await api.run.kill(handle.id);
  } catch (err) {
    setError(err instanceof Error ? err.message : "stop failed");
  } finally {
    setBusy(null);
  }
}, [handle, busy]);

const respondToPermission = useCallback(
  async (approved: boolean, _remember?: boolean) => {
    if (!handle || !activePermissionRequest) return;
    try {
      await api.run.respondToPermission(handle.id, {
        requestId: activePermissionRequest.id,
        approved,
      });
      setActivePermissionRequest(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "permission response failed");
    }
  },
  [handle, activePermissionRequest]
);
```

- [ ] **Step 7: Run tests**

```bash
cd dashboard/client
npx vitest run src/components/chat/__tests__/useRunChat.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Refactor `Run.tsx` to consume the new types/hook**

Replace the local `Envelope`, `ContentBlock`, `AssistantMessage`, `UserMessage`, `SystemInit`, `ResultEnvelope` type definitions in `Run.tsx` with imports from `../components/chat/types`. Remove the local `mergeEnvelope` and streaming helpers and import them from `../components/chat/useRunChat` (or keep them in the hook). The page-level `Run.tsx` continues to manage run history, active runs list, and the config card; the chat session itself can optionally delegate to `useRunChat`.

- [ ] **Step 9: Verify `/run` still works**

```bash
cd dashboard/client
npm run test:client
```

Expected: existing Run-related tests and snapshots still pass.

- [ ] **Step 10: Commit**

```bash
git add dashboard/client/src/components/chat/types.ts \
  dashboard/client/src/components/chat/useRunChat.ts \
  dashboard/client/src/components/chat/__tests__/useRunChat.test.tsx \
  dashboard/client/src/pages/Run.tsx
git commit -m "refactor(chat): extract useRunChat hook and shared envelope types"
```


### Task 2: Build `ChatTab` UI components

**Files:**
- Create: `dashboard/client/src/components/chat/ChatMessageList.tsx`
- Create: `dashboard/client/src/components/chat/ChatInput.tsx`
- Create: `dashboard/client/src/components/chat/ChatTab.tsx`
- Create: `dashboard/client/src/components/chat/__tests__/ChatTab.test.tsx`
- Modify: `dashboard/client/public/locales/en/sessions.json` (add chat tab copy)
- Modify: `dashboard/client/public/locales/zh/sessions.json` (add chat tab copy)

**Interfaces:**
- `ChatTab` receives `sessionId: string`, `cwd: string`, `sessionName?: string`.
- `ChatMessageList` receives `envelopes: Envelope[]`, `isLive: boolean`.
- `ChatInput` receives `value: string`, `onChange`, `onSend`, `disabled`, `placeholder`.

- [ ] **Step 1: Write the failing component test**

Create `dashboard/client/src/components/chat/__tests__/ChatTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatTab } from "../ChatTab";

const mockApiRun = {
  start: vi.fn(),
  send: vi.fn(),
  kill: vi.fn(),
  respondToPermission: vi.fn(),
};

vi.mock("../../../lib/api", () => ({
  api: { run: mockApiRun },
}));

vi.mock("../../../lib/eventBus", () => ({
  eventBus: {
    subscribe: vi.fn(() => () => {}),
    connected: true,
    onConnection: vi.fn(() => () => {}),
  },
}));

describe("ChatTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders start prompt when no run is active", () => {
    render(<ChatTab sessionId="sess-1" cwd="/tmp" />);
    expect(screen.getByPlaceholderText(/Ask Claude/)).toBeInTheDocument();
  });
});
```

Run:

```bash
cd dashboard/client
npx vitest run src/components/chat/__tests__/ChatTab.test.tsx
```

Expected: FAIL, module not found.

- [ ] **Step 2: Create `ChatMessageList`**

Create `dashboard/client/src/components/chat/ChatMessageList.tsx`. Render user turns right-aligned, assistant turns left-aligned, tool use/result as collapsible cards, and permission requests as highlighted banners. Keep the first version minimal; the markdown renderer from `conversation/MarkdownContent` can be reused.

```tsx
import { useRef, useEffect } from "react";
import { User, Bot, Wrench } from "lucide-react";
import type { Envelope } from "./types";
import { MarkdownContent } from "../conversation/MarkdownContent";

export function ChatMessageList({
  envelopes,
  isLive,
}: {
  envelopes: Envelope[];
  isLive: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [envelopes.length]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
      {envelopes.map((env, i) => {
        const t = (env as { type?: string }).type;
        if (t === "user") {
          const text = typeof (env as any).message?.content === "string"
            ? (env as any).message.content
            : "";
          return (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
                {text}
              </div>
            </div>
          );
        }
        if (t === "assistant") {
          const blocks = (env as any).message?.content || [];
          const text = Array.isArray(blocks)
            ? blocks.filter((b) => b.type === "text").map((b) => b.text).join("")
            : blocks;
          return (
            <div key={i} className="flex justify-start gap-3">
              <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-gray-400" />
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-2.5 text-sm text-gray-200">
                <MarkdownContent content={text} />
              </div>
            </div>
          );
        }
        if (t === "tool_use") {
          return (
            <div key={i} className="flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
                <Wrench className="w-3 h-3" />
                {(env as any).name}
              </div>
            </div>
          );
        }
        return null;
      })}
      {isLive && (
        <div className="flex justify-start gap-3">
          <div className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center">
            <Bot className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-xs text-gray-500 flex items-center">Claude is thinking…</div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 3: Create `ChatInput`**

Create `dashboard/client/src/components/chat/ChatInput.tsx`:

```tsx
import { useRef } from "react";
import { Send, Square } from "lucide-react";

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  isLive,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  disabled?: boolean;
  isLive?: boolean;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="border-t border-border bg-surface-1 px-4 py-3">
      <div className="flex items-end gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          className="flex-1 min-h-[40px] max-h-32 bg-transparent text-sm text-gray-200 placeholder-gray-600 resize-none outline-none py-2"
          placeholder={placeholder || "Ask Claude…"}
        />
        {isLive ? (
          <button
            type="button"
            onClick={onStop}
            disabled={disabled}
            className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={disabled || !value.trim()}
            className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `ChatTab`**

Create `dashboard/client/src/components/chat/ChatTab.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { AlertCircle, Play } from "lucide-react";
import { useRunChat } from "./useRunChat";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { PermissionPrompt } from "./PermissionPrompt";

export function ChatTab({
  sessionId,
  cwd,
}: {
  sessionId: string;
  cwd: string;
}) {
  const { t } = useTranslation("sessions");
  const {
    handle,
    envelopes,
    busy,
    error,
    followUp,
    setFollowUp,
    start,
    send,
    stop,
    activePermissionRequest,
    respondToPermission,
    isLive,
  } = useRunChat({ sessionId, cwd });

  const canSend = !!handle?.id && isLive;

  return (
    <div className="flex flex-col h-[600px] rounded-xl border border-border bg-surface-1 overflow-hidden">
      {error && (
        <div className="px-4 py-2.5 border-b border-red-500/20 bg-red-500/10 flex items-center gap-2 text-sm text-red-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!handle && (
        <div className="px-4 py-3 border-b border-border bg-surface-2/50 text-xs text-gray-500 flex items-center gap-2">
          <Play className="w-3.5 h-3.5" />
          {t("chat.startHint", "Type a message to start a new Claude Code run for this session.")}
        </div>
      )}

      {activePermissionRequest && (
        <PermissionPrompt
          request={activePermissionRequest}
          onApprove={() => respondToPermission(true)}
          onReject={() => respondToPermission(false)}
          disabled={busy === "send"}
        />
      )}

      <ChatMessageList envelopes={envelopes} isLive={isLive && !activePermissionRequest} />

      <ChatInput
        value={followUp}
        onChange={setFollowUp}
        onSend={() => {
          if (canSend) send(followUp);
          else start(followUp);
        }}
        onStop={stop}
        disabled={busy === "start" || busy === "send" || busy === "stop"}
        isLive={isLive}
        placeholder={canSend ? t("chat.followUpPlaceholder") : t("chat.startPlaceholder")}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add i18n keys**

Add to both `dashboard/client/public/locales/en/sessions.json` and `dashboard/client/public/locales/zh/sessions.json` under a new `chat` object:

```json
"chat": {
  "title": "Chat",
  "startHint": "Type a message to start a new Claude Code run for this session.",
  "startPlaceholder": "Ask Claude to do something…",
  "followUpPlaceholder": "Send a follow-up…",
  "permissionApprove": "Approve",
  "permissionReject": "Reject",
  "permissionAlways": "Always approve",
  "permissionTitle": "Claude is asking for permission"
}
```

- [ ] **Step 6: Run component tests**

```bash
cd dashboard/client
npx vitest run src/components/chat/__tests__/ChatTab.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add dashboard/client/src/components/chat/ChatMessageList.tsx \
  dashboard/client/src/components/chat/ChatInput.tsx \
  dashboard/client/src/components/chat/ChatTab.tsx \
  dashboard/client/src/components/chat/__tests__/ChatTab.test.tsx \
  dashboard/client/public/locales/en/sessions.json \
  dashboard/client/public/locales/zh/sessions.json
git commit -m "feat(chat): add ChatTab UI components"
```


### Task 3: Integrate `ChatTab` into `SessionDetail`

**Files:**
- Modify: `dashboard/client/src/pages/SessionDetail.tsx`
- Modify: `dashboard/client/src/pages/__tests__/screens.snapshot.test.tsx` (if snapshot includes SessionDetail tabs)
- Test: `dashboard/client/src/pages/__tests__/SessionDetail.chatTab.test.tsx`

**Interfaces:**
- `DetailTab` type expands from `"agents" | "conversation" | "timeline" | "reviews"` to include `"chat"`.
- New tab button appears between "Conversation" and "Timeline".

- [ ] **Step 1: Write the failing test**

Create `dashboard/client/src/pages/__tests__/SessionDetail.chatTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { SessionDetail } from "../SessionDetail";

vi.mock("../../lib/api", () => ({
  api: {
    sessions: {
      get: vi.fn(() =>
        Promise.resolve({
          session: {
            id: "sess-1",
            name: "Test Session",
            status: "active",
            cwd: "/tmp",
            started_at: new Date().toISOString(),
            model: "claude-sonnet-4",
          },
          agents: [],
          workflows: [],
        })
      ),
      transcripts: vi.fn(() => Promise.resolve({ transcripts: [] })),
    },
    pricing: { sessionCost: vi.fn(() => Promise.resolve({ total_cost: 0, breakdown: [] })) },
    plan: { get: vi.fn(() => Promise.reject(new Error("no plan"))) },
    run: {
      list: vi.fn(() => Promise.resolve({ items: [] })),
    },
  },
}));

vi.mock("../../lib/eventBus", () => ({
  eventBus: {
    subscribe: vi.fn(() => () => {}),
    connected: true,
    onConnection: vi.fn(() => () => {}),
  },
}));

describe("SessionDetail chat tab", () => {
  it("renders a Chat tab that can be activated", async () => {
    render(
      <MemoryRouter initialEntries={["/sessions/sess-1"]}&gt;
        &lt;Routes&gt;
          &lt;Route path="/sessions/:id" element={&lt;SessionDetail /&gt;} /&gt;
        &lt;/Routes&gt;
      &lt;/MemoryRouter&gt;
    );

    await waitFor(() => expect(screen.getByText("Test Session")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Chat/i }));
    expect(screen.getByPlaceholderText(/Ask Claude/)).toBeInTheDocument();
  });
});
```

Run:

```bash
cd dashboard/client
npx vitest run src/pages/__tests__/SessionDetail.chatTab.test.tsx
```

Expected: FAIL, no "Chat" button.

- [ ] **Step 2: Update `DetailTab` type and import `ChatTab`**

In `dashboard/client/src/pages/SessionDetail.tsx`:

```typescript
import { ChatTab } from "../components/chat/ChatTab";

type DetailTab = "agents" | "conversation" | "chat" | "timeline" | "reviews";
```

- [ ] **Step 3: Add the Chat tab button**

Insert a new tab button immediately after the "Conversation" button in the tab navigation block:

```tsx
<button
  onClick={() => {
    setActiveTab("chat");
    setTranscriptNotFound(false);
  }}
  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
    activeTab === "chat"
      ? "border-violet-500 text-violet-400"
      : "border-transparent text-gray-500 hover:text-gray-300"
  }`}
>
  <MessageSquare className="w-4 h-4" />
  {t("detail.chat")}
</button>
```

Add `MessageSquare` to the existing lucide import if not already present.

- [ ] **Step 4: Add the Chat tab panel**

Insert a new panel block after the conversation panel:

```tsx
{visitedTabs.has("chat") && (
  <div hidden={activeTab !== "chat"}>
    {session.cwd && (
      <ChatTab sessionId={session.id} cwd={session.cwd} />
    )}
  </div>
)}
```

- [ ] **Step 5: Add `detail.chat` i18n key**

Add `"chat": "Chat"` under the `detail` object in both `dashboard/client/public/locales/en/sessions.json` and `dashboard/client/public/locales/zh/sessions.json`.

- [ ] **Step 6: Run tests and update snapshots if intentional**

```bash
cd dashboard/client
npx vitest run src/pages/__tests__/SessionDetail.chatTab.test.tsx
```

Expected: PASS.

If `screens.snapshot.test.tsx` fails because the tab bar changed:

```bash
cd dashboard/client
npx vitest run -u
```

Review the snapshot diff before committing.

- [ ] **Step 7: Commit**

```bash
git add dashboard/client/src/pages/SessionDetail.tsx \
  dashboard/client/src/pages/__tests__/SessionDetail.chatTab.test.tsx \
  dashboard/client/public/locales/en/sessions.json \
  dashboard/client/public/locales/zh/sessions.json \
  dashboard/client/src/pages/__tests__/__snapshots__
git commit -m "feat(chat): add Chat tab to SessionDetail"
```


### Task 4: Add backend permission-response endpoint (blocked until PTY spike succeeds)

**Prerequisite:** The PTY spike must have demonstrated a reliable way to detect a terminal permission prompt and inject the confirmation characters.

**Files:**
- Modify: `dashboard/server/lib/run-spawner.js`
- Modify: `dashboard/server/routes/run.js`
- Modify: `dashboard/client/src/lib/api.ts`
- Modify: `dashboard/client/src/lib/types.ts`
- Test: `dashboard/server/__tests__/run-spawner.test.js`

**Interfaces:**
- `sendPermissionResponse(id, requestId, approved)` injects the appropriate confirmation characters into the PTY stdin (or writes a `permission_response` envelope if the PTY spike reveals that structured envelopes do work in PTY mode).
- `POST /api/run/:id/permission` accepts `{ requestId: string, approved: boolean }` and delegates to the spawner.
- `api.run.respondToPermission(id, { requestId, approved })` is the client wrapper.

- [ ] **Step 1: Write the failing server test**

Open `dashboard/server/__tests__/run-spawner.test.js` and add a new test (append near existing sendInput tests):

```js
const { describe, it } = require("node:test");
const assert = require("node:assert");
const { Readable, Writable } = require("node:stream");
const runs = require("../lib/run-spawner");

describe("run-spawner permission response", () => {
  it("writes a permission_response envelope to stdin", async () => {
    const stdinChunks = [];
    const child = {
      stdin: new Writable({
        write(chunk, _enc, cb) {
          stdinChunks.push(chunk.toString());
          cb();
        },
      }),
      stdout: new Readable({ read() {} }),
      stderr: new Readable({ read() {} }),
      kill() {},
      killed: false,
    };

    const handle = runs.__injectChildForTest({ child, mode: "conversation", prompt: "hi" });
    runs.sendPermissionResponse(handle.id, "perm-123", true);

    const written = stdinChunks.join("");
    const parsed = JSON.parse(written);
    assert.strictEqual(parsed.type, "permission_response");
    assert.strictEqual(parsed.id, "perm-123");
    assert.strictEqual(parsed.approved, true);
  });
});
```

Run:

```bash
cd dashboard
npm run test:server
```

Expected: FAIL, `sendPermissionResponse` is not exported.

- [ ] **Step 2: Implement `sendPermissionResponse` in `run-spawner.js`**

Add near `sendInput`:

```js
function permissionResponseEnvelope(requestId, approved) {
  return JSON.stringify({ type: "permission_response", id: requestId, approved }) + "\n";
}

function sendPermissionResponse(id, requestId, approved) {
  const handle = handles.get(id);
  if (!handle) throw makeErr("ENOTFOUND", "run not found");
  if (handle.mode !== "conversation") {
    throw makeErr("EWRONGMODE", "only conversation mode accepts permission responses");
  }
  if (handle.status !== "running" && handle.status !== "spawning") {
    throw makeErr("ENOTRUNNING", `run is ${handle.status}`);
  }
  if (typeof requestId !== "string" || !requestId) {
    throw makeErr("EBADREQUEST", "requestId is required");
  }
  if (!handle.child || !handle.child.stdin || !handle.child.stdin.writable) {
    throw makeErr("ESTDINCLOSED", "stdin is not writable");
  }
  handle.child.stdin.write(permissionResponseEnvelope(requestId, approved));
  broadcast("run_permission_response", { id, requestId, approved, at: Date.now() });
  return { ok: true };
}
```

Add `sendPermissionResponse` to `module.exports`.

- [ ] **Step 3: Add the HTTP route**

In `dashboard/server/routes/run.js`, add after the existing `/:id/message` route:

```js
router.post("/:id/permission", (req, res) => {
  const body = req.body || {};
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const approved = body.approved === true;
  if (!requestId) {
    return res.status(400).json({ error: { code: "EBADREQUEST", message: "requestId is required" } });
  }
  try {
    const result = runs.sendPermissionResponse(req.params.id, requestId, approved);
    return res.json(result);
  } catch (err) {
    const status = err.code === "ENOTFOUND" ? 404 : 400;
    return res.status(status).json({ error: { code: err.code, message: err.message } });
  }
});
```

- [ ] **Step 4: Add client API wrapper and types**

In `dashboard/client/src/lib/api.ts`, add to `RunStartArgs` interface siblings:

```typescript
export interface PermissionResponseArgs {
  requestId: string;
  approved: boolean;
}
```

Add to the `run:` namespace after `kill`:

```typescript
respondToPermission: (id: string, args: PermissionResponseArgs) =>
  request<{ ok: true }>(`/run/${encodeURIComponent(id)}/permission`, {
    method: "POST",
    body: JSON.stringify(args),
  }),
```

- [ ] **Step 5: Add WS payload types**

In `dashboard/client/src/lib/types.ts`, add:

```typescript
export interface RunPermissionRequestPayload {
  id: string;
  envelope: {
    type: "permission_request";
    id: string;
    tool_name: string;
    description: string;
  };
}

export interface RunPermissionResponsePayload {
  id: string;
  requestId: string;
  approved: boolean;
}
```

And add corresponding `type` variants to the `WSMessage` union.

- [ ] **Step 6: Run server tests**

```bash
cd dashboard
npm run test:server
```

Expected: PASS (including the new permission test).

- [ ] **Step 7: Commit**

```bash
git add dashboard/server/lib/run-spawner.js \
  dashboard/server/routes/run.js \
  dashboard/server/__tests__/run-spawner.test.js \
  dashboard/client/src/lib/api.ts \
  dashboard/client/src/lib/types.ts
git commit -m "feat(run): add permission response endpoint and client API"
```


### Task 5: Render permission requests as UI buttons (blocked until PTY spike succeeds)

**Prerequisite:** The PTY spike must have demonstrated a reliable way to detect a terminal permission prompt and inject the confirmation characters.

**Files:**
- Create: `dashboard/client/src/components/chat/PermissionPrompt.tsx`
- Modify: `dashboard/client/src/components/chat/useRunChat.ts` (handle `permission_request` envelope and WS events)
- Modify: `dashboard/client/src/components/chat/ChatTab.tsx` (render the prompt card)
- Test: `dashboard/client/src/components/chat/__tests__/PermissionPrompt.test.tsx`

**Interfaces:**
- `PermissionPrompt` receives `request: PermissionRequestEnvelope`, `onApprove`, `onReject`, `disabled`.

- [ ] **Step 1: Write the failing test**

Create `dashboard/client/src/components/chat/__tests__/PermissionPrompt.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionPrompt } from "../PermissionPrompt";

describe("PermissionPrompt", () => {
  it("calls onApprove when Approve is clicked", () => {
    const onApprove = vi.fn();
    render(
      <PermissionPrompt
        request={{ type: "permission_request", id: "p1", tool_name: "Bash", description: "List files" }}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Approve/i }));
    expect(onApprove).toHaveBeenCalled();
  });
});
```

Run:

```bash
cd dashboard/client
npx vitest run src/components/chat/__tests__/PermissionPrompt.test.tsx
```

Expected: FAIL, module not found.

- [ ] **Step 2: Create `PermissionPrompt` component**

Create `dashboard/client/src/components/chat/PermissionPrompt.tsx`:

```tsx
import { ShieldAlert, Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PermissionRequestEnvelope } from "./types";

export function PermissionPrompt({
  request,
  onApprove,
  onReject,
  disabled,
}: {
  request: PermissionRequestEnvelope;
  onApprove: () => void;
  onReject: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("sessions");

  return (
    <div className="mx-4 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
          <ShieldAlert className="w-4 h-4 text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-amber-200">
            {t("chat.permissionTitle")}
          </div>
          <div className="text-xs text-amber-100/70 mt-0.5">
            {request.tool_name}
          </div>
          {request.description && (
            <pre className="mt-2 text-xs text-gray-300 bg-black/20 rounded px-2.5 py-2 overflow-x-auto">
              {request.description}
            </pre>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onApprove}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" />
              {t("chat.permissionApprove")}
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-3 text-gray-200 text-xs font-medium hover:bg-surface-4 disabled:opacity-40"
            >
              <X className="w-3.5 h-3.5" />
              {t("chat.permissionReject")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `useRunChat` to track permission requests**

In `dashboard/client/src/components/chat/useRunChat.ts`, inside the WebSocket subscription:

```typescript
if (msg.type === "run_stream") {
  const p = msg.data as RunStreamPayload;
  if (handle && p.id === handle.id) {
    const env = p.envelope as Envelope;
    setEnvelopes((prev) => mergeEnvelope(prev, env));
    if ((env as { type?: string }).type === "permission_request") {
      setActivePermissionRequest(env as PermissionRequestEnvelope);
    }
  }
}
```

Also clear `activePermissionRequest` when a new user turn is sent or when the run ends.

- [ ] **Step 4: Wire `PermissionPrompt` into `ChatTab`**

Ensure `ChatTab` already imports and renders `PermissionPrompt` as shown in Task 2. Pass the real `request` prop and handlers:

```tsx
{activePermissionRequest && (
  <PermissionPrompt
    request={activePermissionRequest}
    onApprove={() => respondToPermission(true)}
    onReject={() => respondToPermission(false)}
    disabled={busy === "send"}
  />
)}
```

- [ ] **Step 5: Run tests**

```bash
cd dashboard/client
npx vitest run src/components/chat/__tests__/PermissionPrompt.test.tsx \
  src/components/chat/__tests__/useRunChat.test.tsx \
  src/components/chat/__tests__/ChatTab.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add dashboard/client/src/components/chat/PermissionPrompt.tsx \
  dashboard/client/src/components/chat/__tests__/PermissionPrompt.test.tsx \
  dashboard/client/src/components/chat/useRunChat.ts \
  dashboard/client/src/components/chat/ChatTab.tsx
git commit -m "feat(chat): render permission requests as inline approve/reject cards"
```


### Task 6: Responsive layout for desktop and mobile

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatTab.tsx`
- Modify: `dashboard/client/src/pages/SessionDetail.tsx`
- Test: manual verification on a phone or narrow viewport

**Goal:** The Chat tab must be usable on a phone browser (PWA) without horizontal scrolling. The input bar stays fixed at the bottom; the message list scrolls between the header and input.

- [ ] **Step 1: Make `ChatTab` height responsive**

Replace the fixed `h-[600px]` class in `ChatTab` with a flex layout that fills available space:

```tsx
<div className="flex flex-col rounded-xl border border-border bg-surface-1 overflow-hidden h-[min(70vh,600px)] md:h-[600px]">
```

Ensure the SessionDetail tab panel allows the Chat tab to stretch. In `SessionDetail.tsx`, wrap tab panels in a container that gives a minimum height, e.g.:

```tsx
<div className="min-h-[60vh]">{/* tab panels */}</div>
```

- [ ] **Step 2: Prevent body scroll when Chat is active on mobile**

On viewports narrower than `md`, when `activeTab === "chat"`, add `overflow-hidden` to the tab content wrapper so the page does not scroll; only the message list scrolls.

- [ ] **Step 3: Touch-friendly buttons**

In `ChatInput.tsx`, increase tap targets on mobile:

```tsx
<button className="p-3 md:p-2 ..." />
```

In `PermissionPrompt.tsx`, ensure approve/reject buttons have at least `44px` touch height.

- [ ] **Step 4: Manual verification**

1. Start the dev server: `cd dashboard && npm run dev`
2. Open `http://localhost:4820/sessions/<id>` in Chrome.
3. Open DevTools, toggle device toolbar to iPhone SE / Pixel 7.
4. Switch to the Chat tab, type a message, and confirm the input bar is reachable.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/components/chat/ChatTab.tsx \
  dashboard/client/src/components/chat/ChatInput.tsx \
  dashboard/client/src/components/chat/PermissionPrompt.tsx \
  dashboard/client/src/pages/SessionDetail.tsx
git commit -m "style(chat): responsive layout for mobile PWA"
```


### Task 7: Integration and end-to-end verification

**Files:**
- Modify: `dashboard/e2e/e2e-smoke.js`
- Create: `dashboard/server/__tests__/run-permission.test.js`
- Test: full client + server test suites

**Goal:** Prove the new chat tab and permission response path work end-to-end without breaking existing features.

- [ ] **Step 1: Extend E2E smoke test**

Open `dashboard/e2e/e2e-smoke.js` and add a new `smokeChat()` function after `smokeReviews`:

```js
async function smokeChat() {
  // We can't spawn the real `claude` binary in CI, but we can verify the
  // route shape by calling POST /api/run with an invalid prompt and checking
  // that the server responds with a structured error rather than a crash.
  const spawnRes = await req("POST", "/api/run", {
    prompt: "",
    mode: "conversation",
    cwd: os.tmpdir(),
  });
  if (spawnRes.status !== 400) {
    throw new Error(`expected 400 for empty prompt, got ${spawnRes.status}`);
  }

  // Verify the permission response route returns 404 for a non-existent run
  const permRes = await req("POST", "/api/run/nonexistent/permission", {
    requestId: "req-1",
    approved: true,
  });
  if (permRes.status !== 404) {
    throw new Error(`expected 404 for missing run, got ${permRes.status}`);
  }
  console.log("✓ chat route shape and permission error handling");
}
```

Call `smokeChat()` in `main()` after `smokeReviews`.

- [ ] **Step 2: Add server route test for permission response**

Create `dashboard/server/__tests__/run-permission.test.js`:

```js
const { describe, it } = require("node:test");
const assert = require("node:assert");
const request = require("supertest");
const { createApp } = require("../index");

describe("POST /api/run/:id/permission", () => {
  it("returns 400 when requestId is missing", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/run/does-not-exist/permission")
      .set("x-dashboard-token", process.env.DASHBOARD_TOKEN || "")
      .send({ approved: true });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, "EBADREQUEST");
  });
});
```

- [ ] **Step 3: Run full test suites**

Server:

```bash
cd dashboard
npm run test:server
```

Client:

```bash
cd dashboard/client
npm run test:client
```

E2E:

```bash
cd dashboard
npm run test:e2e
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/e2e/e2e-smoke.js \
  dashboard/server/__tests__/run-permission.test.js
git commit -m "test(chat): e2e and server route coverage for chat and permission response"
```


## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| Interactive chat UI inside SessionDetail | Task 2 + Task 3 |
| Stream assistant/tool output | Task 1 (useRunChat reuses existing stream-json parser) |
| Accept follow-up turns | Task 1 (`send`) + Task 2 (`ChatInput`) |
| Mid-session permission prompts as UI buttons | Task 4 (backend) + Task 5 (UI) |
| Mobile / PWA usability | Task 6 |
| Existing `/run` page continues to work | Task 1 refactor + Task 7 regression tests |
| Local-first / loopback security | Global constraints + Task 4 route keeps same-origin guard |

### Placeholder scan

- No "TBD", "TODO", or "implement later" strings remain in code steps.
- Every file path is exact and relative to the repo root.
- Every command has an expected output.
- Permission envelope schema is explicitly gated by the pre-requisite spike; the plan states the exact action to take if the spike fails.

### Type consistency

- `Envelope` union is defined once in `dashboard/client/src/components/chat/types.ts` and imported by `useRunChat.ts`, `ChatMessageList.tsx`, and `Run.tsx`.
- `PermissionResponseArgs` in `dashboard/client/src/lib/api.ts` matches the server route body (`{ requestId: string, approved: boolean }`).
- `RunPermissionRequestPayload` / `RunPermissionResponsePayload` in `dashboard/client/src/lib/types.ts` match the WS broadcasts emitted by `run-spawner.js`.

### Gaps / follow-ups

- A separate plan is needed for a native mobile app or ccpocket-style bridge server if you want remote access off the local network. Task 6 only covers responsive web/PWA.
- Persistent "always approve" preferences are not stored; the `remember` argument in `respondToPermission` is accepted but ignored in Task 5. Add a follow-up task to persist per-tool approval preferences in SQLite if desired.
- The exact property names inside `permission_request` / `permission_response` envelopes must be updated after the PTY spike; if no structured envelope exists, the UI will instead surface prompts parsed from the PTY output stream.
- **Critical blocker discovered:** Claude Code CLI does not emit structured `permission_request` envelopes in `stream-json` mode. A PTY-based interception spike must succeed before Tasks 4–5 can be implemented.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-01-interactive-claude-code-chat.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**2. Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach do you want?

