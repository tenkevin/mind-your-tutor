import { describe, expect, it } from 'vitest';
import { buildServer } from './index.js';

describe('@ideamap/api', () => {
  it('answers the health check', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});
