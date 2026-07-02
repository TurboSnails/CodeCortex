/**
 * @file run-permission.test.js
 * @description Dedicated route-level tests for the permission response
 * endpoint. Verifies validation, error handling, and Y/n injection through
 * the real HTTP surface without invoking the real `claude` binary.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const { PassThrough } = require("node:stream");
const { EventEmitter } = require("node:events");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "run-perm-test-"));
process.env.DASHBOARD_DB_PATH = path.join(TMP, "dashboard.db");

const { createApp } = require("../index");
const runs = require("../lib/run-spawner");

let server;
let BASE;

function fetchJson(p, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(p, BASE);
    const headers = { ...(opts.headers || {}) };
    let body;
    if (opts.body !== undefined) {
      body = Buffer.from(JSON.stringify(opts.body));
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = body.length;
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
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function makeFakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.killed = false;
  child.kill = function (sig) {
    this.killed = true;
    setImmediate(() => this.emit("exit", sig === "SIGTERM" ? 143 : 0, sig || null));
  };
  return child;
}

describe("POST /api/run/:id/permission", () => {
  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    BASE = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    try {
      fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      /* best-effort temp cleanup */
    }
  });

  beforeEach(() => {
    runs.__reset();
  });

  it("returns 400 when requestId is missing", async () => {
    const { status, body } = await fetchJson("/api/run/does-not-exist/permission", {
      method: "POST",
      body: { approved: true },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "EBADREQUEST");
  });

  it("returns 404 for a non-existent run", async () => {
    const { status, body } = await fetchJson("/api/run/does-not-exist/permission", {
      method: "POST",
      body: { requestId: "req-1", approved: true },
    });
    assert.equal(status, 404);
    assert.equal(body.error.code, "ENOTFOUND");
  });

  it("returns 400 when there is no active permission request", async () => {
    const fake = makeFakeChild();
    const handle = runs.__injectChildForTest({ child: fake, mode: "conversation" });
    fake.stdout.write(`{"type":"system","subtype":"init","session_id":"s1"}\n`);
    await new Promise((r) => setImmediate(r));
    const { status, body } = await fetchJson(`/api/run/${handle.id}/permission`, {
      method: "POST",
      body: { requestId: "req-1", approved: true },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, "ENOPROMPT");
  });

  it("injects Y\\n when approved and clears the pending request", async () => {
    const fake = makeFakeChild();
    const handle = runs.__injectChildForTest({ child: fake, mode: "conversation" });
    fake.stdout.write(`{"type":"system","subtype":"init","session_id":"s1"}\n`);
    fake.stdout.write("Allow? (Y/n) ");
    await new Promise((r) => setImmediate(r));
    const requestId = runs
      .getRun(handle.id, { includeEnvelopes: true })
      .envelopes.find((e) => e.type === "permission_request").id;

    const chunks = [];
    fake.stdin.on("data", (c) => chunks.push(c.toString()));

    const { status, body } = await fetchJson(`/api/run/${handle.id}/permission`, {
      method: "POST",
      body: { requestId, approved: true },
    });
    await new Promise((r) => setImmediate(r));

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(chunks.join(""), "Y\n");
    assert.equal(runs.getRun(handle.id).pendingPermissionRequest, undefined);
  });

  it("injects n\\n when rejected", async () => {
    const fake = makeFakeChild();
    const handle = runs.__injectChildForTest({ child: fake, mode: "conversation" });
    fake.stdout.write(`{"type":"system","subtype":"init","session_id":"s1"}\n`);
    fake.stdout.write("Allow? (Y/n) ");
    await new Promise((r) => setImmediate(r));
    const requestId = runs
      .getRun(handle.id, { includeEnvelopes: true })
      .envelopes.find((e) => e.type === "permission_request").id;

    const chunks = [];
    fake.stdin.on("data", (c) => chunks.push(c.toString()));

    await fetchJson(`/api/run/${handle.id}/permission`, {
      method: "POST",
      body: { requestId, approved: false },
    });
    await new Promise((r) => setImmediate(r));

    assert.equal(chunks.join(""), "n\n");
  });
});
