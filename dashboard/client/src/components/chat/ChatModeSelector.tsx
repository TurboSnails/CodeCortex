import { CHAT_MODES, type ChatMode } from "./workflowConfig";

export interface ChatModeSelectorProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

export function ChatModeSelector({ mode, onChange, disabled }: ChatModeSelectorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2" role="group" aria-label="Chat mode">
      {CHAT_MODES.map((m) => {
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              active
                ? "bg-indigo-600 text-white border-indigo-500"
                : "bg-surface-2 text-gray-400 border-border hover:bg-surface-3 hover:text-gray-200"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
