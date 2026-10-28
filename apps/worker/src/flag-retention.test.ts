import { RETENTION_ROLE, json, type Db } from '@ideamap/db';
import {
  freshDatabase,
  hasDatabase,
  seedOrg,
  type SeededOrg,
  type TestDatabase,
} from '@ideamap/db/testing';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runRetention } from './retention.js';

// A2-S4 (D32): a safety flag is deleted with its transcript at the district's AI
// retention period, or once it has been resolved for the district's early-deletion
// window (default 30 days, read at run time), whichever comes first.

const ago = (days: number) => sql<Date>`now() - make_interval(days => ${days})`;

/** A transcript `age` days old with a flag; resolved `resolved` days ago, if given. */
async function seedFlag(
  db: Db,
  org: SeededOrg,
  tag: string,
  age: number,
  resolved: number | null = null,
): Promise<void> {
  const interaction = await db
    .insertInto('ai_interaction')
    .values({
      org_id: org.orgId,
      class_id: org.classId,
      user_id: org.studentId,
      persona: 'tutor',
      model: tag,
      request: json({ messages: [] }),
      created_at: ago(age),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await db
    .insertInto('safety_flag')
    .values({
      org_id: org.orgId,
      class_id: org.classId,
      interaction_id: interaction.id,
      category: 'self_harm',
      notify_teacher: true,
      notify_admin: true,
      created_at: ago(age),
      ...(resolved === null
        ? {}
        : { status: 'resolved', resolved_at: ago(resolved), resolved_by: org.teacherId }),
    })
    .execute();
}

/** Tags of the flags (by their transcript's model) still there. */
async function flagsLeft(db: Db, orgId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('safety_flag as f')
    .innerJoin('ai_interaction as i', 'i.id', 'f.interaction_id')
    .select('i.model')
    .where('f.org_id', '=', orgId)
    .where('i.model', 'like', 'f-%')
    .execute();
  return rows.map((r) => r.model).sort();
}
async function transcriptsLeft(db: Db, orgId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('ai_interaction')
    .select('model')
    .where('org_id', '=', orgId)
    .where('model', 'like', 'f-%')
    .execute();
  return rows.map((r) => r.model).sort();
}

describe.skipIf(!hasDatabase)('safety flag retention (A2-S4, D32)', () => {
  let t: TestDatabase;
  let retention: Db;
  let a: SeededOrg;
  let b: SeededOrg;
  let c: SeededOrg;
  let d: SeededOrg;
  let e: SeededOrg;
  let result: Awaited<ReturnType<typeof runRetention>>;

  const setOrg = (
    org: SeededOrg,
    values: { ai_retention_days?: number; flag_resolved_retention_days?: number },
  ) => t.db.updateTable('organization').set(values).where('id', '=', org.orgId).execute();

  beforeAll(async () => {
    t = await freshDatabase();
    [a, b, c, d, e] = [
      await seedOrg(t.db, 'a'),
      await seedOrg(t.db, 'b'),
      await seedOrg(t.db, 'c'),
      await seedOrg(t.db, 'd'),
      await seedOrg(t.db, 'e'),
    ];
    // B keeps transcripts 20 days; C's window is 7 days, D's 60; E keeps the default.
    await setOrg(b, { ai_retention_days: 20 });
    await setOrg(c, { flag_resolved_retention_days: 7 });
    await setOrg(d, { flag_resolved_retention_days: 60 });

    // Org A, defaults (transcripts 90 days, window 30). Unresolved flags follow their
    // transcript: 29, 31, 89, 91.
    for (const age of [29, 31, 89, 91]) await seedFlag(t.db, a, `f-open-${age}`, age);
    // Resolved flags, 29 and 31 days ago, on a recent transcript.
    await seedFlag(t.db, a, 'f-resolved-29', 5, 29);
    await seedFlag(t.db, a, 'f-resolved-31', 5, 31);
    // Whichever comes first: resolved 31 days ago on a 40-day-old transcript (flag goes,
    // transcript stays), and resolved 5 days ago on a 91-day-old transcript (both go).
    await seedFlag(t.db, a, 'f-first-flag', 40, 31);
    await seedFlag(t.db, a, 'f-first-transcript', 91, 5);
    // Org B, transcripts 20 days: the district's shorter period wins over the window.
    await seedFlag(t.db, b, 'f-b-open-19', 19);
    await seedFlag(t.db, b, 'f-b-open-21', 21);
    await seedFlag(t.db, b, 'f-b-resolved-29', 5, 29);
    // Org C, window 7 days.
    await seedFlag(t.db, c, 'f-c-resolved-6', 2, 6);
    await seedFlag(t.db, c, 'f-c-resolved-8', 2, 8);
    await seedFlag(t.db, c, 'f-c-open-8', 8);
    // Org D, window 60 days: a flag resolved 31 days ago stays.
    await seedFlag(t.db, d, 'f-d-resolved-31', 5, 31);
    await seedFlag(t.db, d, 'f-d-resolved-59', 5, 59);
    await seedFlag(t.db, d, 'f-d-resolved-61', 5, 61);
    // Org E, default window; changed later.
    await seedFlag(t.db, e, 'f-e-resolved-20', 5, 20);

    retention = await t.loginAs(RETENTION_ROLE);
    result = await runRetention(retention, { batchSize: 2 });
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('deletes an unresolved flag with its transcript at the district period (days 89 and 91)', async () => {
    const left = await flagsLeft(t.db, a.orgId);
    expect(left).toContain('f-open-89');
    expect(left).not.toContain('f-open-91');
    expect(await transcriptsLeft(t.db, a.orgId)).not.toContain('f-open-91');
  });

  it('keeps an unresolved flag at days 29 and 31 (the window counts from resolution)', async () => {
    expect(await flagsLeft(t.db, a.orgId)).toEqual(
      expect.arrayContaining(['f-open-29', 'f-open-31']),
    );
  });

  it('deletes a resolved flag past the default window (days 29 and 31)', async () => {
    const left = await flagsLeft(t.db, a.orgId);
    expect(left).toContain('f-resolved-29');
    expect(left).not.toContain('f-resolved-31');
    // Its transcript is on the district's schedule, not the flag's.
    expect(await transcriptsLeft(t.db, a.orgId)).toContain('f-resolved-31');
  });

  it('applies whichever comes first', async () => {
    expect(await flagsLeft(t.db, a.orgId)).not.toContain('f-first-flag');
    expect(await transcriptsLeft(t.db, a.orgId)).toContain('f-first-flag');
    expect(await flagsLeft(t.db, a.orgId)).not.toContain('f-first-transcript');
    expect(await transcriptsLeft(t.db, a.orgId)).not.toContain('f-first-transcript');
  });

  it("keeps exactly org A's flags it should", async () => {
    expect(await flagsLeft(t.db, a.orgId)).toEqual(
      ['f-open-29', 'f-open-31', 'f-open-89', 'f-resolved-29'].sort(),
    );
  });

  it("follows another district's shorter transcript period", async () => {
    expect(await flagsLeft(t.db, b.orgId)).toEqual(['f-b-open-19', 'f-b-resolved-29']);
  });

  it('follows a district window of 7 days', async () => {
    // Resolved 8 days ago is gone; resolved 6 stays; an unresolved one is not touched.
    expect(await flagsLeft(t.db, c.orgId)).toEqual(['f-c-open-8', 'f-c-resolved-6']);
  });

  it('follows a district window of 60 days', async () => {
    expect(await flagsLeft(t.db, d.orgId)).toEqual(['f-d-resolved-31', 'f-d-resolved-59']);
  });

  it('counts only flags deleted by their window, and a rerun deletes nothing', async () => {
    // A: resolved-31 and first-flag. C: resolved-8. D: resolved-61. B and E: none.
    expect(result.safety_flag).toBe(4);
    const again = await runRetention(retention);
    expect(again).toMatchObject({ safety_flag: 0, ai_interaction: 0, aborted: false });
  });

  it('applies a changed window to flags that were already resolved', async () => {
    expect(await flagsLeft(t.db, e.orgId)).toEqual(['f-e-resolved-20']);
    await setOrg(e, { flag_resolved_retention_days: 10 });
    const next = await runRetention(retention);
    expect(next.safety_flag).toBe(1);
    expect(await flagsLeft(t.db, e.orgId)).toEqual([]);
    // And a longer window brings nothing back, but spares flags not yet due.
    await setOrg(c, { flag_resolved_retention_days: 365 });
    expect((await runRetention(retention)).safety_flag).toBe(0);
    expect(await flagsLeft(t.db, c.orgId)).toEqual(['f-c-open-8', 'f-c-resolved-6']);
  });

  it('refuses a window outside 1 to 3650 days', async () => {
    for (const days of [0, -1, 3651]) {
      await expect(setOrg(a, { flag_resolved_retention_days: days })).rejects.toThrow(
        /flag_resolved_retention_days|check/i,
      );
    }
  });

  it("lets the retention role see no unresolved flag and no flag's text or people", async () => {
    const visible = await retention
      .selectFrom('safety_flag' as never)
      .select(['id', 'org_id', 'status', 'resolved_at'] as never)
      .execute();
    expect(visible).toEqual([]);
    await expect(
      retention
        .selectFrom('safety_flag' as never)
        .select(['category'] as never)
        .execute(),
    ).rejects.toThrow(/permission denied/);
  });
});
