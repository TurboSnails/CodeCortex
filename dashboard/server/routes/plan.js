/**
 * Planning layer routes — create and read OpenSpec-style task plans for sessions.
 * Plans are stored as tasks.md files under CODECORTEX_PLANS_DIR (default ~/.codecortex/plans/).
 */

const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { stmts } = require("../db");
const { broadcast } = require("../websocket");

const router = Router();

const PLANS_DIR =
  process.env.CODECORTEX_PLANS_DIR || path.join(os.homedir(), ".codecortex", "plans");

function plansDir() {
  return PLANS_DIR;
}

function tasksFilePath(sessionId) {
  return path.join(plansDir(), sessionId, "tasks.md");
}

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
  // Single prose description → one task
  return [description.trim()];
}

function buildTasksMd(changeName, tasks) {
  const header = `# Plan: ${changeName}\n\n`;
  const body = tasks.map((t) => `- [ ] ${t}`).join("\n");
  return header + body + "\n";
}

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
  const sessionPlanDir = path.join(plansDir(), sessionId);
  fs.mkdirSync(sessionPlanDir, { recursive: true });

  const tasks = parseTasks(description);
  const tasksContent = buildTasksMd(changeName, tasks);
  fs.writeFileSync(path.join(sessionPlanDir, "tasks.md"), tasksContent, "utf8");

  stmts.insertSessionPlan.run(sessionId, changeName, plansDir());

  const taskObjects = tasks.map((t) => ({ done: false, text: t }));

  broadcast("plan_updated", { sessionId, changeName, tasks: taskObjects });

  return res.status(201).json({ changeName, tasks: taskObjects });
});

// GET /api/plan/:sessionId — read current plan tasks
router.get("/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  const plan = stmts.getSessionPlan.get(sessionId);
  if (!plan) {
    return res.status(404).json({ error: "no plan for this session" });
  }

  const filePath = tasksFilePath(sessionId);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "plan file missing" });
  }

  const tasks = readTasksFromFile(filePath);
  return res.status(200).json({ changeName: plan.change_name, tasks });
});

module.exports = router;
