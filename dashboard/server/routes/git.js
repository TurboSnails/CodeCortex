/**
 * @file git.js
 * @description HTTP routes for Git operations used by the IDE-style /chat page.
 * Wraps the local `git` CLI inside the requested cwd. Push requires explicit
 * confirmation via a `confirmed: true` body field.
 */

const { Router } = require("express");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

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

function runGit(cwd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, env: process.env });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (d) => stdout.push(d));
    child.stderr.on("data", (d) => stderr.push(d));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        const e = new Error(err || `git exited with ${code}`);
        e.code = "EGIT";
        e.gitCode = code;
        e.stdout = out;
        e.stderr = err;
        reject(e);
      } else {
        resolve(out);
      }
    });
    if (opts.input) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

function parsePorcelainStatus(output) {
  const lines = output.split("\n").filter(Boolean);
  const staged = [];
  const unstaged = [];
  const untracked = [];
  for (const line of lines) {
    const index = line[0];
    const worktree = line[1];
    const file = line.slice(3);
    if (index === "?" && worktree === "?") {
      untracked.push(file);
    } else if (index !== " " && index !== "?") {
      staged.push({ status: index, file });
    }
    if (worktree !== " " && worktree !== "?") {
      unstaged.push({ status: worktree, file });
    }
  }
  return { staged, unstaged, untracked };
}

router.post("/status", async (req, res) => {
  try {
    const cwd = sanitiseCwd(req.body?.cwd || req.query?.cwd);
    const output = await runGit(cwd, ["status", "--porcelain", "-b"]);
    const lines = output.split("\n");
    const branchLine = lines.find((l) => l.startsWith("## "));
    const branch = branchLine ? branchLine.slice(3).split("...")[0] : null;
    const body = lines.filter((l) => !l.startsWith("## ")).join("\n");
    const status = parsePorcelainStatus(body);
    res.json({ cwd, branch, ...status });
  } catch (err) {
    res.status(400).json({ error: { code: err.code || "EGIT", message: err.message } });
  }
});

router.post("/diff", async (req, res) => {
  try {
    const cwd = sanitiseCwd(req.body?.cwd);
    const { file, staged } = req.body || {};
    const args = ["diff", "--no-color"];
    if (staged) args.push("--cached");
    if (file) args.push("--", file);
    const output = await runGit(cwd, args);
    res.json({ cwd, file, staged: !!staged, diff: output });
  } catch (err) {
    res.status(400).json({ error: { code: err.code || "EGIT", message: err.message } });
  }
});

router.post("/stage", async (req, res) => {
  try {
    const cwd = sanitiseCwd(req.body?.cwd);
    const { file } = req.body || {};
    if (!file) {
      await runGit(cwd, ["add", "."]);
    } else {
      await runGit(cwd, ["add", "--", file]);
    }
    res.json({ cwd, file: file || "*", staged: true });
  } catch (err) {
    res.status(400).json({ error: { code: err.code || "EGIT", message: err.message } });
  }
});

router.post("/unstage", async (req, res) => {
  try {
    const cwd = sanitiseCwd(req.body?.cwd);
    const { file } = req.body || {};
    if (!file) {
      await runGit(cwd, ["reset", "HEAD"]);
    } else {
      await runGit(cwd, ["reset", "HEAD", "--", file]);
    }
    res.json({ cwd, file: file || "*", unstaged: true });
  } catch (err) {
    res.status(400).json({ error: { code: err.code || "EGIT", message: err.message } });
  }
});

router.post("/commit", async (req, res) => {
  try {
    const cwd = sanitiseCwd(req.body?.cwd);
    const { message } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: { code: "EBADMESSAGE", message: "commit message is required" } });
    }
    const output = await runGit(cwd, ["commit", "-m", message.trim()]);
    res.json({ cwd, message: message.trim(), output });
  } catch (err) {
    res.status(400).json({ error: { code: err.code || "EGIT", message: err.message } });
  }
});

router.post("/push", async (req, res) => {
  try {
    const cwd = sanitiseCwd(req.body?.cwd);
    if (!req.body?.confirmed) {
      return res.status(403).json({ error: { code: "ECONFIRM", message: "push requires confirmed: true" } });
    }
    const output = await runGit(cwd, ["push"]);
    res.json({ cwd, pushed: true, output });
  } catch (err) {
    res.status(400).json({ error: { code: err.code || "EGIT", message: err.message } });
  }
});

module.exports = router;
