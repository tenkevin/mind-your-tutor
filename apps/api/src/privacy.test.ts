import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_ROLE, DirectoryExportStore, type Db } from '@ideamap/db';
import {
  freshDatabase,
  hasDatabase,
  seedOrg,
  type SeededOrg,
  type TestDatabase,
} from '@ideamap/db/testing';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from './index.js';
import type { Authenticate } from './imports.js';

// F6-F7 and F6-S1 over HTTP: only an admin of the student's organization may export
// or delete a student.

/** Test sign-in: the `x-test-caller` header is `orgId:userId`, always claiming admin. */
const testSignIn: Authenticate = async (request) => {
  const header = request.headers['x-test-caller'];
  if (typeof header !== 'string') return null;
  const [orgId, userId] = header.split(':');
  // Every caller claims to be an admin: the routes must read the role from the
  // database instead, so teachers and students are still refused.
  return orgId && userId ? { orgId, userId, role: 'admin' } : null;
};

describe('privacy routes without sign-in', () => {
  it('refuses every call until sign-in exists', async () => {
    const app = buildServer({
      privacy: { db: {} as Db, store: new DirectoryExportStore(tmpdir()) },
    });
    for (const [method, url] of [
      ['POST', '/privacy/students/00000000-0000-4000-8000-000000000000/export'],
      ['DELETE', '/privacy/students/00000000-0000-4000-8000-000000000000'],
    ] as const) {
      const res = await app.inject({ method, url, headers: { 'x-test-caller': 'a:b' } });
      expect(res.statusCode).toBe(401);
    }
    await app.close();
  });
});

describe.skipIf(!hasDatabase)('privacy routes (F6-F7, F6-S1)', () => {
  let t: TestDatabase;
  let app: FastifyInstance;
  let a: SeededOrg & { adminId: string };
  let b: SeededOrg & { adminId: string };
  let dir: string;

  async function withAdmin(db: Db, label: string) {
    const seeded = await seedOrg(db, label);
    const admin = await db
      .insertInto('app_user')
      .values({ org_id: seeded.orgId, role: 'admin', name: `Admin ${label}` })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { ...seeded, adminId: admin.id };
  }

  beforeAll(async () => {
    t = await freshDatabase();
    a = await withAdmin(t.db, 'a');
    b = await withAdmin(t.db, 'b');
    dir = await mkdtemp(join(tmpdir(), 'ideamap-api-exports-'));
    app = buildServer({
      privacy: {
        db: await t.loginAs(APP_ROLE),
        store: new DirectoryExportStore(dir),
        authenticate: testSignIn,
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const call = (method: 'POST' | 'DELETE', caller: string | null, studentId = a.studentId) =>
    app.inject({
      method,
      url:
        method === 'POST'
          ? `/privacy/students/${studentId}/export`
          : `/privacy/students/${studentId}`,
      headers: caller ? { 'x-test-caller': caller } : {},
    });

  it('refuses everyone but an admin of the student’s org', async () => {
    for (const [caller, status] of [
      [null, 401],
      [`${a.orgId}:${a.teacherId}`, 403],
      [`${a.orgId}:${a.studentId}`, 403],
      [`${b.orgId}:${b.adminId}`, 404],
      // Claiming org A while being org B's admin.
      [`${a.orgId}:${b.adminId}`, 403],
    ] as const) {
      for (const method of ['POST', 'DELETE'] as const) {
        const res = await call(method, caller);
        expect(res.statusCode, `${method} as ${caller}`).toBe(status);
        expect(res.body).not.toContain('Student a');
      }
    }
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses ids that are not uuids', async () => {
    const res = await call('POST', `${a.orgId}:${a.adminId}`, '../../etc');
    expect(res.statusCode).toBe(404);
  });

  it('lets the org admin export, then delete', async () => {
    const exported = await call('POST', `${a.orgId}:${a.adminId}`);
    expect(exported.statusCode).toBe(201);
    expect(exported.headers['content-disposition']).toBe(
      `attachment; filename="student-${a.studentId}.json"`,
    );
    expect(exported.json()).toMatchObject({
      format: 'ideamap.student-record',
      student: { id: a.studentId, name: 'Student a' },
    });

    const deleted = await call('DELETE', `${a.orgId}:${a.adminId}`);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ deleted: { interactionText: 1, exportFiles: 1 } });
    expect(await readdir(dir, { recursive: true })).not.toContainEqual(
      expect.stringMatching(/\.json$/),
    );
  });
});
