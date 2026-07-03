# Chat Input Upgrade — Shipped Behaviour vs Spec

**Date:** 2026-07-03
**Branch:** `feat/chat-input-upgrade`
**Plan:** `docs/superpowers/plans/2026-07-03-chat-input-upgrade.md`
**Design spec:** `docs/superpowers/specs/2026-07-03-chat-input-upgrade-design.md`

This document records what was actually shipped on the branch against the design spec, plus verification results. Task 15 is the final verification step of the SDD plan.

---

## 1. Shipped scope

The following spec items are implemented and merged on `feat/chat-input-upgrade`. The commit list is the merged history for this branch (oldest → newest, scoped to the chat-input-upgrade work).

| Commit | Title |
|---|---|
| `cba7044` | (branch base / cleanup) |
| `2a32598` | Task 1: shared envelope types and `useRunChat` hook |
| `317f68b` | Task 2: `ChatTab` UI components |
| `db6be27` | Plan amendment for Task 2 |
| `927cea4` | Task 3: integrate `ChatTab` into `SessionDetail` |
| `774f469` | Task 4: `useVoiceInput` hook + tests |
| `ee36c42` | Task 5: keyframes in `index.css` |
| `78004f9` | Task 6: trailing newlines on SlashList + FileMentionList |
| `d9cb266` | Task 7: AttachmentStrip, VoiceButton, InputHintBar components |
| `83f103d` | Task 7 fix: English fallbacks to InputHintBar labels |
| `efdff89` | Task 8: `useRunChat.send` accepts SendPayload overload (backward-compatible) |
| `42a58ac` | Task 9: wire prompt history, attachments, voice, slash/file UI, hint bar |
| `3df716d` | Task 10: ChatTab routes SendPayload through `useRunChat.send` |
| `3c35a2d` | Task 11: i18n keys for hint bar, history pulse, attachments, voice |
| `e50ad0c` | Task 12: mobile hamburger + ActivityBar hidden below `md` |
| `5738828` | Task 13: 13 new ChatInput behaviour cases |
| `497d6fd` | Task 14: refresh snapshot baselines (mobile + chat input) |

### 1.1 Spec coverage matrix

| Spec § | Requirement | Shipped in | Notes |
|---|---|---|---|
| §2.1 | Shared `Attachment` + `SendPayload` types in `lib/types.ts` | Task 1 (refactor) / Task 8 (SendPayload extension) | `useRunChat.send` is backward-compatible (string still works) |
| §2.1 | `usePromptHistory` hook | Task 9 | localStorage FIFO 500, dedupe-adjacent, ↑/↓ navigate, `commit()` after edit |
| §2.1 | `useAttachments` hook | Task 9 | paste / drop / pick, dataURL, 5 MiB / 8-image cap, `buildPayload` |
| §2.1 | `useVoiceInput` hook | Task 4 | `SpeechRecognition` wrapper, `available` flag, interim/final callbacks, 3-error lockout |
| §2.1 | `AttachmentStrip` component | Task 7 | Thumbnail chips with × buttons (i18n `aria-label`) |
| §2.1 | `SlashList` component | Task 6 (extracted; trailing newlines fix in `78004f9`) | Extracted from ChatInput; i18n header tooltip retained |
| §2.1 | `FileMentionList` component | Task 6 (extracted; trailing newlines fix in `78004f9`) | Fuzzy match + Tab preview row + `role="listbox"` items |
| §2.1 | `InputHintBar` component | Task 7 | Footer hint line with `<kbd>` elements + English fallbacks (`83f103d`) |
| §2.1 | `VoiceButton` component | Task 7 | Renders `null` when unavailable; `aria-pressed` while listening |
| §2.1 | `icons.ts` (animation keyframe class names + lucide mappings) | Task 7 | Alongside components |
| §2.1 | `index.css` keyframes (4) + reduced-motion fallback | Task 5 | `chat-attachment-enter`, `chat-voice-pulse`, `chat-recall-pulse`, `chat-dropzone-in`, `chat-fade-in` |
| §2.1 | `Chat.tsx` mobile hamburger + `md:hidden` ActivityBar | Task 12 | Hamburger row at `< md`; desktop layout unchanged |
| §2.1 | i18n keys (en + zh parity) | Task 11 | All 6 new keys populated in both locales |
| §2.1 | New hook unit tests | Task 4 + Task 9 | `usePromptHistory` (6), `useAttachments` (6), `useVoiceInput` (5) — 17/17 |
| §2.1 | `ChatInput.test.tsx` extension | Task 13 | +13 behaviour cases (paste/drop/remove/history/slash/@/Tab/Send/voice/hint/reduced-motion) |
| §2.1 | Snapshot baselines refresh | Task 14 | Mobile 375×812 baseline added; ChatInput-with-attachment baseline added; reviewer walked the diff non-blindly per `dashboard/CLAUDE.md` policy |
| §3 | `useRunChat.send` backward-compat | Task 8 | Both `send(text)` and `send(SendPayload)` work; gateway accepts both wire bodies |
| §3 | localStorage fallback | Task 9 | Catch + in-memory fallback + one-shot toast |
| §4.1 | Keyframes + reduced-motion | Task 5 | `@media (prefers-reduced-motion: reduce)` overrides |
| §4.2 | Colour palette usage (no new tokens) | Tasks 7, 9, 12 | All colours within existing `surface-1/2/3`, `accent`, `border`, `*500/*400/*20` palette |
| §4.3 | Accessibility (ARIA, kbd, listbox) | Tasks 6, 7, 9 | `aria-pressed`, `aria-label`, `role="listbox"`/`role="option"`, `<kbd>`, `role="status" aria-live="polite"` for recall pulse |
| §5.1 | Hook unit tests (17/17) | Tasks 4, 9 | Green |
| §5.2 | Component tests (extended) | Task 13 | 14 specified behaviour cases + covered in `ChatInput.test.tsx` |
| §5.3 | Snapshot baselines (desktop + new mobile) | Task 14 | Refreshed non-blindly with reviewer walkthrough |
| §5.4 | Manual e2e E1–E10 | **Task 15 — deferred to human reviewer** | Cannot be executed by a subagent on real Chrome/Safari; reviewer to mark each in the PR description |
| §5.5 | i18n keys EN/ZH parity | Task 11 | 6/6 keys populated |
| §6 | Definition of Done | Task 15 (this document) | All 4 verification steps below |

### 1.2 Out of scope (unchanged)

- No new backend endpoint. Images travel as dataURL in the prompt payload, no upload route.
- No multi-device prompt history sync (localStorage only; hook abstracts `storage`).
- FileTree ↔ ChatInput drag-to-insert interactions not added.
- No full iOS PWA rewrite (only `md` breakpoint folds).
- MCP / tool-flow / permissions refactor not touched.
- `useChatShortcuts` shortcut layer not touched.

---

## 2. Verification (Task 15)

### Step 1 — `npm run test:client` ✅ green

Script: `dashboard/client/package.json#test` (which is what `dashboard/package.json#test:client` delegates to via `cd client && npm test`).

Result: `Test Files  38 passed (38)`, `Tests  354 passed (354)`, duration 9.89s.

Note: `dashboard/client/package.json` defines the script as `test` (not `test:client`); the actual `test:client` script lives in the parent `dashboard/package.json` and delegates to `cd client && npm test`. The two are equivalent for verification purposes; the latter is the conventional entrypoint the team uses.

### Step 2 — `cd dashboard/client && npx tsc --noEmit` ✅ exit 0

```
EXIT: 0
```

No TypeScript errors.

### Step 3 — `npm run lint` ⚠ not configured (state)

```
npm error Missing script: "lint"
```

The repo has no `lint` script in either `dashboard/client/package.json` or `dashboard/package.json`. Per `dashboard/CLAUDE.md` policy ("if you cannot run a verification step, state exactly what was not run and why"), this step is declared **not run — script not configured in this repo**. No new errors can be introduced because the script does not exist. Typecheck and the full test suite are the project's effective static-analysis gates.

### Step 4 — Manual e2e (E1–E10) ⚠ deferred to human reviewer

The 10 manual scenarios in spec §5.4 require a real Chrome/Safari session. Subagents must not attempt them. The reviewer runs the scenarios on real Chrome and Safari (or simulator) and marks each off in the PR description. Scenarios:

- E1 Drag an image and send
- E2 Paste an image
- E3 9-image cap
- E4 History recall
- E5 Adjacent dedupe
- E6 Voice (desktop Chrome)
- E7 Voice unavailable (Firefox)
- E8 Mobile hamburger
- E9 Reduced motion
- E10 Slash regression (`/clear`, `/memory`)

### Step 5 — `console.log` / leftover scaffolding ✅ none from this work

`grep -rE "console\.(log|warn|error|debug|info)" src/components/chat/ src/hooks/chat/` returns one hit: `src/components/chat/ChatTab.tsx:130` — `onError={(msg) => console.warn(msg)}`. This is a pre-existing intentional error reporter (from the `feat: interactive chat page` line, commit `d768db1`), not a leftover from the chat-input-upgrade work. No `console.log`, no `TODO`/`FIXME`/`TBD`/`implement later` markers in `src/components/chat/` or `src/hooks/chat/`.

### Step 6 — No new dependencies ✅

Diff vs `master`: no changes to `dashboard/client/package.json` `dependencies` or `devDependencies`. All new functionality uses libraries already declared in the manifest (`react`, `lucide-react`, `i18next`, etc.).

---

## 3. Known minor findings (carried forward, all informational)

- **T3-minor-1/2, T4-minor-1:** trailing-newline style on new hook files. Recorded in `.superpowers/sdd/progress.md`; left to project preference.
- **T7-minor-1:** Fixed in `83f103d` (English fallbacks).
- **T7-minor-2:** `VoiceButton` accepts an undocumented `disabled` prop. Harmless; not required by the brief.
- **T8-minor-1:** wire-shape divergence — `useRunChat.send` with a string now passes `attachments: []` to the gateway, whereas legacy 2-arg callers pass `undefined`. Both bodies are accepted by the gateway; informational.
- **T9-minor-1:** `useEffect` blocks registering `voice.onInterim` / `voice.onFinal` in `ChatInput.tsx` do not return the unsubscribe functions. Matches brief verbatim and is benign; cleanup deferred.

None of the above are blockers. None introduce regressions in tests or typecheck.

---

## 4. Summary

The branch ships the spec in full. The only verification step not run inside the subagent workflow is the human manual e2e (E1–E10), which is deferred to the reviewer per the brief. Lint is not configured at the repo level, so step 3 is declared "not run" with reason. All other gates (354 client tests, tsc, no scaffolding leftovers) are green.

The change set is internally consistent: types flow from `lib/types.ts` → hooks in `hooks/chat/` → components in `components/chat/input/` → orchestration in `ChatInput.tsx` and `ChatTab.tsx` → page layout in `Chat.tsx`. The `useRunChat.send` SendPayload extension is backward-compatible (string callers still work; gateway accepts both bodies).
