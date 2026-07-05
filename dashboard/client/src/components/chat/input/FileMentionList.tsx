import { AtSign, FileCode, FileText, Image, FileJson, Terminal, Braces, Hash } from "lucide-react";
import { useTranslation } from "react-i18next";
import { animations } from "./icons";

function pathScore(path: string, q: string): number {
  if (!q) return 0;
  const p = path.toLowerCase();
  if (p === q) return 1000;
  if (p.startsWith(q)) return 800 - Math.min(p.length, 100);
  const idx = p.indexOf(q);
  if (idx >= 0) return 400 - Math.min(idx, 100);
  let i = 0;
  for (const ch of q) {
    i = p.indexOf(ch, i);
    if (i === -1) return 0;
    i++;
  }
  return 100;
}

function getFileIcon(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  const iconMap: Record<string, typeof FileCode> = {
    ts: Braces,
    tsx: Braces,
    js: Braces,
    jsx: Braces,
    json: FileJson,
    md: FileText,
    txt: FileText,
    png: Image,
    jpg: Image,
    jpeg: Image,
    gif: Image,
    svg: Image,
    sh: Terminal,
    bash: Terminal,
    zsh: Terminal,
    py: Hash,
    css: Braces,
    html: Braces,
  };
  const Icon = ext ? iconMap[ext] || FileCode : FileCode;
  return <Icon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" aria-hidden />;
}

export interface FileMentionListProps {
  paths: string[];
  activeIndex: number;
  query: string;
  onSelect: (path: string) => void;
  onHover: (index: number) => void;
}

export function FileMentionList({ paths, activeIndex, query, onSelect, onHover }: FileMentionListProps) {
  const { t } = useTranslation("run");
  if (!paths.length) {
    return (
      <div className="px-3 py-4 text-[11px] text-gray-500 text-center">
        <div className="mb-1">{t("autocomplete.noMatches")}</div>
        <div className="text-[10px] text-gray-600">Type a file path to search</div>
      </div>
    );
  }
  const ranked = query
    ? [...paths].sort((a, b) => pathScore(b, query) - pathScore(a, query))
    : paths;
  return (
    <div role="listbox" className={animations.fadeIn}>
      <div className="px-3 py-1.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-gray-500 inline-flex items-center gap-1.5">
        <AtSign className="w-3 h-3" aria-hidden />
        {t("autocomplete.fileHint")}
      </div>
      {ranked.slice(0, 12).map((p, idx) => (
        <button
          key={p}
          type="button"
          role="option"
          aria-selected={idx === activeIndex}
          aria-label={p}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(p)}
          onMouseEnter={() => onHover(idx)}
          className={`w-full text-left px-3 py-2 transition-colors flex items-center gap-2 ${idx === activeIndex ? "bg-accent/15" : "hover:bg-surface-3"}`}
        >
          {getFileIcon(p)}
          <span className="font-mono text-[11px] text-gray-200 truncate">{p}</span>
          {idx === activeIndex && (
            <span className="ml-auto text-[9px] text-gray-600 font-mono">Tab ↩</span>
          )}
        </button>
      ))}
      {ranked.length > 12 && (
        <div className="px-3 py-1.5 text-[10px] text-gray-600 text-center">
          +{ranked.length - 12} more files
        </div>
      )}
      <div className="px-3 py-1.5 border-t border-border text-[9px] text-gray-600 flex items-center gap-2">
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 rounded bg-surface-3 text-[9px]">↑↓</kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 rounded bg-surface-3 text-[9px]">Tab</kbd> select
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 rounded bg-surface-3 text-[9px]">Esc</kbd> close
        </span>
      </div>
    </div>
  );
}
