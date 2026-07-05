import { useState } from "react";
import { ChevronRight, ChevronDown, Sparkles } from "lucide-react";

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="rounded-md border border-violet-500/20 bg-violet-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium text-violet-300 hover:bg-violet-500/10 transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
        <Sparkles className="w-3 h-3 flex-shrink-0" />
        <span className="text-[10px] uppercase tracking-wider opacity-70">
          {open ? "💭 thinking" : "💭 thinking (hidden)"}
        </span>
      </button>
      {open && (
        <pre className="px-3 py-2 text-[11px] font-mono text-violet-200/80 whitespace-pre-wrap break-words border-t border-violet-500/20 leading-relaxed">
          {text}
        </pre>
      )}
    </div>
  );
}
