import {
  ClassConfigSchema,
  CurriculumVersionSchema,
  ExplanationOverrideSchema,
  VERSION_STATUSES,
  type CurriculumVersion,
} from '@ideamap/contracts';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { json } from './client.js';
import { COLUMNS, type Database } from './schema.js';
import { freshDatabase, hasDatabase, type TestDatabase } from './test/harness.js';
import { SOURCE, seedOrg, waterCyclePack } from './test/seed.js';
import type { Selectable } from 'kysely';

// F4-F9: the typed layer in schema.ts matches the live schema, and rows round-trip
// through the @ideamap/contracts schemas.

function toContract(row: Selectable<Database['curriculum_version']>): CurriculumVersion {
  return CurriculumVersionSchema.parse({
    id: row.id,
    curriculum_id: row.curriculum_id,
    number: row.number,
    status: row.status,
    pack: row.pack,
    derived: row.derived,
    issues: row.issues,
    source: row.source,
    created_at: row.created_at.toISOString(),
    published_at: row.published_at?.toISOString() ?? null,
  });
}

describe.skipIf(!hasDatabase)('typed access (F4-F9)', () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await freshDatabase();
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('lists exactly the columns of every table, in order', async () => {
    const { rows } = await sql<{ table_name: string; columns: string[] }>`
      SELECT table_name, array_agg(column_name::text ORDER BY ordinal_position) AS columns
      FROM information_schema.columns WHERE table_schema = 'public'
      GROUP BY table_name
    `.execute(t.db);
    const live = Object.fromEntries(rows.map((r) => [r.table_name, r.columns]));
    for (const [table, columns] of Object.entries(COLUMNS)) {
      expect(live[table], table).toEqual(columns);
    }
  });

  it('stores contract jsonb in jsonb columns and ids as uuid', async () => {
    const { rows } = await sql<{ column_name: string; data_type: string; is_nullable: string }>`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'curriculum_version' ORDER BY ordinal_position
    `.execute(t.db);
    expect(rows.map((r) => [r.column_name, r.data_type, r.is_nullable])).toEqual([
      ['id', 'uuid', 'NO'],
      ['org_id', 'uuid', 'NO'],
      ['curriculum_id', 'uuid', 'NO'],
      ['number', 'integer', 'NO'],
      ['status', 'text', 'NO'],
      ['pack', 'jsonb', 'NO'],
      ['derived', 'jsonb', 'YES'],
      ['issues', 'jsonb', 'NO'],
      ['source', 'jsonb', 'NO'],
      ['created_by', 'uuid', 'YES'],
      ['created_at', 'timestamp with time zone', 'NO'],
      ['published_at', 'timestamp with time zone', 'YES'],
    ]);
  });

  it('accepts exactly the contract version statuses', async () => {
    const { rows } = await sql<{ def: string }>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'curriculum_version'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status = ANY%'
    `.execute(t.db);
    for (const status of VERSION_STATUSES) expect(rows[0]!.def).toContain(`'${status}'`);
  });

  it('round-trips a CurriculumVersion through the contract', async () => {
    const seeded = await seedOrg(t.db, 'typed');
    const pack = waterCyclePack();
    const inserted = await t.db
      .insertInto('curriculum_version')
      .values({
        org_id: seeded.orgId,
        curriculum_id: seeded.curriculumId,
        number: 3,
        pack: json(pack),
        derived: json({
          ranked_links: { max_links: 3, kept: [], hidden: [] },
          layout: {
            centre: 'rain',
            rank: ['rain'],
            positions: [{ idea_id: 'rain', ring: 0, angle: null, x: 0, y: 0 }],
          },
          quizzes: { seed: 1, quiz_length: 5, banks: [] },
        }),
        issues: json([
          {
            severity: 'warning',
            effect: 'none',
            tab: 'Ideas',
            row: 4,
            column: 'media_url',
            value: null,
            fallback: null,
            message: 'No media.',
          },
        ]),
        source: json(SOURCE),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const version = toContract(inserted);
    expect(version.pack).toEqual(pack);
    expect(version.status).toBe('draft');
    expect(version.issues).toHaveLength(1);
    expect(typeof inserted.number).toBe('number');
  });

  it('round-trips ClassConfig and an approved explanation', async () => {
    const seeded = await seedOrg(t.db, 'config');
    const config = ClassConfigSchema.parse({
      course: { pass_mark: 75, framework: null },
      units: [{ unit: 1, due_date: '2026-11-30' }],
      ideas: [{ idea_id: 'rain', rarity: 'Rare' }],
    });
    await t.db
      .updateTable('class_config')
      .set({ config: json(config) })
      .where('class_id', '=', seeded.classId)
      .execute();
    const row = await t.db
      .selectFrom('class_config')
      .select('config')
      .where('class_id', '=', seeded.classId)
      .executeTakeFirstOrThrow();
    expect(ClassConfigSchema.parse(row.config)).toEqual(config);

    const explanation = await t.db
      .selectFrom('approved_explanation')
      .selectAll()
      .where('curriculum_id', '=', seeded.curriculumId)
      .executeTakeFirstOrThrow();
    expect(
      ExplanationOverrideSchema.parse({
        text: explanation.text,
        source: explanation.source,
        approvedBy: explanation.approved_by,
        approvedAt: explanation.approved_at.toISOString(),
      }).source,
    ).toBe('ai');
  });

  it('reads bigint sequence numbers as numbers', async () => {
    const row = await t.db
      .selectFrom('interaction_event')
      .select(['seq'])
      .orderBy('seq', 'desc')
      .executeTakeFirstOrThrow();
    expect(row.seq).toBe(2);
  });
});
