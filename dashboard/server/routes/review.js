/**
 * Review routes: config management and per-session review trigger/retrieval.
 */

const { Router } = require("express");
const { stmts } = require("../db");
const { readConfig, writeConfig, performReview } = require("../lib/review");

const router = Router();

const VALID_MODES = ["off", "ask", "auto"];
const VALID_PROVIDERS = ["openai", "gemini", "kimi", "minimax", "custom"];

// GET /api/review/config
router.get("/config", (_req, res) => {
  res.json(readConfig());
});

// PATCH /api/review/config
router.patch("/config", (req, res) => {
  const { reviewMode, reviewModel } = req.body || {};

  if (reviewMode !== undefined && !VALID_MODES.includes(reviewMode)) {
    return res.status(400).json({ error: `reviewMode must be one of: ${VALID_MODES.join(", ")}` });
  }
  if (reviewModel?.provider && !VALID_PROVIDERS.includes(reviewModel.provider)) {
    return res.status(400).json({ error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` });
  }

  const updated = writeConfig({ reviewMode, reviewModel });
  return res.json(updated);
});

// POST /api/review/:sessionId — trigger a review
router.post("/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  const session = stmts.getSession ? stmts.getSession.get(sessionId) : null;
  if (!session) {
    return res.status(404).json({ error: "session not found" });
  }

  try {
    const result = await performReview(sessionId);
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    console.error("[review] performReview failed:", err);
    return res.status(500).json({ error: err.message || "review failed" });
  }
});

// GET /api/review/:sessionId — latest review result
router.get("/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const row = stmts.latestReview.get(sessionId);
  if (!row) return res.status(404).json({ error: "no review for this session" });
  return res.json({ id: row.id, model: row.model, review: row.review, createdAt: row.created_at });
});

module.exports = router;
