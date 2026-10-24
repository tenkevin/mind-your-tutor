import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { browserRecognition, browserSpeech, type RecognitionCtor, type SpeechEnv } from './speech';

// The browser's speech objects, swappable in tests and for browsers without them.
export interface SpeechServices {
  speech: SpeechEnv | null;
  recognition: RecognitionCtor | null;
  lang: string;
}

const SpeechContext = createContext<SpeechServices | null>(null);

export function SpeechProvider({
  value,
  children,
}: {
  value: Partial<SpeechServices>;
  children: ReactNode;
}) {
  const parent = useSpeechServices();
  return <SpeechContext value={{ ...parent, ...value }}>{children}</SpeechContext>;
}

// Made once, so components keep the same reader across renders.
let fromBrowser: SpeechServices | undefined;

export function useSpeechServices(): SpeechServices {
  return (
    useContext(SpeechContext) ??
    (fromBrowser ??= { speech: browserSpeech(), recognition: browserRecognition(), lang: 'en-US' })
  );
}

/** Re-renders when the browser finishes loading its voices (they arrive late in Chrome). */
export function useVoicesVersion(speech: SpeechEnv | null): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const synth = speech?.synth as unknown as EventTarget | undefined;
    if (!synth?.addEventListener) return;
    const bump = () => setVersion((v) => v + 1);
    synth.addEventListener('voiceschanged', bump);
    return () => synth.removeEventListener('voiceschanged', bump);
  }, [speech]);
  return version;
}
