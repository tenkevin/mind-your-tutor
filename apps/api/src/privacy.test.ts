import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DirectoryExportStore } from '@ideamap/db';
import { hasDatabase } from '@ideamap/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, sessionFor, startApi, type Signed, type TestApi } from './test/harness.js';

// F6-F7 and F6-S1 over HTTP, with real F5 sessions: only an admin of the student's
// organization may export or delete a student.

describe.skipIf(!hasDatabase)('privacy routes (F6-F7, F6-S1)', () => {
  let api: TestApi;
  let dir: string;
  let who: Record<'admin' | 'teacher' | 'student' | 'otherOrgAdmin', Signed>;
  let studentId: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ideamap-api-exports-'));
    api = await startApi({}, { privacy: new DirectoryExportStore(dir) });
    const { users, orgs } = api.sample;
    studentId = users['student-a1'];
    who = {
      admin: await sessionFor(api, users['admin-a'], orgs.a),
      teacher: await sessionFor(api, users['teacher-a1'], orgs.a),
      student: await sessionFor(api, studentId, orgs.a),
      otherOrgAdmin: await sessionFor(api, users['admin-b'], orgs.b),
    };
  });
  afterAll(async () => {
    await api?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const exportUrl = (id: string) => `/api/privacy/students/${id}/export`;
  const deleteUrl = (id: string) => `/api/privacy/students/${id}`;

  it('refuses everyone but an admin of the student’s org', async () => {
    for (const [caller, status] of [
      [null, 401],
      ['teacher', 403],
      ['student', 403],
      ['otherOrgAdmin', 403],
    ] as const) {
      const signed = caller ? who[caller] : null;
      for (const [method, url] of [
        ['POST', exportUrl(studentId)],
        ['DELETE', deleteUrl(studentId)],
      ] as const) {
        const res = await as(api, signed)(method, url);
        expect(res.statusCode, `${caller} ${method} ${url}`).toBe(status);
        expect(res.body).not.toContain('Student');
      }
    }
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses ids that are not a student of the org', async () => {
    expect((await as(api, who.admin)('POST', exportUrl('not-a-uuid'))).statusCode).toBe(403);
    // A user of the org who isn't a student.
    const teacherId = api.sample.users['teacher-a1'];
    expect((await as(api, who.admin)('POST', exportUrl(teacherId))).statusCode).toBe(404);
    // Another org's student is invisible, so it looks like any id the admin can't use.
    const otherStudent = api.sample.users['student-b1'];
    expect((await as(api, who.admin)('DELETE', deleteUrl(otherStudent))).statusCode).toBe(403);
  });

  it('lets the org admin export, then delete, which also signs the student out', async () => {
    const exported = await as(api, who.admin)('POST', exportUrl(studentId));
    expect(exported.statusCode, exported.body).toBe(201);
    expect(exported.headers['content-disposition']).toBe(
      `attachment; filename="student-${studentId}.json"`,
    );
    const record = exported.json<{ student: { id: string }; auth_sessions: unknown[] }>();
    expect(record).toMatchObject({ format: 'ideamap.student-record', student: { id: studentId } });
    expect(record.auth_sessions.length).toBeGreaterThan(0);
    expect(JSON.stringify(record)).not.toContain('token_hash');

    const deleted = await as(api, who.admin)('DELETE', deleteUrl(studentId));
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(deleted.json()).toMatchObject({ deleted: { exportFiles: 1 } });
    expect(deleted.json().deleted.authSessions).toBeGreaterThan(0);

    // The export file is gone, and the student's session no longer works.
    const files = await readdir(dir, { recursive: true });
    for (const f of files.filter((name) => name.endsWith('.json'))) {
      expect(await readFile(join(dir, f), 'utf8')).not.toContain(studentId);
    }
    expect((await as(api, who.student)('GET', '/api/me')).statusCode).toBe(401);
  });
});
