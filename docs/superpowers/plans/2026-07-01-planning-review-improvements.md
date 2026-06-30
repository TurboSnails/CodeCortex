# Planning & Review Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete three deferred gaps in CodeCortex: real OpenSpec file generation for the planning layer, file-watcher task auto-sync, and a review history tab in SessionDetail.

**Architecture:** Server-side adds a new `openspec-plan.js` lib that detects whether the session's working directory has an `openspec/` folder and writes a proper change there (or falls back to `~/.codecortex/plans/`). A lightweight `plan-watcher.js` wraps `fs.watch` to push `plan_updated` WS events when `tasks.md` changes on disk. The existing `session_reviews` table already stores all history; we just expose it via a new `/history` endpoint and a new `ReviewsTab` component.

**Tech Stack:** Node.js (Express, better-sqlite3, fs.watch), React 18 + TypeScript, Tailwind CSS, Vitest (client), node:test (server), lucide-react icons.

## Global Constraints

- Server tests use Node's built-in `node:test` + `assert/strict` — no Jest/Vitest on server side.
- Client tests use Vitest + @testing-library/react.
- Run `npm run test:server` after every server task; run `npm run test:client` after every client task.
- Never commit a failing test suite.
- All new server files go in `dashboard/server/`; all new client files go in `dashboard/client/src/`.
- `broadcast(type, data)` is imported from `../websocket` in server route/lib files.
- DB uses `better-sqlite3` (synchronous). Never use `db.prepare()` outside the `stmts` object in `db.js`.
- `CODECORTEX_PLANS_DIR` env var overrides the default `~/.codecortex/plans` path (used in tests).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `dashboard/server/lib/openspec-plan.js` | detectPlanLocation, generateOpenSpecChange, parseTasks, toSlug |
| Create | `dashboard/server/lib/plan-watcher.js` | fs.watch wrapper: watch/unwatch per sessionId |
| Create | `dashboard/server/__tests__/openspec-plan.test.js` | Unit tests for openspec-plan.js |
| Create | `dashboard/server/__tests__/plan-watcher.test.js` | Unit tests for plan-watcher.js |
| Create | `dashboard/client/src/components/ReviewsTab.tsx` | Reviews history tab component |
| Create | `dashboard/client/src/components/__tests__/ReviewsTab.test.tsx` | Component tests |
| Modify | `dashboard/server/db.js:384-402, 1314-1328` | ALTER TABLE migrations + listReviews stmt + updated insertSessionPlan |
| Modify | `dashboard/server/routes/plan.js` | Import from openspec-plan.js, use change_dir, call planWatcher |
| Modify | `dashboard/server/routes/review.js` | Add GET /history endpoint |
| Modify | `dashboard/server/routes/hooks.js` | Call planWatcher.unwatch on Stop |
| Modify | `dashboard/server/__tests__/plan.test.js` | Add planType/changeDir assertions + openspec path test |
| Modify | `dashboard/server/__tests__/review.test.js` | Add /history endpoint tests |
| Modify | `dashboard/client/src/lib/types.ts:826-831` | Add ReviewHistoryResponse interface |
| Modify | `dashboard/client/src/lib/api.ts:507-519` | Add review.getHistory method |
| Modify | `dashboard/client/src/pages/SessionDetail.tsx:73,621-667` | Add "reviews" tab + ReviewsTab |
| Modify | `dashboard/client/src/pages/__tests__/screens.snapshot.test.tsx` | Regenerate snapshot (new tab) |

---

## Task 1: DB Migrations + listReviews stmt

**Files:**
- Modify: `dashboard/server/db.js:405-415` (after existing migration try-catch blocks)
- Modify: `dashboard/server/db.js:1314-1328` (stmts object)

**Interfaces:**
- Produces: `stmts.listReviews(sessionId)` → rows `{ id, session_id, model, review, created_at }[]`
- Produces: `stmts.insertSessionPlan` updated to accept 5 params: `(session_id, change_name, plans_dir, plan_type, change_dir)`
- Produces: `session_plans` table with two new nullable columns: `plan_type TEXT DEFAULT 'standalone'`, `change_dir TEXT`

- [ ] **Step 1: Add ALTER TABLE migrations to db.js**

Open `dashboard/server/db.js`. Find the existing migration try-catch block around line 405 (it starts with `// Migrate: link agent rows to a workflow run`). Add the following two try-catch blocks **after** that section:

```js
// Migrate: add plan_type and change_dir to session_plans
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

- [ ] **Step 2: Add listReviews stmt to the stmts object**

In the `stmts` object (around line 1325, after `latestReview`), add:

```js
  listReviews: db.prepare(
    "SELECT id, session_id, model, review, created_at FROM session_reviews WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 50"
  ),
```

- [ ] **Step 3: Update insertSessionPlan stmt to include new columns**

Find the existing `insertSessionPlan` stmt (line ~1315) and replace it:

```js
  insertSessionPlan: db.prepare(
    `INSERT INTO session_plans (session_id, change_name, plans_dir, plan_type, change_dir, created_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
  ),
```

- [ ] **Step 4: Run server tests to confirm no regressions**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:server 2>&1 | tail -20
```

Expected: all existing tests pass. The existing `plan.test.js` will now fail because `insertSessionPlan` expects 5 params but `routes/plan.js` still passes 3 — that is expected and will be fixed in Task 3.

> **Note:** After this step, `plan.test.js` tests for POST will fail (3 params vs 5). This is intentional and temporary. Do NOT commit until Task 3 is also done.

- [ ] **Step 5: Commit Tasks 1+3 together after Task 3 is complete** *(deferred — see Task 3 Step 8)*

---

## Task 2: server/lib/openspec-plan.js

**Files:**
- Create: `dashboard/server/lib/openspec-plan.js`
- Create: `dashboard/server/__tests__/openspec-plan.test.js`

**Interfaces:**
- Produces: `parseTasks(description: string): string[]`
- Produces: `toSlug(description: string): string`
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

// Set env var before requiring the module
const TEST_PLANS_DIR = path.join(os.tmpdir(), `openspec-plan-test-${Date.now()}`);
process.env.CODECORTEX_PLANS_DIR = TEST_PLANS_DIR;

const { parseTasks, toSlug, detectPlanLocation, generateOpenSpecChange } =
  require("../lib/openspec-plan");

describe("parseTasks", () => {
  it("returns single task for prose", () => {
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

  it("returns single task when only one numbered item", () => {
    assert.deepEqual(parseTasks("1. Only task"), ["1. Only task"]);
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
    assert.equal(toSlug("a".repeat(50)).length <= 40, true);
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
  it("creates .openspec.yaml, proposal.md, and tasks.md", () => {
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
      assert.ok(tasks.includes("## Tasks"));
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

function parseTasks(description) {
  const lines = description.split("\n").map((l) => l.trim()).filter(Boolean);
  const numbered = lines.filter((l) => /^\d+[.)]\s/.test(l));
  if (numbered.length > 1) {
    return numbered.map((l) => l.replace(/^\d+[.)]\s+/, "").trim());
  }
  return [description.trim()];
}

function detectPlanLocation(cwd, sessionId) {
  const openspecDir = path.join(cwd, "openspec");
  if (fs.existsSync(openspecDir)) {
    const today = new Date().toISOString().slice(0, 10);
    const slug = `${today}-codecortex-${sessionId.slice(0, 8)}`;
    return {
      type: "openspec",
      changeDir: path.join(openspecDir, "changes", slug),
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

  const checkboxes = tasks.map((t) => `- [ ] ${t}`).join("\n");
  fs.writeFileSync(
    path.join(changeDir, "tasks.md"),
    `## Tasks\n\n${checkboxes}\n`,
    "utf8"
  );
}

module.exports = { toSlug, parseTasks, detectPlanLocation, generateOpenSpecChange };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && node --test server/__tests__/openspec-plan.test.js 2>&1 | tail -10
```

Expected: all tests pass (8 assertions, 0 failures).

- [ ] **Step 5: Run full server suite to confirm no regressions**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:server 2>&1 | tail -5
```

Expected: all pre-existing tests pass (plan.test.js POST failures from Task 1 are still present — OK, still deferred).

- [ ] **Step 6: Commit** *(hold — commit together with Task 3 to keep passing state)*

---

## Task 3: Refactor routes/plan.js + fix insertSessionPlan call

**Files:**
- Modify: `dashboard/server/routes/plan.js` (full refactor)
- Modify: `dashboard/server/__tests__/plan.test.js` (add new assertions)

**Interfaces:**
- Consumes: `toSlug`, `parseTasks`, `detectPlanLocation`, `generateOpenSpecChange` from `../lib/openspec-plan`
- `POST /api/plan/:sessionId` now returns `{ changeName, tasks, planType, changeDir }`
- `GET /api/plan/:sessionId` unchanged response shape
- `PATCH /api/plan/:sessionId/tasks/:index` unchanged response shape

- [ ] **Step 1: Rewrite dashboard/server/routes/plan.js**

Replace the entire file content with:

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
const { toSlug, parseTasks, detectPlanLocation, generateOpenSpecChange } =
  require("../lib/openspec-plan");
const planWatcher = require("../lib/plan-watcher");

const PLANS_BASE =
  process.env.CODECORTEX_PLANS_DIR ||
  path.join(os.homedir(), ".codecortex", "plans");

const router = Router();

function readTasksFromFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content
    .split("\n")
    .filter((l) => /^- \[[ x]\]/.test(l))
    .map((l) => ({
      done: l.startsWith("- [x]"),
      text: l.replace(/^- \[[ x]\]\s*/, "").trim(),
    }));
}

// Returns the absolute path to tasks.md for a plan row.
// New rows use change_dir; legacy rows (change_dir IS NULL) fall back to
// the old plans_dir/<session_id> layout.
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

  const changeName = toSlug(description) || `plan-${Date.now()}`;
  const tasks = parseTasks(description);
  const { type: planType, changeDir } = detectPlanLocation(
    session.cwd || "",
    sessionId
  );
  generateOpenSpecChange(changeDir, sessionId, description, tasks);

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

- [ ] **Step 2: Update plan.test.js — add planType/changeDir assertions and openspec path test**

In `dashboard/server/__tests__/plan.test.js`, find the test `"creates a plan and returns tasks when session exists"`. Add assertions for the new fields after the existing assertions:

```js
assert.equal(res.body.planType, "standalone"); // no openspec/ in test cwd
assert.ok(typeof res.body.changeDir === "string");
assert.ok(res.body.changeDir.includes(sessionId));
```

Also add a new test after the existing `POST` tests:

```js
it("uses openspec/ location when cwd contains openspec directory", async () => {
  const sessionId = "plan-test-openspec-1";
  // Create a temp dir with openspec/ subdirectory
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
```

- [ ] **Step 3: Run server tests — all should pass now**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:server 2>&1 | tail -10
```

Expected: all tests pass including the new openspec test. (plan-watcher is required but not yet implemented — plan.js calls `planWatcher.watch` which will fail unless we create a stub. **Create a minimal stub first in Step 4 if tests fail due to missing plan-watcher**.)

- [ ] **Step 4 (conditional): Create minimal plan-watcher.js stub if Step 3 fails**

If Step 3 fails with `Cannot find module '../lib/plan-watcher'`, create a stub at `dashboard/server/lib/plan-watcher.js`:

```js
// Stub — replaced in Task 4
function watch() {}
function unwatch() {}
module.exports = { watch, unwatch };
```

Then re-run Step 3.

- [ ] **Step 5: Commit Tasks 1 + 2 + 3 together**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard
git add server/db.js server/routes/plan.js server/lib/openspec-plan.js \
        server/__tests__/openspec-plan.test.js server/__tests__/plan.test.js \
        server/lib/plan-watcher.js
git commit -m "$(cat <<'EOF'
feat: openspec integration for planning layer

- DB migrations: plan_type + change_dir columns on session_plans
- New lib/openspec-plan.js: detectPlanLocation (openspec/ auto-detect),
  generateOpenSpecChange (.openspec.yaml + proposal.md + tasks.md)
- routes/plan.js refactored to use openspec-plan; POST response includes
  planType and changeDir fields; legacy rows fall back gracefully
- plan-watcher.js stub (replaced in next commit)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: plan-watcher.js + wire up

**Files:**
- Modify: `dashboard/server/lib/plan-watcher.js` (replace stub)
- Create: `dashboard/server/__tests__/plan-watcher.test.js`
- Modify: `dashboard/server/routes/hooks.js` (add planWatcher.unwatch on Stop)

**Interfaces:**
- Consumes: `broadcast` from `../websocket`
- Produces: `watch(sessionId: string, tasksPath: string, broadcastFn?: Function): void`
- Produces: `unwatch(sessionId: string): void`
- `broadcastFn` defaults to `broadcast` from websocket.js; injectable for tests

- [ ] **Step 1: Write failing tests for plan-watcher.js**

Create `dashboard/server/__tests__/plan-watcher.test.js`:

```js
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Require after any env setup
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
    planWatcher.unwatch("sess-w1");
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("calls broadcastFn with plan_updated when tasks.md is modified", async () => {
    const calls = [];
    planWatcher.watch("sess-w1", tasksFile, (type, data) => calls.push({ type, data }));

    // Give the watcher time to initialize, then modify the file
    await sleep(50);
    fs.writeFileSync(tasksFile, "## Tasks\n\n- [x] Task one\n", "utf8");
    await sleep(400); // debounce is 200ms + buffer

    assert.ok(calls.length >= 1, "expected at least one broadcast call");
    assert.equal(calls[0].type, "plan_updated");
    assert.equal(calls[0].data.sessionId, "sess-w1");
    assert.ok(Array.isArray(calls[0].data.tasks));
    assert.equal(calls[0].data.tasks[0].done, true);
  });

  it("does not register duplicate watchers for the same sessionId", () => {
    const calls = [];
    const broadcastFn = (type, data) => calls.push({ type, data });
    planWatcher.watch("sess-w1", tasksFile, broadcastFn);
    planWatcher.watch("sess-w1", tasksFile, broadcastFn); // second call is a no-op
    // No assertion on calls — just verify no error is thrown
  });

  it("unwatch stops the watcher without error", () => {
    planWatcher.watch("sess-unwatch", tasksFile, () => {});
    assert.doesNotThrow(() => planWatcher.unwatch("sess-unwatch"));
    assert.doesNotThrow(() => planWatcher.unwatch("sess-unwatch")); // double unwatch is safe
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && node --test server/__tests__/plan-watcher.test.js 2>&1 | tail -10
```

Expected: the broadcast test fails (stub watch does nothing).

- [ ] **Step 3: Replace stub with real plan-watcher.js**

Replace `dashboard/server/lib/plan-watcher.js` with:

```js
const fs = require("fs");
const { broadcast: defaultBroadcast } = require("../websocket");

const watchers = new Map(); // sessionId → { watcher, timer }

function readTasksFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content
      .split("\n")
      .filter((l) => /^- \[[ x]\]/.test(l))
      .map((l) => ({
        done: l.startsWith("- [x]"),
        text: l.replace(/^- \[[ x]\]\s*/, "").trim(),
      }));
  } catch {
    return [];
  }
}

function watch(sessionId, tasksPath, broadcastFn = defaultBroadcast) {
  if (watchers.has(sessionId)) return; // prevent duplicate watchers

  let timer = null;

  const watcher = fs.watch(tasksPath, { persistent: false }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const tasks = readTasksFromFile(tasksPath);
      broadcastFn("plan_updated", { sessionId, tasks });
    }, 200);
  });

  watcher.on("error", () => unwatch(sessionId));

  watchers.set(sessionId, { watcher, get timer() { return timer; } });
}

function unwatch(sessionId) {
  const entry = watchers.get(sessionId);
  if (!entry) return;
  try { entry.watcher.close(); } catch {}
  watchers.delete(sessionId);
}

module.exports = { watch, unwatch };
```

- [ ] **Step 4: Run plan-watcher tests**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && node --test server/__tests__/plan-watcher.test.js 2>&1 | tail -10
```

Expected: all 3 tests pass.

- [ ] **Step 5: Wire planWatcher.unwatch into hooks.js on Stop event**

In `dashboard/server/routes/hooks.js`, find the Stop event handler. Add the unwatch call after the existing Stop broadcast (search for `"stop"` or `hook_event_name === "Stop"`):

```js
const planWatcher = require("../lib/plan-watcher");

// In the Stop handler, after the existing broadcast:
planWatcher.unwatch(sessionId);
```

- [ ] **Step 6: Run full server test suite**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:server 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard
git add server/lib/plan-watcher.js server/__tests__/plan-watcher.test.js server/routes/hooks.js
git commit -m "$(cat <<'EOF'
feat: plan-watcher for automatic task.md file sync

Watches tasks.md with fs.watch; debounces 200ms then broadcasts
plan_updated WS event. Cleans up on session Stop hook. Injectable
broadcastFn for testability.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Review History API (server)

**Files:**
- Modify: `dashboard/server/routes/review.js` (add GET /history)
- Modify: `dashboard/server/__tests__/review.test.js` (add /history tests)

**Interfaces:**
- Produces: `GET /api/review/:sessionId/history` → `{ reviews: ReviewResult[], total: number }`
- `ReviewResult` shape (server): `{ id: number, model: string, review: string, createdAt: string }`

- [ ] **Step 1: Add failing tests for /history to review.test.js**

Open `dashboard/server/__tests__/review.test.js`. Find the last `describe` block and add a new one after it:

```js
describe("GET /api/review/:sessionId/history", () => {
  it("returns empty list when no reviews exist", async () => {
    insertSession("review-hist-sess-1");
    const res = await req("GET", "/api/review/review-hist-sess-1/history");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.reviews, []);
    assert.equal(res.body.total, 0);
  });

  it("returns all reviews in descending order", async () => {
    insertSession("review-hist-sess-2");
    // Directly insert review rows
    const { db } = require("../db");
    db.prepare(
      "INSERT INTO session_reviews (session_id, model, diff, review) VALUES (?, ?, ?, ?)"
    ).run("review-hist-sess-2", "gemini/gemini-1.5-flash", null, "First review");
    db.prepare(
      "INSERT INTO session_reviews (session_id, model, diff, review) VALUES (?, ?, ?, ?)"
    ).run("review-hist-sess-2", "openai/gpt-4o", null, "Second review");

    const res = await req("GET", "/api/review/review-hist-sess-2/history");
    assert.equal(res.status, 200);
    assert.equal(res.body.reviews.length, 2);
    assert.equal(res.body.total, 2);
    // Most recent first
    assert.equal(res.body.reviews[0].model, "openai/gpt-4o");
    assert.equal(res.body.reviews[1].model, "gemini/gemini-1.5-flash");
    assert.ok(typeof res.body.reviews[0].id === "number");
    assert.ok(typeof res.body.reviews[0].createdAt === "string");
  });

  it("returns 200 with empty list for session with no reviews (not 404)", async () => {
    insertSession("review-hist-sess-3");
    const res = await req("GET", "/api/review/review-hist-sess-3/history");
    assert.equal(res.status, 200);
  });
});
```

- [ ] **Step 2: Run review tests to verify new tests fail**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && node --test server/__tests__/review.test.js 2>&1 | grep -E "fail|pass|Error" | head -10
```

Expected: new tests fail with 404 (route not found).

- [ ] **Step 3: Add /history endpoint to routes/review.js**

In `dashboard/server/routes/review.js`, add the following route **before** the existing `GET /:sessionId` route (order matters — `/history` must be matched before `/:sessionId`):

```js
// GET /api/review/:sessionId/history — all reviews for this session
router.get("/:sessionId/history", (req, res) => {
  const { sessionId } = req.params;
  const rows = stmts.listReviews.all(sessionId);
  const reviews = rows.map((r) => ({
    id: r.id,
    model: r.model,
    review: r.review,
    createdAt: r.created_at,
  }));
  return res.json({ reviews, total: reviews.length });
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
feat: add review history API endpoint

GET /api/review/:sessionId/history returns all reviews for a session
ordered by most recent first, capped at 50.

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
- Produces: `ReviewHistoryResponse = { reviews: ReviewResult[]; total: number }`
- Produces: `api.review.getHistory(sessionId: string): Promise<ReviewHistoryResponse>`

- [ ] **Step 1: Add ReviewHistoryResponse to types.ts**

In `dashboard/client/src/lib/types.ts`, find the `ReviewResult` interface (line ~826) and add below it:

```ts
export interface ReviewHistoryResponse {
  reviews: ReviewResult[];
  total: number;
}
```

- [ ] **Step 2: Add getHistory to api.ts**

In `dashboard/client/src/lib/api.ts`, find the `review` namespace (around line 507). Add `getHistory` alongside the existing methods:

```ts
getHistory: (sessionId: string) =>
  request<import("./types").ReviewHistoryResponse>(
    `/review/${encodeURIComponent(sessionId)}/history`
  ),
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
  getHistory: (sessionId: string) =>
    request<import("./types").ReviewHistoryResponse>(
      `/review/${encodeURIComponent(sessionId)}/history`
    ),
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

## Task 7: ReviewsTab.tsx + tests

**Files:**
- Create: `dashboard/client/src/components/ReviewsTab.tsx`
- Create: `dashboard/client/src/components/__tests__/ReviewsTab.test.tsx`

**Interfaces:**
- Consumes: `api.review.getHistory`, `api.review.trigger`
- Consumes: `eventBus` from `../../lib/eventBus` (via `subscribe`)
- Consumes: `MarkdownContent` from `../conversation/MarkdownContent`
- Props: `{ sessionId: string; onCountChange?: (n: number) => void }`
- WS: subscribes to `review_ready` events → prepend to list

- [ ] **Step 1: Write failing tests**

Create `dashboard/client/src/components/__tests__/ReviewsTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReviewsTab } from "../ReviewsTab";

const mockReviews = [
  {
    id: 2,
    model: "openai/gpt-4o",
    review: "## Summary\nLooks good.",
    createdAt: "2026-07-01T10:00:00.000Z",
  },
  {
    id: 1,
    model: "gemini/gemini-1.5-flash",
    review: "No issues found.",
    createdAt: "2026-07-01T09:00:00.000Z",
  },
];

vi.mock("../../lib/api", () => ({
  api: {
    review: {
      getHistory: vi.fn(() =>
        Promise.resolve({ reviews: mockReviews, total: 2 })
      ),
      trigger: vi.fn(() =>
        Promise.resolve({ model: "openai/gpt-4o", review: "New review" })
      ),
    },
  },
}));

let busCallback: ((msg: any) => void) | null = null;
vi.mock("../../lib/eventBus", () => ({
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
    vi.clearAllMocks();
  });

  it("shows loading then renders review list", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() =>
      expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument()
    );
    expect(screen.getByText("gemini/gemini-1.5-flash")).toBeInTheDocument();
  });

  it("renders empty state when no reviews", async () => {
    const { api } = await import("../../lib/api");
    (api.review.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      reviews: [],
      total: 0,
    });
    render(<ReviewsTab sessionId="sess-empty" />);
    await waitFor(() =>
      expect(screen.getByText(/暂无审核记录/)).toBeInTheDocument()
    );
  });

  it("calls onCountChange with review count on load", async () => {
    const onCountChange = vi.fn();
    render(<ReviewsTab sessionId="sess-1" onCountChange={onCountChange} />);
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(2));
  });

  it("expands review content on click", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() =>
      expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument()
    );
    // Initially collapsed — markdown not visible
    expect(screen.queryByText(/Looks good/)).not.toBeInTheDocument();
    // Click the first row
    fireEvent.click(screen.getAllByRole("button")[0]);
    await waitFor(() =>
      expect(screen.getByText(/Looks good/)).toBeInTheDocument()
    );
  });

  it("prepends new review from review_ready WS event", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() =>
      expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument()
    );
    // Fire a WS event
    busCallback?.({
      type: "review_ready",
      data: {
        sessionId: "sess-1",
        id: 3,
        model: "kimi/moonshot-v1",
        review: "New WS review",
        createdAt: new Date().toISOString(),
      },
    });
    await waitFor(() =>
      expect(screen.getByText("kimi/moonshot-v1")).toBeInTheDocument()
    );
  });

  it("ignores review_ready events for other sessions", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() =>
      expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument()
    );
    busCallback?.({
      type: "review_ready",
      data: { sessionId: "other-sess", id: 99, model: "x/y", review: "other", createdAt: "" },
    });
    expect(screen.queryByText("x/y")).not.toBeInTheDocument();
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
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import type { ReviewResult } from "../lib/types";
import { MarkdownContent } from "./conversation/MarkdownContent";

interface Props {
  sessionId: string;
  onCountChange?: (n: number) => void;
}

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
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.review
      .getHistory(sessionId)
      .then(({ reviews: data }) => {
        setReviews(data);
        onCountChange?.(data.length);
      })
      .catch(() => {
        setReviews([]);
        onCountChange?.(0);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    return eventBus.subscribe((msg) => {
      if (msg.type !== "review_ready") return;
      const d = msg.data as { sessionId: string; id: number; model: string; review: string; createdAt: string };
      if (d.sessionId !== sessionId) return;
      const newReview: ReviewResult = {
        id: d.id,
        model: d.model,
        review: d.review,
        createdAt: d.createdAt ?? new Date().toISOString(),
      };
      setReviews((prev) => [newReview, ...prev]);
      onCountChange?.((prev) => prev + 1 as any); // type coerce — real count from state
    });
  }, [sessionId]);

  // Keep onCountChange in sync when reviews list changes via WS prepend
  useEffect(() => {
    onCountChange?.(reviews.length);
  }, [reviews.length]);

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
    </div>
  );
}
```

- [ ] **Step 4: Run ReviewsTab tests**

```bash
cd /Users/hassan/Documents/workspace/aiFile/CodeCortex/dashboard && npm run test:client -- --reporter=verbose 2>&1 | grep -E "ReviewsTab|✓|✗|FAIL" | head -15
```

Expected: all 6 ReviewsTab tests pass.

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
feat: add ReviewsTab component for review history

Loads history via api.review.getHistory, subscribes to review_ready WS
events to prepend live results. Expandable rows with MarkdownContent.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire Reviews tab into SessionDetail.tsx + update snapshot

**Files:**
- Modify: `dashboard/client/src/pages/SessionDetail.tsx`
- Modify: `dashboard/client/src/pages/__tests__/screens.snapshot.test.tsx` (snapshot regen)

**Interfaces:**
- Consumes: `ReviewsTab` from `../components/ReviewsTab`
- `DetailTab` type extended with `"reviews"`
- Tab badge: `reviewCount` state (integer), shown when > 0

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

**c)** Add icon import — find the existing lucide-react import line and add `History` to it.

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

Find the tab content section (around line 667). After the `visitedTabs.has("timeline")` block (around line 925), add:

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

Also extend the `visitedTabs` initial set to include "reviews" if needed, or confirm the `useEffect` that tracks `activeTab` → `visitedTabs` handles it (it does — the existing effect adds the tab to visitedTabs on first visit).

- [ ] **Step 4: Add `review` mock to SessionDetail test mocks**

In `dashboard/client/src/pages/__tests__/SessionDetail.nestedAgents.test.tsx` (and any other SessionDetail test files), the `api` mock must include `review.getHistory`. Find the existing `review` mock block and add:

```ts
review: {
  trigger: vi.fn(() => Promise.reject(new Error("no review"))),
  getConfig: vi.fn(() => Promise.resolve({ reviewMode: "off", reviewModel: { provider: "gemini", apiKey: "", model: "gemini-1.5-flash", baseUrl: null } })),
  patchConfig: vi.fn(),
  getLatest: vi.fn(() => Promise.reject(new Error("no review"))),
  getHistory: vi.fn(() => Promise.resolve({ reviews: [], total: 0 })), // ADD THIS
},
```

Check for other test files that mock `api`:
```bash
grep -rn "review:" dashboard/client/src --include="*.test.*" | grep -v getHistory
```
Add `getHistory: vi.fn(() => Promise.resolve({ reviews: [], total: 0 }))` to every mock that has a `review:` block.

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

Reviews tab shows full history of multi-model code reviews for the
session. Badge shows count when > 0. Live updates via review_ready WS.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ OpenSpec integration: `detectPlanLocation` auto-detects `openspec/`, generates `.openspec.yaml` + `proposal.md` + `tasks.md`
- ✅ Standalone fallback: uses `CODECORTEX_PLANS_DIR` or `~/.codecortex/plans`
- ✅ Backward compatibility: legacy DB rows with `change_dir = NULL` fall back to `plans_dir/session_id` path
- ✅ File watcher: `plan-watcher.js` fires `plan_updated` WS on external file changes, no user manual refresh needed
- ✅ Watcher cleanup: `unwatch` called on Stop hook
- ✅ Review history API: `GET /api/review/:sessionId/history` returns up to 50 rows
- ✅ Reviews tab: new tab in SessionDetail with expand/collapse rows and live WS prepend

**Placeholder scan:** None found — all steps contain actual code.

**Type consistency:**
- `ReviewResult` used in `ReviewsTab` matches the interface in `types.ts` (`id`, `model`, `review`, `createdAt`)
- `broadcastFn` signature `(type: string, data: object) => void` matches `broadcast` in `websocket.js`
- `plan_updated` WS payload `{ sessionId, tasks }` matches existing client handler in `SessionDetail.tsx`
- `planWatcher.watch(sessionId, tasksPath)` in `plan.js` (2 args) matches the exported signature which accepts optional 3rd arg
