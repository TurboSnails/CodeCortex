# Chat Input Upgrade — Design Spec

**Date:** 2026-07-03
**Status:** Draft (awaiting user approval)
**Scope:** Localhost `/chat` page input experience only

---

## 1. Goals

Upgrade the input experience of the existing IDE-style `/chat` page ([Chat.tsx](/Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client/src/pages/Chat.tsx)) so it matches the strongest interaction patterns observed in [K9i-0/ccpocket](https://github.com/K9i-0/ccpocket) (prompt history, attachment, slash UI hints) and [siteboon/claudecodeui](https://github.com/siteboon/claudecodeui) (responsive layout, accent animation touches) — **without rewriting the page** and without touching the backend.

### 1.1 In scope

- Prompt history stored locally; recalled with ↑/↓ and Enter to resend.
- Image attachments via paste, drop, file picker; **stored client-side as dataURL**, sent alongside the prompt text in a `SendPayload`.
- Voice input using the browser's Web Speech API (auto-hide when unsupported).
- Enhanced `@` file mention: fuzzy match, path-based search, "Press Tab to insert" preview row.
- Enhanced `/` slash UI: keyboard hint bar, descriptive rows, badge tooltips.
- Responsive changes: collapse `ActivityBar` into a hamburger on `md` and below; keep desktop layout unchanged.

### 1.2 Out of scope

- Any new backend endpoint. Files are sent as dataURL inside the prompt payload; no upload route.
- Multi-device prompt history sync. LocalStorage only. The hook abstracts a `storage` interface to leave room for later migration.
- FileTree ↔ ChatInput drag-to-insert interactions. Directory expand behaviour is unchanged.
- Full iOS PWA rewrite. Only minimal breakpoint folds are done.
- MCP / tool-flow / permissions refactor. The existing `useRunChat` permission flow is preserved.
- `useChatShortcuts` shortcut layer. Not touched.

---

## 2. Approach

**Chosen option: A — Inline enhancement with three new hooks and small new components.**

The existing [`ChatInput`](/Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client/src/components/chat/ChatInput.tsx), [`ChatTab`](/Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client/src/components/chat/ChatTab.tsx), and [`Chat.tsx`](/Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/client/src/pages/Chat.tsx) keep their shape. We add three hooks in `hooks/chat/`, four small components in `components/chat/input/`, and one shared type. `useRunChat.send` is extended with a `SendPayload` overload — backwards-compatible.

### 2.1 File structure

| Path | Action | Responsibility |
|---|---|---|
| `dashboard/client/src/lib/types.ts` | Modify | Add `Attachment` and `SendPayload`. |
| `dashboard/client/src/hooks/chat/usePromptHistory.ts` | Create | localStorage FIFO 500 history, ↑/↓ navigate, dedupe adjacent. |
| `dashboard/client/src/hooks/chat/useAttachments.ts` | Create | paste / drop / pick, dataURL conversion, 5MiB/8-image limit, payload build. |
| `dashboard/client/src/hooks/chat/useVoiceInput.ts` | Create | `SpeechRecognition` wrapper, availability flag, interim/final text callbacks. |
| `dashboard/client/src/components/chat/ChatInput.tsx` | Modify | Wire the three hooks; extract inline lists into dedicated components; bind paste/drop. |
| `dashboard/client/src/components/chat/useRunChat.ts` | Modify | Add `SendPayload` overload to `send(text | payload)`. |
| `dashboard/client/src/components/chat/input/AttachmentStrip.tsx` | Create | Thumbnail chips with × buttons. |
| `dashboard/client/src/components/chat/input/SlashList.tsx` | Create | Extracted from `ChatInput`. |
| `dashboard/client/src/components/chat/input/FileMentionList.tsx` | Create | Extracted from `ChatInput` with fuzzy + preview row. |
| `dashboard/client/src/components/chat/input/InputHintBar.tsx` | Create | Footer hint line with `<kbd>` elements. |
| `dashboard/client/src/components/chat/input/VoiceButton.tsx` | Create | Mic button with listening ring; renders null when `available === false`. |
| `dashboard/client/src/components/chat/input/icons.ts` | Create | Animation keyframe class names + lucide mappings. |
| `dashboard/client/src/index.css` | Modify | Add the four custom keyframes + reduced-motion fallback. |
| `dashboard/client/src/pages/Chat.tsx` | Modify | Add `md:hidden` hamburger row; hide `ActivityBar` below `md`. |
| `dashboard/client/src/lib/i18n/locales/{en,zh}.json` | Modify | New i18n keys (see §5.4). |
| `dashboard/client/src/pages/__tests__/screens.snapshot.test.tsx` | Modify (baseline) | Add new mobile + ChatInput baselines per non-blind update policy. |
| `dashboard/client/src/components/chat/__tests__/ChatInput.test.tsx` | Modify | New behaviour tests. |
| `dashboard/client/src/components/chat/__tests__/hooks/usePromptHistory.test.ts` | Create | Unit tests. |
| `dashboard/client/src/components/chat/__tests__/hooks/useAttachments.test.ts` | Create | Unit tests. |
| `dashboard/client/src/components/chat/__tests__/hooks/useVoiceInput.test.ts` | Create | Unit tests. |

### 2.2 Data flow (send a prompt with 1 image)

```
User drags an image into ChatInput
 └─> useAttachments.onDrop(files)
      └─ File → FileReader.readAsDataURL → attachments: Attachment[]
                                            └─ chip rendered in AttachmentStrip
User types text / browses history with ↑↓ / selects / command / @ file
 └─ Existing ChatInput logic unchanged (detectAutocomplete, scoreSlashMatch)
User presses Enter (or clicks Send)
 └─> ChatInput.onSend()
      ├─ payload = useAttachments.buildPayload(text)
      ├─ runChat.send(payload)         // supports string | SendPayload
      ├─ usePromptHistory.push(text)   // on success
      └─ useAttachments.clear()
```

`SendPayload` type:

```ts
export interface Attachment {
  id: string;            // crypto.randomUUID()
  kind: "image";
  dataUrl: string;       // data:image/png;base64,...
  mimeType: string;
  name: string;          // user-provided filename
  sizeBytes: number;     // < 5MiB to add; > → toast
}

export interface SendPayload {
  text: string;
  attachments: Attachment[];
}
```

### 2.3 Hook contracts

#### `usePromptHistory`

```ts
interface PromptHistoryApi {
  entries: string[];                 // tail = newest
  push(text: string): void;          // FIFO 500; dedupe adjacent
  navigate(dir: -1 | 1): string | null; // ←/→ text or null at edge
  commit(text: string): void;        // after user edits the recalled text
  clear(): void;
  size: number;
}
```

- Storage key: `cc-chat:prompt-history:<anon-or-user-id>`
- Backing storage abstracted (`get/set/del`) so a server backend can swap in later.
- `navigate(-1)` at the start of the list returns `null` rather than wrapping.

#### `useAttachments`

```ts
interface AttachmentsApi {
  items: Attachment[];
  onPaste(e: ClipboardEvent): void;        // bound to textarea onPaste
  onDrop(e: DragEvent): void;              // bound to wrapper onDrop
  onPick(files: FileList | null): void;
  remove(id: string): void;
  clear(): void;
  buildPayload(text: string): SendPayload; // combines text + attachments
}
```

- Per-file limit: **5 MiB**. Total limit: **8 images** per send.
- On limit breach: toast via the existing `ChatToast`.
- `drop` / `paste` handlers always `preventDefault` (no browser image-view tab).

#### `useVoiceInput`

```ts
interface VoiceInputApi {
  available: boolean;        // SpeechRecognition in window
  listening: boolean;
  toggle(): void;
  interimText: string;
  onInterim(cb: (text: string) => void): () => void;
  onFinal(cb: (text: string) => void): () => void;
}
```

- `VoiceButton` returns `null` when `available === false`.
- Three consecutive errors → permanently disabled until reload.
- Recognition text never written to storage.

### 2.4 Module dependencies

```
Chat.tsx
 └─> ChatTab ──> ChatInput ──> usePromptHistory  (server-agnostic)
                          ├──> useAttachments   (no api calls)
                          ├──> useVoiceInput    (no api calls)
                          ├──> SlashList / FileMentionList / VoiceButton
                          └──> api.run.files(cwd, q)        // existing
```

`usePromptHistory`, `useAttachments`, `useVoiceInput` do not know about `useRunChat`; ChatInput orchestrates.

### 2.5 State ownership

| State | Owner | Reason |
|---|---|---|
| `attachments` | `useAttachments` | Local; bound to paste/drop. |
| `historyCursor` | `usePromptHistory` | Local; driven by keyboard. |
| `interimText` | `useVoiceInput` | Owned by the recognition session. |
| `pulseHint` | `ChatInput` | One-shot visual cue per new chat. |
| Autocomplete state | `ChatInput` | Existing behaviour preserved. |

---

## 3. Compatibility & risk

- `useRunChat.send(string)` continues to work; new signature `send(input: string | SendPayload)`. Internal code paths normalise.
- localStorage write failure → catch + degrade to in-memory mode + one-shot toast.
- `SpeechRecognition` missing → `available=false`; button hidden.
- iOS Safari drag is partial — paste remains the primary path; drop is a bonus.
- Snapshot tests require baseline update; reviewer must walk the diff per [dashboard/CLAUDE.md](/Users/hassan/Documents/workspace/aiFile/CodeCortex/CodeCortex/dashboard/CLAUDE.md) policy.
- All current keyboard shortcuts (Cmd+B / J / Shift+E / Shift+G / Shift+M / Esc), slash behaviour, multi-panel behaviour remain untouched.

---

## 4. Theming, animation, accessibility

### 4.1 Animation keyframes (added to `index.css`)

| Name | Effect | Duration | Used by |
|---|---|---|---|
| `chat-attachment-enter` | opacity 0→1, scale 0.95→1 | 180ms | `AttachmentStrip` chip |
| `chat-voice-pulse` | ring scale + opacity loop | 1400ms loop | `VoiceButton` listening |
| `chat-recall-pulse` | opacity 0→1→0 with arrow-up icon | 1800ms once | "Press ↑ to recall" hint |
| `chat-dropzone-in` | dashed border colour shift to accent | 150ms | drop hover |
| `chat-fade-in` | opacity 0→1 | 120ms | SlashList / FileMentionList pop-up |

`@media (prefers-reduced-motion: reduce)` overrides all of the above with `animation: none`.

### 4.2 Colour usage (no new tokens)

- Attachment chip container: `bg-surface-2 border border-border rounded-md`, hover `hover:border-accent/60`.
- Remove (×): `bg-black/70 text-white opacity-0 group-hover:opacity-100` over each chip.
- Dropzone active: `border-accent border-dashed bg-accent/5`.
- Voice listening ring: `bg-red-500/20 ring-2 ring-red-500/40`.
- Recall pulse arrow: `text-accent/70`.
- Hint bar: `text-[10px] text-gray-500`, `whitespace-normal md:whitespace-nowrap`.

All colours live within the existing palette (`surface-1/2/3`, `accent`, `border`, `*500/*400/*20`).

### 4.3 Accessibility

| Element | ARIA | Notes |
|---|---|---|
| `VoiceButton` | `aria-pressed`, i18n `aria-label` | |
| attachment × | i18n `aria-label` | one per chip |
| dropzone | `aria-describedby` pointing to hint text | |
| SlashList / FileMentionList popover | `role="listbox"`, items `role="option" aria-selected` | inherits existing pattern |
| `InputHintBar` | `<kbd>` elements with `aria-hidden="true"` on icons | |
| Recall pulse | `role="status" aria-live="polite"` | |
| Reduced motion | detected via `window.matchMedia('(prefers-reduced-motion: reduce)')` | animations drop |
| Minimum font size | textarea already ≥ 14px; not reduced below 16px to avoid iOS auto-zoom | |

---

## 5. Test plan

### 5.1 Unit tests (`__tests__/hooks/chat/`)

| Suite | Test count | Pass criteria |
|---|---|---|
| `usePromptHistory` | 6 | push, dedupe-adjacent, FIFO 501, navigate ↑ at tail, navigate ↓ past end, commit-after-edit |
| `useAttachments` | 6 | 5MiB boundary, 8-image cap, buildPayload, clear-after-build, paste handler call, drop handler call |
| `useVoiceInput` | 5 | unavailable fallback, toggle listening, interim callback, final callback, three-error lockout |
| **Unit total** | **17** | 17/17 green |

### 5.2 Component tests (extend `ChatInput.test.tsx` + add per-component)

| Case | Pass criteria |
|---|---|
| paste image → AttachmentStrip renders chip | yes |
| drop image → dropzone visual state | wrapper has `border-accent border-dashed` |
| remove attachment | items length decreases |
| history recall (empty + ↑) | textarea value matches latest entry |
| history recall (edit + ↑) | edited value not overwritten (commit works) |
| slash command `/clear` still resolves | regression: same behaviour as baseline |
| `@` fuzzy: query "src/fb" → `src/foo/bar.tsx` ranks first | yes |
| `@` Tab preview row → Tab inserts | yes |
| Send disabled when value trimmed empty | yes |
| Send dispatches `{text, attachments}` to `runChat.send` | payload matches |
| VoiceButton hidden when unavailable | not rendered |
| VoiceButton listening visual + `aria-pressed="true"` | yes |
| HintBar present with `<kbd>` elements | yes |
| Reduced motion → no animations applied | animations classes absent |

### 5.3 Snapshot tests (`screens.snapshot.test.tsx`)

- Desktop 1440×900: existing baselines + new ChatInput-with-attachment baseline.
- Mobile 375×812: brand-new baseline (hamburger header + one bubble + ChatInput empty).
- Baselines regenerated via `cd client && npx vitest run -u`; reviewer walks the diff and explicitly notes "snapshot diff reviewed" in the PR.

### 5.4 Manual e2e scenarios (PR checklist; reviewer runs by hand)

| # | Scenario | Steps |
|---|---|---|
| E1 | Drag an image and send | Drag PNG → chip → type "what is this" → Send → `useRunChat` receives one image |
| E2 | Paste an image | Copy PNG, focus textarea, ⌘V → chip |
| E3 | 9-image cap | Drag 9 → 9th rejected + toast |
| E4 | History recall | Send "abc" → clear → ↑ shows "abc" → Enter resends |
| E5 | Adjacent dedupe | Same text thrice → ↑ shows only one entry |
| E6 | Voice (desktop Chrome) | Click mic → speak → text appears in textarea |
| E7 | Voice unavailable | Firefox → button hidden, no console errors |
| E8 | Mobile hamburger | Resize < md → hamburger visible, ActivityBar hidden |
| E9 | Reduced motion | macOS setting on → no entrance animations |
| E10 | Slash regression | `/clear`, `/memory` still work |

### 5.5 i18n keys (EN/ZH parity)

```
chat.input.hint.bar
chat.input.history.recallPulse
chat.input.attachments.limit
chat.input.attachments.dropHere
chat.input.attachments.remove
chat.input.voice.unavailable
chat.input.slashHeader   (existing key — only tooltip copy added)
```

---

## 6. Definition of Done

- All 17 unit tests + 14 component tests (totalling 31) green.
- `npm run test:client` green; reviewer walks snapshot diff.
- All 10 manual e2e scenarios pass on at least one desktop Chrome and one mobile Safari (or simulator).
- EN + ZH i18n keys populated.
- Existing slash / shortcut / multi-panel / indicator behaviour unchanged.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `SendPayload` ABI change to `useRunChat` | Keep `send(text)` overload; new payload normalised internally |
| LocalStorage quota exhausted | catch → fallback to in-memory; one-shot toast |
| Web Speech variance between browsers | `available` gates rendering; never persist transcripts |
| Snapshot baseline churn | Reviewer pre-walk the diff; non-blind update |
| Mobile fold interfering with shortcuts | `useChatShortcuts` deliberately left alone; current scope only |
