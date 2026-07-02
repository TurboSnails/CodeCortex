import { useTranslation } from "react-i18next";
import { animations, icons } from "./icons";
import type { VoiceInputApi } from "../../../hooks/chat/useVoiceInput";

export function VoiceButton({
  voice,
  disabled,
}: {
  voice: VoiceInputApi;
  disabled?: boolean;
}) {
  const { t } = useTranslation("chat-input");
  if (!voice.available) return null;
  const label = voice.listening
    ? t("voice.stop", "Stop dictation")
    : t("voice.start", "Start dictation");
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={voice.listening}
      disabled={disabled}
      onClick={() => voice.toggle()}
      className={`p-2 rounded-lg text-gray-400 hover:bg-surface-3 ${voice.listening ? animations.voiceListening + " bg-red-500/10 text-red-300" : ""}`}
      title={label}
    >
      {voice.listening ? <icons.micOff className="w-4 h-4" /> : <icons.mic className="w-4 h-4" />}
    </button>
  );
}
