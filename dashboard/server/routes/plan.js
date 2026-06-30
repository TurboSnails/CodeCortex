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
