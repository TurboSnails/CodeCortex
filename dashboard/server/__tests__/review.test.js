/**
 * Tests for the multi-model review system:
 * - isQuestion heuristic
 * - config read/write
 * - POST /api/review/:sessionId (trigger review)
 * - GET  /api/review/:sessionId (latest result)
 * - GET/PATCH /api/review/config
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");

// Isolated test DB & config
const TEST_DB = path.join(
  os.tmpdir(),
  `review-test-${Date.now()}-${process.pid}.db`,
);
const TEST_CONFIG_DIR = path.join(
  os.tmpdir(),
  `codecortex-review-test-${Date.now()}`,
);
process.env.DASHBOARD_DB_PATH = TEST_DB;
process.env.CODECORTEX_CONFIG_DIR = TEST_CONFIG_DIR;

const { createApp } = require("../index");
const { db } = require("../db");
const { isQuestion } = require("../lib/review");

let server;
let BASE;

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      method,
      hostname: "127.0.0.1",
      port: new URL(BASE).port,
      path: urlPath,
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
     VALUES (?, ?, 'active', ?, datetime('now'), datetime('now'))`,
  ).run(id, `test-${id}`, cwd);
}

before(async () => {
  fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  const app = createApp();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  try {
    fs.unlinkSync(TEST_DB);
  } catch {}
  try {
    fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
  } catch {}
});

// ── isQuestion heuristic ──────────────────────────────────────────────────────

describe("isQuestion heuristic", () => {
  it("returns false for empty / null message", () => {
    assert.equal(isQuestion(null), false);
    assert.equal(isQuestion(""), false);
    assert.equal(isQuestion(undefined), false);
  });

  it("returns true when message ends with a question mark", () => {
    assert.equal(isQuestion("Should I proceed?"), true);
    assert.equal(isQuestion("你是否需要我继续？"), true);
  });

  it("returns true for common question patterns", () => {
    assert.equal(
      isQuestion("Do you want me to also refactor the tests?"),
      true,
    );
    assert.equal(isQuestion("Shall I continue with step 2?"), true);
    assert.equal(isQuestion("Would you like me to add error handling?"), true);
    assert.equal(isQuestion("请问需要我继续吗"), true);
  });

  it("returns false for completion-style messages", () => {
    assert.equal(isQuestion("The refactoring is complete."), false);
    assert.equal(isQuestion("All tests pass. Output: `hello`"), false);
    assert.equal(isQuestion("Done."), false);
    assert.equal(
      isQuestion("I've updated the auth module as requested."),
      false,
    );
  });
});

// ── Review config routes ──────────────────────────────────────────────────────

describe("GET /api/review/config", () => {
  it("returns default config (mode=off) when no config file exists", async () => {
    const res = await req("GET", "/api/review/config", null);
    assert.equal(res.status, 200);
    assert.equal(res.body.reviewMode, "off");
    assert.equal(typeof res.body.reviewModel, "object");
  });
});

describe("PATCH /api/review/config", () => {
  it("persists reviewMode change", async () => {
    await req("PATCH", "/api/review/config", { reviewMode: "ask" });
    const res = await req("GET", "/api/review/config", null);
    assert.equal(res.body.reviewMode, "ask");
  });

  it("rejects invalid reviewMode values", async () => {
    const res = await req("PATCH", "/api/review/config", {
      reviewMode: "invalid",
    });
    assert.equal(res.status, 400);
  });

  it("persists reviewModel provider change", async () => {
    await req("PATCH", "/api/review/config", {
      reviewModel: {
        provider: "kimi",
        apiKey: "test-key",
        model: "moonshot-v1-8k",
      },
    });
    const res = await req("GET", "/api/review/config", null);
    assert.equal(res.body.reviewModel.provider, "kimi");
    assert.equal(res.body.reviewModel.model, "moonshot-v1-8k");
  });
});

// ── Review trigger + result routes ───────────────────────────────────────────

describe("POST /api/review/:sessionId", () => {
  it("returns 404 when session not found", async () => {
    const res = await req("POST", "/api/review/nonexistent", null);
    assert.equal(res.status, 404);
  });

  it("returns 200 with a stub result when diff is empty (no git repo)", async () => {
    insertSession("review-test-s1", os.tmpdir());
    const res = await req("POST", "/api/review/review-test-s1", null);
    // No git repo in tmpdir — review returns a "no diff" message, not an error
    assert.ok(res.status === 200 || res.status === 204);
  });
});

describe("GET /api/review/:sessionId", () => {
  it("returns 404 when no review exists", async () => {
    insertSession("no-review-session");
    const res = await req("GET", "/api/review/no-review-session", null);
    assert.equal(res.status, 404);
  });
});

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
    db.prepare(
      "INSERT INTO session_reviews (session_id, model, diff, review) VALUES (?, ?, ?, ?)",
    ).run(
      "review-hist-sess-2",
      "gemini/gemini-1.5-flash",
      null,
      "First review",
    );
    db.prepare(
      "INSERT INTO session_reviews (session_id, model, diff, review) VALUES (?, ?, ?, ?)",
    ).run("review-hist-sess-2", "openai/gpt-4o", null, "Second review");

    const res = await req("GET", "/api/review/review-hist-sess-2/history");
    assert.equal(res.status, 200);
    assert.equal(res.body.reviews.length, 2);
    assert.equal(res.body.total, 2);
    assert.equal(res.body.hasMore, false);
    // Most recent first
    assert.equal(res.body.reviews[0].model, "openai/gpt-4o");
    assert.equal(res.body.reviews[1].model, "gemini/gemini-1.5-flash");
    assert.ok(typeof res.body.reviews[0].id === "number");
    assert.ok(typeof res.body.reviews[0].createdAt === "string");
  });

  it("returns hasMore=false when all reviews fit in one page", async () => {
    insertSession("review-hist-sess-3");
    db.prepare(
      "INSERT INTO session_reviews (session_id, model, diff, review) VALUES (?, ?, ?, ?)",
    ).run("review-hist-sess-3", "gemini/gemini-1.5-flash", null, "Only review");

    const res = await req("GET", "/api/review/review-hist-sess-3/history");
    assert.equal(res.status, 200);
    assert.equal(res.body.hasMore, false);
  });

  it("returns hasMore=true when more reviews exist beyond the page", async () => {
    insertSession("review-hist-sess-4");
    for (let i = 0; i < 3; i++) {
      db.prepare(
        "INSERT INTO session_reviews (session_id, model, diff, review) VALUES (?, ?, ?, ?)",
      ).run(
        "review-hist-sess-4",
        "gemini/gemini-1.5-flash",
        null,
        `Review ${i}`,
      );
    }

    const res = await req(
      "GET",
      "/api/review/review-hist-sess-4/history?limit=2",
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.reviews.length, 2);
    assert.equal(res.body.total, 3);
    assert.equal(res.body.hasMore, true);
  });

  it("honors offset and limit for pagination", async () => {
    insertSession("review-hist-sess-5");
    const models = ["a/1", "b/2", "c/3"];
    for (const model of models) {
      db.prepare(
        "INSERT INTO session_reviews (session_id, model, diff, review) VALUES (?, ?, ?, ?)",
      ).run("review-hist-sess-5", model, null, `Review ${model}`);
    }

    const res = await req(
      "GET",
      "/api/review/review-hist-sess-5/history?limit=1&offset=1",
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.reviews.length, 1);
    assert.equal(res.body.reviews[0].model, "b/2");
    assert.equal(res.body.total, 3);
    assert.equal(res.body.hasMore, true);
  });

  it("returns 400 for invalid limit or offset", async () => {
    insertSession("review-hist-sess-6");
    const resLimit = await req(
      "GET",
      "/api/review/review-hist-sess-6/history?limit=abc",
    );
    assert.equal(resLimit.status, 400);
    const resOffset = await req(
      "GET",
      "/api/review/review-hist-sess-6/history?offset=-1",
    );
    assert.equal(resOffset.status, 400);
  });
});
