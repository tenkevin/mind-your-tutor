import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BertNer, ModelUnavailableError, lazyModelRecognizer, modelRecognizer } from './index.js';

// A7-F10, A7-P1: the bundled model file, run for real. CI needs no network: the weights
// are committed (packages/ai/models, about 4.5 MB; source and licence in the README there).

const FILE = new URL('../models/ner-bert-tiny-v1.bin', import.meta.url);
const bytes = () => {
  const b = readFileSync(FILE);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const model = BertNer.load(bytes());
const found = (text: string) =>
  model.predict(text).map((s) => [s.label, text.slice(s.start, s.end)] as const);

describe('on-device ML NER model (A7-F10, D33)', () => {
  it('finds names and places from sentence context, in any case', () => {
    expect(found('My friend Maya sits next to me in science.')).toEqual([['PER', 'Maya']]);
    expect(found('sam said hi to me at lunch')).toEqual([['PER', 'sam']]);
    expect(found('I live in Springfield near the river.')).toEqual([['LOC', 'Springfield']]);
    expect(found('Paris is in France.').map(([l]) => l)).toEqual(['LOC', 'LOC']);
  });

  it('reads the context: the same word is a place in one sentence and not in another', () => {
    expect(found('We flew to Paris last week.')).toContainEqual(['LOC', 'Paris']);
    expect(found('I love Real Madrid and my cat Luna').map(([, t]) => t)).not.toContain('Maya');
  });

  it('gives the same answer from the SIMD kernel and the plain JavaScript path', () => {
    const plain = BertNer.load(bytes(), { kernel: false });
    for (const text of [
      'Maya told Omar that maya was late for Lincoln Elementary School in Leeds.',
      'sam said hi',
      'Is it true that Noah said clouds are made of smoke?',
    ]) {
      expect(plain.predict(text)).toEqual(model.predict(text));
    }
  });

  it('is small, with no word list of names or places on the device path (A7-P1, F10)', () => {
    expect(statSync(FILE).size).toBeLessThan(15 * 1024 * 1024);
    for (const file of ['device-recognizer.ts', 'ner-model.ts', 'anonymise.ts']) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/gazetteer|FIRST_NAMES|PLACES|ruleRecognizer/);
    }
  });

  it('is deterministic', () => {
    const text = 'Maya and Omar walked to Leeds.';
    expect(model.predict(text)).toEqual(model.predict(text));
  });

  it('refuses a file that is not a model', () => {
    expect(() => BertNer.load(new ArrayBuffer(64))).toThrow('Not a model file');
  });
});

describe('device recognizer', () => {
  const recognizer = modelRecognizer(model);
  const kinds = (text: string) =>
    recognizer.recognize(text) instanceof Promise
      ? []
      : (recognizer.recognize(text) as { kind: string; start: number; end: number }[]).map((e) => [
          e.kind,
          text.slice(e.start, e.end),
        ]);

  it('adds the pattern rules for contacts and schools to the model', () => {
    expect(
      kinds('Maya goes to Lincoln Elementary School, call 555-123-4567 or mail a.b@example.org'),
    ).toEqual([
      ['person', 'Maya'],
      ['school', 'Lincoln Elementary School'],
      ['phone', '555-123-4567'],
      ['email', 'a.b@example.org'],
    ]);
  });

  it('keeps interests: a pet by name and a team', () => {
    expect(kinds('I love Real Madrid and my cat Luna')).toEqual([]);
  });
});

describe('lazy loading and failing closed (A7-F11, D33)', () => {
  const ok = (id: string, counter?: { n: number }) => ({
    id,
    load: async () => {
      if (counter) counter.n++;
      return bytes();
    },
  });
  const broken = (id: string) => ({
    id,
    load: async (): Promise<ArrayBuffer> => {
      throw new Error('offline');
    },
  });

  it('loads the model once, on first use', async () => {
    const loads = { n: 0 };
    const recognizer = lazyModelRecognizer([ok('main', loads)]);
    expect(loads.n).toBe(0);
    expect(await recognizer.recognize('Maya is here')).toHaveLength(1);
    await recognizer.recognize('Omar is here');
    expect(loads.n).toBe(1);
  });

  it('with no loadable model, rejects and never falls back to word lists', async () => {
    const failures: string[] = [];
    const recognizer = lazyModelRecognizer([broken('main')], (id) => failures.push(id));
    // "Maya" and "Leeds" are in the old word lists; they must not be found some other way.
    await expect(recognizer.recognize('I live in Leeds and Maya is my friend')).rejects.toThrow(
      ModelUnavailableError,
    );
    expect(failures).toEqual(['main']);
  });

  it('a file that loads but is not a model counts as unavailable', async () => {
    const recognizer = lazyModelRecognizer([{ id: 'bad', load: async () => new ArrayBuffer(64) }]);
    await expect(recognizer.recognize('Maya')).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it('switches to a configured alternative when the first model fails', async () => {
    const failures: string[] = [];
    const loads = { n: 0 };
    const recognizer = lazyModelRecognizer([broken('first'), ok('second', loads)], (id) =>
      failures.push(id),
    );
    expect(await recognizer.recognize('I live in Leeds and Maya is my friend')).toHaveLength(2);
    expect(failures).toEqual(['first']);
    await recognizer.recognize('again');
    expect(loads.n).toBe(1);
    expect(failures).toEqual(['first']);
  });

  it('tries again later, so a student who comes back online is not stuck', async () => {
    let online = false;
    const recognizer = lazyModelRecognizer([
      {
        id: 'main',
        load: async () => {
          if (!online) throw new Error('offline');
          return bytes();
        },
      },
    ]);
    await expect(recognizer.recognize('Maya')).rejects.toBeInstanceOf(ModelUnavailableError);
    online = true;
    expect(await recognizer.recognize('Maya is here')).toHaveLength(1);
  });
});
