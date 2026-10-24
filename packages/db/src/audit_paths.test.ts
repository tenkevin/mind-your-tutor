import type { ClassConfig } from '@ideamap/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { actAs, json, withOrg, type Db } from './client.js';
import { APP_ROLE } from './migrations/helpers.js';
import { freshDatabase, hasDatabase, type TestDatabase } from './test/harness.js';
import { seedOrg, type SeededOrg } from './test/seed.js';

// 0016's field-level audit paths (T3), and the 0015 guarantees they must keep: secrets
// redacted at any depth (F6-S2; T3 QA run 1, found during testing 1), every change
// recorded, and one row per save.

describe.skipIf(!hasDatabase)('audit field paths (0016)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  let app: Db;

  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'paths');
    app = await t.loginAs(APP_ROLE);
  });
  afterAll(async () => {
    await t?.drop();
  });

  // Each test starts from an empty config, as the owner (whose writes these tests ignore).
  beforeEach(async () => {
    await t.db
      .updateTable('class_config')
      .set({ config: json<ClassConfig>({}) })
      .where('class_id', '=', a.classId)
      .execute();
  });

  /** Set the class config as the teacher; return the audit rows the change wrote. */
  async function save(config: unknown) {
    const since = new Date();
    await withOrg(app, a.orgId, async (trx) => {
      await actAs(trx, a.teacherId);
      await trx
        .updateTable('class_config')
        .set({ config: json(config as ClassConfig) })
        .where('class_id', '=', a.classId)
        .execute();
    });
    return rowsSince(since);
  }

  async function rowsSince(since: Date) {
    return t.db
      .selectFrom('audit_event')
      .select(['action', 'before', 'after', 'detail'])
      .where('org_id', '=', a.orgId)
      .where('actor_id', '=', a.teacherId)
      .where('at', '>=', since)
      .orderBy('at')
      .orderBy('id')
      .execute();
  }

  it('names each changed leaf', async () => {
    const [row] = await save({ course: { topic: 'Rain', grade: '7' } });
    expect(row).toEqual({
      action: 'class_config.updated',
      before: { 'config.course.grade': null, 'config.course.topic': null },
      after: { 'config.course.grade': '7', 'config.course.topic': 'Rain' },
      detail: { changed: ['config.course.grade', 'config.course.topic'] },
    });
  });

  it.each([
    ['an object under a secret key', { connector: { kind: 'drive', token: { value: 'LEAK-1' } } }],
    ['a top-level secret object', { token: { value: 'LEAK-2', type: 'bearer' } }],
    ['an array under a secret key', { credentials: [{ value: 'LEAK-3' }, 'LEAK-4'] }],
    ['secret keys inside an array', { items: [{ api_key: 'LEAK-5', name: 'x' }] }],
    ['a secret object deep inside plain keys', { a: { b: { client_secret: { x: 'LEAK-6' } } } }],
    ['a secret key holding nested secrets', { password: { password: { password: 'LEAK-7' } } }],
  ])('never writes the value of %s', async (_name, config) => {
    const rows = await save(config);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toMatch(/LEAK/);
  });

  it('keeps a secret object as one redacted path, not its leaves', async () => {
    const [row] = await save({ connector: { kind: 'drive', token: { value: 'LEAK-1' } } });
    expect(row!.detail.changed).toEqual(['config.connector.kind', 'config.connector.token']);
    expect(row!.after).toEqual({
      'config.connector.kind': 'drive',
      'config.connector.token': '[redacted]',
    });
  });

  it('redacts both sides when a value inside a secret object changes', async () => {
    await save({ connector: { token: { value: 'OLD-SECRET' } } });
    const [row] = await save({ connector: { token: { value: 'NEW-SECRET' } } });
    expect(row).toMatchObject({
      before: { 'config.connector.token': '[redacted]' },
      after: { 'config.connector.token': '[redacted]' },
      detail: { changed: ['config.connector.token'] },
    });
    expect(JSON.stringify(row)).not.toMatch(/SECRET/);
  });

  it('records an emptied object going away', async () => {
    await save({ course: {} });
    const [row] = await save({});
    expect(row).toEqual({
      action: 'class_config.updated',
      before: { 'config.course': {} },
      after: { 'config.course': null },
      detail: { changed: ['config.course'] },
    });
  });

  it('records an empty object appearing', async () => {
    const [row] = await save({ course: {} });
    expect(row).toMatchObject({
      before: { 'config.course': null },
      after: { 'config.course': {} },
    });
  });

  it('writes nothing for a save that changes nothing', async () => {
    await save({ course: { topic: 'Rain' } });
    expect(await save({ course: { topic: 'Rain' } })).toEqual([]);
  });

  it('writes no row for an empty config row, and the first save is the one row', async () => {
    const since = new Date();
    await withOrg(app, a.orgId, async (trx) => {
      await actAs(trx, a.teacherId);
      await trx.deleteFrom('class_config').where('class_id', '=', a.classId).execute();
      await trx
        .insertInto('class_config')
        .values({ class_id: a.classId, org_id: a.orgId, config: json<ClassConfig>({}) })
        .execute();
      await trx
        .updateTable('class_config')
        .set({ config: json<ClassConfig>({ course: { topic: 'First' } }) })
        .where('class_id', '=', a.classId)
        .execute();
    });
    // One transaction, so the rows share a time; compare them as a set.
    expect((await rowsSince(since)).map((r) => r.action).sort()).toEqual([
      'class_config.deleted',
      'class_config.updated',
    ]);
  });

  it('still records an insert that holds something, redacted', async () => {
    const since = new Date();
    await withOrg(app, a.orgId, async (trx) => {
      await actAs(trx, a.teacherId);
      await trx.deleteFrom('class_config').where('class_id', '=', a.classId).execute();
      await trx
        .insertInto('class_config')
        .values({
          class_id: a.classId,
          org_id: a.orgId,
          config: json({ course: { topic: 'Kept' }, token: { v: 'LEAK-8' } } as ClassConfig),
        })
        .execute();
    });
    const rows = await rowsSince(since);
    expect(rows.map((r) => r.action).sort()).toEqual([
      'class_config.created',
      'class_config.deleted',
    ]);
    expect(rows.find((r) => r.action === 'class_config.created')!.after).toMatchObject({
      config: { course: { topic: 'Kept' }, token: '[redacted]' },
    });
    expect(JSON.stringify(rows)).not.toMatch(/LEAK/);
  });
});
