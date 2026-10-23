import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { json } from './client.js';
import { validDerived } from './test/derived.js';
import { errorCode, freshDatabase, hasDatabase, PG, type TestDatabase } from './test/harness.js';
import {
  SOURCE,
  embedding,
  seedOrg,
  testUlid,
  waterCyclePack,
  type SeededOrg,
} from './test/seed.js';

// F4-F2 and F4-F3: keys, references and version status are enforced by the database.

describe.skipIf(!hasDatabase)('keys and references (F4-F2)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  let b: SeededOrg;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
    b = await seedOrg(t.db, 'b');
  });
  afterAll(async () => {
    await t?.drop();
  });

  const missing = randomUUID();

  // One row per table that breaks a reference: to a parent that doesn't exist, and to
  // a parent in another organization.
  const cases: [string, () => string][] = [
    [
      'app_user → organization',
      () => `INSERT INTO app_user (org_id, role, name) VALUES ('${missing}', 'student', 'X')`,
    ],
    [
      'curriculum → organization',
      () => `INSERT INTO curriculum (org_id, title) VALUES ('${missing}', 'X')`,
    ],
    [
      'curriculum → creator in another org',
      () =>
        `INSERT INTO curriculum (org_id, title, created_by) VALUES ('${a.orgId}', 'X', '${b.teacherId}')`,
    ],
    [
      'curriculum_version → curriculum',
      () =>
        `INSERT INTO curriculum_version (org_id, curriculum_id, number, pack, source) VALUES ('${a.orgId}', '${missing}', 9, '{}', '{}')`,
    ],
    [
      'curriculum_version → curriculum in another org',
      () =>
        `INSERT INTO curriculum_version (org_id, curriculum_id, number, pack, source) VALUES ('${a.orgId}', '${b.curriculumId}', 9, '{}', '{}')`,
    ],
    [
      'curriculum_defaults → curriculum',
      () =>
        `INSERT INTO curriculum_defaults (org_id, curriculum_id) VALUES ('${a.orgId}', '${missing}')`,
    ],
    [
      'approved_explanation → approver in another org',
      () =>
        `INSERT INTO approved_explanation (org_id, curriculum_id, idea_id, text, source, approved_by) VALUES ('${a.orgId}', '${a.curriculumId}', 'cloud', 'T', 'ai', '${b.teacherId}')`,
    ],
    [
      'library_doc → curriculum',
      () =>
        `INSERT INTO library_doc (org_id, curriculum_id, title, file_url) VALUES ('${a.orgId}', '${missing}', 'T', 'x.pdf')`,
    ],
    [
      'chunk → library_doc',
      () =>
        `INSERT INTO chunk (org_id, curriculum_id, library_doc_id, ordinal, content, embedding) VALUES ('${a.orgId}', '${a.curriculumId}', '${missing}', 5, 'c', '${embedding(2)}')`,
    ],
    [
      'chunk → library_doc of another curriculum',
      () =>
        `INSERT INTO chunk (org_id, curriculum_id, library_doc_id, ordinal, content, embedding) VALUES ('${a.orgId}', '${missing}', '${a.libraryDocId}', 5, 'c', '${embedding(2)}')`,
    ],
    [
      'class → curriculum',
      () =>
        `INSERT INTO class (org_id, curriculum_id, teacher_id, name) VALUES ('${a.orgId}', '${missing}', '${a.teacherId}', 'C')`,
    ],
    [
      'class → teacher in another org',
      () =>
        `INSERT INTO class (org_id, curriculum_id, teacher_id, name) VALUES ('${a.orgId}', '${a.curriculumId}', '${b.teacherId}', 'C')`,
    ],
    [
      'class → version of another curriculum',
      () =>
        `INSERT INTO class (org_id, curriculum_id, pinned_version_id, teacher_id, name) VALUES ('${a.orgId}', '${a.curriculumId}', '${b.publishedId}', '${a.teacherId}', 'C')`,
    ],
    [
      'class_config → class',
      () => `INSERT INTO class_config (org_id, class_id) VALUES ('${a.orgId}', '${missing}')`,
    ],
    [
      'enrollment → student in another org',
      () =>
        `INSERT INTO enrollment (org_id, class_id, student_id) VALUES ('${a.orgId}', '${a.classId}', '${b.studentId}')`,
    ],
    [
      'class_library_setting → shared doc of another curriculum',
      () =>
        `INSERT INTO class_library_setting (org_id, class_id, curriculum_id, library_doc_id, use_for) VALUES ('${a.orgId}', '${a.classId}', '${a.curriculumId}', '${b.libraryDocId}', 'off')`,
    ],
    [
      "class_library_setting → curriculum that isn't the class's",
      () =>
        `INSERT INTO class_library_setting (org_id, class_id, curriculum_id, library_doc_id, use_for) VALUES ('${a.orgId}', '${a.classId}', '${b.curriculumId}', '${b.libraryDocId}', 'off')`,
    ],
    [
      'class_library_doc → class in another org',
      () =>
        `INSERT INTO class_library_doc (org_id, class_id, title, file_url) VALUES ('${a.orgId}', '${b.classId}', 'T', 'up.pdf')`,
    ],
    [
      'class_chunk → upload of another class',
      () =>
        `INSERT INTO class_chunk (org_id, class_id, class_library_doc_id, ordinal, content, embedding) VALUES ('${a.orgId}', '${missing}', '${a.classLibraryDocId}', 5, 'c', '${embedding(2)}')`,
    ],
    [
      'interaction_event → class',
      () =>
        `INSERT INTO interaction_event (id, org_id, student_id, class_id, version_id, seq, at, type) VALUES ('${testUlid()}', '${a.orgId}', '${a.studentId}', '${missing}', '${a.publishedId}', 100, now(), 'x.y')`,
    ],
    [
      'interaction_event → student in another org',
      () =>
        `INSERT INTO interaction_event (id, org_id, student_id, class_id, version_id, seq, at, type) VALUES ('${testUlid()}', '${a.orgId}', '${b.studentId}', '${a.classId}', '${a.publishedId}', 100, now(), 'x.y')`,
    ],
    [
      'interaction_event → version',
      () =>
        `INSERT INTO interaction_event (id, org_id, student_id, class_id, version_id, seq, at, type) VALUES ('${testUlid()}', '${a.orgId}', '${a.studentId}', '${a.classId}', '${missing}', 100, now(), 'x.y')`,
    ],
    [
      'interaction_text → class',
      () =>
        `INSERT INTO interaction_text (org_id, class_id, student_id, kind, body) VALUES ('${a.orgId}', '${missing}', '${a.studentId}', 'chat', 'b')`,
    ],
    [
      'generated_map_view → version in another org',
      () =>
        `INSERT INTO generated_map_view (org_id, class_id, student_id, version_id, generator, view) VALUES ('${a.orgId}', '${a.classId}', '${a.studentId}', '${b.publishedId}', 'g', '{}')`,
    ],
    [
      'ai_output → class',
      () =>
        `INSERT INTO ai_output (org_id, class_id, kind, content) VALUES ('${a.orgId}', '${missing}', 'k', '{}')`,
    ],
    [
      'progress_snapshot → student',
      () =>
        `INSERT INTO progress_snapshot (org_id, class_id, student_id, rules_version, state, last_seq) VALUES ('${a.orgId}', '${a.classId}', '${missing}', 'r', '{}', 0)`,
    ],
    [
      'import_job → version of another curriculum',
      () =>
        `INSERT INTO import_job (org_id, curriculum_id, source, version_id) VALUES ('${a.orgId}', '${a.curriculumId}', '{}', '${b.draftId}')`,
    ],
    [
      'export_job → class',
      () =>
        `INSERT INTO export_job (org_id, kind, class_id) VALUES ('${a.orgId}', 'class_progress', '${missing}')`,
    ],
    [
      'audit_event → actor in another org',
      () =>
        `INSERT INTO audit_event (org_id, actor_id, action, target_type) VALUES ('${a.orgId}', '${b.teacherId}', 'a', 't')`,
    ],
    [
      'ai_interaction → user',
      () =>
        `INSERT INTO ai_interaction (org_id, user_id, persona, model, request) VALUES ('${a.orgId}', '${missing}', 'tutor', 'm', '{}')`,
    ],
  ];

  it.each(cases)('rejects a broken reference: %s', async (_name, statement) => {
    expect(await errorCode(() => sql.raw(statement()).execute(t.db))).toBe(PG.foreignKey);
  });

  it("accepts a class's use_for settings for shared documents, including off, and nothing else (D11)", async () => {
    const set = (useFor: string) =>
      sql`
        UPDATE class_library_setting SET use_for = ${useFor}
        WHERE class_id = ${a.classId} AND library_doc_id = ${a.libraryDocId}
      `.execute(t.db);
    for (const useFor of ['agent', 'tutor', 'both', 'off']) {
      expect(await errorCode(() => set(useFor)), useFor).toBeNull();
    }
    expect(await errorCode(() => set('hidden'))).toBe(PG.check);
    // Off is a class setting only; a shared document or an upload can't be off.
    expect(
      await errorCode(() =>
        sql`UPDATE class_library_doc SET use_for = 'off' WHERE id = ${a.classLibraryDocId}`.execute(
          t.db,
        ),
      ),
    ).toBe(PG.check);
  });

  it('rejects a duplicate (curriculum_id, number)', async () => {
    const code = await errorCode(() =>
      t.db
        .insertInto('curriculum_version')
        .values({
          org_id: a.orgId,
          curriculum_id: a.curriculumId,
          number: 1,
          pack: json(waterCyclePack()),
          source: json(SOURCE),
        })
        .execute(),
    );
    expect(code).toBe(PG.unique);
  });

  it('rejects deleting a parent that is still referenced', async () => {
    expect(
      await errorCode(() => t.db.deleteFrom('app_user').where('id', '=', a.teacherId).execute()),
    ).toBe(PG.foreignKey);
  });
});

describe.skipIf(!hasDatabase)('version status (F4-F3)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
  });
  afterAll(async () => {
    await t?.drop();
  });

  let next = 10;
  async function insertVersion(status: string, publishedAt: Date | null) {
    return sql`
      INSERT INTO curriculum_version (org_id, curriculum_id, number, status, pack, source, published_at)
      VALUES (${a.orgId}, ${a.curriculumId}, ${next++}, ${status}, '{}', '{}', ${publishedAt})
      RETURNING id
    `.execute(t.db);
  }

  it('accepts draft, published and archived, and nothing else', async () => {
    expect(await errorCode(() => insertVersion('draft', null))).toBeNull();
    expect(await errorCode(() => insertVersion('published', new Date()))).toBeNull();
    expect(await errorCode(() => insertVersion('archived', new Date()))).toBeNull();
    expect(await errorCode(() => insertVersion('other', new Date()))).toBe(PG.check);
    expect(await errorCode(() => insertVersion('other', null))).toBe(PG.check);
    // Only drafts lack a publish time, as in the contract.
    expect(await errorCode(() => insertVersion('published', null))).toBe(PG.check);
    expect(await errorCode(() => insertVersion('draft', new Date()))).toBe(PG.check);
  });

  it("refuses to change a published version's body", async () => {
    for (const set of [
      `pack = '{"version": 1}'`,
      `derived = '{}'`,
      `issues = '[{}]'`,
      `source = '{}'`,
      `number = 99`,
      `published_at = now() - interval '1 day'`,
    ]) {
      const code = await errorCode(() =>
        sql.raw(`UPDATE curriculum_version SET ${set} WHERE id = '${a.publishedId}'`).execute(t.db),
      );
      expect(code, set).toBe(PG.insufficientPrivilege);
    }
  });

  it('lets a draft be re-derived, then published, archived and re-published', async () => {
    const draft = () => t.db.updateTable('curriculum_version').where('id', '=', a.draftId);
    expect(
      await errorCode(() =>
        draft()
          .set({ derived: json(validDerived()) })
          .execute(),
      ),
    ).toBeNull();
    expect(
      await errorCode(() =>
        draft().set({ status: 'published', published_at: new Date() }).execute(),
      ),
    ).toBeNull();
    expect(await errorCode(() => draft().set({ status: 'archived' }).execute())).toBeNull();
    expect(await errorCode(() => draft().set({ status: 'published' }).execute())).toBeNull();
    // Never back to draft, and never deleted once published.
    expect(
      await errorCode(() => draft().set({ status: 'draft', published_at: null }).execute()),
    ).not.toBeNull();
    expect(
      await errorCode(() =>
        t.db.deleteFrom('curriculum_version').where('id', '=', a.draftId).execute(),
      ),
    ).toBe(PG.insufficientPrivilege);
  });

  it('refuses to pin a class to a draft (D2)', async () => {
    const { rows } = await insertVersion('draft', null);
    const draftId = (rows[0] as { id: string }).id;
    const code = await errorCode(() =>
      t.db
        .updateTable('class')
        .set({ pinned_version_id: draftId })
        .where('id', '=', a.classId)
        .execute(),
    );
    expect(code).toBe(PG.check);
  });
});
