import { AtSign, FileCode } from "lucide-react";
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
      <div className="px-3 py-2 text-[11px] text-gray-500">
        {t("autocomplete.noMatches")}
      </div>
    );
  }
  const ranked = query
    ? [...paths].sort((a, b) => pathScore(b, query) - pathScore(a, query))
    : paths;
  const preview = ranked[0];
  return (
    <div role="listbox" className={animations.fadeIn}>
      <div className="px-3 py-1.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-gray-500 inline-flex items-center gap-1.5">
        <AtSign className="w-3 h-3" aria-hidden />
        {t("autocomplete.fileHint")}
      </div>
      {preview && (
        <div className="px-3 py-1 border-b border-border text-[10.5px] text-gray-400">
          {t("chat.tabToInsert", "Press")} <kbd className="kbd">Tab</kbd> {t("chat.toInsert", "to insert")}{" "}
          <span className="font-mono text-gray-200">{preview}</span>
        </div>
      )}
      {ranked.map((p, idx) => (
        <button
          key={p}
          type="button"
          role="option"
          aria-selected={idx === activeIndex}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(p)}
          onMouseEnter={() => onHover(idx)}
          className={`w-full text-left px-3 py-1.5 transition-colors flex items-center gap-2 ${idx === activeIndex ? "bg-accent/15" : "hover:bg-surface-3"}`}
        >
          <FileCode className="w-3 h-3 text-gray-500 flex-shrink-0" aria-hidden />
          <span className="font-mono text-[11px] text-gray-200 truncate">{p}</span>
        </button>
      ))}
    </div>
  );
}
