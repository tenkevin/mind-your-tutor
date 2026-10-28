import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPrivacyLayer, loadModel, privacyLayer } from './privacy';

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

  it('still blurs with the pattern and word-list rules if the model cannot be fetched', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('caches', undefined);
    clearPrivacyLayer();
    expect(await privacyLayer().blur('my friend Maya is at 12 Oak Road')).toBe(
      'my friend Person A is at Address A',
    );
  });
});
