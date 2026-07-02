/**
 * @file files.js
 * @description HTTP routes for workspace file exploration used by the IDE-style
 * /chat page. Provides a recursive file tree and file content retrieval, with
 * strict path containment so requests cannot escape the requested cwd.
 */

const { Router } = require("express");
const fs = require("node:fs");
const path = require("node:path");

const router = Router();

function isExistingDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function sanitiseCwd(input) {
  if (input == null || input === "") {
    const e = new Error("cwd is required");
    e.code = "EBADCWD";
    throw e;
  }
  if (typeof input !== "string") {
    const e = new Error("cwd must be a string");
    e.code = "EBADCWD";
    throw e;
  }
  if (!path.isAbsolute(input)) {
    const e = new Error("cwd must be an absolute path");
    e.code = "EBADCWD";
    throw e;
  }
  const resolved = path.resolve(input);
  if (!isExistingDir(resolved)) {
    const e = new Error(`cwd does not exist: ${resolved}`);
    e.code = "EBADCWD";
    throw e;
  }
  return resolved;
}

/**
 * Ensure target is contained within base directory. Returns the resolved
 * absolute path on success, throws on traversal.
 */
function containedPath(base, target) {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedBase, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    const e = new Error("path is outside the workspace");
    e.code = "EPATHTRAVERSAL";
    throw e;
  }
  return resolvedTarget;
}

function buildTree(root, currentDepth, maxDepth) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const children = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    const child = {
      name: entry.name,
      path: fullPath,
      type: entry.isDirectory() ? "directory" : "file",
    };
    if (entry.isDirectory() && currentDepth < maxDepth) {
      try {
        child.children = buildTree(fullPath, currentDepth + 1, maxDepth);
      } catch {
        child.children = [];
        child.error = "cannot read directory";
      }
    }
    children.push(child);
  }
  return children.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === "directory" ? -1 : 1;
  });
}

router.get("/tree", (req, res) => {
  try {
    const cwd = sanitiseCwd(req.query.cwd);
    const depth = Math.min(parseInt(req.query.depth, 10) || 3, 5);
    const tree = buildTree(cwd, 1, depth);
    res.json({ cwd, depth, tree });
  } catch (err) {
    res.status(400).json({ error: { code: err.code || "EFILES", message: err.message } });
  }
});

router.get("/content", (req, res) => {
  try {
    const cwd = sanitiseCwd(req.query.cwd);
    if (!req.query.path || typeof req.query.path !== "string") {
      return res.status(400).json({ error: { code: "EBADPATH", message: "path is required" } });
    }
    const target = containedPath(cwd, req.query.path);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      return res.status(404).json({ error: { code: "ENOTFOUND", message: "file not found" } });
    }
    const content = fs.readFileSync(target, "utf8");
    res.json({ path: target, content });
  } catch (err) {
    res.status(400).json({ error: { code: err.code || "EFILES", message: err.message } });
  }
});

module.exports = router;
