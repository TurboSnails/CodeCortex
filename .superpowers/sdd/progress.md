# SDD Progress — Chat Input Upgrade

**Branch:** `feat/chat-input-upgrade`
**BranchBase:** `cba7044` (parent of branch creation; cleanup commits `76b7ec5` & `cba7044` are ancestors)
**Plan:** `docs/superpowers/plans/2026-07-03-chat-input-upgrade.md`
**Spec:** `docs/superpowers/specs/2026-07-03-chat-input-upgrade-design.md`

Pre-SDD state:
- Working tree had unrelated `package-lock.json` mods + untracked `.vscode/`. Stashed as `dry-run: package-lock mods + .vscode (stash 2026-07-03 pre-SDD)`. Recover with `git stash pop` after merge.

Task ledger — append one line per clean task:

```
Task 1: complete (commits cba7044..2a32598, review clean, tsc independently re-verified)
Task 2: complete (commits 2a32598..317f68b + plan amendment db6be27, review APPROVED; both deviations justified)
Task 3: complete (commits 317f68b..927cea4, review APPROVED; concern about brief's mock-cast under noUncheckedIndexedAccess fixed with one-char `!`)
Task 4: complete (commits 927cea4..774f469, review APPROVED with 1 minor; test-stub deviation (in-place window mutation + afterEach cleanup) justified — brief's globalThis.window override breaks jsdom prototype chain and leaks across tests)
Task 5: complete (commits 774f469..ee36c42, review APPROVED with 0 issues; tsc clean)
Task 6: complete (commits ee36c42..78004f9, re-review APPROVED with 0 issues; initial reviewer NEEDS_FIXES on missing trailing newlines, fix subagent added them in 78004f9)
Task 7: complete (commits 78004f9..d9cb266 + fix 83f103d; review APPROVED with 2 minors; T7-minor-1 fixed pre-emptively before Task 9)
Task 8: complete (commits 83f103d..efdff89, review APPROVED with 1 informational minor)
Task 9: complete (commits efdff89..42a58ac, review APPROVED with 1 minor; 4 deviations from brief all justified)
Task 10: complete (commits 42a58ac..3df716d, review APPROVED with 0 issues; 72/72 chat tests pass)
Task 11: complete (commits 3df716d..3c35a2d, review APPROVED with 0 issues; adapted to repo's per-namespace i18n structure)
Task 12: complete (commits 3c35a2d..e50ad0c, review APPROVED with 0 issues; expected Chat snapshot failure deferred to Task 14)
Task 13: complete (commits e50ad0c..5738828, review APPROVED with 3 minor test-coverage nits)
Task 14: complete (commits 5738828..497d6fd, review APPROVED with 0 issues; snapshot baselines refreshed non-blindly with mobile baseline)
Task 15: complete (commits 497d6fd..02a695c, review APPROVED with 2 minor informational; 354/354 tests green, tsc exit 0, lint declared not-run, E1–E10 deferred to reviewer per brief)
```

## Minor findings carried forward (filled after Task reviews)

- T3-minor-1: `useAttachments.test.ts` and the new hook files lack a trailing newline at EOF — task review noted as a project-preference nit. Confirm at final review.
- T3-minor-2: `useAttachments.ts` lines referenced by the implementer carry a `\ No newline at end of file` marker; same root cause as above.
- T3-minor-3: brief deviation list (the `!` non-null assertion) was a justified fix; already merged in `927cea4` — no follow-up needed.
- T4-minor-1: `useVoiceInput.ts` + test file both lack trailing newline at EOF (same pattern as T3-minor-1/2). Final review should run a single `sed -i -e '$a\\' $file` sweep on the new files to normalize, or accept as project preference.
- T7-minor-1: FIXED in commit `83f103d` — `InputHintBar.tsx` now uses inline English defaults for all six hint keys. No follow-up needed.
- T7-minor-2: `VoiceButton` accepts a `disabled` prop and forwards it to the button element. The brief did not require this; harmless addition, no follow-up needed.
- T8-minor-1: wire-shape divergence — when `useRunChat.send` is called with a string, the hook passes `attachments: []` (explicit) to `api.run.send`, whereas legacy 2-arg callers pass `undefined`. Both wire-bodies are accepted by the gateway (no backend regression); no action required. Informational only.
- T9-minor-1: FIXED in `b1e5307` (consecutive-error counter) and partially improved in `94671b9` (useVoiceInput API now accepts `onRecognition` callback for cleaner test injection; ChatInput voice hookup still discards unsubscribe — left as deferred cleanup).

## Final review outstanding

- **Final whole-branch review: APPROVED with 2 important + 12 minor findings** (see `.superpowers/sdd/final-review.md`).
- **Final fix wave: 5 commits, all green, no unresolved minors.**
  - `94671b9` — fix(chat-input): remove test back-channel from useVoiceInput
  - `b128caf` — fix(chat-input): surface attachment limit errors via ChatToast
  - `b1e5307` — fix(chat-input): useVoiceInput 3-error lockout now counts consecutive errors
  - `8547069` — chore(chat-input): add trailing newlines to 6 chat-input files
  - `0448a9b` — fix(chat-input): wrap SessionDetail ChatTab in ChatWorkspaceProvider (regression fix after Important #2)
- **Final cross-cutting state (HEAD `0448a9b`):** 38 test files / 354 tests passing; `tsc --noEmit` exit 0; lint not configured (declared per `dashboard/CLAUDE.md`); manual e2e E1–E10 still deferred to human reviewer.
- **Status: READY FOR PR.** Open the PR; reviewer runs the 10 manual e2e scenarios in real Chrome and mobile Safari (or simulator), then merges.

---

# SDD Progress — Chat Workflow Mode Selector

**Branch:** `master`
**BranchBase:** `a308a2c` (commit before SDD execution begins)
**Plan:** `docs/superpowers/plans/2026-07-04-chat-workflow-modes.md`
**Spec:** `docs/superpowers/specs/2026-07-04-chat-workflow-modes-design.md`

Task ledger — append one line per clean task:

```
Task 0: complete (commits a308a2c..dd70842, review clean)
Task 1: complete (commits dd70842..0a41d0f, review APPROVED after 2 fix rounds)
Task 2: complete (commits 0a41d0f..9ef4be4, review clean)
Task 3: complete (commits 9ef4be4..a3eefbf, review APPROVED with minor radio-group a11y notes)
Task 4: complete (commits a3eefbf..efe91ee, review APPROVED with minor notes)
Task 5: complete (commits efe91ee..312883b, review APPROVED with 4 minors; 600 ms delay restored and fake-timer leak fixed in final fix commit)
Task 7: complete (commits 312883b..d508fb9, review APPROVED with 3 minors; marker instructions appended verbatim)
Task 8: complete (commits d508fb9..e4b404f, review APPROVED with 2 minors; plugin files patched outside repo, README committed)
```

## Minor findings carried forward (chat workflow mode selector)

- T5-minor-1: Missing integration test for no-marker default-to-PAUSE in `ChatTab.workflow.test.tsx`. Hook-level coverage exists; deferred to final review.
- T5-minor-2: `react-hooks/exhaustive-deps` disable in `ChatTab.tsx` marker effect is intentional because `marker` identity changes each typewriter tick. Documented in code; consider a ref-based comparison if refactor later.
- T5-minor-3: Duplicated error banner markup between `useRunChat` error and workflow error. Could extract a small `ErrorBanner` component at final review.
- T5-minor-4: Hardcoded Chinese mode-switch confirmation matches the brief and has a `// TODO(i18n)` comment.