"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Message quand la dictée du navigateur n'est pas disponible (ou manque de réseau). */
export const DICTATION_FALLBACK = "Dictée indisponible ici : utilisez le micro de votre clavier.";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/**
 * Dictée en français (Web Speech API, surtout Chrome, et en ligne). `onText` reçoit chaque phrase
 * reconnue. Sans dictée disponible, `hint` invite à passer par le micro du clavier.
 */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onText);

  useEffect(() => {
    callback.current = onText;
  }, [onText]);

  useEffect(() => () => recognition.current?.stop(), []);

  const toggle = useCallback(() => {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setHint(DICTATION_FALLBACK);
      return;
    }
    const session = new Constructor();
    session.lang = "fr-FR";
    session.continuous = true;
    session.interimResults = false;
    session.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) {
          callback.current(result[0].transcript.trim());
        }
      }
    };
    session.onerror = () => {
      setHint(DICTATION_FALLBACK);
    };
    session.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = session;
    setHint(null);
    setListening(true);
    try {
      session.start();
    } catch {
      recognition.current = null;
      setListening(false);
      setHint(DICTATION_FALLBACK);
    }
  }, []);

  return { listening, hint, toggle };
}
