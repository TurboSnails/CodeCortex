import { useCallback, useEffect, useRef, useState } from "react";

export interface VoiceInputApi {
  available: boolean;
  listening: boolean;
  interimText: string;
  toggle: () => void;
  onInterim: (cb: (text: string) => void) => () => void;
  onFinal: (cb: (text: string) => void) => () => void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useVoiceInput(): VoiceInputApi {
  const Ctor = getRecognitionCtor();
  const available = !!Ctor;

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const interimCbRef = useRef<((t: string) => void) | null>(null);
  const finalCbRef = useRef<((t: string) => void) | null>(null);
  const lockedRef = useRef(false);
  const errorCountRef = useRef(0);

  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");

  const start = useCallback(() => {
    if (!Ctor || lockedRef.current) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          finalCbRef.current?.(r[0].transcript);
          setInterimText("");
        } else {
          interim += r[0].transcript;
        }
      }
      if (interim) {
        setInterimText(interim);
        interimCbRef.current?.(interim);
      }
    };
    rec.onerror = () => {
      errorCountRef.current += 1;
      if (errorCountRef.current >= 3) {
        lockedRef.current = true;
        setListening(false);
      }
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    (globalThis as any).__lastRec = rec;
    rec.start();
    setListening(true);
  }, [Ctor]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (!available || lockedRef.current) return;
    if (listening) stop();
    else start();
  }, [available, listening, start, stop]);

  useEffect(() => () => recRef.current?.abort(), []);

  const onInterim = useCallback((cb: (t: string) => void) => {
    interimCbRef.current = cb;
    return () => { if (interimCbRef.current === cb) interimCbRef.current = null; };
  }, []);
  const onFinal = useCallback((cb: (t: string) => void) => {
    finalCbRef.current = cb;
    return () => { if (finalCbRef.current === cb) finalCbRef.current = null; };
  }, []);

  return { available, listening, interimText, toggle, onInterim, onFinal };
}