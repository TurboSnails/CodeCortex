/**
 * @file files-git.test.js
 * @description Tests for /api/files and /api/git routes used by the IDE-style
 * /chat page. Covers file tree, content retrieval, path traversal guards, and
 * Git status/diff/stage/unstage/commit/push confirmation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "files-git-test-"));
const WORKSPACE = path.join(TMP, "workspace");
const NESTED = path.join(WORKSPACE, "src", "components");

fs.mkdirSync(NESTED, { recursive: true });
fs.writeFileSync(path.join(WORKSPACE, "README.md"), "# Hello\n");
fs.writeFileSync(path.join(NESTED, "Chat.tsx"), "export function Chat() {}\n");

// Outside-of-workspace file for traversal tests
const OUTSIDE_FILE = path.join(TMP, "secret.txt");
fs.writeFileSync(OUTSIDE_FILE, "secret\n");

process.env.DASHBOARD_DB_PATH = path.join(TMP, "dashboard-test.db");

const { createApp } = require("../index");

let server;
let BASE;

function fetchJson(p, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(p, BASE);
    const headers = { ...(opts.headers || {}) };
    let bodyBuf;
    if (opts.body !== undefined) {
      bodyBuf = Buffer.from(JSON.stringify(opts.body));
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = bodyBuf.length;
    }
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: opts.method || "GET",
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          let json;
          try {
            json = JSON.parse(body);
          } catch {
            json = body;
          }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on("error", reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

describe("/api/files and /api/git", () => {
  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    BASE = `http://127.0.0.1:${server.address().port}`;

    const { spawnSync } = require("node:child_process");
    spawnSync("git", ["init"], { cwd: WORKSPACE });
    spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: WORKSPACE });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: WORKSPACE });
    spawnSync("git", ["add", "."], { cwd: WORKSPACE });
    spawnSync("git", ["commit", "-m", "init"], { cwd: WORKSPACE });
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    try {
      fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* best-effort */
    }
  });

  it("tree returns recursive directory structure", async () => {
    const { status, body } = await fetchJson(
      `/api/files/tree?cwd=${encodeURIComponent(WORKSPACE)}&depth=3`
    );
    assert.equal(status, 200);
    assert.equal(body.cwd, WORKSPACE);
    assert.ok(Array.isArray(body.tree));
    const readme = body.tree.find((n) => n.name === "README.md");
    assert.ok(readme);
    assert.equal(readme.type, "file");
    const src = body.tree.find((n) => n.name === "src");
    assert.ok(src);
    assert.equal(src.type, "directory");
    const components = src.children.find((n) => n.name === "components");
    assert.ok(components);
    const chat = components.children.find((n) => n.name === "Chat.tsx");
    assert.ok(chat);
  });

  it("content returns file contents", async () => {
    const filePath = path.join(NESTED, "Chat.tsx");
    const { status, body } = await fetchJson(
      `/api/files/content?cwd=${encodeURIComponent(WORKSPACE)}&path=${encodeURIComponent(filePath)}`
    );
    assert.equal(status, 200);
    assert.equal(body.path, filePath);
    assert.match(body.content, /export function Chat/);
  });

  it("content rejects traversal outside cwd", async () => {
    const { status, body } = await fetchJson(
      `/api/files/content?cwd=${encodeURIComponent(WORKSPACE)}&path=${encodeURIComponent(OUTSIDE_FILE)}`
    );
    assert.equal(status, 400);
    assert.equal(body.error.code, "EPATHTRAVERSAL");
  });

  it("content rejects relative path traversal", async () => {
    const { status, body } = await fetchJson(
      `/api/files/content?cwd=${encodeURIComponent(WORKSPACE)}&path=${encodeURIComponent("../secret.txt")}`
    );
    assert.equal(status, 400);
    assert.equal(body.error.code, "EPATHTRAVERSAL");
  });

  it("tree rejects missing cwd", async () => {
    const { status } = await fetchJson("/api/files/tree");
    assert.equal(status, 400);
  });

  it("status returns clean working tree", async () => {
    const { status, body } = await fetchJson("/api/git/status", {
      method: "POST",
      body: { cwd: WORKSPACE },
    });
    assert.equal(status, 200);
    assert.equal(body.cwd, WORKSPACE);
    assert.equal(body.staged.length, 0);
    assert.equal(body.unstaged.length, 0);
    assert.equal(body.untracked.length, 0);
  });

  it("stage and diff file changes", async () => {
    fs.writeFileSync(path.join(WORKSPACE, "new.md"), "new content\n");

    const status1 = await fetchJson("/api/git/status", { method: "POST", body: { cwd: WORKSPACE } });
    assert.equal(status1.body.untracked.length, 1);

    const stage = await fetchJson("/api/git/stage", {
      method: "POST",
      body: { cwd: WORKSPACE, file: "new.md" },
    });
    assert.equal(stage.status, 200);

    const status2 = await fetchJson("/api/git/status", { method: "POST", body: { cwd: WORKSPACE } });
    assert.equal(status2.body.staged.length, 1);

    const diff = await fetchJson("/api/git/diff", {
      method: "POST",
      body: { cwd: WORKSPACE, file: "new.md", staged: true },
    });
    assert.equal(diff.status, 200);
    assert.match(diff.body.diff, /new content/);
  });

  it("commit changes with message", async () => {
    const { status, body } = await fetchJson("/api/git/commit", {
      method: "POST",
      body: { cwd: WORKSPACE, message: "Initial commit" },
    });
    assert.equal(status, 200);
    assert.equal(body.message, "Initial commit");

    const status2 = await fetchJson("/api/git/status", { method: "POST", body: { cwd: WORKSPACE } });
    assert.equal(status2.body.staged.length, 0);
  });

  it("push requires confirmation", async () => {
    const { status, body } = await fetchJson("/api/git/push", {
      method: "POST",
      body: { cwd: WORKSPACE },
    });
    assert.equal(status, 403);
    assert.equal(body.error.code, "ECONFIRM");
  });

  it("unstage moves file back to changes", async () => {
    fs.writeFileSync(path.join(WORKSPACE, "new.md"), "updated content\n");
    await fetchJson("/api/git/stage", { method: "POST", body: { cwd: WORKSPACE, file: "new.md" } });
    const status1 = await fetchJson("/api/git/status", { method: "POST", body: { cwd: WORKSPACE } });
    assert.equal(status1.body.staged.length, 1);

    await fetchJson("/api/git/unstage", { method: "POST", body: { cwd: WORKSPACE, file: "new.md" } });
    const status2 = await fetchJson("/api/git/status", { method: "POST", body: { cwd: WORKSPACE } });
    assert.equal(status2.body.staged.length, 0);
    assert.equal(status2.body.unstaged.length, 1);
  });
});
