/**
 * Tests for the planning layer route: POST/GET /api/plan/:sessionId
 * Uses Node's built-in test runner.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");

// Isolated test DB
const TEST_DB = path.join(os.tmpdir(), `plan-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

const PLANS_DIR = path.join(os.tmpdir(), `codecortex-plans-test-${Date.now()}`);
process.env.CODECORTEX_PLANS_DIR = PLANS_DIR;

const { createApp } = require("../index");
const { db, stmts } = require("../db");

let server;
let BASE;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      method,
      hostname: "127.0.0.1",
      port: new URL(BASE).port,
      path,
      headers: { "content-type": "application/json" },
    };
    const r = http.request(options, (res) => {
      let raw = "";
      res.on("data", (d) => (raw += d));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function insertSession(id, cwd = os.tmpdir()) {
  db.prepare(
    `INSERT OR IGNORE INTO sessions (id, name, status, cwd, started_at, updated_at)
     VALUES (?, ?, 'active', ?, datetime('now'), datetime('now'))`
  ).run(id, `test-${id}`, cwd);
}

before(async () => {
  const app = createApp();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.rmSync(PLANS_DIR, { recursive: true }); } catch {}
});

describe("POST /api/plan/:sessionId", () => {
  it("returns 404 when session does not exist", async () => {
    const res = await req("POST", "/api/plan/nonexistent", { description: "do stuff" });
    assert.equal(res.status, 404);
  });

  it("creates a plan and returns tasks when session exists", async () => {
    const sessionId = "plan-test-session-1";
    insertSession(sessionId);

    const res = await req("POST", `/api/plan/${sessionId}`, {
      description: "Set up auth module",
    });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.changeName, "string");
    assert.ok(Array.isArray(res.body.tasks));
    assert.ok(res.body.tasks.length > 0);
    assert.equal(res.body.tasks[0].done, false);
    assert.equal(typeof res.body.tasks[0].text, "string");
    assert.equal(res.body.planType, "standalone"); // no openspec/ in test cwd
    assert.ok(typeof res.body.changeDir === "string");
    assert.ok(res.body.changeDir.includes(sessionId));
  });

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

  it("creates tasks.md file in CODECORTEX_PLANS_DIR", async () => {
    const sessionId = "plan-test-session-2";
    insertSession(sessionId);

    await req("POST", `/api/plan/${sessionId}`, { description: "Add payment flow" });

    const planFile = path.join(PLANS_DIR, sessionId, "tasks.md");
    assert.ok(fs.existsSync(planFile), `tasks.md should exist at ${planFile}`);
    const content = fs.readFileSync(planFile, "utf8");
    assert.ok(content.includes("Add payment flow"));
  });

  it("parses numbered list into separate tasks", async () => {
    const sessionId = "plan-test-session-3";
    insertSession(sessionId);

    const description = "1. Write tests\n2. Implement feature\n3. Review PR";
    const res = await req("POST", `/api/plan/${sessionId}`, { description });

    assert.equal(res.status, 201);
    assert.equal(res.body.tasks.length, 3);
    assert.ok(res.body.tasks[0].text.includes("Write tests"));
    assert.ok(res.body.tasks[1].text.includes("Implement feature"));
  });

  it("returns 409 when a plan already exists for the session", async () => {
    const sessionId = "plan-test-session-dup";
    insertSession(sessionId);

    await req("POST", `/api/plan/${sessionId}`, { description: "first plan" });
    const res = await req("POST", `/api/plan/${sessionId}`, { description: "second plan" });

    assert.equal(res.status, 409);
  });
});

describe("GET /api/plan/:sessionId", () => {
  it("returns 404 when no plan exists", async () => {
    insertSession("no-plan-session");
    const res = await req("GET", "/api/plan/no-plan-session", null);
    assert.equal(res.status, 404);
  });

  it("returns current tasks after plan creation", async () => {
    const sessionId = "plan-get-test-1";
    insertSession(sessionId);
    await req("POST", `/api/plan/${sessionId}`, { description: "Build dashboard" });

    const res = await req("GET", `/api/plan/${sessionId}`, null);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.tasks));
    assert.ok(res.body.tasks.length > 0);
    assert.equal(typeof res.body.changeName, "string");
  });

  it("reflects checkbox state from tasks.md file", async () => {
    const sessionId = "plan-get-test-2";
    insertSession(sessionId);
    await req("POST", `/api/plan/${sessionId}`, { description: "1. task one\n2. task two" });

    // Manually mark first task done in the file
    const planFile = path.join(PLANS_DIR, sessionId, "tasks.md");
    let content = fs.readFileSync(planFile, "utf8");
    content = content.replace("- [ ] task one", "- [x] task one");
    fs.writeFileSync(planFile, content);

    const res = await req("GET", `/api/plan/${sessionId}`, null);
    const doneTask = res.body.tasks.find((t) => t.done);
    assert.ok(doneTask, "Should have at least one completed task");
    assert.ok(doneTask.text.includes("task one"));
  });
});

describe("PATCH /api/plan/:sessionId/tasks/:index", () => {
  it("returns 404 when no plan exists for the session", async () => {
    insertSession("patch-no-plan-session");
    const res = await req("PATCH", "/api/plan/patch-no-plan-session/tasks/0", { done: true });
    assert.equal(res.status, 404);
  });

  it("toggles a task to done and persists it to tasks.md", async () => {
    const sessionId = "patch-test-1";
    insertSession(sessionId);
    await req("POST", `/api/plan/${sessionId}`, { description: "1. task one\n2. task two" });

    const res = await req("PATCH", `/api/plan/${sessionId}/tasks/0`, { done: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.tasks[0].done, true);
    assert.equal(res.body.tasks[1].done, false);

    const planFile = path.join(PLANS_DIR, sessionId, "tasks.md");
    const content = fs.readFileSync(planFile, "utf8");
    assert.ok(content.includes("- [x] task one"));
    assert.ok(content.includes("- [ ] task two"));
  });

  it("toggles a task back to not-done", async () => {
    const sessionId = "patch-test-2";
    insertSession(sessionId);
    await req("POST", `/api/plan/${sessionId}`, { description: "1. task one\n2. task two" });
    await req("PATCH", `/api/plan/${sessionId}/tasks/0`, { done: true });

    const res = await req("PATCH", `/api/plan/${sessionId}/tasks/0`, { done: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.tasks[0].done, false);
  });

  it("returns 404 for an out-of-range task index", async () => {
    const sessionId = "patch-test-3";
    insertSession(sessionId);
    await req("POST", `/api/plan/${sessionId}`, { description: "only one task" });

    const res = await req("PATCH", `/api/plan/${sessionId}/tasks/5`, { done: true });
    assert.equal(res.status, 404);
  });
});
