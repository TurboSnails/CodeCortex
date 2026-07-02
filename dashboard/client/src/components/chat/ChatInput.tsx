import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Square, Slash as SlashIcon, AtSign, FileCode } from "lucide-react";
import { api } from "../../lib/api";

export interface ChatSlashCommand {
  name: string;
  description?: string;
  source: "builtin" | "user" | "project" | "plugin";
}

interface AutocompleteState {
  kind: "slash" | "file";
  query: string;
  triggerStart: number;
  cursor: number;
}

function subsequenceMatch(s: string, q: string): boolean {
  let i = 0;
  for (const ch of q) {
    i = s.indexOf(ch, i);
    if (i === -1) return false;
    i++;
  }
  return true;
}

function scoreSlashMatch(name: string, description: string | undefined, q: string): number {
  if (!q) return 1;
  const n = name.toLowerCase();
  if (n === q) return 1000;
  if (n.startsWith(q)) return 800 - Math.min(n.length, 100);
  const parts = n.split(/[-_.\s]/);
  if (parts.some((p) => p.startsWith(q))) {
    return 600 - Math.min(n.length, 100);
  }
  const idx = n.indexOf(q);
  if (idx >= 0) return 400 - Math.min(idx, 100);
  if (subsequenceMatch(n, q)) return 200;
  if (q.length >= 3) {
    const d = (description || "").toLowerCase();
    if (d.includes(q)) return 100;
  }
  return 0;
}

function detectAutocomplete(value: string, cursor: number): AutocompleteState | null {
  let start = cursor;
  while (start > 0) {
    const ch = value[start - 1];
    if (!ch || /\s/.test(ch)) break;
    start--;
  }
  const tok = value.slice(start, cursor);
  if (tok.startsWith("/")) {
    return { kind: "slash", query: tok.slice(1), triggerStart: start, cursor };
  }
  if (tok.startsWith("@")) {
    return { kind: "file", query: tok.slice(1), triggerStart: start, cursor };
  }
  return null;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  isLive,
  placeholder,
  slashCommands = [],
  fileCwd,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  disabled?: boolean;
  isLive?: boolean;
  placeholder?: string;
  slashCommands?: ChatSlashCommand[];
  fileCwd?: string;
}) {
  const { t } = useTranslation(["run", "sessions"]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<AutocompleteState | null>(null);
  const [active, setActive] = useState(0);
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const fileFetchRef = useRef<{ q: string; t: number } | null>(null);

  const slashItems = useMemo(() => {
    if (!state || state.kind !== "slash") return [] as ChatSlashCommand[];
    const q = state.query.toLowerCase();
    const sourceOrder = { project: 0, user: 1, plugin: 2, builtin: 3 } as const;
    if (!q) {
      return [...slashCommands].sort(
        (a, b) => sourceOrder[a.source] - sourceOrder[b.source] || a.name.localeCompare(b.name)
      );
    }
    type Scored = { cmd: ChatSlashCommand; score: number };
    const scored: Scored[] = [];
    for (const cmd of slashCommands) {
      const score = scoreSlashMatch(cmd.name, cmd.description, q);
      if (score > 0) scored.push({ cmd, score });
    }
    return scored
      .sort(
        (a, b) =>
          b.score - a.score ||
          sourceOrder[a.cmd.source] - sourceOrder[b.cmd.source] ||
          a.cmd.name.length - b.cmd.name.length ||
          a.cmd.name.localeCompare(b.cmd.name)
      )
      .map((s) => s.cmd);
  }, [state, slashCommands]);

  useEffect(() => {
    if (!state || state.kind !== "file" || !fileCwd) {
      setFileSuggestions([]);
      return;
    }
    const ts = Date.now();
    fileFetchRef.current = { q: state.query, t: ts };
    const tid = setTimeout(() => {
      if (fileFetchRef.current?.t !== ts) return;
      api.run
        .files(fileCwd, state.query)
        .then((r) => setFileSuggestions(r.items))
        .catch(() => setFileSuggestions([]));
    }, 120);
    return () => clearTimeout(tid);
  }, [state, fileCwd]);

  const items = state?.kind === "file" ? fileSuggestions : slashItems;

  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1));
  }, [items.length, active]);

  const insertChoice = (choice: ChatSlashCommand | string) => {
    if (!state || !taRef.current) return;
    const ta = taRef.current;
    const before = value.slice(0, state.triggerStart);
    const after = value.slice(state.cursor);
    let inserted: string;
    if (state.kind === "slash") {
      inserted = `/${(choice as ChatSlashCommand).name}`;
    } else {
      inserted = `@${choice as string}`;
    }
    const needsSpace = after.length > 0 && !after.startsWith(" ");
    const next = before + inserted + (needsSpace ? " " : "") + after;
    onChange(next);
    setState(null);
    setActive(0);
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length + (needsSpace ? 1 : 0);
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (state && items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(items.length - 1, a + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        return;
      }
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const choice = items[active];
        if (choice) insertChoice(choice);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const choice = items[active];
        if (choice) insertChoice(choice);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setState(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onSend();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const ta = e.target;
    const next = detectAutocomplete(ta.value, ta.selectionStart || 0);
    setState(next);
    if (!next) setActive(0);
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const next = detectAutocomplete(ta.value, ta.selectionStart || 0);
    setState(next);
  };

  return (
    <div className="border-t border-border bg-surface-1 px-4 py-3">
      <div className="relative flex items-end gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
        <div className="relative flex-1">
          <textarea
            ref={taRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            disabled={disabled}
            rows={1}
            spellCheck={false}
            className="w-full min-h-[40px] max-h-32 bg-transparent text-sm text-gray-200 placeholder-gray-600 resize-none outline-none py-2"
            placeholder={placeholder || "Ask Claude…"}
          />
          {state && (
            <div className="absolute z-30 left-0 right-0 bottom-full mb-1 rounded-md border border-border bg-surface-1 shadow-lg shadow-black/40 max-h-60 overflow-auto py-1">
              <div className="px-3 py-1.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-gray-500 inline-flex items-center gap-1.5">
                {state.kind === "slash" ? (
                  <>
                    <SlashIcon className="w-3 h-3" />
                    {t("run:autocomplete.slashHint")}
                  </>
                ) : (
                  <>
                    <AtSign className="w-3 h-3" />
                    {t("run:autocomplete.fileHint")}
                  </>
                )}
              </div>
              {items.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-gray-500">
                  {t("run:autocomplete.noMatches")}
                </div>
              ) : state.kind === "slash" ? (
                (items as ChatSlashCommand[]).map((c, idx) => (
                  <button
                    key={`${c.source}:${c.name}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertChoice(c)}
                    onMouseEnter={() => setActive(idx)}
                    className={`w-full text-left px-3 py-1.5 transition-colors ${
                      idx === active ? "bg-accent/15" : "hover:bg-surface-3"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] text-gray-100">/{c.name}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-gray-600 text-gray-400">
                        {c.source}
                      </span>
                    </div>
                    {c.description && (
                      <div className="text-[10.5px] text-gray-500 truncate mt-0.5">
                        {c.description}
                      </div>
                    )}
                  </button>
                ))
              ) : (
                (items as string[]).map((p, idx) => (
                  <button
                    key={p}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertChoice(p)}
                    onMouseEnter={() => setActive(idx)}
                    className={`w-full text-left px-3 py-1.5 transition-colors flex items-center gap-2 ${
                      idx === active ? "bg-accent/15" : "hover:bg-surface-3"
                    }`}
                  >
                    <FileCode className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span className="font-mono text-[11px] text-gray-200 truncate">{p}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {isLive ? (
          <button
            type="button"
            onClick={onStop}
            disabled={disabled}
            className="p-3 md:p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40"
            aria-label="stop"
          >
            <Square className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={disabled || !value.trim()}
            className="p-3 md:p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40"
            aria-label="send"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
