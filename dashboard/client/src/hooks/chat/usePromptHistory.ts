import { useCallback, useEffect, useRef, useState } from "react";

export interface PromptHistoryApi {
  entries: string[];
  push: (text: string) => void;
  navigate: (dir: -1 | 1) => string | null;
  commit: (text: string) => void;
  clear: () => void;
  size: number;
}

const MAX_ENTRIES = 500;

function key() {
  return "cc-chat:prompt-history:anon";
}

function read(): string[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(key());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(entries: string[]) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key(), JSON.stringify(entries));
  } catch {
    /* quota or privacy mode: ignore */
  }
}

export function usePromptHistory(): PromptHistoryApi {
  const [entries, setEntries] = useState<string[]>(() => read());
  const cursorRef = useRef(entries.length); // index *past* the last position

  useEffect(() => {
    cursorRef.current = entries.length;
  }, [entries.length]);

  const push = useCallback((text: string) => {
    const next = text.trim();
    if (!next) return;
    setEntries((prev) => {
      const without = prev[prev.length - 1] === next ? prev.slice(0, -1) : prev;
      const merged = [...without, next];
      const trimmed = merged.length > MAX_ENTRIES ? merged.slice(merged.length - MAX_ENTRIES) : merged;
      write(trimmed);
      cursorRef.current = trimmed.length;
      return trimmed;
    });
  }, []);

  const navigate = useCallback((dir: -1 | 1): string | null => {
    const len = entries.length;
    if (len === 0) return null;
    const next = Math.max(0, Math.min(len, cursorRef.current + dir));
    if (next === cursorRef.current) {
      if (dir === 1) return null;
      return entries[next] ?? null;
    }
    cursorRef.current = next;
    if (next === 0) return null;
    return entries[next] ?? null;
  }, [entries]);

  const commit = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setEntries((prev) => {
      const next = prev[prev.length - 1] === trimmed ? prev : [...prev.slice(0, -1), trimmed];
      write(next);
      cursorRef.current = next.length;
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    cursorRef.current = 0;
    write([]);
  }, []);

  return { entries, push, navigate, commit, clear, size: entries.length };
}