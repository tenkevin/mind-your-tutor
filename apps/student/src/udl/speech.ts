// Read-aloud and speech input, entirely in the browser (D17, S5). Nothing here
// calls the network, records audio or emits tracker events (D19, §8.2):
// - read-aloud only uses voices the browser marks `localService`, so the text is
//   spoken on the device and not sent to a cloud voice;
// - speech input only runs when the browser can recognise speech on the device
//   (`processLocally`), so the student's voice never leaves it. Where it can't,
//   the mic is hidden and typing still works.
// The browser objects are passed in, so the logic is testable without a DOM.

export type ReadState = 'idle' | 'speaking' | 'paused';

export interface Word {
  text: string;
  start: number;
  end: number;
}

/** Split text into words with their character offsets, for highlighting. */
export function splitWords(text: string): Word[] {
  const words: Word[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    words.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return words;
}

/** The word a speech `boundary` event's character index falls in, or -1. */
export function wordAt(words: readonly Word[], charIndex: number): number {
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (charIndex < w.end) return charIndex >= w.start || i === 0 ? i : i - 1;
  }
  return words.length - 1;
}

export interface VoiceLike {
  lang: string;
  localService: boolean;
  default?: boolean;
}

export interface UtteranceLike {
  voice: VoiceLike | null;
  lang: string;
  rate: number;
  onboundary: ((e: { charIndex: number; name?: string }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export interface SynthLike {
  getVoices(): VoiceLike[];
  speak(u: UtteranceLike): void;
  pause(): void;
  resume(): void;
  cancel(): void;
}

export interface SpeechEnv {
  synth: SynthLike;
  makeUtterance(text: string): UtteranceLike;
}

/** The best on-device voice for a language, or null when there is none. */
export function pickLocalVoice(voices: readonly VoiceLike[], lang: string): VoiceLike | null {
  const local = voices.filter((v) => v.localService);
  const base = lang.split('-')[0]!.toLowerCase();
  const sameLang = local.filter((v) => v.lang.toLowerCase().startsWith(base));
  return sameLang.find((v) => v.lang === lang) ?? sameLang[0] ?? null;
}

export interface ReadAloudCallbacks {
  onState(state: ReadState): void;
  onWord(index: number): void;
}

export interface ReadAloud {
  /** False when no on-device voice exists; the text is still on screen. */
  available(): boolean;
  play(text: string): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export function createReadAloud(
  env: SpeechEnv | null,
  cb: ReadAloudCallbacks,
  opts: { lang?: string; rate?: number } = {},
): ReadAloud {
  const lang = opts.lang ?? 'en-US';
  let current: UtteranceLike | null = null;
  const voice = () => (env ? pickLocalVoice(env.synth.getVoices(), lang) : null);

  const finish = (u: UtteranceLike) => {
    if (current !== u) return;
    current = null;
    cb.onWord(-1);
    cb.onState('idle');
  };

  return {
    available: () => voice() !== null,
    play(text) {
      const v = voice();
      if (!env || !v) return;
      env.synth.cancel();
      const words = splitWords(text);
      const u = env.makeUtterance(text);
      u.voice = v;
      u.lang = v.lang;
      u.rate = opts.rate ?? 1;
      u.onboundary = (e) => {
        if (current === u && (e.name === undefined || e.name === 'word')) {
          cb.onWord(wordAt(words, e.charIndex));
        }
      };
      u.onend = () => finish(u);
      u.onerror = () => finish(u);
      current = u;
      env.synth.speak(u);
      cb.onWord(words.length ? 0 : -1);
      cb.onState('speaking');
    },
    pause() {
      if (!env || !current) return;
      env.synth.pause();
      cb.onState('paused');
    },
    resume() {
      if (!env || !current) return;
      env.synth.resume();
      cb.onState('speaking');
    },
    stop() {
      // Only this reader's speech: another reader may be talking.
      if (!env || !current) return;
      current = null;
      env.synth.cancel();
      cb.onWord(-1);
      cb.onState('idle');
    },
  };
}

/** The browser's speech synthesis, or null outside a browser that has it. */
export function browserSpeech(): SpeechEnv | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  if (typeof SpeechSynthesisUtterance === 'undefined') return null;
  return {
    synth: window.speechSynthesis as unknown as SynthLike,
    makeUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
  };
}

// Speech input. SpeechRecognition isn't in TypeScript's DOM types yet, so this
// is the part of the Web Speech API that S5 uses.

export interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  processLocally?: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface RecognitionCtor {
  new (): RecognitionLike;
  available?(o: { langs: string[]; processLocally: boolean }): Promise<Availability>;
  install?(o: { langs: string[]; processLocally: boolean }): Promise<boolean>;
}

/** The browser's SpeechRecognition constructor, or null. */
export function browserRecognition(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, RecognitionCtor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Whether the device can turn speech into text by itself. Only true when the
 * browser can recognise this language on the device; a browser that would send
 * audio to a server counts as unsupported. This never asks for the microphone.
 */
export async function canDictateOnDevice(
  Ctor: RecognitionCtor | null,
  lang = 'en-US',
): Promise<boolean> {
  if (!Ctor?.available) return false;
  try {
    const a = await Ctor.available({ langs: [lang], processLocally: true });
    return a !== 'unavailable';
  } catch {
    return false;
  }
}

export type DictationState = 'idle' | 'starting' | 'listening' | 'error';

export interface DictationCallbacks {
  /** The words heard so far in this turn, final and in progress. */
  onText(text: string): void;
  onState(state: DictationState, error?: string): void;
}

export interface Dictation {
  start(): Promise<void>;
  stop(): void;
}

/**
 * One listening turn at a time. `start` must run from the mic button's press: it
 * may fetch the on-device language pack, then the browser asks for the mic.
 */
export function createDictation(
  Ctor: RecognitionCtor,
  cb: DictationCallbacks,
  lang = 'en-US',
  /** How long getting ready (the on-device language pack) may take. */
  readyTimeoutMs = 20_000,
): Dictation {
  let rec: RecognitionLike | null = null;
  // Each press of Talk is a turn; Stop or a new turn makes an older one stale.
  let turn = 0;
  let starting = false;
  const opts = { langs: [lang], processLocally: true };

  const ready = async () => {
    const a = Ctor.available ? await Ctor.available(opts) : 'unavailable';
    if (a === 'available') return true;
    if (a === 'unavailable' || !Ctor.install) return false;
    return Ctor.install(opts);
  };

  return {
    async start() {
      if (rec || starting) return;
      const mine = ++turn;
      starting = true;
      cb.onState('starting');
      let timer: ReturnType<typeof setTimeout> | undefined;
      let ok: boolean;
      try {
        ok = await Promise.race([
          ready(),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), readyTimeoutMs);
          }),
        ]);
      } catch {
        ok = false;
      } finally {
        clearTimeout(timer);
      }
      if (mine !== turn) return; // stopped while getting ready
      starting = false;
      if (!ok) {
        cb.onState('error', 'not-on-device');
        return;
      }
      const r = new Ctor();
      r.lang = lang;
      r.interimResults = true;
      r.continuous = false;
      // Recognise on the device only. If the browser ignores this, it never
      // reached here: `available` above answered for on-device recognition.
      r.processLocally = true;
      r.onresult = (e) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) text += e.results[i]![0].transcript;
        cb.onText(text.trim());
      };
      // An error is followed by `end`; report it then, so it isn't overwritten.
      let failed: string | undefined;
      r.onerror = (e) => {
        failed = e.error;
      };
      r.onend = () => {
        if (rec !== r) return;
        rec = null;
        if (failed) cb.onState('error', failed);
        else cb.onState('idle');
      };
      rec = r;
      try {
        r.start();
        cb.onState('listening');
      } catch {
        rec = null;
        cb.onState('error', 'start-failed');
      }
    },
    stop() {
      if (rec) {
        rec.stop();
        return;
      }
      if (!starting) return;
      // Still getting ready: cancel that turn.
      starting = false;
      turn++;
      cb.onState('idle');
    },
  };
}
