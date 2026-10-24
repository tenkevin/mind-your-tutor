import { readFileSync } from 'node:fs';
import { hasDatabase } from '@ideamap/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, signIn, startApi, type Signed, type TestApi } from './test/harness.js';

// F5-F8: OneRoster CSV import creates users, classes and enrolments in the right org.

const fixture = (name: string) =>
  readFileSync(new URL(`../../../fixtures/oneroster/${name}`, import.meta.url), 'utf8');

describe.skipIf(!hasDatabase)('OneRoster import (F5-F8)', () => {
  let api: TestApi;
  let admin: Signed;
  beforeAll(async () => {
    api = await startApi();
    admin = await signIn(api, 'google', 'admin-a');
  });
  afterAll(async () => {
    await api?.close();
  });

  const body = () => ({
    curriculumId: api.sample.curricula.a,
    users: fixture('users.csv'),
    classes: fixture('classes.csv'),
    enrollments: fixture('enrollments.csv'),
  });
  const counts = async () => {
    const n = (table: 'app_user' | 'class' | 'enrollment') =>
      api.t.db
        .selectFrom(table)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('org_id', '=', api.sample.orgs.a)
        .executeTakeFirstOrThrow()
        .then((r) => Number(r.n));
    return {
      users: await n('app_user'),
      classes: await n('class'),
      enrollments: await n('enrollment'),
    };
  };

  it('creates users, classes and enrolments in the admin’s org, once', async () => {
    const before = await counts();
    const first = await as(api, admin)('POST', '/api/roster/import', body());
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({
      users: { created: 5, updated: 0 },
      classes: { created: 2, updated: 0 },
      enrollments: { created: 3 },
    });
    expect(await counts()).toEqual({
      users: before.users + 5,
      classes: before.classes + 2,
      enrollments: before.enrollments + 3,
    });

    const again = await as(api, admin)('POST', '/api/roster/import', body());
    expect(again.json()).toMatchObject({
      users: { created: 0, updated: 0 },
      classes: { created: 0, updated: 0 },
      enrollments: { created: 0 },
    });
    expect(await counts()).toEqual({
      users: before.users + 5,
      classes: before.classes + 2,
      enrollments: before.enrollments + 3,
    });

    const imported = await api.t.db
      .selectFrom('app_user')
      .select(['org_id', 'role', 'name', 'email', 'roster_source_id'])
      .where('roster_source_id', 'in', ['t-101', 's-201'])
      .orderBy('roster_source_id')
      .execute();
    expect(imported).toEqual([
      {
        org_id: api.sample.orgs.a,
        role: 'student',
        name: 'Dee Student',
        email: null,
        roster_source_id: 's-201',
      },
      {
        org_id: api.sample.orgs.a,
        role: 'teacher',
        name: 'Ben Teacher',
        email: 'ben.teacher@example.org',
        roster_source_id: 't-101',
      },
    ]);
    // Nothing reached org B.
    expect(
      await api.t.db
        .selectFrom('app_user')
        .select('id')
        .where('org_id', '=', api.sample.orgs.b)
        .where('roster_source_id', 'like', 's-%')
        .execute(),
    ).toEqual([]);
    // The import is audited.
    const audit = await api.t.db
      .selectFrom('audit_event')
      .select(['actor_id', 'action'])
      .where('action', '=', 'roster.import')
      .execute();
    expect(audit).toEqual([
      { actor_id: admin.userId, action: 'roster.import' },
      { actor_id: admin.userId, action: 'roster.import' },
    ]);
  });

  it('refuses a teacher', async () => {
    const teacher = await signIn(api, 'google', 'teacher-a1');
    expect((await as(api, teacher)('POST', '/api/roster/import', body())).statusCode).toBe(403);
  });

  it('answers 400 to a malformed file, with the reason', async () => {
    const res = await as(api, admin)('POST', '/api/roster/import', {
      ...body(),
      classes: 'title\nx\n',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'classes.csv has no sourcedId column.' });
  });
});
