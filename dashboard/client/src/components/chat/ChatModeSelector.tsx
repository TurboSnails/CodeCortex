import { CHAT_MODES, getModePreview, type ChatMode } from "./workflowConfig";
import { Tip } from "../Tip";

export interface ChatModeSelectorProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
}

export function ChatModeSelector({ mode, onChange }: ChatModeSelectorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2" role="group" aria-label="Chat mode">
      {CHAT_MODES.map((m) => {
        const active = m.id === mode;
        const button = (
          <button
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              active
                ? "bg-indigo-600 text-white border-indigo-500"
                : "bg-surface-2 text-gray-400 border-border hover:bg-surface-3 hover:text-gray-200"
            }`}
          >
            {m.label}
          </button>
        );
        return (
          <Tip key={m.id} raw={getModePreview(m.id)}>
            {button}
          </Tip>
        );
      })}
    </div>
  );
}
