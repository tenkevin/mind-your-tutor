import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Anonymiser } from '@ideamap/ai/anonymise';
import { lazyModelRecognizer } from '@ideamap/ai/device';
import { AI_UNAVAILABLE_MESSAGE } from '@ideamap/contracts';
import { askPersona } from './ai';
import {
  NER_MODELS,
  PRIVACY_UNAVAILABLE_MESSAGE,
  clearPrivacyLayer,
  loadModel,
  privacyLayer,
} from './privacy';

// A7-F10, A7-P1 on the student device: the model is fetched lazily, cached, and used for
// names and places. The tests serve the committed weights from disk, so no network.

const FILE = new URL('../../../packages/ai/models/ner-bert-tiny-v1.bin', import.meta.url);
const weights = () => {
  const b = readFileSync(FILE);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

function stubBrowser() {
  const store = new Map<string, Response>();
  const fetchFn = vi.fn(async () => new Response(weights()));
  vi.stubGlobal('fetch', fetchFn);
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (url: string) => store.get(url)?.clone(),
      put: async (url: string, res: Response) => void store.set(url, res),
    }),
  });
  return fetchFn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearPrivacyLayer();
});

describe('the student layer uses the ML model (A7-F10)', () => {
  it('loads the model only when first needed, then blurs from sentence context', async () => {
    const fetchFn = stubBrowser();
    clearPrivacyLayer();
    expect(fetchFn).not.toHaveBeenCalled();
    const layer = privacyLayer();
    expect(await layer.blur('sam said hi to me at lunch in Leeds')).toBe(
      'Person A said hi to me at lunch in Place A',
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await layer.blur('Then sam met Omar at lunch')).toBe(
      'Then Person A met Person B at lunch',
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('serves the model from the browser cache on later loads', async () => {
    const fetchFn = stubBrowser();
    await loadModel('https://app.test/model.bin');
    await loadModel('https://app.test/model.bin');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('fails closed without a model (A7-F11, D33)', () => {
  const CLASS = '00000000-0000-4000-8000-000000000001';
  const reply = {
    interactionId: '00000000-0000-4000-8000-000000000002',
    persona: { id: 'tutor', name: 'Ms. Ivy' },
    reply: 'Hello Person A',
  };
  const api = () => {
    const calls: string[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      calls.push(init.body as string);
      return new Response(JSON.stringify(reply), { status: 200 });
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
  };
  const ask = (fetchFn: typeof fetch, anonymiser?: Anonymiser) =>
    askPersona(fetchFn, {
      classId: CLASS,
      persona: 'tutor',
      csrfToken: 'csrf-1',
      request: { message: 'my friend Maya is at 12 Oak Road' },
      ...(anonymiser ? { anonymiser } : {}),
    });

  it('blocks chat with a calm, plain message and sends nothing when the model file is blocked', async () => {
    vi.stubGlobal('fetch', async () => new Response('blocked', { status: 403 }));
    vi.stubGlobal('caches', undefined);
    clearPrivacyLayer();
    const { fetchFn, calls } = api();
    const res = await ask(fetchFn);
    expect(calls).toHaveLength(0);
    expect(res).toEqual({
      ok: false,
      message: PRIVACY_UNAVAILABLE_MESSAGE,
      retryAfterSeconds: null,
    });
    expect(PRIVACY_UNAVAILABLE_MESSAGE).not.toBe(AI_UNAVAILABLE_MESSAGE);
    // Plain words: no codes, no jargon, no blame.
    expect(PRIVACY_UNAVAILABLE_MESSAGE).not.toMatch(/model|error|\d{3}|NER|offline mode/i);
  });

  it('also blocks when the network is down and there is no Cache API', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    vi.stubGlobal('caches', undefined);
    clearPrivacyLayer();
    const { fetchFn, calls } = api();
    expect((await ask(fetchFn)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('chat works again once the model can be loaded', async () => {
    let online = false;
    vi.stubGlobal('caches', undefined);
    vi.stubGlobal('fetch', async () => {
      if (!online) return new Response('blocked', { status: 403 });
      return new Response(weights());
    });
    clearPrivacyLayer();
    const { fetchFn, calls } = api();
    expect((await ask(fetchFn)).ok).toBe(false);
    online = true;
    expect((await ask(fetchFn)).ok).toBe(true);
    expect(JSON.parse(calls[0]!)).toEqual({ message: 'my friend Person A is at Address A' });
  });

  it('switches to a configured alternative model when the first is blocked', async () => {
    const urls: string[] = [];
    const sources = [
      {
        id: 'first',
        load: () => {
          urls.push('first');
          return Promise.reject(new Error('blocked'));
        },
      },
      {
        id: 'second',
        load: async () => {
          urls.push('second');
          return weights();
        },
      },
    ];
    const { fetchFn, calls } = api();
    const res = await ask(fetchFn, new Anonymiser({ recognizer: lazyModelRecognizer(sources) }));
    expect(res.ok).toBe(true);
    expect(urls).toEqual(['first', 'second']);
    expect(JSON.parse(calls[0]!)).toEqual({ message: 'my friend Person A is at Address A' });
  });

  it('has one configured model today, and no word-list recognizer on the device', () => {
    expect(NER_MODELS.map((m) => m.id)).toEqual(['bert-tiny-conll-v1']);
    const source = readFileSync(new URL('./privacy.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/ruleRecognizer|gazetteer/);
  });
});
