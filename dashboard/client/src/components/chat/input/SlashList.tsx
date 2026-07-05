import { Slash as SlashIcon, Keyboard, Sparkles } from "lucide-react";
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

/** Builtin commands that are AI-powered for badge */
const AI_COMMANDS = new Set(["help", "review", "explain", "refactor", "optimize", "debug"]);

export function SlashList({ items, activeIndex, onSelect, onHover }: SlashListProps) {
  const { t } = useTranslation("run");
  if (!items.length) {
    return (
      <div className="px-3 py-4 text-[11px] text-gray-500 text-center">
        <div className="mb-1">{t("autocomplete.noMatches")}</div>
        <div className="text-[10px] text-gray-600">Type a command name to search</div>
      </div>
    );
  }

  // Separate AI commands from regular
  const aiItems = items.filter((c) => AI_COMMANDS.has(c.name));
  const regularItems = items.filter((c) => !AI_COMMANDS.has(c.name));

  return (
    <div role="listbox" className={animations.fadeIn}>
      <div className="px-3 py-1.5 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-gray-500 inline-flex items-center gap-1.5">
        <SlashIcon className="w-3 h-3" aria-hidden />
        {t("autocomplete.slashHint")}
        <span className="ml-auto text-gray-600 flex items-center gap-1">
          <Keyboard className="w-3 h-3" />
          <span>Tab</span>
        </span>
      </div>

      {aiItems.length > 0 && (
        <>
          <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-violet-400/70 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            AI Commands
          </div>
          {aiItems.map((c, idx) => (
            <SlashItem
              key={`${c.source}:${c.name}`}
              cmd={c}
              isActive={idx === activeIndex}
              onSelect={onSelect}
              onHover={onHover}
              index={idx}
            />
          ))}
        </>
      )}

      {regularItems.length > 0 && (
        <>
          {aiItems.length > 0 && (
            <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
              All Commands
            </div>
          )}
          {regularItems.map((c) => {
            const realIdx = items.indexOf(c);
            return (
              <SlashItem
                key={`${c.source}:${c.name}`}
                cmd={c}
                isActive={realIdx === activeIndex}
                onSelect={onSelect}
                onHover={onHover}
                index={realIdx}
              />
            );
          })}
        </>
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

function SlashItem({
  cmd,
  isActive,
  onSelect,
  onHover,
  index,
}: {
  cmd: ChatSlashCommand;
  isActive: boolean;
  onSelect: (cmd: ChatSlashCommand) => void;
  onHover: (index: number) => void;
  index: number;
}) {
  const isAI = AI_COMMANDS.has(cmd.name);
  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onSelect(cmd)}
      onMouseEnter={() => onHover(index)}
      className={`w-full text-left px-3 py-2 transition-colors ${isActive ? "bg-accent/15" : "hover:bg-surface-3"}`}
    >
      <div className="flex items-center gap-2">
        <span className={`font-mono text-[12px] ${isAI ? "text-violet-200" : "text-gray-100"}`}>
          /{cmd.name}
        </span>
        <span
          title={cmd.source}
          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${sourceBadgeClasses[cmd.source]}`}
        >
          {cmd.source}
        </span>
        {isAI && (
          <Sparkles className="w-3 h-3 text-violet-400/60 ml-auto" />
        )}
      </div>
      {cmd.description && (
        <div className="text-[10.5px] text-gray-500 truncate mt-0.5">{cmd.description}</div>
      )}
    </button>
  );
}
