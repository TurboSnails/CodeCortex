/**
 * E2E smoke test for plan creation → file watcher → reviews pagination.
 * Runs against a real server instance with a temp database.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { WebSocket } = require("ws");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "codecortex-e2e-"));
const TEST_DB = path.join(TMP, "dashboard.db");
const PLANS_DIR = path.join(TMP, "plans");
const CONFIG_DIR = path.join(TMP, "config");

process.env.DASHBOARD_DB_PATH = TEST_DB;
process.env.CODECORTEX_PLANS_DIR = PLANS_DIR;
process.env.CODECORTEX_CONFIG_DIR = CONFIG_DIR;
process.env.DASHBOARD_TOKEN = "e2e-smoke-token";

const { createApp, startServer } = require("../server/index");
const { db } = require("../server/db");

function req(method, urlPath, body, token = process.env.DASHBOARD_TOKEN) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      method,
      hostname: "127.0.0.1",
      port: new URL(BASE).port,
      path: urlPath,
      headers: {
        "content-type": "application/json",
        ...(token ? { "x-dashboard-token": token } : {}),
      },
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

let server;
let BASE;

async function setup() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const app = createApp();
  server = await startServer(app, 0);
  BASE = `http://127.0.0.1:${server.address().port}`;

  db.prepare(
    `INSERT INTO sessions (id, name, status, cwd, started_at, updated_at)
     VALUES (?, ?, 'active', ?, datetime('now'), datetime('now'))`,
  ).run("e2e-session", "e2e-session", os.tmpdir());
}

async function smokePlan() {
  // Create plan
  const createRes = await req("POST", "/api/plan/e2e-session", {
    description: "1. Set up auth\n2. Write tests\n3. Ship it",
  });
  if (createRes.status !== 201)
    throw new Error(`plan create failed: ${createRes.status}`);
  console.log("✓ plan created:", createRes.body.changeName);

  // Verify GET plan
  const getRes = await req("GET", "/api/plan/e2e-session");
  if (getRes.status !== 200)
    throw new Error(`plan get failed: ${getRes.status}`);
  if (getRes.body.tasks.length !== 3)
    throw new Error(`expected 3 tasks, got ${getRes.body.tasks.length}`);
  console.log("✓ plan read returns 3 tasks");

  // Toggle task via PATCH
  const patchRes = await req("PATCH", "/api/plan/e2e-session/tasks/0", {
    done: true,
  });
  if (patchRes.status !== 200)
    throw new Error(`plan patch failed: ${patchRes.status}`);
  if (!patchRes.body.tasks[0].done) throw new Error("task 0 not toggled");
  console.log("✓ task toggled via PATCH");
}

async function smokeWatcher() {
  const ws = new WebSocket(
    BASE.replace("http", "ws") +
      "/ws?token=" +
      encodeURIComponent(process.env.DASHBOARD_TOKEN),
  );
  const messages = [];
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
  });

  // Wait a tick for the server-side watcher to settle, then edit tasks.md externally.
  await new Promise((r) => setTimeout(r, 100));
  const planFile = path.join(PLANS_DIR, "e2e-session", "tasks.md");
  const content = fs.readFileSync(planFile, "utf8");
  fs.writeFileSync(
    planFile,
    content.replace("- [x] Set up auth", "- [ ] Set up auth"),
    "utf8",
  );

  // Wait for the debounced broadcast.
  await new Promise((r) => setTimeout(r, 500));

  const planUpdated = messages.find(
    (m) => m.type === "plan_updated" && m.data.sessionId === "e2e-session",
  );
  if (!planUpdated) throw new Error("no plan_updated WebSocket event received");
  console.log("✓ external tasks.md edit broadcast plan_updated");

  ws.close();
}

async function smokeReviews() {
  // Insert review rows directly.
  for (let i = 0; i < 5; i++) {
    db.prepare(
      "INSERT INTO session_reviews (session_id, model, diff, review) VALUES (?, ?, ?, ?)",
    ).run("e2e-session", `model-${i}`, null, `Review ${i}`);
  }

  const page1 = await req(
    "GET",
    "/api/review/e2e-session/history?limit=2&offset=0",
  );
  if (page1.status !== 200)
    throw new Error(`review history failed: ${page1.status}`);
  if (page1.body.reviews.length !== 2)
    throw new Error(`expected 2 reviews, got ${page1.body.reviews.length}`);
  if (page1.body.total !== 5)
    throw new Error(`expected total 5, got ${page1.body.total}`);
  if (page1.body.hasMore !== true) throw new Error("expected hasMore=true");
  console.log("✓ review pagination page 1: 2/5 hasMore=true");

  const page2 = await req(
    "GET",
    "/api/review/e2e-session/history?limit=2&offset=2",
  );
  if (page2.body.reviews.length !== 2)
    throw new Error(
      `expected 2 reviews page 2, got ${page2.body.reviews.length}`,
    );
  if (page2.body.hasMore !== true)
    throw new Error("expected hasMore=true page 2");

  const page3 = await req(
    "GET",
    "/api/review/e2e-session/history?limit=2&offset=4",
  );
  if (page3.body.reviews.length !== 1)
    throw new Error(
      `expected 1 review page 3, got ${page3.body.reviews.length}`,
    );
  if (page3.body.hasMore !== false)
    throw new Error("expected hasMore=false page 3");
  console.log("✓ review pagination through 3 pages");
}

async function smokeChat() {
  // We can't spawn the real `claude` binary in CI, but we can verify the
  // route shape by calling POST /api/run with an invalid prompt and checking
  // that the server responds with a structured error rather than a crash.
  const spawnRes = await req("POST", "/api/run", {
    prompt: "",
    mode: "conversation",
    cwd: os.tmpdir(),
  });
  if (spawnRes.status !== 400) {
    throw new Error(`expected 400 for empty prompt, got ${spawnRes.status}`);
  }

  // Verify the permission response route returns 404 for a non-existent run
  const permRes = await req("POST", "/api/run/nonexistent/permission", {
    requestId: "req-1",
    approved: true,
  });
  if (permRes.status !== 404) {
    throw new Error(`expected 404 for missing run, got ${permRes.status}`);
  }
  console.log("✓ chat route shape and permission error handling");
}

async function teardown() {
  server?.close();
  try {
    fs.rmSync(TMP, { recursive: true });
  } catch {}
  try {
    fs.unlinkSync(TEST_DB);
  } catch {}
}

async function main() {
  try {
    await setup();
    await smokePlan();
    await smokeWatcher();
    await smokeReviews();
    await smokeChat();
    console.log("\nE2E smoke test passed.");
  } catch (err) {
    console.error("\nE2E smoke test failed:", err.message);
    process.exitCode = 1;
  } finally {
    await teardown();
  }
}

main();
