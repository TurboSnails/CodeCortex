import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, Square } from "lucide-react";
import { api } from "../../lib/api";
import { usePromptHistory } from "../../hooks/chat/usePromptHistory";
import { useAttachments } from "../../hooks/chat/useAttachments";
import { useVoiceInput } from "../../hooks/chat/useVoiceInput";
import { animations, icons } from "./input/icons";
import { SlashList } from "./input/SlashList";
import { FileMentionList } from "./input/FileMentionList";
import { AttachmentStrip } from "./input/AttachmentStrip";
import { VoiceButton } from "./input/VoiceButton";
import { ShortcutDropdown } from "./input/ShortcutDropdown";
import { InputHintBar } from "./input/InputHintBar";

export interface ChatSlashCommand {
  name: string;
  description?: string;
  source: "builtin" | "user" | "project" | "plugin" | "skill";
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
  onSendWithPayload,
  onError,
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
  onSendWithPayload?: (payload: import("../../lib/types").SendPayload) => Promise<void> | void;
  onError?: (message: string) => void;
}) {
  const { t } = useTranslation(["run", "sessions"]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<AutocompleteState | null>(null);
  const [active, setActive] = useState(0);
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const fileFetchRef = useRef<{ q: string; t: number } | null>(null);

  const history = usePromptHistory();
  const attachments = useAttachments({ onError });
  const voice = useVoiceInput();
  const [pulseHint, setPulseHint] = useState(false);

  useEffect(() => {
    setPulseHint(true);
    const t = setTimeout(() => setPulseHint(false), 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [interimVisible, setInterimVisible] = useState(false);
  useEffect(() => voice.onInterim(() => setInterimVisible(true)), [voice]);
  useEffect(() => voice.onFinal((final) => {
    setInterimVisible(false);
    onChange(value ? `${value} ${final}` : final);
  }), [voice, value, onChange]);

  const [dragging, setDragging] = useState(false);
  const canSendText = !!value.trim() || attachments.items.length > 0;

  const doSend = () => {
    if (!canSendText) return;
    const payload = attachments.buildPayload(value);
    if (onSendWithPayload) {
      void onSendWithPayload({ text: payload.text, attachments: payload.attachments });
    } else {
      onChange(payload.text);
      onSend();
    }
    history.push(payload.text || "(image)");
  };

  const slashItems = useMemo(() => {
    if (!state || state.kind !== "slash") return [] as ChatSlashCommand[];
    const q = state.query.toLowerCase();
    const sourceOrder = { project: 0, user: 1, skill: 2, plugin: 3, builtin: 4 } as const;
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
    if (state == null && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const next = history.navigate(e.key === "ArrowUp" ? -1 : 1);
      if (next != null) {
        e.preventDefault();
        onChange(next);
      }
      return;
    }
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
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      doSend();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      doSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const ta = e.target;
    const next = detectAutocomplete(ta.value, ta.selectionStart || 0);
    setState(next);
    if (!next) setActive(0);
  };

  const handleSelect = (_e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    // Intentionally empty: calling setState here causes a re-render that
    // clears the browser's native text selection, breaking copy/paste.
    // Autocomplete state is already updated via handleChange on input.
  };

  return (
    <div className="border-t border-border bg-surface-1 px-3 md:px-4 py-2 md:py-3">
      <div className={`relative flex items-end gap-2 rounded-xl border bg-surface-2 px-3 py-2 transition-colors ${dragging ? `border-accent border-dashed bg-accent/5 ${animations.dropzoneActive}` : "border-border"}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { setDragging(false); attachments.onDrop(e); }}
      >
        <div className="relative flex-1">
          <AttachmentStrip items={attachments.items} onRemove={attachments.remove} />
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => {
              handleChange(e);
              const ta = e.target as HTMLTextAreaElement & { files?: FileList | null };
              if (ta.files && ta.files.length) attachments.onPick(ta.files);
            }}
            onPaste={(e) => {
              handleChange(e as unknown as React.ChangeEvent<HTMLTextAreaElement>);
              attachments.onPaste(e as unknown as ClipboardEvent);
            }}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            disabled={disabled}
            rows={1}
            spellCheck={false}
            className="w-full min-h-[40px] max-h-32 bg-transparent text-sm text-gray-200 placeholder-gray-600 resize-none outline-none py-2"
            placeholder={placeholder || "Ask Claude…"}
          />
          {interimVisible && voice.interimText && (
            <div className="absolute right-2 top-2 text-[10px] text-gray-500 italic max-w-[40%] truncate" role="status" aria-live="polite">
              {voice.interimText}
            </div>
          )}
          {state && (
            <div className={`absolute z-30 left-0 right-0 bottom-full mb-1 rounded-md border border-border bg-surface-1 shadow-lg shadow-black/40 max-h-60 overflow-auto py-1`}>
              {state.kind === "slash" ? (
                <SlashList
                  items={slashItems}
                  activeIndex={active}
                  onSelect={(c) => insertChoice(c)}
                  onHover={setActive}
                />
              ) : (
                <FileMentionList
                  paths={fileSuggestions}
                  activeIndex={active}
                  query={state.query}
                  onSelect={(p) => insertChoice(p)}
                  onHover={setActive}
                />
              )}
            </div>
          )}
        </div>

        <VoiceButton voice={voice} disabled={disabled} />
        <ShortcutDropdown />

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
            onClick={() => doSend()}
            disabled={disabled || !canSendText}
            className="p-3 md:p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40"
            aria-label="send"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
      {pulseHint && value.trim() === "" && history.size > 0 && (
        <div role="status" aria-live="polite" className={`absolute right-3 bottom-16 text-[10px] text-accent/70 inline-flex items-center gap-1 ${animations.recallPulse}`}>
          <icons.arrowUp className="w-3 h-3" />
          {t("chat-input:history.recallPulse", "Press ↑ to recall previous prompts")}
        </div>
      )}
      <InputHintBar />
    </div>
  );
}
