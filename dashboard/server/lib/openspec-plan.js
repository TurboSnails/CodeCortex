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

// Make a short alphanumeric hash (base36) from a string.
// Used to disambiguate slugs when two sessionIds share the first 8 chars.
function shortHash(input) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit, then to base36, take last 4 chars
  return (h >>> 0).toString(36).padStart(4, "0").slice(-4);
}

function makeSlug(sessionId) {
  const today = new Date().toISOString().slice(0, 10);
  const prefix = sessionId.slice(0, 8);
  const hash = shortHash(sessionId);
  return `${today}-codecortex-${prefix}-${hash}`;
}

function parseTasks(description) {
  const lines = description.split("\n").map((l) => l.trim()).filter(Boolean);
  const numbered = lines.filter((l) => /^\d+[.)]\s/.test(l));
  if (numbered.length > 1) {
    return numbered.map((l) => l.replace(/^\d+[.)]\s+/, "").trim());
  }
  if (numbered.length === 1) {
    return [numbered[0].replace(/^\d+[.)]\s+/, "").trim()];
  }
  return [description.trim()];
}

// Read-side parser used by both GET /api/plan and plan-watcher. Independent of
// header format (v1 # Plan: or v2 ## Tasks) — only looks at checkbox lines.
function parseTasksFromFileContent(content) {
  return content
    .split("\n")
    .filter((l) => /^- \[[ x]\]/.test(l))
    .map((l) => ({
      done: l.startsWith("- [x]"),
      text: l.replace(/^- \[[ x]\]\s*/, "").trim(),
    }));
}

function detectPlanLocation(cwd, sessionId) {
  const openspecDir = path.join(cwd, "openspec");
  if (fs.existsSync(openspecDir)) {
    return {
      type: "openspec",
      changeDir: path.join(openspecDir, "changes", makeSlug(sessionId)),
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
  const changeName = path.basename(changeDir);
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

  // Use v1 header format (# Plan: <changeName>) so legacy row fallback path
  // can also parse this file with the same checkbox regex.
  const checkboxes = tasks.map((t) => `- [ ] ${t}`).join("\n");
  fs.writeFileSync(
    path.join(changeDir, "tasks.md"),
    `# Plan: ${changeName}\n\n${checkboxes}\n`,
    "utf8"
  );
}

module.exports = {
  toSlug,
  makeSlug,
  parseTasks,
  parseTasksFromFileContent,
  detectPlanLocation,
  generateOpenSpecChange,
};
