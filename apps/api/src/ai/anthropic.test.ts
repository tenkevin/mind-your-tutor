import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anthropicProvider } from './anthropic.js';
import { loadAiConfig } from './config.js';
import { ModelError } from './provider.js';

// The Claude adapter against a local stand-in for the Messages API: no key, no network.

interface Seen {
  headers: IncomingMessage['headers'];
  body: Record<string, unknown>;
}

let server: Server;
let baseURL = '';
const seen: Seen[] = [];
let answer: (res: import('node:http').ServerResponse) => void = () => {};

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => {
      seen.push({ headers: req.headers, body: JSON.parse(raw) as Record<string, unknown> });
      answer(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const message = (extra: Record<string, unknown> = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text: 'Water evaporates.' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 50, output_tokens: 4 },
  ...extra,
});

const request = () => ({
  model: 'claude-opus-5-5',
  system: 'You are Ms. Ivy.',
  messages: [{ role: 'user' as const, content: 'Hi, I am Person A.' }],
  user: 'u_pseudonym',
  maxTokens: 500,
  signal: new AbortController().signal,
});

describe('anthropicProvider', () => {
  it('sends the filled prompt, the conversation and only a pseudonymous user id', async () => {
    answer = (res) =>
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(message()));
    seen.length = 0;
    const provider = anthropicProvider({ apiKey: 'sk-test-key', fallbacks: true, baseURL });
    expect(await provider.complete(request())).toEqual({
      text: 'Water evaporates.',
      inputTokens: 50,
      outputTokens: 4,
      model: 'claude-opus-5-5',
    });
    const { headers, body } = seen[0]!;
    expect(headers['x-api-key']).toBe('sk-test-key');
    expect(headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 500,
      system: 'You are Ms. Ivy.',
      messages: [{ role: 'user', content: 'Hi, I am Person A.' }],
      metadata: { user_id: 'u_pseudonym' },
      fallbacks: 'default',
    });
  });

  it('leaves the fallback out when it is turned off', async () => {
    seen.length = 0;
    const provider = anthropicProvider({ apiKey: 'k', fallbacks: false, baseURL });
    await provider.complete(request());
    expect(seen[0]!.body.fallbacks).toBeUndefined();
    expect(seen[0]!.headers['anthropic-beta']).toBeUndefined();
  });

  it('maps errors and refusals to failures without the provider message', async () => {
    const provider = anthropicProvider({ apiKey: 'k', fallbacks: false, baseURL });
    answer = (res) =>
      res
        .writeHead(500, { 'content-type': 'application/json' })
        .end(
          JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'secret detail' } }),
        );
    const failed = await provider.complete(request()).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(ModelError);
    expect(failed).toMatchObject({ failure: 'provider_error', message: 'provider status 500' });

    answer = (res) =>
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify(message({ stop_reason: 'refusal', content: [] })));
    await expect(provider.complete(request())).rejects.toMatchObject({ failure: 'refused' });

    answer = () => {}; // never answers
    const controller = new AbortController();
    const pending = provider.complete({ ...request(), signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toMatchObject({ failure: 'timeout' });
  });
});

describe('loadAiConfig', () => {
  it('reads the key and limits from the environment, with defaults', () => {
    expect(loadAiConfig({})).toEqual({
      apiKey: null,
      model: 'claude-opus-5-5',
      fallbacks: true,
      maxTokens: 2000,
      timeoutMs: 30_000,
      limits: { perStudent: 10, perClass: 120, windowMs: 60_000 },
    });
    expect(
      loadAiConfig({
        IDEAMAP_AI_API_KEY: 'sk-x',
        IDEAMAP_AI_MODEL: 'claude-haiku-5-5',
        IDEAMAP_AI_FALLBACKS: 'off',
        IDEAMAP_AI_STUDENT_PER_MINUTE: '4',
        IDEAMAP_AI_CLASS_PER_MINUTE: '40',
      }),
    ).toMatchObject({
      apiKey: 'sk-x',
      model: 'claude-haiku-5-5',
      fallbacks: false,
      limits: { perStudent: 4, perClass: 40 },
    });
  });

  it('refuses limits that are not whole positive numbers', () => {
    for (const bad of ['0', '-1', '1.5', 'many']) {
      expect(() => loadAiConfig({ IDEAMAP_AI_STUDENT_PER_MINUTE: bad })).toThrow(/whole number/);
    }
    expect(() => loadAiConfig({ IDEAMAP_AI_MODEL: 'a b' })).toThrow(/model id/);
  });
});
