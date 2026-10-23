import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { json } from './client.js';
import { asApp, freshDatabase, hasDatabase, type TestDatabase } from './test/harness.js';
import { embedding, seedOrg, testUlid, type SeededOrg } from './test/seed.js';

// F4-P2 and F4-P3. Seeds 1,000,000 events and 10,000 chunks (IDEAMAP_PERF_EVENTS
// and IDEAMAP_PERF_CHUNKS change that), then checks the hot paths use indexes.

const EVENTS = Number(process.env.IDEAMAP_PERF_EVENTS ?? 1_000_000);
const CHUNKS = Number(process.env.IDEAMAP_PERF_CHUNKS ?? 10_000);
const STUDENTS = 1_000;
const CURRICULA = 50;
const VERSIONS_PER_CURRICULUM = 4;
const CLASSES = 2_000;
const PER_STUDENT = Math.ceil(EVENTS / STUDENTS);

async function plan(t: TestDatabase, orgId: string, query: ReturnType<typeof sql>) {
  const rows = await asApp(t.db, orgId, (trx) =>
    sql<{ 'QUERY PLAN': string }>`EXPLAIN ${query}`.execute(trx),
  );
  const text = rows.rows.map((r) => r['QUERY PLAN']).join('\n');
  if (process.env.IDEAMAP_PERF_VERBOSE) console.log(text);
  return text;
}

describe.skipIf(!hasDatabase)('performance', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  let studentId: string;
  let classId: string;
  let curriculumId: string;

  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'perf');
    const org = sql.lit(a.orgId);
    const teacher = sql.lit(a.teacherId);

    // Curricula with versions, classes pinned to their first version, students.
    await sql`
      INSERT INTO curriculum (org_id, title) SELECT ${org}, 'Curriculum ' || n FROM generate_series(1, ${sql.lit(CURRICULA)}) n
    `.execute(t.db);
    await sql`
      INSERT INTO curriculum_version (org_id, curriculum_id, number, status, pack, source, published_at)
      SELECT ${org}, c.id, v, 'published', '{}', '{}', now()
      FROM curriculum c CROSS JOIN generate_series(1, ${sql.lit(VERSIONS_PER_CURRICULUM)}) v
      WHERE c.id <> ${sql.lit(a.curriculumId)}
    `.execute(t.db);
    await sql`
      INSERT INTO class (org_id, curriculum_id, pinned_version_id, teacher_id, name)
      SELECT ${org}, v.curriculum_id, v.id, ${teacher}, 'Class ' || n
      FROM generate_series(1, ${sql.lit(CLASSES)}) n
      JOIN LATERAL (
        SELECT id, curriculum_id FROM curriculum_version WHERE number = 1
        ORDER BY id OFFSET (n % ${sql.lit(CURRICULA - 1)}) LIMIT 1
      ) v ON true
    `.execute(t.db);
    await sql`
      INSERT INTO app_user (org_id, role, name)
      SELECT ${org}, 'student', 'Student ' || n FROM generate_series(1, ${sql.lit(STUDENTS)}) n
    `.execute(t.db);

    // Events: each student gets a run of seq numbers in the seeded class.
    await sql`
      INSERT INTO interaction_event (id, org_id, student_id, class_id, version_id, seq, at, type, payload)
      SELECT
        lpad(upper(to_hex(s.rn)), 10, '0') || lpad(upper(to_hex(g)), 16, '0'),
        ${org}, s.id, ${sql.lit(a.classId)}, ${sql.lit(a.publishedId)}, g, now(), 'idea.opened', '{}'
      FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM app_user WHERE role = 'student' AND name LIKE 'Student %' AND name <> 'Student perf') s
      CROSS JOIN generate_series(1, ${sql.lit(PER_STUDENT)}) g
    `.execute(t.db);

    // Chunks across the curricula's library documents.
    await sql`
      INSERT INTO library_doc (org_id, curriculum_id, title, file_url)
      SELECT ${org}, id, 'Doc', 'doc.pdf' FROM curriculum WHERE id <> ${sql.lit(a.curriculumId)}
    `.execute(t.db);
    await sql`
      INSERT INTO chunk (org_id, curriculum_id, library_doc_id, ordinal, content, embedding)
      SELECT ${org}, d.curriculum_id, d.id, n, 'Passage ' || n,
        (SELECT array_agg(sin(n * 31 + i) / 10)::vector FROM generate_series(0, 1023) i)
      FROM library_doc d
      CROSS JOIN generate_series(1, ${sql.lit(Math.ceil(CHUNKS / (CURRICULA - 1)))}) n
      WHERE d.curriculum_id <> ${sql.lit(a.curriculumId)}
    `.execute(t.db);
    await sql`ANALYZE`.execute(t.db);

    const sample = await sql<{ student_id: string; class_id: string; curriculum_id: string }>`
      SELECT e.student_id, c.id AS class_id, c.curriculum_id
      FROM interaction_event_key e, class c WHERE c.name = 'Class 7' LIMIT 1
    `.execute(t.db);
    ({ student_id: studentId, class_id: classId, curriculum_id: curriculumId } = sample.rows[0]!);
  }, 600_000);

  afterAll(async () => {
    await t?.drop();
  });

  it(`seeds ${EVENTS.toLocaleString('en')} events and ${CHUNKS.toLocaleString('en')} chunks`, async () => {
    const { rows } = await sql<{ events: number; chunks: number }>`
      SELECT (SELECT count(*) FROM interaction_event)::int AS events, (SELECT count(*) FROM chunk)::int AS chunks
    `.execute(t.db);
    expect(rows[0]!.events).toBeGreaterThanOrEqual(EVENTS);
    expect(rows[0]!.chunks).toBeGreaterThanOrEqual(CHUNKS);
  });

  it('reads events for a student after a seq by index (F4-P2)', async () => {
    const text = await plan(
      t,
      a.orgId,
      sql`SELECT * FROM interaction_event WHERE student_id = ${sql.lit(studentId)} AND seq > ${sql.lit(Math.floor(PER_STUDENT / 2))} ORDER BY seq`,
    );
    expect(text).toMatch(/Index Scan|Index Only Scan|Bitmap Index Scan/);
    // Every partition holding events is read by index. For a small result the planner
    // may still "scan" next month's empty, analyzed partition: zero pages, zero cost.
    const seqScanned = [...text.matchAll(/Seq Scan on (\w+)/g)].map((m) => m[1]!);
    for (const partition of seqScanned) {
      const { rows } = await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM ${sql.table(partition)}
      `.execute(t.db);
      expect(rows[0]!.n, `${partition} is sequentially scanned but has rows`).toBe(0);
    }
  });

  it("reads a class's pinned version by index (F4-P2)", async () => {
    const text = await plan(
      t,
      a.orgId,
      sql`SELECT v.* FROM class c JOIN curriculum_version v ON v.id = c.pinned_version_id WHERE c.id = ${sql.lit(classId)}`,
    );
    expect(text).not.toContain('Seq Scan');
  });

  it("lists a curriculum's versions by index (F4-P2)", async () => {
    const text = await plan(
      t,
      a.orgId,
      sql`SELECT id, number, status FROM curriculum_version WHERE curriculum_id = ${sql.lit(curriculumId)} ORDER BY number DESC`,
    );
    expect(text).not.toContain('Seq Scan');
  });

  it("searches a curriculum's chunks by vector with an index (F4-P2)", async () => {
    const text = await plan(
      t,
      a.orgId,
      sql`SELECT id FROM chunk WHERE curriculum_id = ${sql.lit(curriculumId)} ORDER BY embedding <=> ${sql.lit(embedding(5))}::vector LIMIT 10`,
    );
    expect(text).not.toContain('Seq Scan');
  });

  it('inserts 100,000 events in batches of 500 at over 5,000 rows a second (F4-P3)', async () => {
    const batches = 200;
    const started = performance.now();
    for (let b = 0; b < batches; b++) {
      const rows = Array.from({ length: 500 }, (_, i) => ({
        id: testUlid(),
        org_id: a.orgId,
        student_id: a.studentId,
        class_id: a.classId,
        version_id: a.publishedId,
        seq: 1_000 + b * 500 + i,
        at: new Date(),
        type: 'quiz.answered',
        payload: json({ choice: i % 4, correct: i % 3 === 0, ms: 1200 }),
      }));
      await asApp(t.db, a.orgId, (trx) =>
        trx.insertInto('interaction_event').values(rows).execute(),
      );
    }
    const seconds = (performance.now() - started) / 1000;
    const rate = 100_000 / seconds;
    console.log(`event inserts: ${Math.round(rate).toLocaleString('en')} rows/s`);
    expect(rate).toBeGreaterThan(5_000);
  });
});
