import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { buildServer } from './index.js';

const config = loadConfig({
  IDEAMAP_APP_ORIGINS: 'https://teacher.ideamap.test',
  IDEAMAP_SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
});

describe('@ideamap/api', () => {
  it('answers the health check', async () => {
    const app = buildServer({ db: undefined as never, config });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it('answers unknown routes with a fixed 404 body', async () => {
    const app = buildServer({ db: undefined as never, config });
    const res = await app.inject({ method: 'GET', url: '/nope-23240?q=<x>' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Not found' });
    expect(res.body).not.toContain('nope');
    await app.close();
  });

  it('lists no providers until they are configured', async () => {
    const app = buildServer({ db: undefined as never, config });
    const res = await app.inject({ method: 'GET', url: '/auth/providers' });
    expect(res.json()).toEqual({ providers: [] });
    expect((await app.inject({ method: 'GET', url: '/auth/google/start' })).statusCode).toBe(404);
    await app.close();
  });
});
