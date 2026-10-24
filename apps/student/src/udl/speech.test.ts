import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canDictateOnDevice,
  createDictation,
  createReadAloud,
  pickLocalVoice,
  splitWords,
  wordAt,
  type RecognitionCtor,
  type RecognitionLike,
  type SpeechEnv,
  type UtteranceLike,
  type VoiceLike,
} from './speech';

const local: VoiceLike = { lang: 'en-US', localService: true };
const cloud: VoiceLike = { lang: 'en-US', localService: false, default: true };

function fakeSpeech(voices: VoiceLike[] = [cloud, local]) {
  const spoken: UtteranceLike[] = [];
  const calls: string[] = [];
  const env: SpeechEnv = {
    synth: {
      getVoices: () => voices,
      speak: (u) => {
        spoken.push(u);
        calls.push('speak');
      },
      pause: () => calls.push('pause'),
      resume: () => calls.push('resume'),
      cancel: () => calls.push('cancel'),
    },
    makeUtterance: () => ({
      voice: null,
      lang: '',
      rate: 1,
      onboundary: null,
      onend: null,
      onerror: null,
    }),
  };
  return { env, spoken, calls };
}

// Nothing in S5 may reach the network (S5-S1).
const fetchSpy = vi.fn();
vi.stubGlobal('fetch', fetchSpy);
afterEach(() => expect(fetchSpy).not.toHaveBeenCalled());

describe('words', () => {
  it('splits text into words with offsets', () => {
    expect(splitWords(' Hi there,  Milo')).toEqual([
      { text: 'Hi', start: 1, end: 3 },
      { text: 'there,', start: 4, end: 10 },
      { text: 'Milo', start: 12, end: 16 },
    ]);
  });

  it('maps a boundary index to its word', () => {
    const w = splitWords('Hi there Milo');
    expect([0, 2, 3, 9, 12, 40].map((i) => wordAt(w, i))).toEqual([0, 0, 1, 2, 2, 2]);
  });
});

describe('read-aloud (S5-F1, S5-S1)', () => {
  it('uses only on-device voices', () => {
    expect(pickLocalVoice([cloud, local], 'en-US')).toBe(local);
    expect(pickLocalVoice([cloud], 'en-US')).toBeNull();
    expect(pickLocalVoice([{ lang: 'fr-FR', localService: true }], 'en-US')).toBeNull();
    expect(pickLocalVoice([{ lang: 'en-GB', localService: true }], 'en-US')?.lang).toBe('en-GB');
  });

  it('plays, highlights, pauses, resumes and stops', () => {
    const { env, spoken, calls } = fakeSpeech();
    const states: string[] = [];
    const words: number[] = [];
    const r = createReadAloud(env, {
      onState: (s) => states.push(s),
      onWord: (w) => words.push(w),
    });
    expect(r.available()).toBe(true);

    r.play('Water rises as vapour');
    const u = spoken[0]!;
    expect(u.voice).toBe(local);
    u.onboundary!({ charIndex: 6, name: 'word' });
    u.onboundary!({ charIndex: 0, name: 'sentence' }); // not a word: ignored
    r.pause();
    r.resume();
    r.stop();
    u.onend!(); // a late end from the cancelled utterance changes nothing

    expect(calls).toEqual(['cancel', 'speak', 'pause', 'resume', 'cancel']);
    expect(states).toEqual(['speaking', 'paused', 'speaking', 'idle']);
    expect(words).toEqual([0, 1, -1]);
  });

  it("stops only its own speech, not another reader's", () => {
    const { env, calls } = fakeSpeech();
    const a = createReadAloud(env, { onState: () => {}, onWord: () => {} });
    const b = createReadAloud(env, { onState: () => {}, onWord: () => {} });
    a.play('One');
    b.stop();
    expect(calls).toEqual(['cancel', 'speak']);
  });

  it('goes idle when speech ends or fails', () => {
    const { env, spoken } = fakeSpeech();
    const states: string[] = [];
    const r = createReadAloud(env, { onState: (s) => states.push(s), onWord: () => {} });
    r.play('One');
    spoken[0]!.onend!();
    r.play('Two');
    spoken[1]!.onerror!();
    expect(states).toEqual(['speaking', 'idle', 'speaking', 'idle']);
  });

  it('does nothing without an on-device voice', () => {
    const { env, calls } = fakeSpeech([cloud]);
    const r = createReadAloud(env, { onState: () => {}, onWord: () => {} });
    expect(r.available()).toBe(false);
    r.play('Hello');
    expect(calls).toEqual([]);
    expect(createReadAloud(null, { onState: () => {}, onWord: () => {} }).available()).toBe(false);
  });
});

function fakeRecognition(availability: string | null, install = true) {
  const made: RecognitionLike[] = [];
  const started: RecognitionLike[] = [];
  class Rec implements RecognitionLike {
    lang = '';
    interimResults = false;
    continuous = true;
    processLocally?: boolean;
    onresult: RecognitionLike['onresult'] = null;
    onerror: RecognitionLike['onerror'] = null;
    onend: RecognitionLike['onend'] = null;
    constructor() {
      made.push(this);
    }
    start() {
      started.push(this);
    }
    stop() {
      this.onend?.();
    }
    abort() {}
  }
  const Ctor = Rec as unknown as RecognitionCtor;
  if (availability !== null) {
    Ctor.available = vi.fn(async () => availability as 'available');
    Ctor.install = vi.fn(async () => install);
  }
  return { Ctor, made, started };
}

describe('speech input (S5-F3, S5-S1, S5-S2)', () => {
  it('counts only on-device recognition as support', async () => {
    expect(await canDictateOnDevice(null)).toBe(false);
    expect(await canDictateOnDevice(fakeRecognition(null).Ctor)).toBe(false);
    expect(await canDictateOnDevice(fakeRecognition('unavailable').Ctor)).toBe(false);
    expect(await canDictateOnDevice(fakeRecognition('available').Ctor)).toBe(true);
    expect(await canDictateOnDevice(fakeRecognition('downloadable').Ctor)).toBe(true);
  });

  it('checking support never opens the microphone', async () => {
    const { Ctor, made } = fakeRecognition('available');
    await canDictateOnDevice(Ctor);
    expect(made).toHaveLength(0);
  });

  it('turns speech into text on the device, for the student to check', async () => {
    const { Ctor, started } = fakeRecognition('available');
    const texts: string[] = [];
    const states: string[] = [];
    const d = createDictation(Ctor, {
      onText: (t) => texts.push(t),
      onState: (s) => states.push(s),
    });
    await d.start();
    const rec = started[0]!;
    expect(rec.processLocally).toBe(true);
    expect(rec.interimResults).toBe(true);
    rec.onresult!({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: 'the sun ' } },
        { isFinal: false, 0: { transcript: 'heats water' } },
      ],
    });
    d.stop();
    expect(texts).toEqual(['the sun heats water']);
    expect(states).toEqual(['starting', 'listening', 'idle']);
  });

  it('fetches the on-device language pack first when needed', async () => {
    const { Ctor, started } = fakeRecognition('downloadable');
    await createDictation(Ctor, { onText: () => {}, onState: () => {} }).start();
    expect(Ctor.install).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true });
    expect(started).toHaveLength(1);
  });

  it('refuses to listen when audio would leave the device', async () => {
    for (const { Ctor, made } of [
      fakeRecognition(null),
      fakeRecognition('unavailable'),
      fakeRecognition('downloadable', false),
    ]) {
      const states: [string, string?][] = [];
      await createDictation(Ctor, {
        onText: () => {},
        onState: (s, e) => states.push([s, e]),
      }).start();
      expect(made).toHaveLength(0);
      expect(states.at(-1)).toEqual(['error', 'not-on-device']);
    }
  });

  it('Stop while getting ready cancels, and the mic is never opened', async () => {
    const { Ctor, made } = fakeRecognition('downloadable');
    let finish!: (ok: boolean) => void;
    Ctor.install = vi.fn(() => new Promise<boolean>((r) => (finish = r)));
    const states: string[] = [];
    const d = createDictation(Ctor, { onText: () => {}, onState: (s) => states.push(s) });
    const started = d.start();
    await Promise.resolve();
    d.stop();
    finish(true);
    await started;
    expect(states).toEqual(['starting', 'idle']);
    expect(made).toHaveLength(0);
  });

  it('gives up when getting ready takes too long', async () => {
    const { Ctor, made } = fakeRecognition('downloadable');
    Ctor.install = vi.fn(() => new Promise<boolean>(() => {}));
    const states: [string, string?][] = [];
    await createDictation(
      Ctor,
      { onText: () => {}, onState: (s, e) => states.push([s, e]) },
      'en-US',
      10,
    ).start();
    expect(states).toEqual([
      ['starting', undefined],
      ['error', 'not-on-device'],
    ]);
    expect(made).toHaveLength(0);
  });

  it('Stop with nothing running does nothing', () => {
    const states: string[] = [];
    createDictation(fakeRecognition('available').Ctor, {
      onText: () => {},
      onState: (s) => states.push(s),
    }).stop();
    expect(states).toEqual([]);
  });

  it('reports a blocked microphone after the turn ends', async () => {
    const { Ctor, started } = fakeRecognition('available');
    const states: [string, string?][] = [];
    await createDictation(Ctor, {
      onText: () => {},
      onState: (s, e) => states.push([s, e]),
    }).start();
    started[0]!.onerror!({ error: 'not-allowed' });
    started[0]!.onend!();
    expect(states.at(-1)).toEqual(['error', 'not-allowed']);
  });
});
