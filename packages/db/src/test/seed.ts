import { readFileSync } from 'node:fs';
import { parsePack, type ClassConfig, type Pack, type VersionSource } from '@ideamap/contracts';
import { json, toVector, type Db } from '../client.js';
import { EMBEDDING_DIMENSIONS } from '../migrations/0006_library.js';

// Test data: clearly fake names and example.org addresses, nothing real.

export function waterCyclePack(): Pack {
  const raw: unknown = JSON.parse(
    readFileSync(new URL('../../../../fixtures/water-cycle/pack.json', import.meta.url), 'utf8'),
  );
  const result = parsePack(raw);
  if (!result.value) throw new Error('fixtures/water-cycle/pack.json did not parse');
  return result.value;
}

export const SOURCE: VersionSource = {
  kind: 'json',
  file_ref: 'uploads/test/pack.json',
  file_name: 'pack.json',
  checksum: 'a'.repeat(64),
  column_mapping: [],
};

let ulidCounter = 0;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A ULID-shaped id, unique within the test run. */
export function testUlid(): string {
  let n = ++ulidCounter;
  let out = '';
  for (let i = 0; i < 26; i++) {
    out = CROCKFORD[n % 32]! + out;
    n = Math.floor(n / 32);
  }
  return out;
}

export function embedding(seed: number): string {
  return toVector(
    Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => Math.sin(seed * 31 + i) / 10),
  );
}

export interface SeededOrg {
  orgId: string;
  teacherId: string;
  studentId: string;
  curriculumId: string;
  draftId: string;
  publishedId: string;
  classId: string;
  libraryDocId: string;
  classLibraryDocId: string;
  textId: string;
}

/**
 * One organization with a row in every tenant table. Runs as the connection's own
 * role (the migration role in tests), which bypasses row-level security.
 */
export async function seedOrg(db: Db, label: string): Promise<SeededOrg> {
  const pack = waterCyclePack();
  const org = await db
    .insertInto('organization')
    .values({ name: `Test District ${label}` })
    .returning('id')
    .executeTakeFirstOrThrow();
  const orgId = org.id;

  const [teacher, student] = await db
    .insertInto('app_user')
    .values([
      {
        org_id: orgId,
        role: 'teacher',
        name: `Teacher ${label}`,
        email: `teacher-${label}@example.org`.toLowerCase(),
      },
      {
        org_id: orgId,
        role: 'student',
        name: `Student ${label}`,
        sso_provider: 'google',
        sso_subject: `test-${label}-${orgId}`,
        roster_source_id: `roster-${label}`,
      },
    ])
    .returning('id')
    .execute();
  const teacherId = teacher!.id;
  const studentId = student!.id;

  const curriculum = await db
    .insertInto('curriculum')
    .values({ org_id: orgId, title: `Water cycle ${label}`, created_by: teacherId })
    .returning('id')
    .executeTakeFirstOrThrow();
  const curriculumId = curriculum.id;

  const published = await db
    .insertInto('curriculum_version')
    .values({
      org_id: orgId,
      curriculum_id: curriculumId,
      number: 1,
      status: 'published',
      pack: json(pack),
      source: json(SOURCE),
      published_at: new Date(),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const draft = await db
    .insertInto('curriculum_version')
    .values({
      org_id: orgId,
      curriculum_id: curriculumId,
      number: 2,
      pack: json(pack),
      source: json(SOURCE),
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  await db
    .insertInto('curriculum_defaults')
    .values({
      org_id: orgId,
      curriculum_id: curriculumId,
      config: json<ClassConfig>({ course: { grade: '5' } }),
    })
    .execute();
  await db
    .insertInto('approved_explanation')
    .values({
      org_id: orgId,
      curriculum_id: curriculumId,
      idea_id: 'rain',
      text: 'Water falls from clouds.',
      source: 'ai',
      approved_by: teacherId,
    })
    .execute();

  const doc = await db
    .insertInto('library_doc')
    .values({
      org_id: orgId,
      curriculum_id: curriculumId,
      title: 'Water cycle notes',
      file_url: 'notes.pdf',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await db
    .insertInto('chunk')
    .values({
      org_id: orgId,
      curriculum_id: curriculumId,
      library_doc_id: doc.id,
      ordinal: 0,
      content: 'Evaporation turns water into vapour.',
      embedding: embedding(1),
    })
    .execute();

  const klass = await db
    .insertInto('class')
    .values({
      org_id: orgId,
      curriculum_id: curriculumId,
      pinned_version_id: published.id,
      teacher_id: teacherId,
      name: `Class ${label}`,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const classId = klass.id;

  await db
    .insertInto('class_config')
    .values({ org_id: orgId, class_id: classId, config: json({ course: { pass_mark: 80 } }) })
    .execute();
  await db
    .insertInto('enrollment')
    .values({ org_id: orgId, class_id: classId, student_id: studentId })
    .execute();

  // D11: the class hides the shared document and adds an upload of its own.
  await db
    .insertInto('class_library_setting')
    .values({
      org_id: orgId,
      class_id: classId,
      curriculum_id: curriculumId,
      library_doc_id: doc.id,
      use_for: 'off',
      updated_by: teacherId,
    })
    .execute();
  const upload = await db
    .insertInto('class_library_doc')
    .values({
      org_id: orgId,
      class_id: classId,
      title: 'Lab sheet',
      file_url: 'lab-sheet.pdf',
      use_for: 'tutor',
      uploaded_by: teacherId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await db
    .insertInto('class_chunk')
    .values({
      org_id: orgId,
      class_id: classId,
      class_library_doc_id: upload.id,
      ordinal: 0,
      content: 'Fill the jar and mark the water line.',
      embedding: embedding(3),
    })
    .execute();

  const text = await db
    .insertInto('interaction_text')
    .values({
      org_id: orgId,
      class_id: classId,
      student_id: studentId,
      kind: 'chat',
      body: 'Why does rain fall?',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  const base = {
    org_id: orgId,
    class_id: classId,
    student_id: studentId,
    version_id: published.id,
  };
  await db
    .insertInto('interaction_event')
    .values([
      { ...base, id: testUlid(), seq: 1, at: new Date(), type: 'session.started' },
      {
        ...base,
        id: testUlid(),
        seq: 2,
        at: new Date(),
        type: 'chat.turn',
        payload: json({ persona: 'tutor', text_ref: text.id }),
      },
    ])
    .execute();
  await db
    .insertInto('generated_map_view')
    .values({ ...base, generator: 'test', view: json({ centre: 'rain' }) })
    .execute();
  await db
    .insertInto('ai_output')
    .values({ ...base, persona: 'tutor', kind: 'explanation', content: json({ text: 'Rain.' }) })
    .execute();
  await db
    .insertInto('progress_snapshot')
    .values({
      org_id: orgId,
      class_id: classId,
      student_id: studentId,
      rules_version: 'test-1',
      state: json({}),
      last_seq: 2,
    })
    .execute();

  await db
    .insertInto('import_job')
    .values({
      org_id: orgId,
      curriculum_id: curriculumId,
      status: 'succeeded',
      source: json(SOURCE),
      version_id: draft.id,
      created_by: teacherId,
    })
    .execute();
  await db
    .insertInto('export_job')
    .values({ org_id: orgId, kind: 'class_progress', class_id: classId, created_by: teacherId })
    .execute();
  await db
    .insertInto('audit_event')
    .values({
      org_id: orgId,
      actor_id: teacherId,
      action: 'version.published',
      target_type: 'curriculum_version',
      target_id: published.id,
    })
    .execute();
  await db
    .insertInto('ai_interaction')
    .values({
      org_id: orgId,
      class_id: classId,
      user_id: studentId,
      persona: 'tutor',
      model: 'test-model',
      request: json({ messages: [] }),
    })
    .execute();

  return {
    orgId,
    teacherId,
    studentId,
    curriculumId,
    draftId: draft.id,
    publishedId: published.id,
    classId,
    libraryDocId: doc.id,
    classLibraryDocId: upload.id,
    textId: text.id,
  };
}
