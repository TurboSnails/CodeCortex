# Chat Interaction Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the dead dual-`useRunChat` architecture on `/chat`, then layer four interaction improvements on top of the corrected data flow: a Focus mode toggle, hover step-chain previews for workflow modes, a themed confirm dialog (replacing `window.confirm`) with a real New-Session guard, and Git-panel consolidation.

**Architecture:** `useRunChat` moves from being called separately inside both `Chat.tsx` and `ChatTab.tsx` to being called once in `Chat.tsx` and passed down as an optional prop — `ChatTab` falls back to its own internal call when no prop is given, so its other consumer (`SessionDetail.tsx`) is unaffected. All four UI improvements are additive: new reducer state (`ChatWorkspaceContext`), a new shared `ConfirmDialog` component (native `<dialog>`, matching the existing `SessionHistoryDialog` pattern), and small edits to existing components.

**Tech Stack:** React + TypeScript, Vitest + Testing Library, react-i18next, lucide-react icons, Tailwind utility classes (no new dependencies).

## Global Constraints

- Preserve existing behavior unless explicitly asked to change it (dashboard/CLAUDE.md).
- Prefer minimal, reversible diffs (dashboard/CLAUDE.md).
- Frontend changes: run `npm run test:client` (from `dashboard/`) before finishing; this includes per-screen snapshot tests (`client/src/pages/__tests__/screens.snapshot.test.tsx`) — review any diff and regenerate baselines deliberately with `cd client && npx vitest run -u`, never blindly.
- No new npm dependencies — reuse the existing `Tip` component, native `<dialog>`, and `lucide-react` icons already in the project.
- `ChatTab`'s `sessionId` prop is a confirmed-dead parameter (never read inside `useRunChat`'s body) — remove it rather than keep it as a no-op.

---

### Task 1: Add `reset()` to `useRunChat`

**Files:**
- Modify: `dashboard/client/src/components/chat/useRunChat.ts`
- Test: `dashboard/client/src/components/chat/__tests__/useRunChat.test.tsx`

**Interfaces:**
- Produces: `UseRunChatReturn.reset: () => void` — clears `handle`, `envelopes`, `followUp`, `busy`, `error`, and `activePermissionRequest` back to their initial values. Later tasks (3, 9) call `runChat.reset()`.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/client/src/components/chat/__tests__/useRunChat.test.tsx`, inside the `describe("useRunChat", ...)` block (after the existing `"kills the run through the API"` test):

```tsx
  it("reset() clears handle, envelopes, followUp, error, and permission request", async () => {
    const handle: RunHandle = {
      id: "run-1",
      status: "running",
      mode: "conversation",
      cwd: "/tmp",
      permissionMode: "acceptEdits",
      model: null,
      effort: null,
      prompt: "hello",
      argv: [],
      pid: 123,
      resumeSessionId: null,
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      signal: null,
      error: null,
      sessionId: "sess-1",
      envelopeCount: 1,
      stdoutTail: "",
      stderrTail: "",
    };
    mockStart.mockResolvedValueOnce(handle);

    const { result } = renderHook(() => useRunChat({ sessionId: "sess-1", cwd: "/tmp" }));

    await act(async () => {
      await result.current.start("hello");
    });
    act(() => {
      result.current.setFollowUp("draft text");
    });
    expect(result.current.handle).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.handle).toBeNull();
    expect(result.current.envelopes).toEqual([]);
    expect(result.current.followUp).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.activePermissionRequest).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/useRunChat.test.tsx`
Expected: FAIL with `result.current.reset is not a function`

- [ ] **Step 3: Implement `reset()`**

In `dashboard/client/src/components/chat/useRunChat.ts`, add `reset` to the `UseRunChatReturn` interface (after `isResponding: boolean;`):

```ts
  isResponding: boolean;
  reset: () => void;
}
```

Then, inside `useRunChat`, add the implementation right before the `return` statement (after the `isResponding` `useMemo` block):

```ts
  const reset = useCallback(() => {
    setHandle(null);
    setEnvelopes([]);
    setFollowUp("");
    setBusy(null);
    setError(null);
    setActivePermissionRequest(null);
  }, []);

  return {
    handle,
    envelopes,
    displayEnvelopes,
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
    isResponding,
    reset,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/useRunChat.test.tsx`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
cd dashboard && git add client/src/components/chat/useRunChat.ts client/src/components/chat/__tests__/useRunChat.test.tsx
git commit -m "feat(chat): add reset() to useRunChat"
```

---

### Task 2: Make `ChatTab` accept an optional `runChat` prop

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatTab.tsx`
- Modify: `dashboard/client/src/pages/Chat.tsx` (drop the now-invalid `sessionId` prop passed to `ChatTab` — does not yet pass `runChat`)
- Modify: `dashboard/client/src/pages/SessionDetail.tsx` (drop the same dead prop)

**Interfaces:**
- Consumes: `UseRunChatReturn` type from `./useRunChat` (already defined, extended in Task 1).
- Produces: `ChatTab`'s props become `{ runChat?: UseRunChatReturn; cwd: string; className?: string }`. When `runChat` is omitted, `ChatTab` calls `useRunChat({ cwd })` itself — this is the fallback path `SessionDetail.tsx` continues to use unchanged. Task 3 wires `Chat.tsx` to pass `runChat` explicitly.

This task is a no-behavior-change refactor: with no caller passing `runChat` yet, every existing test and consumer keeps working exactly as before.

- [ ] **Step 1: Write the failing test**

Add a new test to `dashboard/client/src/components/chat/__tests__/ChatTab.test.tsx` (after the existing `"enables send button when text is entered"` test), proving an externally-supplied `runChat` is honored instead of an internal one:

```tsx
  it("uses an externally-supplied runChat instead of creating its own", () => {
    const externalRunChat = {
      handle: null,
      envelopes: [],
      displayEnvelopes: [],
      busy: null,
      error: null,
      followUp: "external draft",
      setFollowUp: vi.fn(),
      start: vi.fn(),
      send: vi.fn(),
      stop: vi.fn(),
      activePermissionRequest: null,
      respondToPermission: vi.fn(),
      isLive: false,
      isResponding: false,
      reset: vi.fn(),
    };
    render(
      <ChatWorkspaceProvider>
        <ChatTab cwd="/tmp" runChat={externalRunChat} />
      </ChatWorkspaceProvider>
    );
    expect(screen.getByRole("textbox")).toHaveValue("external draft");
  });
```

This requires importing `ChatTab`'s prop type — no new import needed since the test constructs a plain object matching the shape.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatTab.test.tsx`
Expected: FAIL — either a TypeScript error (`runChat` does not exist on props) or the textarea showing empty value instead of `"external draft"`.

- [ ] **Step 3: Change `ChatTab`'s prop signature and internal wiring**

In `dashboard/client/src/components/chat/ChatTab.tsx`, add the import (alongside the existing `useRunChat` import):

```ts
import { useRunChat, type UseRunChatReturn } from "./useRunChat";
```

Change the function signature from:

```ts
export function ChatTab({
  sessionId,
  cwd,
  className,
}: {
  sessionId: string;
  cwd: string;
  className?: string;
}) {
```

to:

```ts
export function ChatTab({
  runChat: externalRunChat,
  cwd,
  className,
}: {
  runChat?: UseRunChatReturn;
  cwd: string;
  className?: string;
}) {
```

Then change the hook call from:

```ts
  const {
    handle,
    displayEnvelopes,
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
    isResponding,
  } = useRunChat({ sessionId, cwd });
```

to:

```ts
  const internalRunChat = useRunChat({ cwd });
  const runChat = externalRunChat ?? internalRunChat;
  const {
    handle,
    displayEnvelopes,
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
    isResponding,
  } = runChat;
```

- [ ] **Step 4: Drop the dead `sessionId` prop from both call sites**

In `dashboard/client/src/pages/Chat.tsx`, change:

```tsx
              <ChatTab key={sessionId} sessionId={sessionId} cwd={cwd} className="h-full border-0 rounded-none" />
```

to:

```tsx
              <ChatTab key={sessionId} cwd={cwd} className="h-full border-0 rounded-none" />
```

(Task 3 will add `runChat={runChat}` here — leaving it off for now keeps this task's diff isolated to the prop-shape change.)

In `dashboard/client/src/pages/SessionDetail.tsx`, change:

```tsx
              <ChatTab sessionId={session.id} cwd={session.cwd} />
```

to:

```tsx
              <ChatTab cwd={session.cwd} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatTab.test.tsx src/components/chat/__tests__/ChatTab.workflow.test.tsx src/pages/__tests__/SessionDetail.chatTab.test.tsx`
Expected: PASS — all existing tests in these three files continue to pass unchanged (they exercise the internal-fallback path), plus the new test from Step 1.

- [ ] **Step 6: Commit**

```bash
cd dashboard && git add client/src/components/chat/ChatTab.tsx client/src/pages/Chat.tsx client/src/pages/SessionDetail.tsx client/src/components/chat/__tests__/ChatTab.test.tsx
git commit -m "refactor(chat): let ChatTab accept an external runChat instance"
```

---

### Task 3: Lift `useRunChat` into `Chat.tsx` as the single source of truth

**Files:**
- Modify: `dashboard/client/src/pages/Chat.tsx`
- Create: `dashboard/client/src/pages/__tests__/Chat.test.tsx`

**Interfaces:**
- Consumes: `runChat.reset()` (Task 1), `ChatTab`'s optional `runChat` prop (Task 2).
- Produces: `Chat.tsx`'s `runChat` is now the only `useRunChat` instance on the page; `ChatStatusBar`, `BottomPanel`, and the file-highlighting effect receive real envelope data. New Session calls `runChat.reset()`.

- [ ] **Step 1: Write the failing test**

Create `dashboard/client/src/pages/__tests__/Chat.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Chat } from "../Chat";
import { api } from "../../lib/api";
import type { RunHandle } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    run: {
      cwds: vi.fn(() => Promise.resolve({ items: [{ path: "/tmp/project" }] })),
      start: vi.fn(),
      send: vi.fn(),
      kill: vi.fn(),
      respondToPermission: vi.fn(),
      files: vi.fn(),
    },
    files: {
      tree: vi.fn(() => Promise.resolve({ tree: [] })),
      content: vi.fn(() => Promise.resolve({ content: "" })),
    },
    git: {
      status: vi.fn(() => Promise.resolve({ staged: [], unstaged: [] })),
      diff: vi.fn(() => Promise.resolve({ diff: "" })),
    },
    ccConfig: {
      commands: vi.fn(() => Promise.resolve({ items: [] })),
    },
  },
}));

let busCallback: ((msg: unknown) => void) | null = null;
vi.mock("../../lib/eventBus", () => ({
  eventBus: {
    subscribe: vi.fn((cb: (msg: unknown) => void) => {
      busCallback = cb;
      return () => {
        busCallback = null;
      };
    }),
    connected: true,
    onConnection: vi.fn(() => () => {}),
  },
}));

const mockStart = vi.mocked(api.run.start);

function makeHandle(): RunHandle {
  return {
    id: "run-1",
    pid: 123,
    mode: "conversation",
    cwd: "/tmp/project",
    model: null,
    permissionMode: "acceptEdits",
    effort: null,
    prompt: "hello",
    argv: [],
    resumeSessionId: null,
    status: "running",
    startedAt: Date.now(),
    endedAt: null,
    exitCode: null,
    signal: null,
    error: null,
    sessionId: "sess-1",
    envelopeCount: 1,
    stdoutTail: "",
    stderrTail: "",
  };
}

describe("Chat page", () => {
  beforeEach(() => {
    busCallback = null;
    vi.clearAllMocks();
    mockStart.mockResolvedValue(makeHandle());
    (api.run.cwds as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [{ path: "/tmp/project" }] });
  });

  it("feeds real envelope data to the page-level status bar (not a dead runChat instance)", async () => {
    render(<Chat />);

    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    await waitFor(() => expect(busCallback).not.toBeNull());

    act(() => {
      busCallback?.({
        type: "run_stream",
        data: {
          id: "run-1",
          envelope: {
            type: "result",
            total_cost_usd: 0.25,
            modelUsage: {
              "claude-sonnet": {
                contextWindow: 200_000,
                inputTokens: 1000,
                outputTokens: 500,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
              },
            },
          },
        },
      });
    });

    await waitFor(() => expect(screen.getByText(/\$0\.2500/)).toBeInTheDocument());
  });

  it("resets run state when New Session is clicked while idle", async () => {
    render(<Chat />);

    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(busCallback).not.toBeNull());

    // Let the run finish so the page is genuinely idle before clicking New
    // Session - Task 9 adds a confirm-guard for the "still active" case,
    // which is covered separately and would otherwise intercept this click.
    act(() => {
      busCallback?.({
        type: "run_status",
        data: { id: "run-1", status: "completed", at: Date.now() },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /new session/i }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "second" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(2));
  });
});
```

**Note for Task 9:** once the New-Session confirm guard lands, re-run this test file — this specific test already simulates the run completing (via a `run_status: "completed"` event) before clicking New Session, so it stays valid once the guard checks `runChat.isLive`. No further edit to this test should be needed, but confirm it still passes in Task 9's test run.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/client && npx vitest run src/pages/__tests__/Chat.test.tsx`
Expected: FAIL on the first test — `$0.2500` never appears, because `Chat.tsx`'s own `runChat.envelopes` never receives the `run_stream` message (its `handle` is `null`, so `useRunChat`'s subscription filter `handle && p.id === handle.id` never matches).

- [ ] **Step 3: Wire `Chat.tsx` to pass `runChat` down and reset it on New Session**

In `dashboard/client/src/pages/Chat.tsx`, change the New Session button's handler. Current:

```tsx
          <button
            type="button"
            onClick={() => setSessionId(newSessionId())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-gray-300 border border-border hover:bg-surface-3 hover:text-gray-100 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t("chat.newSession", "New Session")}
          </button>
```

Add a named handler above the `return` statement (near the other `handleGit*` callbacks):

```ts
  const startNewSession = useCallback(() => {
    runChat.reset();
    setSessionId(newSessionId());
  }, [runChat]);
```

Then change the button's `onClick`:

```tsx
          <button
            type="button"
            onClick={startNewSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-gray-300 border border-border hover:bg-surface-3 hover:text-gray-100 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t("chat.newSession", "New Session")}
          </button>
```

Finally, pass `runChat` down to `ChatTab` (from Task 2's edit):

```tsx
              <ChatTab key={sessionId} runChat={runChat} cwd={cwd} className="h-full border-0 rounded-none" />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/client && npx vitest run src/pages/__tests__/Chat.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full chat test suite to check for regressions**

Run: `cd dashboard/client && npx vitest run src/components/chat src/pages/__tests__/SessionDetail.chatTab.test.tsx src/pages/__tests__/Chat.test.tsx`
Expected: PASS — no regressions from lifting the hook.

- [ ] **Step 6: Typecheck**

Run: `cd dashboard/client && npx tsc -b`
Expected: no errors (confirms `sessionId` removal in Task 2 and the new `runChat` prop line up across `Chat.tsx`, `ChatTab.tsx`, `SessionDetail.tsx`).

- [ ] **Step 7: Commit**

```bash
cd dashboard && git add client/src/pages/Chat.tsx client/src/pages/__tests__/Chat.test.tsx
git commit -m "fix(chat): lift useRunChat to Chat.tsx so the status bar and bottom panel see real data"
```

---

### Task 4: Add Focus-mode state to `ChatWorkspaceContext`

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatWorkspaceContext.tsx`
- Test: `dashboard/client/src/components/chat/__tests__/ChatWorkspace.TokenMeter.test.tsx`

**Interfaces:**
- Produces: `ChatWorkspaceState.focusMode: boolean`, `ChatWorkspaceState.preFocusSnapshot: { left: boolean; right: boolean; bottom: boolean } | null`, and `useChatWorkspaceActions().toggleFocusMode: () => void`. Task 5 consumes `state.focusMode` and `actions.toggleFocusMode`.

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/client/src/components/chat/__tests__/ChatWorkspace.TokenMeter.test.tsx`, inside the `describe("ChatWorkspaceContext", ...)` block (after `"keeps at most 100 problems"`):

```tsx
  it("toggleFocusMode hides all panels and snapshots prior visibility", () => {
    const { result } = renderHook(
      () => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }),
      { wrapper }
    );
    act(() => result.current.actions.toggleBottomPanel()); // bottom becomes visible

    act(() => result.current.actions.toggleFocusMode());

    expect(result.current.state.focusMode).toBe(true);
    expect(result.current.state.leftSidebar.visible).toBe(false);
    expect(result.current.state.rightPanel.visible).toBe(false);
    expect(result.current.state.bottomPanel.visible).toBe(false);
  });

  it("toggleFocusMode restores the exact prior visibility on exit", () => {
    const { result } = renderHook(
      () => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }),
      { wrapper }
    );
    act(() => result.current.actions.toggleRightPanel()); // right panel becomes hidden (was visible)

    act(() => result.current.actions.toggleFocusMode()); // enter focus
    act(() => result.current.actions.toggleFocusMode()); // exit focus

    expect(result.current.state.focusMode).toBe(false);
    expect(result.current.state.leftSidebar.visible).toBe(true);
    expect(result.current.state.rightPanel.visible).toBe(false);
    expect(result.current.state.bottomPanel.visible).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatWorkspace.TokenMeter.test.tsx`
Expected: FAIL — `result.current.actions.toggleFocusMode is not a function`

- [ ] **Step 3: Implement the state, action, and reducer case**

In `dashboard/client/src/components/chat/ChatWorkspaceContext.tsx`, add to `ChatWorkspaceState` (after `highlightedPaths: Set<string>;`):

```ts
  highlightedPaths: Set<string>;
  focusMode: boolean;
  preFocusSnapshot: { left: boolean; right: boolean; bottom: boolean } | null;
}
```

Add to the `Action` union (after `| { type: "open_file_preview"; payload: string };`, changing the trailing `;` accordingly):

```ts
  | { type: "open_file_preview"; payload: string }
  | { type: "toggle_focus_mode" };
```

Add to `initialState` (after `highlightedPaths: new Set(),`):

```ts
  highlightedPaths: new Set(),
  focusMode: false,
  preFocusSnapshot: null,
};
```

Add a reducer case (after the `case "set_highlighted_paths":` block, before `default:`):

```ts
    case "toggle_focus_mode": {
      if (!state.focusMode) {
        return {
          ...state,
          focusMode: true,
          preFocusSnapshot: {
            left: state.leftSidebar.visible,
            right: state.rightPanel.visible,
            bottom: state.bottomPanel.visible,
          },
          leftSidebar: { ...state.leftSidebar, visible: false },
          rightPanel: { ...state.rightPanel, visible: false },
          bottomPanel: { ...state.bottomPanel, visible: false },
        };
      }
      const snap = state.preFocusSnapshot ?? { left: true, right: true, bottom: false };
      return {
        ...state,
        focusMode: false,
        preFocusSnapshot: null,
        leftSidebar: { ...state.leftSidebar, visible: snap.left },
        rightPanel: { ...state.rightPanel, visible: snap.right },
        bottomPanel: { ...state.bottomPanel, visible: snap.bottom },
      };
    }
```

Add the action creator inside `useChatWorkspaceActions` (after `setHighlightedPaths`):

```ts
  const toggleFocusMode = useCallback(() => dispatch({ type: "toggle_focus_mode" }), [dispatch]);
```

Add `toggleFocusMode` to both the returned object and its `useMemo` dependency array (after `setHighlightedPaths,` in each):

```ts
      setHighlightedPaths,
      toggleFocusMode,
    }),
    [
      // ...
      setHighlightedPaths,
      toggleFocusMode,
    ]
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatWorkspace.TokenMeter.test.tsx`
Expected: PASS (all tests in this file, including the two new ones)

- [ ] **Step 5: Commit**

```bash
cd dashboard && git add client/src/components/chat/ChatWorkspaceContext.tsx client/src/components/chat/__tests__/ChatWorkspace.TokenMeter.test.tsx
git commit -m "feat(chat): add focus-mode state to ChatWorkspaceContext"
```

---

### Task 5: Wire the Focus-mode button, ActivityBar hiding, and keyboard shortcut

**Files:**
- Modify: `dashboard/client/src/pages/Chat.tsx`
- Modify: `dashboard/client/src/components/chat/useChatShortcuts.ts`
- Modify: `dashboard/client/src/i18n/locales/en/sessions.json`
- Modify: `dashboard/client/src/i18n/locales/zh/sessions.json`

**Interfaces:**
- Consumes: `state.focusMode`, `actions.toggleFocusMode` (Task 4).

- [ ] **Step 1: Write the failing test**

Add to `dashboard/client/src/pages/__tests__/Chat.test.tsx` (reuses the mocks already set up in Task 3), after the existing tests:

```tsx
  it("Focus button hides side/bottom panels and the shortcut toggles it back", async () => {
    render(<Chat />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());

    expect(screen.getByTitle("Explorer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^focus$/i }));
    expect(screen.queryByTitle("Explorer")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "f", metaKey: true, shiftKey: true });
    expect(screen.getByTitle("Explorer")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/client && npx vitest run src/pages/__tests__/Chat.test.tsx`
Expected: FAIL — no button named "Focus" exists yet.

- [ ] **Step 3: Add i18n keys**

In `dashboard/client/src/i18n/locales/en/sessions.json`, inside the `"chat"` object (after `"followUpPlaceholder": "Send a follow-up…",`):

```json
    "followUpPlaceholder": "Send a follow-up…",
    "focusMode": "Focus",
    "exitFocusMode": "Exit Focus",
```

In `dashboard/client/src/i18n/locales/zh/sessions.json`, inside the `"chat"` object (same position):

```json
    "followUpPlaceholder": "发送后续消息…",
    "focusMode": "专注模式",
    "exitFocusMode": "退出专注",
```

- [ ] **Step 4: Add the Focus button and hide the ActivityBar in `Chat.tsx`**

Add `Maximize2, Minimize2` to the `lucide-react` import:

```tsx
import { Menu, MessageSquare, History, RefreshCw, Maximize2, Minimize2 } from "lucide-react";
```

Add the button in the header actions row, immediately before the existing "New Session" button:

```tsx
          <button
            type="button"
            onClick={actions.toggleFocusMode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-gray-300 border border-border hover:bg-surface-3 hover:text-gray-100 transition-colors"
          >
            {state.focusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {state.focusMode ? t("chat.exitFocusMode") : t("chat.focusMode")}
          </button>
          <button
            type="button"
            onClick={startNewSession}
            ...
```

Wrap the `ActivityBar` + left `ResizablePanel` block so it disappears entirely during focus mode. Change:

```tsx
        <div className={mobileSidebarOpen ? "block md:contents" : "hidden md:contents"}>
          <ActivityBar active={state.leftSidebar.activeView} onChange={(v) => { actions.setLeftView(v); setMobileSidebarOpen(false); }} />
          <ResizablePanel
            side="left"
            visible={state.leftSidebar.visible}
            defaultWidth={240}
            onToggle={actions.toggleLeftSidebar}
            header={leftHeader}
          >
            {leftContent}
          </ResizablePanel>
        </div>
```

to:

```tsx
        {!state.focusMode && (
          <div className={mobileSidebarOpen ? "block md:contents" : "hidden md:contents"}>
            <ActivityBar active={state.leftSidebar.activeView} onChange={(v) => { actions.setLeftView(v); setMobileSidebarOpen(false); }} />
            <ResizablePanel
              side="left"
              visible={state.leftSidebar.visible}
              defaultWidth={240}
              onToggle={actions.toggleLeftSidebar}
              header={leftHeader}
            >
              {leftContent}
            </ResizablePanel>
          </div>
        )}
```

(The right `ResizablePanel` and `BottomPanel` already stop rendering on their own once `visible` is `false`, per Task 4's reducer — no change needed there.)

- [ ] **Step 5: Add the `Cmd+Shift+F` shortcut**

In `dashboard/client/src/components/chat/useChatShortcuts.ts`, add to the `ShortcutActions` interface (after `stopRun?: () => void;`):

```ts
  stopRun?: () => void;
  toggleFocusMode?: () => void;
}
```

Add the key handler (after the `Cmd+Shift+M` block, before `Esc`):

```ts
      // Cmd+Shift+F: toggle Focus mode
      if (meta && shift && e.key.toLowerCase() === "f") {
        e.preventDefault();
        actions.toggleFocusMode?.();
        return;
      }

      // Esc: stop running session if provided
```

In `dashboard/client/src/pages/Chat.tsx`, pass the action through the existing `useChatShortcuts` call:

```tsx
  useChatShortcuts({
    toggleLeftSidebar: actions.toggleLeftSidebar,
    setLeftView: actions.setLeftView,
    toggleRightPanel: actions.toggleRightPanel,
    setRightTab: actions.setRightTab,
    toggleBottomPanel: actions.toggleBottomPanel,
    setBottomTab: actions.setBottomTab,
    stopRun: isLive ? stop : undefined,
    toggleFocusMode: actions.toggleFocusMode,
  });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd dashboard/client && npx vitest run src/pages/__tests__/Chat.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd dashboard && git add client/src/pages/Chat.tsx client/src/components/chat/useChatShortcuts.ts client/src/i18n/locales/en/sessions.json client/src/i18n/locales/zh/sessions.json client/src/pages/__tests__/Chat.test.tsx
git commit -m "feat(chat): add Focus mode toggle button and Cmd+Shift+F shortcut"
```

---

### Task 6: Workflow-mode hover preview

**Files:**
- Modify: `dashboard/client/src/components/chat/workflowConfig.ts`
- Modify: `dashboard/client/src/components/chat/ChatModeSelector.tsx`
- Test: `dashboard/client/src/components/chat/__tests__/ChatModeSelector.test.tsx`

**Interfaces:**
- Produces: `getModePreview(mode: ChatMode): string | undefined` in `workflowConfig.ts` — `undefined` for `"normal"`, a one-line description of the step chain for the other three modes.

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/client/src/components/chat/__tests__/ChatModeSelector.test.tsx`, after the existing tests, and add `fireEvent` to the import:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatModeSelector } from "../ChatModeSelector";

describe("ChatModeSelector", () => {
  // ...existing tests unchanged...

  it("shows a step-chain hover preview for OpenSpec mode", () => {
    render(<ChatModeSelector mode="normal" onChange={vi.fn()} />);
    const openSpecBtn = screen.getByRole("radio", { name: "OpenSpec" });
    fireEvent.mouseEnter(openSpecBtn.parentElement!, { clientX: 10, clientY: 10 });
    expect(screen.getByText(/opsx:explore/)).toBeInTheDocument();
    expect(screen.getByText(/opsx:archive/)).toBeInTheDocument();
  });

  it("shows no hover preview for the normal mode", () => {
    render(<ChatModeSelector mode="normal" onChange={vi.fn()} />);
    const normalBtn = screen.getByRole("radio", { name: "普通" });
    fireEvent.mouseEnter(normalBtn, { clientX: 10, clientY: 10 });
    expect(screen.queryByText(/自动执行/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatModeSelector.test.tsx`
Expected: FAIL — no preview text renders on hover yet.

- [ ] **Step 3: Add `getModePreview` to `workflowConfig.ts`**

Add after `getPlaceholder`:

```ts
export function getModePreview(mode: ChatMode): string | undefined {
  if (mode === "normal") return undefined;
  const chain = getWorkflowSteps(mode)
    .map((s) => s.command)
    .join(" → ");
  return `自动执行：${chain}（每步完成后自动推进到下一步）`;
}
```

- [ ] **Step 4: Wrap the mode pills with `Tip` in `ChatModeSelector.tsx`**

Replace the full file contents with:

```tsx
import { CHAT_MODES, getModePreview, type ChatMode } from "./workflowConfig";
import { Tip } from "../Tip";

export interface ChatModeSelectorProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
}

export function ChatModeSelector({ mode, onChange }: ChatModeSelectorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2" role="group" aria-label="Chat mode">
      {CHAT_MODES.map((m) => {
        const active = m.id === mode;
        const button = (
          <button
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              active
                ? "bg-indigo-600 text-white border-indigo-500"
                : "bg-surface-2 text-gray-400 border-border hover:bg-surface-3 hover:text-gray-200"
            }`}
          >
            {m.label}
          </button>
        );
        return (
          <Tip key={m.id} raw={getModePreview(m.id)}>
            {button}
          </Tip>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatModeSelector.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
cd dashboard && git add client/src/components/chat/workflowConfig.ts client/src/components/chat/ChatModeSelector.tsx client/src/components/chat/__tests__/ChatModeSelector.test.tsx
git commit -m "feat(chat): add hover step-chain preview to workflow mode pills"
```

---

### Task 7: Build the shared `ConfirmDialog` component

**Files:**
- Create: `dashboard/client/src/components/chat/ConfirmDialog.tsx`
- Test: `dashboard/client/src/components/chat/__tests__/ConfirmDialog.test.tsx`

**Interfaces:**
- Produces: `ConfirmDialog` React component with props `{ open: boolean; title: string; message: string; confirmLabel: string; cancelLabel: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void }`. Consumed by Task 8 (mode-switch guard) and Task 9 (New Session guard).

- [ ] **Step 1: Write the failing test**

Create `dashboard/client/src/components/chat/__tests__/ConfirmDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "../ConfirmDialog";

beforeAll(() => {
  // jsdom doesn't implement <dialog>'s imperative methods.
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  }
});

describe("ConfirmDialog", () => {
  it("renders title, message, and both action buttons when open", () => {
    render(
      <ConfirmDialog
        open
        title="Switch mode?"
        message="Progress will be lost."
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText("Switch mode?")).toBeInTheDocument();
    expect(screen.getByText("Progress will be lost.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="T" message="M" confirmLabel="Yes" cancelLabel="No" onConfirm={onConfirm} onCancel={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="T" message="M" confirmLabel="Yes" cancelLabel="No" onConfirm={vi.fn()} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not render its content when closed", () => {
    render(
      <ConfirmDialog open={false} title="T" message="M" confirmLabel="Yes" cancelLabel="No" onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: "Yes" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ConfirmDialog.test.tsx`
Expected: FAIL — `Cannot find module '../ConfirmDialog'`

- [ ] **Step 3: Implement `ConfirmDialog.tsx`**

```tsx
/**
 * @file ConfirmDialog.tsx
 * @description Shared themed confirmation modal, replacing native window.confirm()
 * for actions that discard in-progress work (mode switch, new session).
 */

import { useEffect, useRef } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal?.();
    } else if (typeof dialogRef.current?.close === "function") {
      dialogRef.current.close();
    }
  }, [open]);

  if (!open) {
    return <dialog ref={dialogRef} />;
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        if (e.target === dialogRef.current) onCancel();
      }}
      onCancel={() => onCancel()}
      className="rounded-xl border border-border bg-surface-1 shadow-xl shadow-black/50 p-0 m-auto"
      style={{ maxWidth: "24rem", width: "90vw" }}
    >
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-medium text-gray-200">{title}</span>
      </div>
      <div className="px-4 py-3 text-sm text-gray-300">{message}</div>
      <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-gray-300 border border-border hover:bg-surface-3 hover:text-gray-100 transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            destructive
              ? "bg-red-600 text-white hover:bg-red-500"
              : "bg-indigo-600 text-white hover:bg-indigo-500"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
```

Note: rendering an empty `<dialog ref={dialogRef} />` (rather than `null`) when `open` is `false` keeps the same `dialogRef` node mounted across the `open` transition, so the `useEffect`'s `showModal()`/`close()` calls always target a real element.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ConfirmDialog.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd dashboard && git add client/src/components/chat/ConfirmDialog.tsx client/src/components/chat/__tests__/ConfirmDialog.test.tsx
git commit -m "feat(chat): add shared ConfirmDialog component"
```

---

### Task 8: Replace `window.confirm` with `ConfirmDialog`, and localize workflow banners

**Files:**
- Modify: `dashboard/client/src/components/chat/ChatTab.tsx`
- Modify: `dashboard/client/src/i18n/locales/en/sessions.json`
- Modify: `dashboard/client/src/i18n/locales/zh/sessions.json`
- Modify: `dashboard/client/src/i18n/locales/en/common.json`
- Modify: `dashboard/client/src/i18n/locales/zh/common.json`
- Test: `dashboard/client/src/components/chat/__tests__/ChatTab.workflow.test.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 7).

- [ ] **Step 1: Write the failing test**

Add to `dashboard/client/src/components/chat/__tests__/ChatTab.workflow.test.tsx`, after the existing mode-switch-related tests (search the file for how mode switching is tested today, or add near the end of the `describe` block):

```tsx
  it("shows a themed confirm dialog (not window.confirm) when switching modes mid-workflow", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());
    const confirmSpy = vi.spyOn(window, "confirm");

    renderChatTab();

    fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "add login" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(mockStart).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("radio", { name: /Superpower/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    const confirmButton = screen.getByRole("button", { name: /switch anyway/i });
    expect(confirmButton).toBeInTheDocument();
    // Mode hasn't switched yet - still on OpenSpec until confirmed.
    expect(screen.getByRole("radio", { name: /OpenSpec/i })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Superpower/i })).toHaveAttribute("aria-checked", "true")
    );
  });

  it("dismisses the confirm dialog without switching modes when Cancel is clicked", async () => {
    mockStart.mockResolvedValueOnce(makeHandle());

    renderChatTab();

    fireEvent.click(screen.getByRole("radio", { name: /OpenSpec/i }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "add login" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(mockStart).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("radio", { name: /Superpower/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("button", { name: /switch anyway/i })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /OpenSpec/i })).toHaveAttribute("aria-checked", "true");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatTab.workflow.test.tsx`
Expected: FAIL — the current code calls `window.confirm(...)` synchronously (jsdom's default `window.confirm` returns `false`), so the mode never switches and no "switch anyway" button exists.

- [ ] **Step 3: Add i18n keys**

In `dashboard/client/src/i18n/locales/en/sessions.json`, inside `"chat"` (after the keys added in Task 5):

```json
    "exitFocusMode": "Exit Focus",
    "modeSwitchConfirmTitle": "Switch mode?",
    "modeSwitchConfirmMessage": "The current workflow hasn't finished. Switching modes will cancel its progress.",
    "modeSwitchConfirmAction": "Switch anyway",
    "workflowPaused": "This step needs your input — continue describing what you need or answer the question.",
    "workflowAutoAdvance": "This step is complete. The next step ({{command}}) will run automatically.",
```

In `dashboard/client/src/i18n/locales/zh/sessions.json`, inside `"chat"` (same position):

```json
    "exitFocusMode": "退出专注",
    "modeSwitchConfirmTitle": "切换模式？",
    "modeSwitchConfirmMessage": "当前工作流尚未完成，切换模式将取消进度。",
    "modeSwitchConfirmAction": "仍然切换",
    "workflowPaused": "当前步骤需要你的输入，请继续描述需求或回答问题。",
    "workflowAutoAdvance": "当前步骤已完成，下一步将自动执行 {{command}}。",
```

In `dashboard/client/src/i18n/locales/en/common.json`, add (after `"cancel": "Cancel",`):

```json
  "cancel": "Cancel",
  "confirm": "Confirm",
```

In `dashboard/client/src/i18n/locales/zh/common.json`, add (after `"cancel": "取消",`):

```json
  "cancel": "取消",
  "confirm": "确认",
```

- [ ] **Step 4: Replace `window.confirm` in `ChatTab.tsx`**

Add the import (alongside the other `./` imports):

```ts
import { ConfirmDialog } from "./ConfirmDialog";
```

Change `useTranslation` to also load the `common` namespace:

```ts
  const { t } = useTranslation(["sessions", "common"]);
```

Add state for the pending mode switch (near the other `useState` calls, after `const [mode, setMode] = useState<ChatMode>("normal");`):

```ts
  const [pendingModeSwitch, setPendingModeSwitch] = useState<ChatMode | null>(null);
```

Replace the `ChatModeSelector`'s `onChange` and the three hardcoded-Chinese blocks. Current:

```tsx
      <ChatModeSelector
        mode={mode}
        onChange={(next) => {
          if (workflow.kind !== "idle") {
            // TODO(i18n): hardcoded Chinese confirmation per brief; replace with i18n key when available.
            const ok = window.confirm("当前工作流尚未完成，切换模式将取消进度。是否继续？");
            if (!ok) return;
            cancelWorkflow();
          }
          setMode(next);
        }}
      />
      {workflow.kind !== "idle" && workflow.kind !== "done" && workflow.kind !== "error" && (
        <WorkflowProgress
          mode={workflow.mode}
          currentStepId={workflow.stepId}
          onCancel={cancelWorkflow}
        />
      )}

      {workflow.kind === "paused" && (
        <div className="px-4 py-2 border-b border-amber-500/20 bg-amber-500/10 text-xs text-amber-200">
          {/* TODO(i18n): hardcoded Chinese string per brief; replace with i18n key when available. */}
          当前步骤需要你的输入，请继续描述需求或回答问题。
        </div>
      )}

      {workflow.kind === "running" && pendingAutoAdvance && (
        <div className="px-4 py-2 border-b border-blue-500/20 bg-blue-500/10 text-xs text-blue-200">
          {/* TODO(i18n): hardcoded Chinese string per brief; replace with i18n key when available. */}
          当前步骤已完成，下一步将自动执行 {pendingAutoAdvance.command}。
        </div>
      )}
```

New:

```tsx
      <ChatModeSelector
        mode={mode}
        onChange={(next) => {
          if (workflow.kind !== "idle") {
            setPendingModeSwitch(next);
            return;
          }
          setMode(next);
        }}
      />
      <ConfirmDialog
        open={pendingModeSwitch !== null}
        title={t("sessions:chat.modeSwitchConfirmTitle")}
        message={t("sessions:chat.modeSwitchConfirmMessage")}
        confirmLabel={t("sessions:chat.modeSwitchConfirmAction")}
        cancelLabel={t("common:cancel")}
        destructive
        onConfirm={() => {
          const next = pendingModeSwitch;
          setPendingModeSwitch(null);
          if (next) {
            cancelWorkflow();
            setMode(next);
          }
        }}
        onCancel={() => setPendingModeSwitch(null)}
      />
      {workflow.kind !== "idle" && workflow.kind !== "done" && workflow.kind !== "error" && (
        <WorkflowProgress
          mode={workflow.mode}
          currentStepId={workflow.stepId}
          onCancel={cancelWorkflow}
        />
      )}

      {workflow.kind === "paused" && (
        <div className="px-4 py-2 border-b border-amber-500/20 bg-amber-500/10 text-xs text-amber-200">
          {t("sessions:chat.workflowPaused")}
        </div>
      )}

      {workflow.kind === "running" && pendingAutoAdvance && (
        <div className="px-4 py-2 border-b border-blue-500/20 bg-blue-500/10 text-xs text-blue-200">
          {t("sessions:chat.workflowAutoAdvance", { command: pendingAutoAdvance.command })}
        </div>
      )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ChatTab.workflow.test.tsx`
Expected: PASS (all tests in this file, including the 2 new ones)

- [ ] **Step 6: Commit**

```bash
cd dashboard && git add client/src/components/chat/ChatTab.tsx client/src/i18n/locales/en/sessions.json client/src/i18n/locales/zh/sessions.json client/src/i18n/locales/en/common.json client/src/i18n/locales/zh/common.json client/src/components/chat/__tests__/ChatTab.workflow.test.tsx
git commit -m "feat(chat): replace window.confirm with themed ConfirmDialog, localize workflow banners"
```

---

### Task 9: New-Session guard using the real `runChat` state

**Files:**
- Modify: `dashboard/client/src/pages/Chat.tsx`
- Modify: `dashboard/client/src/i18n/locales/en/sessions.json`
- Modify: `dashboard/client/src/i18n/locales/zh/sessions.json`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 7), `runChat.isLive` / `runChat.followUp` (real values as of Task 3).

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/client/src/pages/__tests__/Chat.test.tsx`, after the existing tests:

```tsx
  it("confirms before starting a new session while a run is active", async () => {
    render(<Chat />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /new session/i }));

    expect(screen.getByText(/start a new session/i)).toBeInTheDocument();
    expect(mockStart).toHaveBeenCalledTimes(1); // not reset yet

    fireEvent.click(screen.getByRole("button", { name: /^start new session$/i }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "second" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(2));
  });

  it("confirms before starting a new session with an unsent draft, even if idle", async () => {
    render(<Chat />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "unsent draft" } });

    fireEvent.click(screen.getByRole("button", { name: /new session/i }));

    expect(screen.getByText(/start a new session/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/client && npx vitest run src/pages/__tests__/Chat.test.tsx`
Expected: FAIL — clicking "New Session" resets immediately with no confirmation text ever appearing.

- [ ] **Step 3: Add i18n keys**

In `dashboard/client/src/i18n/locales/en/sessions.json`, inside `"chat"` (after `chat.newSession`/`chat.history` — see Step 4 below which adds those too):

```json
    "newSessionConfirmTitle": "Start a new session?",
    "newSessionConfirmMessage": "This will discard the active run and any unsent draft. Continue?",
    "newSessionConfirmAction": "Start new session",
```

In `dashboard/client/src/i18n/locales/zh/sessions.json`, inside `"chat"` (same position):

```json
    "newSessionConfirmTitle": "开始新会话？",
    "newSessionConfirmMessage": "这将丢弃当前正在运行的任务和未发送的草稿。是否继续？",
    "newSessionConfirmAction": "开始新会话",
```

- [ ] **Step 4: Formalize the existing `newSession`/`history` fallback-only keys**

These two buttons already call `t("chat.newSession", "New Session")` / `t("chat.history", "History")` with only an English fallback — no JSON entry exists yet in either locale, so `zh` users currently see English button labels. Add proper entries in `dashboard/client/src/i18n/locales/en/sessions.json`'s `"chat"` object (after `"followUpPlaceholder"`, before the Task 5/8 additions):

```json
    "followUpPlaceholder": "Send a follow-up…",
    "newSession": "New Session",
    "history": "History",
```

In `dashboard/client/src/i18n/locales/zh/sessions.json`'s `"chat"` object (same position):

```json
    "followUpPlaceholder": "发送后续消息…",
    "newSession": "新会话",
    "history": "历史记录",
```

- [ ] **Step 5: Add the guard in `Chat.tsx`**

Import `ConfirmDialog`:

```tsx
import { ConfirmDialog } from "../components/chat/ConfirmDialog";
```

Add `"common"` to the loaded namespaces:

```tsx
  const { t } = useTranslation(["sessions", "run", "common"]);
```

Add state (near `const [historyOpen, setHistoryOpen] = useState(false);`):

```ts
  const [pendingNewSession, setPendingNewSession] = useState(false);
```

Change `startNewSession` (added in Task 3) into the guarded click handler, and rename the actual reset logic:

```ts
  const resetToNewSession = useCallback(() => {
    runChat.reset();
    setSessionId(newSessionId());
  }, [runChat]);

  const handleNewSessionClick = useCallback(() => {
    if (runChat.isLive || runChat.followUp.trim().length > 0) {
      setPendingNewSession(true);
      return;
    }
    resetToNewSession();
  }, [runChat, resetToNewSession]);
```

Update the button's `onClick`:

```tsx
          <button
            type="button"
            onClick={handleNewSessionClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-gray-300 border border-border hover:bg-surface-3 hover:text-gray-100 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t("chat.newSession")}
          </button>
```

Render the dialog next to the existing `SessionHistoryDialog` (just before the closing `</div>` of `ChatWorkspace`'s returned JSX):

```tsx
      <ConfirmDialog
        open={pendingNewSession}
        title={t("chat.newSessionConfirmTitle")}
        message={t("chat.newSessionConfirmMessage")}
        confirmLabel={t("chat.newSessionConfirmAction")}
        cancelLabel={t("common:cancel")}
        destructive
        onConfirm={() => {
          setPendingNewSession(false);
          resetToNewSession();
        }}
        onCancel={() => setPendingNewSession(false)}
      />
      <SessionHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(id) => setSessionId(id)}
      />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd dashboard/client && npx vitest run src/pages/__tests__/Chat.test.tsx`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 7: Commit**

```bash
cd dashboard && git add client/src/pages/Chat.tsx client/src/i18n/locales/en/sessions.json client/src/i18n/locales/zh/sessions.json client/src/pages/__tests__/Chat.test.tsx
git commit -m "feat(chat): guard New Session with a confirm dialog when a run is active or a draft is unsent"
```

---

### Task 10: Consolidate the Git panel to the right side only

**Files:**
- Modify: `dashboard/client/src/components/chat/ActivityBar.tsx`
- Modify: `dashboard/client/src/components/chat/ChatWorkspaceContext.tsx`
- Modify: `dashboard/client/src/components/chat/useChatShortcuts.ts`
- Modify: `dashboard/client/src/pages/Chat.tsx`
- Test: `dashboard/client/src/components/chat/__tests__/ChatWorkspace.TokenMeter.test.tsx`
- Create: `dashboard/client/src/components/chat/__tests__/ActivityBar.test.tsx`
- Create: `dashboard/client/src/components/chat/__tests__/useChatShortcuts.test.ts`

**Interfaces:**
- Produces: `LeftSidebarView` narrows from `"explorer" | "git" | "settings"` to `"explorer" | "settings"`.

- [ ] **Step 1: Write the failing tests**

Create `dashboard/client/src/components/chat/__tests__/ActivityBar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityBar } from "../ActivityBar";

describe("ActivityBar", () => {
  it("renders Explorer and Settings but not Source Control", () => {
    render(<ActivityBar active="explorer" onChange={vi.fn()} />);
    expect(screen.getByTitle("Explorer")).toBeInTheDocument();
    expect(screen.getByTitle("Settings")).toBeInTheDocument();
    expect(screen.queryByTitle("Source Control")).not.toBeInTheDocument();
  });
});
```

Create `dashboard/client/src/components/chat/__tests__/useChatShortcuts.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useChatShortcuts } from "../useChatShortcuts";

function fireShortcut(key: string, opts: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey: true, shiftKey: true, ...opts }));
}

describe("useChatShortcuts", () => {
  it("Cmd+Shift+G opens the Git tab in the right panel, not the left sidebar", () => {
    const setLeftView = vi.fn();
    const setRightTab = vi.fn();
    renderHook(() =>
      useChatShortcuts({
        toggleLeftSidebar: vi.fn(),
        setLeftView,
        toggleRightPanel: vi.fn(),
        setRightTab,
        toggleBottomPanel: vi.fn(),
        setBottomTab: vi.fn(),
      })
    );

    fireShortcut("g");

    expect(setRightTab).toHaveBeenCalledWith("git");
    expect(setLeftView).not.toHaveBeenCalled();
  });

  it("Cmd+Shift+F toggles focus mode", () => {
    const toggleFocusMode = vi.fn();
    renderHook(() =>
      useChatShortcuts({
        toggleLeftSidebar: vi.fn(),
        setLeftView: vi.fn(),
        toggleRightPanel: vi.fn(),
        setRightTab: vi.fn(),
        toggleBottomPanel: vi.fn(),
        setBottomTab: vi.fn(),
        toggleFocusMode,
      })
    );

    fireShortcut("f");

    expect(toggleFocusMode).toHaveBeenCalledTimes(1);
  });
});
```

Update the existing `"setLeftView opens sidebar and switches view"` test in `dashboard/client/src/components/chat/__tests__/ChatWorkspace.TokenMeter.test.tsx` — it currently exercises `setLeftView("git")`, which will no longer typecheck once `"git"` is removed from `LeftSidebarView`. Change:

```tsx
  it("setLeftView opens sidebar and switches view", () => {
    const { result } = renderHook(() => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }), {
      wrapper,
    });
    act(() => result.current.actions.toggleLeftSidebar());
    expect(result.current.state.leftSidebar.visible).toBe(false);
    act(() => result.current.actions.setLeftView("git"));
    expect(result.current.state.leftSidebar.visible).toBe(true);
    expect(result.current.state.leftSidebar.activeView).toBe("git");
  });
```

to:

```tsx
  it("setLeftView opens sidebar and switches view", () => {
    const { result } = renderHook(() => ({ state: useChatWorkspace().state, actions: useChatWorkspaceActions() }), {
      wrapper,
    });
    act(() => result.current.actions.toggleLeftSidebar());
    expect(result.current.state.leftSidebar.visible).toBe(false);
    act(() => result.current.actions.setLeftView("settings"));
    expect(result.current.state.leftSidebar.visible).toBe(true);
    expect(result.current.state.leftSidebar.activeView).toBe("settings");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ActivityBar.test.tsx src/components/chat/__tests__/useChatShortcuts.test.ts`
Expected: FAIL — `ActivityBar.test.tsx` fails because "Source Control" is still rendered today; `useChatShortcuts.test.ts` fails because `Cmd+Shift+G` still calls `setLeftView("git")`.

- [ ] **Step 3: Remove Git from `ActivityBar.tsx`**

```tsx
/**
 * @file ActivityBar.tsx
 * @description Vertical icon bar on the far left of the IDE-style /chat page.
 * Switches the left sidebar between Explorer and Settings views. Git lives
 * only in the right panel now (no more duplicated Git view).
 */

import { FolderTree, Settings } from "lucide-react";
import type { LeftSidebarView } from "./ChatWorkspaceContext";

interface ActivityBarProps {
  active: LeftSidebarView;
  onChange: (view: LeftSidebarView) => void;
}

const ITEMS: { view: LeftSidebarView; icon: typeof FolderTree; label: string }[] = [
  { view: "explorer", icon: FolderTree, label: "Explorer" },
  { view: "settings", icon: Settings, label: "Settings" },
];

export function ActivityBar({ active, onChange }: ActivityBarProps) {
  return (
    <div className="hidden md:flex w-12 flex-col items-center py-2 border-r border-border bg-surface-1 flex-shrink-0">
      {ITEMS.map(({ view, icon: Icon, label }) => {
        const isActive = active === view;
        return (
          <button
            key={view}
            type="button"
            onClick={() => onChange(view)}
            title={label}
            className={`relative w-9 h-9 rounded-md flex items-center justify-center mb-1 transition-colors ${
              isActive
                ? "bg-accent/15 text-accent"
                : "text-gray-500 hover:text-gray-300 hover:bg-surface-2"
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-accent rounded-r" />
            )}
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Narrow `LeftSidebarView` in `ChatWorkspaceContext.tsx`**

```ts
export type LeftSidebarView = "explorer" | "settings";
```

- [ ] **Step 5: Repoint the `Cmd+Shift+G` shortcut**

In `dashboard/client/src/components/chat/useChatShortcuts.ts`, change:

```ts
      // Cmd+Shift+G: Git
      if (meta && shift && e.key.toLowerCase() === "g") {
        e.preventDefault();
        actions.setLeftView("git");
        return;
      }
```

to:

```ts
      // Cmd+Shift+G: Git (lives only in the right panel now)
      if (meta && shift && e.key.toLowerCase() === "g") {
        e.preventDefault();
        actions.setRightTab("git");
        return;
      }
```

- [ ] **Step 6: Remove the now-dead "git" branch from `Chat.tsx`**

Change:

```tsx
  useEffect(() => {
    if (state.leftSidebar.activeView === "git" || state.rightPanel.activeTab === "git") {
      loadGitStatus();
    }
  }, [state.leftSidebar.activeView, state.rightPanel.activeTab, cwd, loadGitStatus]);
```

to:

```tsx
  useEffect(() => {
    if (state.rightPanel.activeTab === "git") {
      loadGitStatus();
    }
  }, [state.rightPanel.activeTab, cwd, loadGitStatus]);
```

Change:

```tsx
  const leftHeader =
    state.leftSidebar.activeView === "explorer"
      ? "Explorer"
      : state.leftSidebar.activeView === "git"
        ? "Source Control"
        : "Settings";

  const leftContent =
    state.leftSidebar.activeView === "explorer" ? (
      state.explorer.tree ? (
        <FileTree
          nodes={state.explorer.tree}
          expandedPaths={state.explorer.expandedPaths}
          selectedPath={state.explorer.selectedPath}
          highlightedPaths={state.highlightedPaths}
          onToggle={actions.toggleExpandPath}
          onSelect={handleFileSelect}
        />
      ) : state.explorer.loading ? (
        <div className="p-3 text-xs text-gray-500">Loading files...</div>
      ) : (
        <div className="p-3 text-xs text-red-300">{state.explorer.error || "No files"}</div>
      )
    ) : state.leftSidebar.activeView === "git" ? (
      <GitPanel
        cwd={cwd}
        status={state.git.status}
        diff={state.git.diff}
        loading={state.git.loading}
        diffLoading={state.git.diffLoading}
        error={state.git.error}
        selectedFile={state.git.selectedFile}
        onSelectFile={actions.selectGitFile}
        onStage={handleGitStage}
        onUnstage={handleGitUnstage}
        onCommit={handleGitCommit}
        onPush={handleGitPush}
      />
    ) : (
      <div className="p-3 text-xs text-gray-500">Settings panel placeholder.</div>
    );
```

to:

```tsx
  const leftHeader = state.leftSidebar.activeView === "explorer" ? "Explorer" : "Settings";

  const leftContent =
    state.leftSidebar.activeView === "explorer" ? (
      state.explorer.tree ? (
        <FileTree
          nodes={state.explorer.tree}
          expandedPaths={state.explorer.expandedPaths}
          selectedPath={state.explorer.selectedPath}
          highlightedPaths={state.highlightedPaths}
          onToggle={actions.toggleExpandPath}
          onSelect={handleFileSelect}
        />
      ) : state.explorer.loading ? (
        <div className="p-3 text-xs text-gray-500">Loading files...</div>
      ) : (
        <div className="p-3 text-xs text-red-300">{state.explorer.error || "No files"}</div>
      )
    ) : (
      <div className="p-3 text-xs text-gray-500">Settings panel placeholder.</div>
    );
```

(`GitPanel` stays imported and used — it's still rendered in `rightContent`, unchanged.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd dashboard/client && npx vitest run src/components/chat/__tests__/ActivityBar.test.tsx src/components/chat/__tests__/useChatShortcuts.test.ts src/components/chat/__tests__/ChatWorkspace.TokenMeter.test.tsx src/pages/__tests__/Chat.test.tsx`
Expected: PASS

- [ ] **Step 8: Typecheck**

Run: `cd dashboard/client && npx tsc -b`
Expected: no errors (confirms no remaining reference to `"git"` as a `LeftSidebarView` value).

- [ ] **Step 9: Commit**

```bash
cd dashboard && git add client/src/components/chat/ActivityBar.tsx client/src/components/chat/ChatWorkspaceContext.tsx client/src/components/chat/useChatShortcuts.ts client/src/pages/Chat.tsx client/src/components/chat/__tests__/ChatWorkspace.TokenMeter.test.tsx client/src/components/chat/__tests__/ActivityBar.test.tsx client/src/components/chat/__tests__/useChatShortcuts.test.ts
git commit -m "refactor(chat): consolidate Git panel to the right side only"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full client test suite**

Run: `cd dashboard && npm run test:client`
Expected: all suites pass.

- [ ] **Step 2: Review and regenerate screen snapshots**

Run: `cd dashboard/client && npx vitest run src/pages/__tests__/screens.snapshot.test.tsx`

If the `/chat` snapshot fails (expected — the ActivityBar lost its Git icon and the header gained a Focus button), inspect the diff, confirm it matches these intentional changes, then regenerate:

Run: `cd dashboard/client && npx vitest run -u src/pages/__tests__/screens.snapshot.test.tsx`

- [ ] **Step 3: Full client build/typecheck**

Run: `cd dashboard/client && npx tsc -b && npx vite build`
Expected: no errors.

- [ ] **Step 4: Run the full test suite once more to confirm the snapshot update didn't break anything else**

Run: `cd dashboard && npm run test:client`
Expected: all suites pass.

- [ ] **Step 5: Commit the snapshot update**

```bash
cd dashboard && git add client/src/pages/__tests__/__snapshots__
git commit -m "test(chat): regenerate screen snapshots for Focus mode and Git-panel consolidation"
```
