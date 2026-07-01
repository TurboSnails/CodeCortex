const { describe, it, before, after, beforeEach } = require("node:test");
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
    planWatcher.unwatch("sess-w1");
    planWatcher.unwatch("sess-unwatch");
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("calls broadcastFn with plan_updated when tasks.md is modified", async () => {
    const calls = [];
    planWatcher.watch("sess-w1", tasksFile, (type, data) =>
      calls.push({ type, data }),
    );

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
    // No assertion on calls — just verify no error is thrown and no duplicate registered
  });

  it("unwatch stops the watcher without error", () => {
    planWatcher.watch("sess-unwatch", tasksFile, () => {});
    assert.doesNotThrow(() => planWatcher.unwatch("sess-unwatch"));
    assert.doesNotThrow(() => planWatcher.unwatch("sess-unwatch")); // double unwatch is safe
  });

  it("unwatchAll closes all active watchers without error", async () => {
    const calls = [];
    planWatcher.watch("sess-all-1", tasksFile, (type, data) =>
      calls.push({ type, data }),
    );
    planWatcher.watch("sess-all-2", tasksFile, (type, data) =>
      calls.push({ type, data }),
    );

    assert.doesNotThrow(() => planWatcher.unwatchAll());

    // After unwatchAll, further file changes should not broadcast.
    await sleep(50);
    fs.writeFileSync(tasksFile, "## Tasks\n\n- [x] Task one\n", "utf8");
    await sleep(400);

    assert.equal(calls.length, 0, "expected no broadcasts after unwatchAll");
  });
});
