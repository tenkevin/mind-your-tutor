import { AI_RATE_LIMIT_MESSAGE, AI_UNAVAILABLE_MESSAGE, CSRF_HEADER } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { askPersona } from './ai';

const CLASS = '00000000-0000-4000-8000-000000000001';
const reply = {
  interactionId: '00000000-0000-4000-8000-000000000002',
  persona: { id: 'tutor', name: 'Ms. Ivy' },
  reply: 'Evaporation is when water turns into vapour.',
};

function answering(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

const ask = (fetchFn: typeof fetch) =>
  askPersona(fetchFn, {
    classId: CLASS,
    persona: 'tutor',
    csrfToken: 'csrf-1',
    request: { message: 'What is evaporation?' },
  });

describe('askPersona (A1)', () => {
  it('posts only the conversation, with the CSRF token, to the persona route', async () => {
    const { fetchFn, calls } = answering(200, reply);
    expect(await ask(fetchFn)).toEqual({ ok: true, reply });
    expect(calls[0]!.url).toBe(`/api/classes/${CLASS}/ai/tutor`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ message: 'What is evaporation?' });
    expect((calls[0]!.init.headers as Record<string, string>)[CSRF_HEADER]).toBe('csrf-1');
  });

  it('turns a rate limit into a plain sentence, never a raw 429 (A1-U1)', async () => {
    const { fetchFn } = answering(
      429,
      { error: 'whatever', code: 'rate_limited' },
      { 'retry-after': '42' },
    );
    expect(await ask(fetchFn)).toEqual({
      ok: false,
      message: "You've asked a lot of questions. Try again in a minute.",
      retryAfterSeconds: 42,
    });
    expect(AI_RATE_LIMIT_MESSAGE).toBe("You've asked a lot of questions. Try again in a minute.");
  });

  it('shows a friendly message for a failure, a bad reply or no network', async () => {
    for (const fetchFn of [
      answering(502, { error: 'x', code: 'unavailable' }).fetchFn,
      answering(200, { nope: true }).fetchFn,
      (async () => {
        throw new TypeError('offline');
      }) as unknown as typeof fetch,
    ]) {
      expect(await ask(fetchFn)).toEqual({
        ok: false,
        message: AI_UNAVAILABLE_MESSAGE,
        retryAfterSeconds: null,
      });
    }
  });
});
