# Planning & Review Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Approved (2026-07-01)
**Spec:** `docs/superpowers/specs/2026-07-01-codecortex-planning-review-improvements-design.md`

**Goal:** Complete three deferred gaps in CodeCortex: real OpenSpec file generation for the planning layer, file-watcher task auto-sync, and a paginated review history tab in SessionDetail.

**Architecture:** Server-side adds a new `openspec-plan.js` lib that detects whether the session's working directory has an `openspec/` folder and writes a proper change there (or falls back to `~/.codecortex/plans/`). A `plan-watcher.js` wraps `fs.watch` to push `plan_updated` WS events when `tasks.md` changes on disk, with `unwatchAll` for clean shutdown. The existing `session_reviews` table stores all history; we expose it via a paginated `/history?offset=&limit=` endpoint and a new `ReviewsTab` component using `IntersectionObserver` for infinite scroll.

**Tech Stack:** Node.js (Express, better-sqlite3, fs.watch), React 18 + TypeScript, Tailwind CSS, Vitest (client), node:test (server), lucide-react icons.

## Global Constraints

- Server tests use Node's built-in `node:test` + `assert/strict` — no Jest/Vitest on server side.
- Client tests use Vitest + @testing-library/react.
- Run `npm run test:server` after every server task; run `npm run test:client` after every client task.
- **Never commit a failing test suite. Every commit point must have a green tree.**
- All new server files go in `dashboard/server/`; all new client files go in `dashboard/client/src/`.
- `broadcast(type, data)` is imported from `../websocket` in server route/lib files.
- DB uses `better-sqlite3` (synchronous). Never use `db.prepare()` outside the `stmts` object in `db.js`.
- `CODECORTEX_PLANS_DIR` env var overrides the default `~/.codecortex/plans` path (used in tests).
- **Commit strategy:** Each Task ends with its own commit. Cross-task coordination uses `feature flags` (env vars or runtime checks) only when unavoidable — prefer "tree stays green" over "atomic mega-commit".

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `dashboard/server/lib/openspec-plan.js` | detectPlanLocation, generateOpenSpecChange, parseTasks, parseTasksFromFileContent, toSlug, makeSlug |
| Create | `dashboard/server/lib/plan-watcher.js` | fs.watch wrapper: watch/unwatch/unwatchAll per sessionId |
| Create | `dashboard/server/__tests__/openspec-plan.test.js` | Unit tests for openspec-plan.js |
| Create | `dashboard/server/__tests__/plan-watcher.test.js` | Unit tests for plan-watcher.js |
| Create | `dashboard/client/src/components/ReviewsTab.tsx` | Reviews history tab component (infinite scroll) |
| Create | `dashboard/client/src/components/__tests__/ReviewsTab.test.tsx` | Component tests |
| Modify | `dashboard/server/db.js` | ALTER TABLE migrations + listReviews stmt + updated insertSessionPlan (5 params) + countReviews |
| Modify | `dashboard/server/routes/plan.js` | Full refactor: import from openspec-plan, use change_dir, fallback for legacy rows, call planWatcher |
| Modify | `dashboard/server/routes/review.js` | Add GET /history with pagination |
| Modify | `dashboard/server/routes/hooks.js` | Call planWatcher.unwatch on Stop |
| Modify | `dashboard/server/index.js` | Call planWatcher.unwatchAll on SIGTERM/SIGINT |
| Modify | `dashboard/server/__tests__/plan.test.js` | Add planType/changeDir assertions + openspec path test + legacy row fallback test |
| Modify | `dashboard/server/__tests__/review.test.js` | Add /history endpoint tests (pagination, hasMore, limits) |
| Modify | `dashboard/client/src/lib/types.ts` | Add ReviewHistoryResponse interface |
| Modify | `dashboard/client/src/lib/api.ts` | Add review.getHistory with offset/limit |
| Modify | `dashboard/client/src/pages/SessionDetail.tsx` | Add "reviews" tab + ReviewsTab + History icon |
| Modify | `dashboard/client/src/pages/__tests__/screens.snapshot.test.tsx` | Regenerate snapshot (new tab) |
| Modify | `dashboard/client/src/pages/__tests__/SessionDetail.nestedAgents.test.tsx` | Add review.getHistory mock |

---

## Task 1: DB Migrations — Phase 1 of 2 (non-breaking ALTER + new stmts)

> **Why split:** v1's `insertSessionPlan` takes 3 params (session_id, change_name, plans_dir). v2 takes 5 (adds plan_type, change_dir). The current `routes/plan.js` POST calls the 3-param version. We must keep the tree green at every commit.
>
> **Strategy:** This commit adds only the non-breaking migrations (`listReviews`, `countReviews`, ALTER TABLE) — the new columns are added but `insertSessionPlan` still takes 3 params. Routes don't read the new columns yet. Task 3 bumps `insertSessionPlan` to 5 params and updates the only caller.

**Files:**
- Modify: `dashboard/server/db.js` — migrations section + stmts object

**Interfaces:**
- Consumes: existing `sessions`, `session_reviews`, `session_plans` tables (read-only here)
- Produces: `session_plans` table with two new nullable columns: `plan_type TEXT DEFAULT 'standalone'`, `change_dir TEXT`
- Produces: `stmts.listReviews(sessionId, limit, offset)` → rows
- Produces: `stmts.countReviews(sessionId)` → `{ count: number }`
- `stmts.insertSessionPlan` **unchanged** (still 3 params — bumped in Task 3)

- [ ] **Step 1: Add ALTER TABLE migrations to db.js**

Open `dashboard/server/db.js`. Find the existing migration try-catch block (search for `// Migrate:`). Add the following two try-catch blocks **after** the last existing one:

```js
// Migrate: add plan_type and change_dir to session_plans (v2 planning layer)
try {
  db.prepare("SELECT plan_type FROM session_plans LIMIT 1").get();
} catch {
  db.prepare("ALTER TABLE session_plans ADD COLUMN plan_type TEXT DEFAULT 'standalone'").run();
}
try {
  db.prepare("SELECT change_dir FROM session_plans LIMIT 1").get();
} catch {
  db.prepare("ALTER TABLE session_plans ADD COLUMN change_dir TEXT").run();
}
```

- [ ] **Step 2: Add listReviews and countReviews stmts**

In the `stmts` object, after `latestReview`, add:

```js
  listReviews: db.prepare(
    "SELECT id, session_id, model, review, created_at FROM session_reviews WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
  ),
  countReviews: db.prepare(
    "SELECT COUNT(*) AS count FROM session_reviews WHERE session_id = ?"
  ),
```

- [ ] **Step 3: Run server tests to confirm no regressions**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:server 2>&1 | tail -20
```

Expected: all existing tests pass. New columns added with defaults, new stmts registered but unused by routes.

- [ ] **Step 4: Commit**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard
git add server/db.js
git commit -m "$(cat <<'EOF'
feat(db): add plan_type/change_dir columns and listReviews/countReviews stmts

Non-breaking migration: new columns added with DEFAULT 'standalone',
existing insertSessionPlan unchanged. New stmts unused until Task 3/5.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: server/lib/openspec-plan.js

**Files:**
- Create: `dashboard/server/lib/openspec-plan.js`
- Create: `dashboard/server/__tests__/openspec-plan.test.js`

**Interfaces:**
- Consumes: `fs`, `path`, `os` Node built-ins
- Consumes: env var `CODECORTEX_PLANS_DIR` (optional, falls back to `~/.codecortex/plans`)
- Produces: `parseTasks(description: string): string[]`
- Produces: `parseTasksFromFileContent(content: string): { done: boolean, text: string }[]`
- Produces: `toSlug(description: string): string` (40-char truncated)
- Produces: `makeSlug(sessionId: string): string` (`YYYY-MM-DD-codecortex-<8>-<4hash>`)
- Produces: `detectPlanLocation(cwd: string, sessionId: string): { type: 'openspec'|'standalone', changeDir: string }`
- Produces: `generateOpenSpecChange(changeDir: string, sessionId: string, description: string, tasks: string[]): void`

- [ ] **Step 1: Write the failing tests**

Create `dashboard/server/__tests__/openspec-plan.test.js`:

```js
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TEST_PLANS_DIR = path.join(os.tmpdir(), `openspec-plan-test-${Date.now()}`);
process.env.CODECORTEX_PLANS_DIR = TEST_PLANS_DIR;

const {
  parseTasks,
  parseTasksFromFileContent,
  toSlug,
  makeSlug,
  detectPlanLocation,
  generateOpenSpecChange,
} = require("../lib/openspec-plan");

describe("parseTasks", () => {
  it("returns single task for prose (no number)", () => {
    assert.deepEqual(parseTasks("Fix the login bug"), ["Fix the login bug"]);
  });

  it("splits period-numbered list", () => {
    assert.deepEqual(
      parseTasks("1. Create route\n2. Add test\n3. Update docs"),
      ["Create route", "Add test", "Update docs"]
    );
  });

  it("splits paren-numbered list", () => {
    assert.deepEqual(
      parseTasks("1) Step one\n2) Step two"),
      ["Step one", "Step two"]
    );
  });

  it("returns single task when only one numbered item (strips number)", () => {
    assert.deepEqual(parseTasks("1. Only task"), ["Only task"]);
  });
});

describe("parseTasksFromFileContent", () => {
  it("parses v1 header format", () => {
    const content = "# Plan: my-plan\n\n- [ ] Task one\n- [x] Task two\n";
    assert.deepEqual(parseTasksFromFileContent(content), [
      { done: false, text: "Task one" },
      { done: true, text: "Task two" },
    ]);
  });

  it("ignores non-checkbox lines", () => {
    const content = "## Why\n\nSome prose.\n\n- [ ] Real task\n";
    assert.deepEqual(parseTasksFromFileContent(content), [
      { done: false, text: "Real task" },
    ]);
  });

  it("returns empty for empty file", () => {
    assert.deepEqual(parseTasksFromFileContent(""), []);
  });
});

describe("toSlug", () => {
  it("lowercases and hyphenates", () => {
    assert.equal(toSlug("Fix Auth Bug"), "fix-auth-bug");
  });

  it("strips special chars", () => {
    assert.equal(toSlug("Add OAuth2 (Google)"), "add-oauth2-google");
  });

  it("truncates at 40 chars", () => {
    assert.ok(toSlug("a".repeat(50)).length <= 40);
  });
});

describe("makeSlug", () => {
  it("includes date, prefix, sessionId prefix, and 4-char hash", () => {
    const slug = makeSlug("abcdefghijklmnop");
    assert.match(slug, /^\d{4}-\d{2}-\d{2}-codecortex-abcdefgh-[a-z0-9]{4}$/);
  });

  it("produces different slugs for different sessionIds with same prefix", () => {
    const s1 = makeSlug("aaaaaaaa-1111");
    const s2 = makeSlug("aaaaaaaa-2222");
    assert.notEqual(s1, s2);
  });
});

describe("detectPlanLocation", () => {
  it("returns standalone when cwd has no openspec/", () => {
    const result = detectPlanLocation("/no/openspec/here", "sess-abc12345");
    assert.equal(result.type, "standalone");
    assert.equal(result.changeDir, path.join(TEST_PLANS_DIR, "sess-abc12345"));
  });

  it("returns openspec when cwd has openspec/ directory", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openspec-detect-test-"));
    try {
      fs.mkdirSync(path.join(tmp, "openspec"));
      const result = detectPlanLocation(tmp, "sess-abc12345");
      assert.equal(result.type, "openspec");
      assert.ok(result.changeDir.includes(path.join(tmp, "openspec", "changes")));
      assert.ok(result.changeDir.includes("codecortex-sess-abc1"));
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});

describe("generateOpenSpecChange", () => {
  it("creates .openspec.yaml, proposal.md, and tasks.md with v1-compat header", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openspec-gen-test-"));
    try {
      generateOpenSpecChange(tmp, "sess-test-123", "Fix auth bug", [
        "Update middleware",
        "Add test",
      ]);

      const yaml = fs.readFileSync(path.join(tmp, ".openspec.yaml"), "utf8");
      assert.ok(yaml.includes("schema: spec-driven"));
      assert.ok(yaml.includes("sess-test-123"));

      const proposal = fs.readFileSync(path.join(tmp, "proposal.md"), "utf8");
      assert.ok(proposal.includes("## Why"));
      assert.ok(proposal.includes("Fix auth bug"));
      assert.ok(proposal.includes("- Update middleware"));

      const tasks = fs.readFileSync(path.join(tmp, "tasks.md"), "utf8");
      assert.ok(tasks.startsWith("# Plan:"), "tasks.md must use v1 header format");
      assert.ok(tasks.includes("- [ ] Update middleware"));
      assert.ok(tasks.includes("- [ ] Add test"));
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it("creates nested changeDir if it does not exist", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openspec-mkdir-test-"));
    try {
      const nested = path.join(tmp, "a", "b", "c");
      generateOpenSpecChange(nested, "sess-xyz", "Do thing", ["task one"]);
      assert.ok(fs.existsSync(path.join(nested, "tasks.md")));
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && node --test server/__tests__/openspec-plan.test.js 2>&1 | tail -10
```

Expected: `Error: Cannot find module '../lib/openspec-plan'`

- [ ] **Step 3: Create dashboard/server/lib/openspec-plan.js**

```js
const fs = require("fs");
const path = require("path");
const os = require("os");

function toSlug(description) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .replace(/-+$/, "");
}

// Make a short alphanumeric hash (base36) from a string.
// Used to disambiguate slugs when two sessionIds share the first 8 chars.
function shortHash(input) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit, then to base36, take last 4 chars
  return (h >>> 0).toString(36).padStart(4, "0").slice(-4);
}

function makeSlug(sessionId) {
  const today = new Date().toISOString().slice(0, 10);
  const prefix = sessionId.slice(0, 8);
  const hash = shortHash(sessionId);
  return `${today}-codecortex-${prefix}-${hash}`;
}

function parseTasks(description) {
  const lines = description.split("\n").map((l) => l.trim()).filter(Boolean);
  const numbered = lines.filter((l) => /^\d+[.)]\s/.test(l));
  if (numbered.length > 1) {
    return numbered.map((l) => l.replace(/^\d+[.)]\s+/, "").trim());
  }
  if (numbered.length === 1) {
    return [numbered[0].replace(/^\d+[.)]\s+/, "").trim()];
  }
  return [description.trim()];
}

// Read-side parser used by both GET /api/plan and plan-watcher. Independent of
// header format (v1 # Plan: or v2 ## Tasks) — only looks at checkbox lines.
function parseTasksFromFileContent(content) {
  return content
    .split("\n")
    .filter((l) => /^- \[[ x]\]/.test(l))
    .map((l) => ({
      done: l.startsWith("- [x]"),
      text: l.replace(/^- \[[ x]\]\s*/, "").trim(),
    }));
}

function detectPlanLocation(cwd, sessionId) {
  const openspecDir = path.join(cwd, "openspec");
  if (fs.existsSync(openspecDir)) {
    return {
      type: "openspec",
      changeDir: path.join(openspecDir, "changes", makeSlug(sessionId)),
    };
  }
  const baseDir =
    process.env.CODECORTEX_PLANS_DIR ||
    path.join(os.homedir(), ".codecortex", "plans");
  return {
    type: "standalone",
    changeDir: path.join(baseDir, sessionId),
  };
}

function generateOpenSpecChange(changeDir, sessionId, description, tasks) {
  fs.mkdirSync(changeDir, { recursive: true });
  const changeName = path.basename(changeDir);
  const today = new Date().toISOString().slice(0, 10);

  fs.writeFileSync(
    path.join(changeDir, ".openspec.yaml"),
    `schema: spec-driven\ncreated: ${today}\nsession_id: ${sessionId}\n`,
    "utf8"
  );

  const taskList = tasks.map((t) => `- ${t}`).join("\n");
  fs.writeFileSync(
    path.join(changeDir, "proposal.md"),
    `## Why\n\n${description}\n\n## What Changes\n\n${taskList}\n`,
    "utf8"
  );

  // Use v1 header format (# Plan: <changeName>) so legacy row fallback path
  // can also parse this file with the same checkbox regex.
  const checkboxes = tasks.map((t) => `- [ ] ${t}`).join("\n");
  fs.writeFileSync(
    path.join(changeDir, "tasks.md"),
    `# Plan: ${changeName}\n\n${checkboxes}\n`,
    "utf8"
  );
}

module.exports = {
  toSlug,
  makeSlug,
  parseTasks,
  parseTasksFromFileContent,
  detectPlanLocation,
  generateOpenSpecChange,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && node --test server/__tests__/openspec-plan.test.js 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Run full server suite to confirm no regressions**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:server 2>&1 | tail -5
```

Expected: all pass (no callers yet, lib is unused).

- [ ] **Step 6: Commit**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard
git add server/lib/openspec-plan.js server/__tests__/openspec-plan.test.js
git commit -m "$(cat <<'EOF'
feat(server): add openspec-plan lib with detect/generate/slug helpers

Pure functions for OpenSpec integration: detectPlanLocation (cwd probe),
generateOpenSpecChange (writes 3 files with v1-compat tasks.md header),
parseTasksFromFileContent (format-agnostic reader), makeSlug (date +
sessionId prefix + 4-char hash for collision resistance).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Refactor routes/plan.js + bump insertSessionPlan to 5 params

> **Why this works as a separate green commit:** We add a `feature flag` of sorts — the route still calls the 3-param `insertSessionPlan` BUT we pass the new fields via a fallback. Cleaner approach: bump the stmt to 5 params AND update the single caller in the same commit. Since only one caller exists, this is a single atomic change.

**Files:**
- Modify: `dashboard/server/db.js` — `insertSessionPlan` stmt (3 → 5 params)
- Modify: `dashboard/server/routes/plan.js` — full refactor
- Create: `dashboard/server/lib/plan-watcher.js` — stub (replaced in Task 4)
- Modify: `dashboard/server/__tests__/plan.test.js` — add new assertions

**Interfaces:**
- Consumes: `parseTasks`, `parseTasksFromFileContent`, `detectPlanLocation`, `generateOpenSpecChange`, `makeSlug` from `../lib/openspec-plan` (Task 2)
- Consumes: `planWatcher.watch/unwatch/unwatchAll` stub from `../lib/plan-watcher` (Task 4 replaces stub; this commit only needs the stub interface to exist)
- Consumes: `stmts.listReviews` and `stmts.countReviews` (Task 1) — not used here, but the columns are
- Consumes: existing `stmts.getSession`, `stmts.getSessionPlan` from `../db`
- Produces: `POST /api/plan/:sessionId` now returns `{ changeName, tasks, planType, changeDir }`
- Produces: `GET /api/plan/:sessionId` unchanged response shape
- Produces: `PATCH /api/plan/:sessionId/tasks/:index` unchanged response shape
- Produces: Legacy row fallback: if `plan.change_dir` IS NULL, use `path.join(plan.plans_dir, plan.session_id, "tasks.md")` (v1 layout)
- Produces: `stmts.insertSessionPlan` 5-param signature: `(session_id, change_name, plans_dir, plan_type, change_dir)`

- [ ] **Step 1: Bump insertSessionPlan to 5 params in db.js**

Find `insertSessionPlan` in db.js stmts object. Replace with:

```js
  insertSessionPlan: db.prepare(
    `INSERT INTO session_plans (session_id, change_name, plans_dir, plan_type, change_dir, created_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
  ),
```

- [ ] **Step 2: Create plan-watcher.js stub**

Create `dashboard/server/lib/plan-watcher.js`:

```js
// Stub — replaced in Task 4
function watch() {}
function unwatch() {}
function unwatchAll() {}
module.exports = { watch, unwatch, unwatchAll };
```

- [ ] **Step 3: Rewrite dashboard/server/routes/plan.js**

```js
/**
 * Planning layer routes — create and read OpenSpec-style task plans for sessions.
 * When the session cwd contains an openspec/ directory, writes a proper change
 * there. Otherwise falls back to ~/.codecortex/plans/<sessionId>/.
 */

const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { stmts } = require("../db");
const { broadcast } = require("../websocket");
const {
  parseTasks,
  parseTasksFromFileContent,
  detectPlanLocation,
  generateOpenSpecChange,
} = require("../lib/openspec-plan");
const planWatcher = require("../lib/plan-watcher");

const PLANS_BASE =
  process.env.CODECORTEX_PLANS_DIR ||
  path.join(os.homedir(), ".codecortex", "plans");

const router = Router();

// Read-side: parse tasks.md content into { done, text }[].
// Both v1 (`# Plan: <name>`) and v2 (`## Tasks`) headers are accepted because
// the regex only matches checkbox lines, not headers.
function readTasksFromFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return parseTasksFromFileContent(content);
}

// Returns the absolute path to tasks.md for a plan row.
// New rows have change_dir set. Legacy v1 rows (change_dir IS NULL) fall back
// to the old plans_dir/<session_id>/ layout. Note: plan.plans_dir is the base
// path (~/.codecortex/plans) — NOT a per-session directory — so we join with
// session_id to reconstruct the v1 path. This is the implicit coupling that
// v1's insertSessionPlan established; we rely on it for backward compat.
function getTasksFilePath(plan) {
  if (plan.change_dir) return path.join(plan.change_dir, "tasks.md");
  return path.join(plan.plans_dir, plan.session_id, "tasks.md");
}

function toggleTaskInFile(filePath, taskIndex, done) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  let seen = -1;
  let found = false;
  const nextLines = lines.map((line) => {
    if (!/^- \[[ x]\]/.test(line)) return line;
    seen += 1;
    if (seen !== taskIndex) return line;
    found = true;
    const text = line.replace(/^- \[[ x]\]\s*/, "").trim();
    return `- [${done ? "x" : " "}] ${text}`;
  });
  if (!found) return null;
  fs.writeFileSync(filePath, nextLines.join("\n"), "utf8");
  return readTasksFromFile(filePath);
}

// POST /api/plan/:sessionId — create a plan for a session
router.post("/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const { description } = req.body || {};

  if (!description || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "description is required" });
  }

  const session = stmts.getSession ? stmts.getSession.get(sessionId) : null;
  if (!session) {
    return res.status(404).json({ error: "session not found" });
  }

  const existing = stmts.getSessionPlan.get(sessionId);
  if (existing) {
    return res.status(409).json({ error: "plan already exists for this session" });
  }

  const tasks = parseTasks(description);
  const { type: planType, changeDir } = detectPlanLocation(
    session.cwd || "",
    sessionId
  );
  generateOpenSpecChange(changeDir, sessionId, description, tasks);

  const changeName = require("../lib/openspec-plan").makeSlug(sessionId);
  stmts.insertSessionPlan.run(sessionId, changeName, PLANS_BASE, planType, changeDir);

  const taskObjects = tasks.map((t) => ({ done: false, text: t }));
  broadcast("plan_updated", { sessionId, changeName, tasks: taskObjects });

  const tasksPath = path.join(changeDir, "tasks.md");
  planWatcher.watch(sessionId, tasksPath);

  return res.status(201).json({ changeName, tasks: taskObjects, planType, changeDir });
});

// GET /api/plan/:sessionId — read current plan tasks
router.get("/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  const plan = stmts.getSessionPlan.get(sessionId);
  if (!plan) {
    return res.status(404).json({ error: "no plan for this session" });
  }

  const filePath = getTasksFilePath(plan);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "plan file missing" });
  }

  const tasks = readTasksFromFile(filePath);
  return res.status(200).json({ changeName: plan.change_name, tasks });
});

// PATCH /api/plan/:sessionId/tasks/:index — toggle a task's done state
router.patch("/:sessionId/tasks/:index", (req, res) => {
  const { sessionId, index } = req.params;
  const taskIndex = Number(index);
  const { done } = req.body || {};

  if (!Number.isInteger(taskIndex) || taskIndex < 0) {
    return res.status(400).json({ error: "index must be a non-negative integer" });
  }
  if (typeof done !== "boolean") {
    return res.status(400).json({ error: "done must be a boolean" });
  }

  const plan = stmts.getSessionPlan.get(sessionId);
  if (!plan) {
    return res.status(404).json({ error: "no plan for this session" });
  }

  const filePath = getTasksFilePath(plan);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "plan file missing" });
  }

  const updatedTasks = toggleTaskInFile(filePath, taskIndex, done);
  if (updatedTasks === null) {
    return res.status(404).json({ error: "task index out of range" });
  }

  broadcast("plan_updated", {
    sessionId,
    changeName: plan.change_name,
    tasks: updatedTasks,
  });

  return res.status(200).json({ changeName: plan.change_name, tasks: updatedTasks });
});

module.exports = router;
```

- [ ] **Step 4: Add new assertions to plan.test.js**

In `dashboard/server/__tests__/plan.test.js`, find the test `"creates a plan and returns tasks when session exists"`. Add assertions for the new fields after the existing assertions (before the closing `});`):

```js
    assert.equal(res.body.planType, "standalone"); // no openspec/ in test cwd (os.tmpdir())
    assert.ok(typeof res.body.changeDir === "string");
    assert.ok(res.body.changeDir.includes(sessionId));
```

Add a new test at the end of `POST` describe block (before the `GET` describe):

```js
  it("uses openspec/ location when cwd contains openspec directory", async () => {
    const sessionId = "plan-test-openspec-1";
    const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "codecortex-openspec-cwd-"));
    fs.mkdirSync(path.join(tmpCwd, "openspec"));
    insertSession(sessionId, tmpCwd);

    const res = await req("POST", `/api/plan/${sessionId}`, {
      description: "1. Create route\n2. Add test",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.planType, "openspec");
    assert.ok(res.body.changeDir.includes(path.join(tmpCwd, "openspec", "changes")));

    // proposal.md and .openspec.yaml should exist alongside tasks.md
    assert.ok(fs.existsSync(path.join(res.body.changeDir, "proposal.md")));
    assert.ok(fs.existsSync(path.join(res.body.changeDir, ".openspec.yaml")));

    fs.rmSync(tmpCwd, { recursive: true });
  });

  it("legacy plan row (change_dir NULL) is readable via fallback path", async () => {
    const sessionId = "plan-test-legacy-1";
    insertSession(sessionId);

    // Insert a v1-style row: change_dir NULL, plans_dir = PLANS_DIR
    db.prepare(
      `INSERT INTO session_plans (session_id, change_name, plans_dir, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).run(sessionId, "legacy-change", PLANS_DIR);

    // v1 wrote tasks.md at PLANS_DIR/<sessionId>/tasks.md
    const legacyDir = path.join(PLANS_DIR, sessionId);
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, "tasks.md"),
      "# Plan: legacy-change\n\n- [ ] legacy task\n",
      "utf8"
    );

    const res = await req("GET", `/api/plan/${sessionId}`, null);
    assert.equal(res.status, 200);
    assert.equal(res.body.tasks.length, 1);
    assert.equal(res.body.tasks[0].text, "legacy task");
  });
```

- [ ] **Step 5: Run server tests — all should pass now**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:server 2>&1 | tail -10
```

Expected: all tests pass including the new openspec test and legacy fallback test.

- [ ] **Step 6: Commit**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard
git add server/db.js server/routes/plan.js server/lib/plan-watcher.js \
        server/__tests__/plan.test.js
git commit -m "$(cat <<'EOF'
feat: openspec integration for planning layer

- Bump insertSessionPlan to 5 params (adds plan_type, change_dir)
- Refactor routes/plan.js to detect cwd's openspec/ directory and write
  proper change files (.openspec.yaml + proposal.md + tasks.md)
- Legacy v1 row fallback: change_dir NULL rows read from plans_dir/<id>/
- plan-watcher.js stub (replaced in next commit)
- New tests: openspec path, planType/changeDir fields, legacy row compat

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: plan-watcher.js — real implementation

**Files:**
- Modify: `dashboard/server/lib/plan-watcher.js` (replace stub)
- Create: `dashboard/server/__tests__/plan-watcher.test.js`
- Modify: `dashboard/server/routes/hooks.js` (add planWatcher.unwatch on Stop)
- Modify: `dashboard/server/index.js` (add planWatcher.unwatchAll on SIGTERM/SIGINT)

**Interfaces:**
- Consumes: `parseTasksFromFileContent` from `../lib/openspec-plan` (Task 2)
- Consumes: `broadcast` from `../websocket` (existing)
- Consumes: stub `plan-watcher.js` (Task 3) — replaced in Step 3
- Consumes: existing `routes/hooks.js` Stop handler
- Consumes: existing `server/index.js` startup code
- Produces: `watch(sessionId, tasksPath)` — starts fs.watch; 200ms debounce; broadcasts `plan_updated` on file change; idempotent per sessionId
- Produces: `watchWith(sessionId, tasksPath, broadcastFn)` — test-only injectable broadcast
- Produces: `unwatch(sessionId)` — closes watcher; safe to call when not watched
- Produces: `unwatchAll()` — closes all watchers; used on server shutdown

- [ ] **Step 1: Write failing tests for plan-watcher.js**

Create `dashboard/server/__tests__/plan-watcher.test.js`:

```js
const { describe, it, after, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const planWatcher = require("../lib/plan-watcher");

let tmpDir;
let tasksFile;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("plan-watcher", () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-watcher-test-"));
    tasksFile = path.join(tmpDir, "tasks.md");
    fs.writeFileSync(tasksFile, "## Tasks\n\n- [ ] Task one\n", "utf8");
  });

  after(() => {
    planWatcher.unwatchAll();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("calls broadcastFn with plan_updated when tasks.md is modified", async () => {
    const calls = [];
    const sessionId = "sess-w1";
    planWatcher.watchWith(sessionId, tasksFile, (type, data) =>
      calls.push({ type, data })
    );

    await sleep(50);
    fs.writeFileSync(tasksFile, "## Tasks\n\n- [x] Task one\n", "utf8");
    await sleep(400);

    assert.ok(calls.length >= 1, "expected at least one broadcast call");
    assert.equal(calls[0].type, "plan_updated");
    assert.equal(calls[0].data.sessionId, sessionId);
    assert.ok(Array.isArray(calls[0].data.tasks));
    assert.equal(calls[0].data.tasks[0].done, true);

    planWatcher.unwatch(sessionId);
  });

  it("does not register duplicate watchers for the same sessionId", () => {
    const sessionId = "sess-dup";
    const fn = () => {};
    planWatcher.watchWith(sessionId, tasksFile, fn);
    planWatcher.watchWith(sessionId, tasksFile, fn); // no-op
    planWatcher.unwatch(sessionId);
  });

  it("unwatch stops the watcher without error", () => {
    const sessionId = "sess-unwatch";
    planWatcher.watchWith(sessionId, tasksFile, () => {});
    assert.doesNotThrow(() => planWatcher.unwatch(sessionId));
    assert.doesNotThrow(() => planWatcher.unwatch(sessionId));
  });

  it("unwatchAll closes every active watcher", () => {
    planWatcher.watchWith("sess-a", tasksFile, () => {});
    planWatcher.watchWith("sess-b", tasksFile, () => {});
    assert.doesNotThrow(() => planWatcher.unwatchAll());
    // After unwatchAll, further unwatch calls are safe
    assert.doesNotThrow(() => planWatcher.unwatch("sess-a"));
    assert.doesNotThrow(() => planWatcher.unwatch("sess-b"));
  });

  it("debounces multiple rapid changes into one broadcast", async () => {
    const sessionId = "sess-debounce";
    const calls = [];
    planWatcher.watchWith(sessionId, tasksFile, (type, data) =>
      calls.push({ type, data })
    );

    await sleep(50);
    fs.writeFileSync(tasksFile, "## Tasks\n\n- [x] Task one\n- [ ] Task two\n", "utf8");
    fs.writeFileSync(tasksFile, "## Tasks\n\n- [x] Task one\n- [x] Task two\n", "utf8");
    fs.writeFileSync(tasksFile, "## Tasks\n\n- [x] Task one\n- [x] Task two\n- [ ] Task three\n", "utf8");

    await sleep(400);
    // 3 rapid writes should produce exactly 1 broadcast (debounced)
    assert.equal(calls.length, 1, `expected 1 call, got ${calls.length}`);

    planWatcher.unwatch(sessionId);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && node --test server/__tests__/plan-watcher.test.js 2>&1 | tail -10
```

Expected: tests fail (stub `watch` does nothing; `watchWith` does not exist).

- [ ] **Step 3: Replace stub with real plan-watcher.js**

```js
const fs = require("fs");
const { broadcast: defaultBroadcast } = require("../websocket");
const { parseTasksFromFileContent } = require("./openspec-plan");

const watchers = new Map(); // sessionId → { watcher, timer }

function readTasks(filePath) {
  try {
    return parseTasksFromFileContent(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

// Internal: register a watcher with a custom broadcast fn (for tests).
// Public callers (routes/plan.js) use watch() which defaults to websocket.broadcast.
function watchWith(sessionId, tasksPath, broadcastFn) {
  if (watchers.has(sessionId)) return; // prevent duplicate

  let timer = null;

  const watcher = fs.watch(tasksPath, { persistent: false }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      // Re-check session is still watched (could have been unwatched during debounce)
      if (!watchers.has(sessionId)) return;
      const tasks = readTasks(tasksPath);
      broadcastFn("plan_updated", { sessionId, tasks });
    }, 200);
  });

  watcher.on("error", () => unwatch(sessionId));

  watchers.set(sessionId, { watcher, getTimer: () => timer });
}

function watch(sessionId, tasksPath) {
  watchWith(sessionId, tasksPath, defaultBroadcast);
}

function unwatch(sessionId) {
  const entry = watchers.get(sessionId);
  if (!entry) return;
  try {
    entry.watcher.close();
  } catch {}
  watchers.delete(sessionId);
}

function unwatchAll() {
  for (const sessionId of [...watchers.keys()]) {
    unwatch(sessionId);
  }
}

module.exports = { watch, watchWith, unwatch, unwatchAll };
```

- [ ] **Step 4: Run plan-watcher tests**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && node --test server/__tests__/plan-watcher.test.js 2>&1 | tail -10
```

Expected: all 5 tests pass.

- [ ] **Step 5: Wire planWatcher.unwatch into hooks.js on Stop event**

In `dashboard/server/routes/hooks.js`, find the Stop event handler (search for `hook_event_name === "Stop"` or similar). Add the unwatch call after the existing Stop broadcast:

```js
const planWatcher = require("../lib/plan-watcher");

// In the Stop handler, after the existing broadcast:
planWatcher.unwatch(sessionId);
```

- [ ] **Step 6: Wire planWatcher.unwatchAll into server/index.js on shutdown**

In `dashboard/server/index.js`, find the existing `process.on("SIGTERM" / "SIGINT")` handlers. If they exist, add the unwatchAll call inside them. If they don't exist, add new handlers near the bottom:

```js
const planWatcher = require("./lib/plan-watcher");

function gracefulShutdown(signal) {
  planWatcher.unwatchAll();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

Verify the file already has a `server` reference; if not, use the variable that holds the `app.listen(...)` return value.

- [ ] **Step 7: Run full server test suite**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:server 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard
git add server/lib/plan-watcher.js server/__tests__/plan-watcher.test.js \
        server/routes/hooks.js server/index.js
git commit -m "$(cat <<'EOF'
feat: plan-watcher for automatic tasks.md sync + clean shutdown

Watches tasks.md with fs.watch; debounces 200ms then broadcasts
plan_updated WS event. Cleans up on session Stop hook and on server
SIGTERM/SIGINT. Injectable broadcastFn (watchWith) for testability.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Review History API (server, paginated)

**Files:**
- Modify: `dashboard/server/routes/review.js` (add GET /history with pagination)
- Modify: `dashboard/server/__tests__/review.test.js` (add /history tests)

**Interfaces:**
- Consumes: `stmts.listReviews(sessionId, limit, offset)` and `stmts.countReviews(sessionId)` (Task 1)
- Consumes: existing `routes/review.js` (POST/GET /:sessionId, GET/PATCH /config)
- Consumes: existing `session_reviews` table
- Produces: `GET /api/review/:sessionId/history?offset=0&limit=20` → `{ reviews: ReviewResult[], total: number, hasMore: boolean }`
- Produces: `limit` clamped to [1, 50], default 20
- Produces: `offset` clamped to >= 0, default 0
- Produces: `ReviewResult` shape (server): `{ id: number, model: string, review: string, createdAt: string }`

- [ ] **Step 1: Add failing tests for /history to review.test.js**

Open `dashboard/server/__tests__/review.test.js`. Find the last `describe` block and add a new one after it:

```js
describe("GET /api/review/:sessionId/history", () => {
  function insertReviews(sessionId, count) {
    for (let i = 0; i < count; i++) {
      db.prepare(
        "INSERT INTO session_reviews (session_id, model, diff, review) VALUES (?, ?, ?, ?)"
      ).run(sessionId, `model-${i}`, null, `Review ${i}`);
    }
  }

  it("returns empty list with total=0 when no reviews exist", async () => {
    insertSession("review-hist-sess-1");
    const res = await req("GET", "/api/review/review-hist-sess-1/history");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.reviews, []);
    assert.equal(res.body.total, 0);
    assert.equal(res.body.hasMore, false);
  });

  it("returns first page with default limit=20", async () => {
    insertSession("review-hist-sess-2");
    insertReviews("review-hist-sess-2", 25);

    const res = await req("GET", "/api/review/review-hist-sess-2/history");
    assert.equal(res.status, 200);
    assert.equal(res.body.reviews.length, 20);
    assert.equal(res.body.total, 25);
    assert.equal(res.body.hasMore, true);
    // Most recent first (highest id first)
    assert.equal(res.body.reviews[0].model, "model-24");
  });

  it("returns next page with offset=20", async () => {
    insertSession("review-hist-sess-3");
    insertReviews("review-hist-sess-3", 25);

    const res = await req("GET", "/api/review/review-hist-sess-3/history?offset=20");
    assert.equal(res.status, 200);
    assert.equal(res.body.reviews.length, 5);
    assert.equal(res.body.hasMore, false);
    assert.equal(res.body.reviews[0].model, "model-4");
  });

  it("clamps limit to max 50", async () => {
    insertSession("review-hist-sess-4");
    insertReviews("review-hist-sess-4", 60);

    const res = await req("GET", "/api/review/review-hist-sess-4/history?limit=999");
    assert.equal(res.status, 200);
    assert.equal(res.body.reviews.length, 50);
    assert.equal(res.body.hasMore, true);
    assert.equal(res.body.total, 60);
  });

  it("returns 400 for negative offset", async () => {
    insertSession("review-hist-sess-5");
    const res = await req("GET", "/api/review/review-hist-sess-5/history?offset=-1");
    assert.equal(res.status, 400);
  });
});
```

You may need to add `const { db } = require("../db");` at the top of the test file if not already present.

- [ ] **Step 2: Run review tests to verify new tests fail**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && node --test server/__tests__/review.test.js 2>&1 | grep -E "fail|pass|Error" | head -10
```

Expected: new tests fail with 404 (route not found).

- [ ] **Step 3: Add /history endpoint to routes/review.js**

In `dashboard/server/routes/review.js`, add the following route **before** the existing `GET /:sessionId` route (order matters — `/history` must be matched before `/:sessionId`):

```js
// GET /api/review/:sessionId/history?offset=0&limit=20 — paginated review history
router.get("/:sessionId/history", (req, res) => {
  const { sessionId } = req.params;

  // Parse and clamp pagination params
  const rawOffset = Number(req.query.offset);
  const rawLimit = Number(req.query.limit);
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  let limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : 20;
  limit = Math.min(limit, 50);

  if (req.query.offset !== undefined && (!Number.isFinite(rawOffset) || rawOffset < 0)) {
    return res.status(400).json({ error: "offset must be a non-negative integer" });
  }

  const rows = stmts.listReviews.all(sessionId, limit, offset);
  const { count: total } = stmts.countReviews.get(sessionId);
  const reviews = rows.map((r) => ({
    id: r.id,
    model: r.model,
    review: r.review,
    createdAt: r.created_at,
  }));
  const hasMore = offset + reviews.length < total;

  return res.json({ reviews, total, hasMore });
});
```

- [ ] **Step 4: Run review tests**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && node --test server/__tests__/review.test.js 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Run full server suite**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:server 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard
git add server/routes/review.js server/__tests__/review.test.js
git commit -m "$(cat <<'EOF'
feat: paginated review history API endpoint

GET /api/review/:sessionId/history?offset=N&limit=N returns reviews
ordered by most recent first. limit clamped to [1,50], default 20.
Response includes total count and hasMore for infinite scroll.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Client types + api.ts

**Files:**
- Modify: `dashboard/client/src/lib/types.ts` (add ReviewHistoryResponse)
- Modify: `dashboard/client/src/lib/api.ts` (add review.getHistory)

**Interfaces:**
- Consumes: existing `ReviewResult` interface in `types.ts` (line ~826)
- Consumes: existing `api.review` namespace in `api.ts` (line ~507)
- Consumes: existing `request<T>(path, opts)` helper
- Produces: `ReviewHistoryResponse = { reviews: ReviewResult[]; total: number; hasMore: boolean }`
- Produces: `api.review.getHistory(sessionId: string, opts?: { offset?: number; limit?: number })` returns `Promise<ReviewHistoryResponse>`

- [ ] **Step 1: Add ReviewHistoryResponse to types.ts**

In `dashboard/client/src/lib/types.ts`, find the `ReviewResult` interface (line ~826) and add below it:

```ts
export interface ReviewHistoryResponse {
  reviews: ReviewResult[];
  total: number;
  hasMore: boolean;
}
```

- [ ] **Step 2: Add getHistory to api.ts**

In `dashboard/client/src/lib/api.ts`, find the `review` namespace (around line 507). Add `getHistory`:

```ts
getHistory: (sessionId: string, opts?: { offset?: number; limit?: number }) => {
  const params = new URLSearchParams();
  params.set("offset", String(opts?.offset ?? 0));
  params.set("limit", String(opts?.limit ?? 20));
  return request<import("./types").ReviewHistoryResponse>(
    `/review/${encodeURIComponent(sessionId)}/history?${params}`
  );
},
```

The full `review` block should now look like:

```ts
review: {
  getConfig: () => request<import("./types").ReviewConfig>("/review/config"),
  patchConfig: (body: Partial<import("./types").ReviewConfig>) =>
    request<import("./types").ReviewConfig>("/review/config", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  trigger: (sessionId: string) =>
    request<{ model: string; review: string }>(`/review/${encodeURIComponent(sessionId)}`, {
      method: "POST",
    }),
  getLatest: (sessionId: string) =>
    request<import("./types").ReviewResult>(`/review/${encodeURIComponent(sessionId)}`),
  getHistory: (sessionId: string, opts?: { offset?: number; limit?: number }) => {
    const params = new URLSearchParams();
    params.set("offset", String(opts?.offset ?? 0));
    params.set("limit", String(opts?.limit ?? 20));
    return request<import("./types").ReviewHistoryResponse>(
      `/review/${encodeURIComponent(sessionId)}/history?${params}`
    );
  },
},
```

- [ ] **Step 3: Run client tests**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:client 2>&1 | tail -10
```

Expected: all existing tests pass (no new tests yet — added in Task 7).

- [ ] **Step 4: Commit**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard
git add client/src/lib/types.ts client/src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat: add ReviewHistoryResponse type and api.review.getHistory

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: ReviewsTab.tsx (infinite scroll, no duplicate emit)

**Files:**
- Create: `dashboard/client/src/components/ReviewsTab.tsx`
- Create: `dashboard/client/src/components/__tests__/ReviewsTab.test.tsx`

**Interfaces:**
- Consumes: `api.review.getHistory` (Task 6) and existing `api.review.trigger`
- Consumes: `eventBus.subscribe` from `../lib/eventBus`
- Consumes: `MarkdownContent` from `./conversation/MarkdownContent`
- Consumes: `ReviewResult` from `../lib/types`
- Consumes: `History` icon from `lucide-react`
- Produces: `ReviewsTab` component exported from `../components/ReviewsTab`
- Produces: Props `{ sessionId: string; onCountChange?: (n: number) => void }`
- Produces: Initial load: `api.review.getHistory(sessionId, { offset: 0, limit: 20 })`
- Produces: Infinite scroll: `IntersectionObserver` on sentinel ref → load next page
- Produces: WS subscribe `review_ready` → prepend to list, emit count via ref-guarded callback
- Produces: `onCountChange` only fires when count actually changes (ref de-dup)

- [ ] **Step 1: Write failing tests**

Create `dashboard/client/src/components/__tests__/ReviewsTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReviewsTab } from "../ReviewsTab";

const mockReviewsPage1 = [
  { id: 20, model: "openai/gpt-4o", review: "## Summary\nLooks good.", createdAt: "2026-07-01T10:00:00.000Z" },
  { id: 19, model: "gemini/gemini-1.5-flash", review: "No issues found.", createdAt: "2026-07-01T09:00:00.000Z" },
];
const mockReviewsPage2 = [
  { id: 18, model: "kimi/moonshot-v1", review: "Third review.", createdAt: "2026-07-01T08:00:00.000Z" },
];

const getHistoryMock = vi.fn();

vi.mock("../../../lib/api", () => ({
  api: {
    review: {
      getHistory: (...args: any[]) => getHistoryMock(...args),
    },
  },
}));

let busCallback: ((msg: any) => void) | null = null;
vi.mock("../../../lib/eventBus", () => ({
  eventBus: {
    subscribe: vi.fn((cb: (msg: any) => void) => {
      busCallback = cb;
      return () => { busCallback = null; };
    }),
  },
}));

describe("ReviewsTab", () => {
  beforeEach(() => {
    busCallback = null;
    getHistoryMock.mockReset();
    getHistoryMock.mockResolvedValue({ reviews: mockReviewsPage1, total: 21, hasMore: true });
  });

  it("shows loading then renders review list", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() => expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument());
    expect(screen.getByText("gemini/gemini-1.5-flash")).toBeInTheDocument();
  });

  it("renders empty state when no reviews", async () => {
    getHistoryMock.mockResolvedValueOnce({ reviews: [], total: 0, hasMore: false });
    render(<ReviewsTab sessionId="sess-empty" />);
    await waitFor(() => expect(screen.getByText(/暂无审核记录/)).toBeInTheDocument());
  });

  it("calls onCountChange with total count on initial load", async () => {
    const onCountChange = vi.fn();
    render(<ReviewsTab sessionId="sess-1" onCountChange={onCountChange} />);
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(21));
  });

  it("does not emit duplicate onCountChange for the same count", async () => {
    const onCountChange = vi.fn();
    render(<ReviewsTab sessionId="sess-1" onCountChange={onCountChange} />);
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(21));
    // Trigger a render that doesn't change the count
    fireEvent.click(screen.getAllByRole("button")[0]);
    await waitFor(() => expect(screen.getByText(/Looks good/)).toBeInTheDocument());
    // onCountChange should still have been called exactly once (or with same value)
    const callsFor21 = onCountChange.mock.calls.filter(([n]) => n === 21);
    expect(callsFor21.length).toBe(1);
  });

  it("expands review content on click", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() => expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument());
    expect(screen.queryByText(/Looks good/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button")[0]);
    await waitFor(() => expect(screen.getByText(/Looks good/)).toBeInTheDocument());
  });

  it("prepends new review from review_ready WS event", async () => {
    const onCountChange = vi.fn();
    render(<ReviewsTab sessionId="sess-1" onCountChange={onCountChange} />);
    await waitFor(() => expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument());
    busCallback?.({
      type: "review_ready",
      data: { sessionId: "sess-1", id: 100, model: "kimi/moonshot-v1", review: "New WS review", createdAt: new Date().toISOString() },
    });
    await waitFor(() => expect(screen.getByText("New WS review")).toBeInTheDocument());
    // Count should have updated to 22 (21 + 1)
    const lastCall = onCountChange.mock.calls[onCountChange.mock.calls.length - 1];
    expect(lastCall[0]).toBe(22);
  });

  it("ignores review_ready events for other sessions", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() => expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument());
    busCallback?.({
      type: "review_ready",
      data: { sessionId: "other-sess", id: 99, model: "x/y", review: "other", createdAt: "" },
    });
    expect(screen.queryByText("x/y")).not.toBeInTheDocument();
  });

  it("calls getHistory with offset=0 and limit=20 on initial load", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() => expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument());
    expect(getHistoryMock).toHaveBeenCalledWith("sess-1", { offset: 0, limit: 20 });
    expect(getHistoryMock.mock.calls.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:client -- --reporter=verbose 2>&1 | grep -E "ReviewsTab|FAIL|pass" | head -10
```

Expected: fails with `Cannot find module '../ReviewsTab'`.

- [ ] **Step 3: Create dashboard/client/src/components/ReviewsTab.tsx**

```tsx
import { useEffect, useRef, useState, useCallback } from "react";
import { History } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import type { ReviewResult } from "../lib/types";
import { MarkdownContent } from "./conversation/MarkdownContent";

interface Props {
  sessionId: string;
  onCountChange?: (n: number) => void;
}

const PAGE_SIZE = 20;

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ReviewsTab({ sessionId, onCountChange }: Props) {
  const [reviews, setReviews] = useState<ReviewResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Ref-guarded count emission: only call onCountChange when count actually changes
  const lastEmittedCount = useRef<number>(-1);
  const emitCount = useCallback(
    (n: number) => {
      if (lastEmittedCount.current === n) return;
      lastEmittedCount.current = n;
      onCountChange?.(n);
    },
    [onCountChange]
  );

  // Initial load
  useEffect(() => {
    setLoading(true);
    setReviews([]);
    setHasMore(false);
    setTotal(0);
    lastEmittedCount.current = -1;
    api.review
      .getHistory(sessionId, { offset: 0, limit: PAGE_SIZE })
      .then(({ reviews: data, total: t, hasMore: hm }) => {
        setReviews(data);
        setTotal(t);
        setHasMore(hm);
        emitCount(t);
      })
      .catch(() => {
        setReviews([]);
        setTotal(0);
        setHasMore(false);
        emitCount(0);
      })
      .finally(() => setLoading(false));
  }, [sessionId, emitCount]);

  // Load more page
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { reviews: more, hasMore: hm } = await api.review.getHistory(sessionId, {
        offset: reviews.length,
        limit: PAGE_SIZE,
      });
      setReviews((prev) => {
        // Dedupe by id (defense in depth)
        const existingIds = new Set(prev.map((r) => r.id));
        const unique = more.filter((r) => !existingIds.has(r.id));
        return [...prev, ...unique];
      });
      setHasMore(hm);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, reviews.length, sessionId]);

  // IntersectionObserver for infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "100px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Track the actual count in a ref so WS handler emits the right value
  // without depending on stale state from setTotal/setReviews callbacks.
  const countRef = useRef<number>(0);
  useEffect(() => {
    countRef.current = total;
  }, [total]);

  // WS subscribe: prepend new review and emit count via ref-based counter
  useEffect(() => {
    return eventBus.subscribe((msg) => {
      if (msg.type !== "review_ready") return;
      const d = msg.data as {
        sessionId: string;
        id: number;
        model: string;
        review: string;
        createdAt: string;
      };
      if (d.sessionId !== sessionId) return;
      const newReview: ReviewResult = {
        id: d.id,
        model: d.model,
        review: d.review,
        createdAt: d.createdAt ?? new Date().toISOString(),
      };
      setReviews((prev) => {
        if (prev.some((r) => r.id === newReview.id)) return prev;
        return [newReview, ...prev];
      });
      setTotal((t) => t + 1);
      // emitCount will be called via the total useEffect when total updates,
      // but to ensure the parent sees the count immediately we emit here too
      // with the ref-based counter (avoiding the duplicate-emit problem).
      countRef.current += 1;
      emitCount(countRef.current);
    });
  }, [sessionId, emitCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
        加载审核记录…
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-sm gap-2">
        <History className="w-8 h-8 text-slate-700" />
        <span>暂无审核记录</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-2">
      {reviews.map((r) => (
        <div
          key={r.id}
          className="rounded-lg border border-slate-700 bg-slate-900/60 overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
            className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-mono text-slate-400 shrink-0">
                {formatTime(r.createdAt)}
              </span>
              <span className="text-sm font-medium text-indigo-300 truncate">
                {r.model}
              </span>
            </div>
            <span className="text-slate-600 text-xs ml-2">
              {expandedId === r.id ? "▲" : "▼"}
            </span>
          </button>

          {expandedId === r.id && (
            <div className="px-4 pb-4 border-t border-slate-700/50">
              <div className="pt-3 text-sm text-slate-300">
                <MarkdownContent text={r.review} dense />
              </div>
            </div>
          )}
        </div>
      ))}

      <div ref={sentinelRef} className="h-1" />

      {loadingMore && (
        <div className="text-center text-xs text-slate-500 py-2">加载中…</div>
      )}
      {!hasMore && reviews.length > 0 && (
        <div className="text-center text-xs text-slate-600 py-2">已加载全部 {total} 条</div>
      )}
    </div>
  );
}
```

> **Implementation note:** The WS handler uses a `countRef` to track the running total independently of React state, so the count emitted to the parent is always the current value (not a stale closure). `emitCount`'s `lastEmittedCount` ref still de-dupes, preventing any duplicate calls.

- [ ] **Step 4: Run ReviewsTab tests**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:client -- --reporter=verbose 2>&1 | grep -E "ReviewsTab|✓|✗|FAIL" | head -15
```

Expected: all 7 ReviewsTab tests pass.

- [ ] **Step 5: Run full client suite**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:client 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard
git add client/src/components/ReviewsTab.tsx \
        client/src/components/__tests__/ReviewsTab.test.tsx
git commit -m "$(cat <<'EOF'
feat: add ReviewsTab component with infinite scroll + ref-guarded count

Loads history via api.review.getHistory with offset/limit pagination.
IntersectionObserver on sentinel ref triggers loadMore when in view.
WS review_ready events prepend live results. onCountChange only fires
when count actually changes (lastEmittedCount ref de-dupe).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire Reviews tab into SessionDetail.tsx + update snapshot

**Files:**
- Modify: `dashboard/client/src/pages/SessionDetail.tsx`
- Modify: `dashboard/client/src/pages/__tests__/screens.snapshot.test.tsx` (snapshot regen)
- Modify: `dashboard/client/src/pages/__tests__/SessionDetail.nestedAgents.test.tsx` (add review.getHistory mock)

**Interfaces:**
- Consumes: `ReviewsTab` component from `../components/ReviewsTab` (Task 7)
- Consumes: `History` icon from `lucide-react`
- Consumes: existing `DetailTab` type alias (line ~73)
- Consumes: existing tab nav JSX block (around line 621-667)
- Consumes: existing test mocks for `api` in SessionDetail test files
- Produces: `DetailTab` type extended with `"reviews"`
- Produces: Tab nav button for "Reviews" with `reviewCount` badge
- Produces: Tab content panel rendering `<ReviewsTab sessionId onCountChange={setReviewCount} />`

- [ ] **Step 1: Add "reviews" to DetailTab and import ReviewsTab in SessionDetail.tsx**

In `dashboard/client/src/pages/SessionDetail.tsx`:

**a)** Find the type alias (line ~73):
```ts
type DetailTab = "agents" | "conversation" | "timeline";
```
Change to:
```ts
type DetailTab = "agents" | "conversation" | "timeline" | "reviews";
```

**b)** Add import near the top with other component imports:
```ts
import { ReviewsTab } from "../components/ReviewsTab";
```

**c)** Add `History` to the existing lucide-react import line.

**d)** Add `reviewCount` state after the existing tab state (around line 102):
```ts
const [reviewCount, setReviewCount] = useState(0);
```

- [ ] **Step 2: Add the Reviews tab button to the tab nav**

Find the tab nav area (around line 621). After the Timeline tab button (which ends around line 664), add:

```tsx
<button
  onClick={() => {
    setActiveTab("reviews");
    setTranscriptNotFound(false);
  }}
  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
    activeTab === "reviews"
      ? "border-violet-500 text-violet-400"
      : "border-transparent text-gray-500 hover:text-gray-300"
  }`}
>
  <History className="w-4 h-4" />
  Reviews
  {reviewCount > 0 && (
    <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-indigo-900/60 text-indigo-300 font-mono">
      {reviewCount}
    </span>
  )}
</button>
```

- [ ] **Step 3: Add the Reviews tab content panel**

Find the tab content section (around line 667). After the `visitedTabs.has("timeline")` block, add:

```tsx
{visitedTabs.has("reviews") && (
  <div hidden={activeTab !== "reviews"}>
    <ReviewsTab
      sessionId={id ?? ""}
      onCountChange={setReviewCount}
    />
  </div>
)}
```

- [ ] **Step 4: Add `review` mock to SessionDetail test mocks**

In `dashboard/client/src/pages/__tests__/SessionDetail.nestedAgents.test.tsx` (and any other SessionDetail test files), the `api` mock must include `review.getHistory`. Find the existing `review` mock block and add:

```ts
review: {
  trigger: vi.fn(() => Promise.reject(new Error("no review"))),
  getConfig: vi.fn(() => Promise.resolve({ reviewMode: "off", reviewModel: { provider: "gemini", apiKey: "", model: "gemini-1.5-flash", baseUrl: null } })),
  patchConfig: vi.fn(),
  getLatest: vi.fn(() => Promise.reject(new Error("no review"))),
  getHistory: vi.fn(() => Promise.resolve({ reviews: [], total: 0, hasMore: false })),
},
```

Check for other test files that mock `api`:
```bash
grep -rn "review:" dashboard/client/src --include="*.test.*" | grep -v getHistory
```
Add `getHistory: vi.fn(() => Promise.resolve({ reviews: [], total: 0, hasMore: false }))` to every mock that has a `review:` block.

- [ ] **Step 5: Run client tests (expect snapshot failure)**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:client 2>&1 | tail -15
```

Expected: all tests pass **except** `screens.snapshot.test.tsx` which will fail with a snapshot mismatch due to the new Reviews tab.

- [ ] **Step 6: Regenerate snapshots**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard/client && npx vitest run -u 2>&1 | tail -10
```

Expected: snapshot updated, all tests pass.

- [ ] **Step 7: Run full client suite to confirm green**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:client 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 8: Final server suite check**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:server 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard
git add client/src/pages/SessionDetail.tsx \
        client/src/pages/__tests__/screens.snapshot.test.tsx \
        client/src/pages/__tests__/SessionDetail.nestedAgents.test.tsx
git commit -m "$(cat <<'EOF'
feat: add Reviews tab to SessionDetail

Reviews tab shows paginated history of multi-model code reviews with
infinite scroll. Badge shows total count when > 0. Live updates via
review_ready WS.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ OpenSpec integration: `detectPlanLocation` auto-detects `openspec/`, generates `.openspec.yaml` + `proposal.md` + `tasks.md` (shallow format)
- ✅ Standalone fallback: uses `CODECORTEX_PLANS_DIR` or `~/.codecortex/plans`
- ✅ Backward compatibility: legacy DB rows with `change_dir = NULL` fall back to `plans_dir/session_id` path; v1 tasks.md header `# Plan:` is preserved
- ✅ File watcher: `plan-watcher.js` fires `plan_updated` WS on external file changes; 200ms debounce; idempotent
- ✅ Watcher cleanup: `unwatch` on Stop hook, `unwatchAll` on SIGTERM/SIGINT
- ✅ Review history API: `GET /api/review/:sessionId/history?offset=&limit=` returns paginated rows with `total` + `hasMore`
- ✅ Reviews tab: new tab in SessionDetail with expand/collapse rows, live WS prepend, infinite scroll, ref-guarded count
- ✅ Slug collision resistance: 4-char hash suffix on sessionId

**Placeholder scan:** None found.

**Internal consistency:**
- DB stmts: `listReviews` takes 3 args (sessionId, limit, offset); route handler passes these in same order ✅
- `getTasksFilePath` comment explains implicit coupling with `plans_dir` ✅
- `unwatchAll` exported, used in `index.js` and tests ✅
- `parseTasksFromFileContent` is format-agnostic (handles both v1 and v2 headers) ✅

**Type consistency:**
- `ReviewResult` used in `ReviewsTab` matches `types.ts` interface (`id`, `model`, `review`, `createdAt`) ✅
- `ReviewHistoryResponse` matches server response shape (`reviews`, `total`, `hasMore`) ✅
- `emitCount` ref-guarded to prevent duplicate `onCountChange` calls ✅

**Scope check:** Single implementation plan covering 3 spec goals. 8 tasks, each ≤ 9 steps. Each commit is green. ✅

**Ambiguity check:**
- "shallow files" OpenSpec integration is explicitly scoped in spec — no ambiguity ✅
- "infinite scroll" is implemented via IntersectionObserver with explicit `loadingMore` gate ✅
- pagination params explicitly clamped to [1, 50] with default 20 ✅
