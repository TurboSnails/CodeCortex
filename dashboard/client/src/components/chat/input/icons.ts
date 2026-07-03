import { ArrowUp, AtSign, Image, Mic, MicOff, Paperclip, Slash as SlashIcon, X } from "lucide-react";

export const animations = {
  attachmentEnter: "animate-[chat-attachment-enter_180ms_ease-out]",
  voiceListening: "animate-[chat-voice-pulse_1.4s_ease-in-out_infinite]",
  recallPulse: "animate-[chat-recall-pulse_1.8s_ease-in-out]",
  dropzoneActive: "animate-[chat-dropzone-in_150ms_ease-out]",
  fadeIn: "animate-[chat-fade-in_120ms_ease-out]",
} as const;

export const icons = {
  slash: SlashIcon,
  at: AtSign,
  mic: Mic,
  micOff: MicOff,
  image: Image,
  paperclip: Paperclip,
  close: X,
  arrowUp: ArrowUp,
} as const;
