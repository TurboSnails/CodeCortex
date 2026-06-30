## 1. Database

- [x] 1.1 Add `plan_type` and `change_dir` columns to `session_plans` (with try/catch on ALTER for re-runs)
- [x] 1.2 Add `listReviews` and `countReviews` prepared statements to `db.js`

## 2. OpenSpec Plan Library

- [x] 2.1 Create `server/lib/openspec-plan.js` exporting `toSlug` / `makeSlug` / `parseTasks` / `parseTasksFromFileContent`
- [x] 2.2 Implement `detectPlanLocation(cwd, sessionId)` (openspec vs standalone fallback)
- [x] 2.3 Implement `generateOpenSpecChange(changeDir, sessionId, description, tasks)` writing `.openspec.yaml` + `proposal.md` + `tasks.md` (v1 `# Plan:` header)
- [x] 2.4 Make `makeSlug` produce `YYYY-MM-DD-codecortex-<8char>-<4char hash>` to avoid same-day same-prefix collisions

## 3. Plan Route Integration

- [x] 3.1 Update `POST /api/plan/:sessionId` to use `detectPlanLocation` + `generateOpenSpecChange`
- [x] 3.2 Persist `plan_type` and `change_dir` columns in `session_plans` row
- [x] 3.3 Add `getTasksFilePath(plan)` helper that falls back to legacy `plans_dir/session_id/tasks.md` when `change_dir IS NULL`
- [x] 3.4 Start `planWatcher.watch(sessionId, tasksPath)` after successful POST

## 4. Plan Watcher

- [x] 4.1 Create `server/lib/plan-watcher.js` wrapping `fs.watch` with 200ms debounce
- [x] 4.2 Make `watch` idempotent per `sessionId` (no duplicate FSWatcher)
- [x] 4.3 Self-clean on file deletion (`unwatch` instead of throwing)
- [x] 4.4 Inject `broadcastFn` parameter for testability
- [x] 4.5 Hook into `routes/hooks.js` Stop event to call `planWatcher.unwatch(sessionId)`

## 5. Server Tests

- [x] 5.1 `openspec-plan.test.js`: cover `parseTasks` (prose / numbered-period / numbered-paren / single), `parseTasksFromFileContent` (v1 header / non-checkbox lines / empty), `toSlug` (lowercase / strip special / 40-char truncate), `makeSlug` (date+prefix+hash format / different slugs for different sessionIds), `detectPlanLocation` (no openspec/ → standalone, with openspec/ → openspec path), `generateOpenSpecChange` (three files / nested mkdir)
- [x] 5.2 `plan-watcher.test.js`: cover broadcast on modify / no duplicate watchers / unwatch is safe
- [x] 5.3 `plan.test.js`: assert new `plan_type` / `change_dir` fields in response
- [x] 5.4 `review.test.js`: assert `/api/review/:sessionId/history` endpoint (default / custom / clamp / 400)

## 6. Client API + Types

- [x] 6.1 Add `ReviewHistoryResponse` to `client/src/lib/types.ts`
- [x] 6.2 Add `api.review.getHistory(sessionId)` to `client/src/lib/api.ts`

## 7. ReviewsTab Component

- [x] 7.1 Create `client/src/components/ReviewsTab.tsx` with `reviews` + `expandedId` state
- [x] 7.2 Initial load via `useEffect` + `api.review.getHistory`
- [x] 7.3 Subscribe to WS `review_ready` and prepend to list
- [x] 7.4 Render per-row timestamp + provider/model badge + expand/collapse button + MarkdownContent
- [x] 7.5 Empty state: "暂无审核记录"
- [x] 7.6 `onCountChange` callback to expose total to parent

## 8. SessionDetail Integration

- [x] 8.1 Add "Reviews" tab to SessionDetail, importing `ReviewsTab`
- [x] 8.2 Display numeric badge when `reviewCount > 0` (initial value from `total` field)

## 9. Client Tests

- [x] 9.1 `ReviewsTab.test.tsx`: cover initial render / WS prepend / expand/collapse / empty state
- [x] 9.2 Update `screens.snapshot.test.tsx.snap` baseline for new Reviews tab
