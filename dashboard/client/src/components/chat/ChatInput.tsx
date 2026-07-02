import { useRef } from "react";
import { Send, Square } from "lucide-react";

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  isLive,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  disabled?: boolean;
  isLive?: boolean;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="border-t border-border bg-surface-1 px-4 py-3">
      <div className="flex items-end gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          className="flex-1 min-h-[40px] max-h-32 bg-transparent text-sm text-gray-200 placeholder-gray-600 resize-none outline-none py-2"
          placeholder={placeholder || "Ask Claude…"}
        />
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
