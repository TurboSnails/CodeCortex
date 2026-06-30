/**
 * Multi-model code review service.
 *
 * Providers supported (all via HTTP, no extra deps):
 *   openai   — https://api.openai.com/v1          (GPT-4o-mini, gpt-4o, etc.)
 *   gemini   — Google Generative Language API
 *   kimi     — https://api.moonshot.cn/v1          (OpenAI-compatible)
 *   minimax  — https://api.minimax.chat/v1         (OpenAI-compatible)
 *   custom   — any OpenAI-compatible base URL
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { stmts } = require("../db");
const { broadcast } = require("../websocket");

// ── Config ────────────────────────────────────────────────────────────────────

const CONFIG_DIR =
  process.env.CODECORTEX_CONFIG_DIR || path.join(os.homedir(), ".codecortex");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG = {
  reviewMode: "off",  // "off" | "ask" | "auto"
  reviewModel: {
    provider: "gemini",  // "openai" | "gemini" | "kimi" | "minimax" | "custom"
    apiKey: "",
    model: "gemini-1.5-flash",
    baseUrl: null,  // for "custom" provider
  },
};

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    return Object.assign({}, DEFAULT_CONFIG, JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(updates) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const current = readConfig();
  const next = {
    ...current,
    ...updates,
    reviewModel: {
      ...current.reviewModel,
      ...(updates.reviewModel || {}),
    },
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

// ── Heuristic ─────────────────────────────────────────────────────────────────

const QUESTION_PATTERNS = [
  /\?$|？$/,           // ends with question mark (ASCII or full-width)
  /\bdo you want\b/i,
  /\bshould i\b/i,
  /\bwould you\b/i,
  /\bshall i\b/i,
  /\bplease confirm\b/i,
  /\bdo you need\b/i,
  /\bwant me to\b/i,
  /\bneed me to\b/i,
  /需要我/,            // CJK: no \b needed (word boundaries don't apply)
  /请问/,
  /是否.*[?？]/,
  /您是否/,
  /可以吗/,
  /对吗/,
];

function isQuestion(message) {
  if (!message || typeof message !== "string") return false;
  const trimmed = message.trim();
  if (!trimmed) return false;
  return QUESTION_PATTERNS.some((p) => p.test(trimmed));
}

// ── Git diff ──────────────────────────────────────────────────────────────────

function getGitDiff(cwd) {
  try {
    const diff = execSync("git diff HEAD", {
      cwd,
      encoding: "utf8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return diff.trim() || null;
  } catch {
    return null;
  }
}

// ── Model call ────────────────────────────────────────────────────────────────

const PROVIDER_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  kimi: "https://api.moonshot.cn/v1",
  minimax: "https://api.minimax.chat/v1",
};

const REVIEW_SYSTEM_PROMPT = `You are a concise code reviewer. Review the git diff below.
Point out: logic errors, bugs, security issues, missing edge cases, and quick improvements.
Be direct. If the diff looks good, say so briefly. Respond in the same language as the diff's context.`;

async function callOpenAICompatible(config, diff) {
  const baseUrl = config.baseUrl || PROVIDER_BASE_URLS[config.provider] || PROVIDER_BASE_URLS.openai;
  const url = `${baseUrl}/chat/completions`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: REVIEW_SYSTEM_PROMPT },
        { role: "user", content: `Review this diff:\n\n\`\`\`diff\n${diff}\n\`\`\`` },
      ],
      max_tokens: 1024,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`${config.provider} API error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const json = await resp.json();
  return json.choices?.[0]?.message?.content || "(empty response)";
}

async function callGemini(config, diff) {
  const model = config.model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: REVIEW_SYSTEM_PROMPT },
            { text: `Review this diff:\n\n\`\`\`diff\n${diff}\n\`\`\`` },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${err.slice(0, 200)}`);
  }
  const json = await resp.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "(empty response)";
}

async function callModel(modelConfig, diff) {
  if (modelConfig.provider === "gemini") {
    return callGemini(modelConfig, diff);
  }
  return callOpenAICompatible(modelConfig, diff);
}

// ── Core review function ──────────────────────────────────────────────────────

async function performReview(sessionId) {
  const session = stmts.getSession ? stmts.getSession.get(sessionId) : null;
  if (!session) throw Object.assign(new Error("session not found"), { statusCode: 404 });

  const cwd = session.cwd || os.homedir();
  const diff = getGitDiff(cwd);

  const config = readConfig();
  const modelName = `${config.reviewModel.provider}/${config.reviewModel.model}`;

  if (!diff) {
    const reviewText = "No uncommitted changes detected (git diff HEAD returned empty).";
    stmts.insertReview.run(sessionId, modelName, null, reviewText);
    const row = stmts.latestReview.get(sessionId);
    broadcast("review_ready", { sessionId, model: modelName, review: reviewText, id: row?.id });
    return { model: modelName, review: reviewText };
  }

  if (!config.reviewModel.apiKey) {
    const reviewText = "Review API key not configured. Set it in Settings → Review.";
    stmts.insertReview.run(sessionId, modelName, diff, reviewText);
    const row = stmts.latestReview.get(sessionId);
    broadcast("review_ready", { sessionId, model: modelName, review: reviewText, id: row?.id });
    return { model: modelName, review: reviewText };
  }

  const reviewText = await callModel(config.reviewModel, diff);
  stmts.insertReview.run(sessionId, modelName, diff, reviewText);
  const row = stmts.latestReview.get(sessionId);
  broadcast("review_ready", { sessionId, model: modelName, review: reviewText, id: row?.id });
  return { model: modelName, review: reviewText };
}

// ── Stop-hook integration ─────────────────────────────────────────────────────

function triggerIfAppropriate(sessionId, lastAssistantMessage) {
  const config = readConfig();
  if (config.reviewMode === "off") return;
  if (isQuestion(lastAssistantMessage)) return;

  if (config.reviewMode === "auto") {
    performReview(sessionId).catch((err) => {
      console.warn("[review] auto-review failed:", err.message);
    });
  } else if (config.reviewMode === "ask") {
    broadcast("review_prompt", { sessionId });
  }
}

module.exports = { isQuestion, readConfig, writeConfig, performReview, triggerIfAppropriate };
