import { useEffect, useState } from "react";
import { ShieldCheck, Eye, EyeOff, Settings2 } from "lucide-react";
import { api } from "../lib/api";
import type { ReviewConfig, ReviewMode, ReviewProvider } from "../lib/types";

const MODE_LABELS: Record<ReviewMode, string> = {
  off: "Off — manual trigger only",
  ask: "Ask — prompt after each session turn",
  auto: "Auto — review automatically",
};

const PROVIDERS: { value: ReviewProvider; label: string; defaultModel: string }[] = [
  { value: "gemini", label: "Google Gemini", defaultModel: "gemini-1.5-flash" },
  { value: "openai", label: "OpenAI / GPT", defaultModel: "gpt-4o-mini" },
  { value: "kimi", label: "Kimi (Moonshot)", defaultModel: "moonshot-v1-8k" },
  { value: "minimax", label: "MiniMax", defaultModel: "abab6.5s-chat" },
  { value: "custom", label: "Custom (OpenAI-compatible)", defaultModel: "" },
];

const DEFAULT_CONFIG: ReviewConfig = {
  reviewMode: "off",
  reviewModel: { provider: "gemini", apiKey: "", model: "gemini-1.5-flash", baseUrl: null },
};

export function ReviewSettings() {
  const [config, setConfig] = useState<ReviewConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    api.review.getConfig().then(setConfig).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.review.patchConfig(config);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function setMode(mode: ReviewMode) {
    setConfig((c) => ({ ...c, reviewMode: mode }));
  }

  function setProvider(provider: ReviewProvider) {
    const p = PROVIDERS.find((p) => p.value === provider);
    setConfig((c) => ({
      ...c,
      reviewModel: {
        ...c.reviewModel,
        provider,
        model: p?.defaultModel ?? c.reviewModel.model,
        baseUrl: null,
      },
    }));
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6">
      <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2 mb-4">
        <ShieldCheck className="w-4 h-4 text-indigo-400" />
        Multi-Model Code Review
      </h3>

      {/* Review mode */}
      <div className="mb-5">
        <p className="text-xs text-gray-400 mb-2">Review mode</p>
        <div className="flex flex-col gap-1.5">
          {(["off", "ask", "auto"] as ReviewMode[]).map((mode) => (
            <label key={mode} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="reviewMode"
                value={mode}
                checked={config.reviewMode === mode}
                onChange={() => setMode(mode)}
                className="accent-indigo-500"
              />
              <span className="text-sm text-slate-300">{MODE_LABELS[mode]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Provider */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-1.5">Review model provider</p>
        <select
          value={config.reviewModel.provider}
          onChange={(e) => setProvider(e.target.value as ReviewProvider)}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Model name */}
      <div className="mb-4">
        <p className="text-xs text-gray-400 mb-1.5">Model</p>
        <input
          type="text"
          value={config.reviewModel.model}
          onChange={(e) => setConfig((c) => ({ ...c, reviewModel: { ...c.reviewModel, model: e.target.value } }))}
          placeholder="e.g. gemini-1.5-flash"
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Custom base URL (only for custom provider) */}
      {config.reviewModel.provider === "custom" && (
        <div className="mb-4">
          <p className="text-xs text-gray-400 mb-1.5">Base URL</p>
          <input
            type="text"
            value={config.reviewModel.baseUrl ?? ""}
            onChange={(e) => setConfig((c) => ({ ...c, reviewModel: { ...c.reviewModel, baseUrl: e.target.value || null } }))}
            placeholder="https://your-api.com/v1"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* API Key */}
      <div className="mb-5">
        <p className="text-xs text-gray-400 mb-1.5">API Key</p>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={config.reviewModel.apiKey}
            onChange={(e) => setConfig((c) => ({ ...c, reviewModel: { ...c.reviewModel, apiKey: e.target.value } }))}
            placeholder="Paste your API key here"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 pr-9 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </div>
  );
}
