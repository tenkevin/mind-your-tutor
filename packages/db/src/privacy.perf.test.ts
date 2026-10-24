import { ClassConfigSchema, type ClassConfig } from '@ideamap/contracts';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actAs, json, withOrg, type Db } from './client.js';
import { APP_ROLE } from './migrations/helpers.js';
import { freshDatabase, hasDatabase, type TestDatabase } from './test/harness.js';
import { seedOrg, type SeededOrg } from './test/seed.js';

// F6-P2: the audit trigger's cost on a config save. A timing test, so it runs in the
// `perf` project (vitest.config.ts): after the other test files, one file at a time,
// so parallel database tests can't skew it (docs/qa/CXB.md). The bar is unchanged.

interface Org extends SeededOrg {
  adminId: string;
}

async function seedWithAdmin(db: Db, label: string): Promise<Org> {
  const seeded = await seedOrg(db, label);
  const admin = await db
    .insertInto('app_user')
    .values({
      org_id: seeded.orgId,
      role: 'admin',
      name: `Admin ${label}`,
      email: `admin-${label}@example.org`,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { ...seeded, adminId: admin.id };
}

function config(value: ClassConfig) {
  return json(ClassConfigSchema.parse(value));
}

describe.skipIf(!hasDatabase)('audit cost (F6-P2)', () => {
  let t: TestDatabase;
  let a: Org;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedWithAdmin(t.db, 'p');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('adds under 10 ms at p95 to a config save', async () => {
    const app = await t.loginAs(APP_ROLE);
    const save = async (i: number) => {
      const started = performance.now();
      await withOrg(app, a.orgId, async (trx) => {
        await actAs(trx, a.teacherId);
        await trx
          .updateTable('class_config')
          .set({
            config: config({
              course: { pass_mark: 50 + (i % 40) },
              units: [{ unit: 1, due_date: `2026-11-${String(1 + (i % 28)).padStart(2, '0')}` }],
              personas: [{ persona_id: 'tutor', prompt_template: `Prompt ${i} for {name}.` }],
            }),
          })
          .where('class_id', '=', a.classId)
          .execute();
      });
      return performance.now() - started;
    };
    const p95 = async (n: number) => {
      const times: number[] = [];
      for (let i = 0; i < n; i++) times.push(await save(i));
      times.sort((x, y) => x - y);
      return times[Math.floor(n * 0.95)]!;
    };
    await p95(30); // warm up
    const audited = await p95(300);
    await sql`ALTER TABLE class_config DISABLE TRIGGER audit`.execute(t.db);
    const plain = await p95(300);
    await sql`ALTER TABLE class_config ENABLE TRIGGER audit`.execute(t.db);
    if (process.env.IDEAMAP_PERF_VERBOSE) console.log({ audited, plain });
    expect(audited - plain).toBeLessThan(10);
  });
});
