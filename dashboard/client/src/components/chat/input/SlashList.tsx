import { Slash as SlashIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatSlashCommand } from "../ChatInput";
import { animations } from "./icons";

export interface SlashListProps {
  items: ChatSlashCommand[];
  activeIndex: number;
  onSelect: (cmd: ChatSlashCommand) => void;
  onHover: (index: number) => void;
}

const sourceBadgeClasses: Record<ChatSlashCommand["source"], string> = {
  skill: "border-amber-500/40 text-amber-300 bg-amber-500/10",
  builtin: "border-indigo-500/40 text-indigo-300 bg-indigo-500/10",
  project: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  user: "border-sky-500/40 text-sky-300 bg-sky-500/10",
  plugin: "border-violet-500/40 text-violet-300 bg-violet-500/10",
};

export function SlashList({ items, activeIndex, onSelect, onHover }: SlashListProps) {
  const { t } = useTranslation("run");
  if (!items.length) {
    return (
      <div className="px-3 py-2 text-[11px] text-gray-500">
        {t("autocomplete.noMatches")}
      </div>
    );
  }
  return (
    <div role="listbox" className={animations.fadeIn}>
      <div className="px-3 py-1.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-gray-500 inline-flex items-center gap-1.5">
        <SlashIcon className="w-3 h-3" aria-hidden />
        {t("autocomplete.slashHint")}
      </div>
      {items.map((c, idx) => (
        <button
          key={`${c.source}:${c.name}`}
          type="button"
          role="option"
          aria-selected={idx === activeIndex}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(c)}
          onMouseEnter={() => onHover(idx)}
          className={`w-full text-left px-3 py-1.5 transition-colors ${idx === activeIndex ? "bg-accent/15" : "hover:bg-surface-3"}`}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-gray-100">/{c.name}</span>
            <span
              title={c.source}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${sourceBadgeClasses[c.source]}`}
            >
              {c.source}
            </span>
          </div>
          {c.description && (
            <div className="text-[10.5px] text-gray-500 truncate mt-0.5">{c.description}</div>
          )}
        </button>
      ))}
    </div>
  );
}