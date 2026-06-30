const fs = require("fs");
const { broadcast: defaultBroadcast } = require("../websocket");
const { parseTasksFromFileContent } = require("./openspec-plan");

const watchers = new Map(); // sessionId → { watcher, timer }

function watch(sessionId, tasksPath, broadcastFn = defaultBroadcast) {
  if (watchers.has(sessionId)) return; // prevent duplicate watchers

  let timer = null;

  const watcher = fs.watch(tasksPath, { persistent: false }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      let content;
      try {
        content = fs.readFileSync(tasksPath, "utf8");
      } catch {
        // File vanished (test cleanup, rm, session teardown) — self-clean
        // and drop the event instead of throwing an uncaught exception.
        unwatch(sessionId);
        return;
      }
      const tasks = parseTasksFromFileContent(content);
      broadcastFn("plan_updated", { sessionId, tasks });
    }, 200);
  });

  watcher.on("error", () => unwatch(sessionId));

  watchers.set(sessionId, { watcher });
}

function unwatch(sessionId) {
  const entry = watchers.get(sessionId);
  if (!entry) return;
  try {
    entry.watcher.close();
  } catch {}
  watchers.delete(sessionId);
}

module.exports = { watch, unwatch };