import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshDatabase, hasDatabase } from '@ideamap/db/testing';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { buildServer, startServer } from './index.js';

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

describe.skipIf(!hasDatabase)('the deployed API (T2-F8)', () => {
  it('wires C4’s imports and the session authenticator into the bootstrap', async () => {
    const t = await freshDatabase();
    const uploads = await mkdtemp(join(tmpdir(), 'ideamap-uploads-'));
    const server = await startServer(
      {
        IDEAMAP_APP_ORIGINS: 'https://teacher.ideamap.test',
        IDEAMAP_SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
        DATABASE_URL: t.url,
        UPLOAD_DIR: uploads,
      },
      { logger: false },
    );
    try {
      await server.app.ready();
      const routes = server.app.routePolicies.map((r) => `${r.method} ${r.url}`);
      expect(routes).toEqual(
        expect.arrayContaining([
          'POST /api/curricula/:curriculumId/imports',
          'GET /api/curricula/:curriculumId/imports/latest',
          'GET /api/imports/:jobId',
        ]),
      );
      // Signed out: the session authenticator answers before the body is read.
      const res = await server.app.inject({
        method: 'GET',
        url: '/api/curricula/00000000-0000-4000-8000-000000000000/imports/latest',
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await server.close();
      await rm(uploads, { recursive: true, force: true });
      await t.drop();
    }
  });

  it('needs an upload directory', async () => {
    await expect(
      startServer({
        IDEAMAP_APP_ORIGINS: 'https://teacher.ideamap.test',
        IDEAMAP_SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
        DATABASE_URL: 'postgres://unused',
      }),
    ).rejects.toThrow(/UPLOAD_DIR/);
  });
});
