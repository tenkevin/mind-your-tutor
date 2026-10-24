import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClassConfigSchema, type ClassConfig } from '@ideamap/contracts';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actAs, json, withOrg, type Db } from './client.js';
import { DirectoryExportStore, type ExportStore } from './export-store.js';
import { SECRET_KEY_PATTERN } from './migrations/0015_privacy.js';
import { APP_ROLE, RETENTION_ROLE } from './migrations/helpers.js';
import {
  classHistory,
  deleteStudent,
  exportStudent,
  isSecretKey,
  PrivacyError,
  RECORD_OMITS,
  recordExportSubjects,
  redactSecrets,
  REMOVED_STUDENT_NAME,
  REMOVED_TEXT,
  resolveTexts,
  writeAudit,
  type StudentRecord,
} from './privacy.js';
import { errorCode, freshDatabase, hasDatabase, PG, type TestDatabase } from './test/harness.js';
import { seedOrg, testUlid, type SeededOrg } from './test/seed.js';

// F6: audit writes (F6-F5, F6-F6, F6-S2, F6-P2, F6-U2), retention settings (F6-F2) and
// FERPA export and delete (F6-F7, F6-S1, F6-S3). The retention job itself is tested in
// apps/worker.

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

/** A signed-in session for `userId` (F5's auth_session), as sign-in would store it. */
async function addSession(db: Db, orgId: string, userId: string): Promise<void> {
  const now = Date.now();
  await db
    .insertInto('auth_session')
    .values({
      org_id: orgId,
      user_id: userId,
      token_hash: randomBytes(32),
      provider: 'google',
      created_at: new Date(now - 60_000),
      last_seen_at: new Date(now),
      expires_at: new Date(now + 3_600_000),
    })
    .execute();
}

async function latestAudit(db: Db, orgId: string, action: string) {
  return db
    .selectFrom('audit_event')
    .selectAll()
    .where('org_id', '=', orgId)
    .where('action', '=', action)
    .orderBy('at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst();
}

function config(value: ClassConfig) {
  return json(ClassConfigSchema.parse(value));
}

describe.skipIf(!hasDatabase)('audit log (F6-F5, F6-F6, F6-S2, F6-U2)', () => {
  let t: TestDatabase;
  let app: Db;
  let a: Org;
  let b: Org;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedWithAdmin(t.db, 'a');
    b = await seedWithAdmin(t.db, 'b');
    app = await t.loginAs(APP_ROLE);
  });
  afterAll(async () => {
    await t?.drop();
  });

  /** As the app, acting for org A and its teacher. */
  const asTeacher = <T>(fn: Parameters<typeof withOrg<T>>[2]) =>
    withOrg(app, a.orgId, async (trx) => {
      await actAs(trx, a.teacherId);
      return fn(trx);
    });

  it('records a due date change with actor, org, target, before, after and time', async () => {
    const started = new Date();
    await asTeacher((trx) =>
      trx
        .updateTable('class_config')
        .set({
          config: config({
            course: { pass_mark: 80 },
            units: [{ unit: 1, due_date: '2026-11-30' }],
          }),
        })
        .where('class_id', '=', a.classId)
        .execute(),
    );
    const row = await latestAudit(t.db, a.orgId, 'class_config.updated');
    expect(row).toMatchObject({
      org_id: a.orgId,
      actor_id: a.teacherId,
      target_type: 'class_config',
      target_id: a.classId,
      class_id: a.classId,
      before: { 'config.units': null },
      after: { 'config.units': [{ unit: 1, due_date: '2026-11-30' }] },
      detail: { changed: ['config.units'] },
    });
    expect(row!.at.getTime()).toBeGreaterThanOrEqual(started.getTime() - 1000);
  });

  it('records persona prompt and rarity overrides as separate fields', async () => {
    await asTeacher((trx) =>
      trx
        .updateTable('class_config')
        .set({
          config: config({
            course: { pass_mark: 80 },
            units: [{ unit: 1, due_date: '2026-11-30' }],
            ideas: [{ idea_id: 'rain', rarity: 'Rare' }],
            personas: [{ persona_id: 'tutor', prompt_template: 'You are {name}, kind and calm.' }],
          }),
        })
        .where('class_id', '=', a.classId)
        .execute(),
    );
    const row = await latestAudit(t.db, a.orgId, 'class_config.updated');
    expect(row!.detail.changed).toEqual(['config.ideas', 'config.personas']);
    expect(row!.after).toEqual({
      'config.ideas': [{ idea_id: 'rain', rarity: 'Rare' }],
      'config.personas': [
        { persona_id: 'tutor', prompt_template: 'You are {name}, kind and calm.' },
      ],
    });
  });

  it('records curriculum-level persona changes', async () => {
    await asTeacher((trx) =>
      trx
        .updateTable('curriculum_defaults')
        .set({
          config: config({
            course: { grade: '5' },
            personas: [{ persona_id: 'peer', prompt_template: 'You are {name}, a curious peer.' }],
          }),
        })
        .where('curriculum_id', '=', a.curriculumId)
        .execute(),
    );
    const row = await latestAudit(t.db, a.orgId, 'curriculum_defaults.updated');
    expect(row).toMatchObject({
      actor_id: a.teacherId,
      target_id: a.curriculumId,
      curriculum_id: a.curriculumId,
      detail: { changed: ['config.personas'] },
    });
  });

  it("records a class's library setting change (D11)", async () => {
    const doc = await t.db
      .selectFrom('library_doc')
      .select('id')
      .where('curriculum_id', '=', a.curriculumId)
      .executeTakeFirstOrThrow();
    // Settings are class-scoped (F4b): act inside the class.
    await asTeacher(async (trx) => {
      await sql`SELECT set_config('app.class_id', ${a.classId}, true)`.execute(trx);
      return trx
        .updateTable('class_library_setting')
        .set({ use_for: 'tutor', updated_by: a.teacherId })
        .where('class_id', '=', a.classId)
        .execute();
    });
    const row = await latestAudit(t.db, a.orgId, 'library_setting.changed');
    expect(row).toMatchObject({
      actor_id: a.teacherId,
      target_type: 'library_setting',
      target_id: doc.id,
      class_id: a.classId,
      before: { use_for: 'off' },
      after: { use_for: 'tutor' },
      detail: { changed: ['use_for'], key: { library_doc_id: doc.id } },
    });
  });

  it('records a class upload being added (D11)', async () => {
    await withOrg(app, a.orgId, async (trx) => {
      await actAs(trx, a.teacherId);
      await sql`SELECT set_config('app.class_id', ${a.classId}, true)`.execute(trx);
      await trx
        .insertInto('class_library_doc')
        .values({
          org_id: a.orgId,
          class_id: a.classId,
          title: 'Rain gauge worksheet',
          file_url: 'rain-gauge.pdf',
          use_for: 'both',
          uploaded_by: a.teacherId,
        })
        .execute();
    });
    const row = await latestAudit(t.db, a.orgId, 'class_library_doc.added');
    expect(row).toMatchObject({ actor_id: a.teacherId, class_id: a.classId, before: null });
    expect(row!.after).toMatchObject({ title: 'Rain gauge worksheet', use_for: 'both' });
  });

  it('records a D9 explanation approval', async () => {
    await asTeacher((trx) =>
      trx
        .insertInto('approved_explanation')
        .values({
          org_id: a.orgId,
          curriculum_id: a.curriculumId,
          idea_id: 'evaporation',
          text: 'Heat turns liquid water into vapour.',
          source: 'ai',
          approved_by: a.teacherId,
        })
        .execute(),
    );
    const row = await latestAudit(t.db, a.orgId, 'explanation.approved');
    expect(row).toMatchObject({
      actor_id: a.teacherId,
      target_type: 'explanation',
      target_id: a.curriculumId,
      curriculum_id: a.curriculumId,
      detail: { key: { idea_id: 'evaporation' } },
    });
    expect(row!.after).toMatchObject({ text: 'Heat turns liquid water into vapour.' });
  });

  it('records a publish, and pinning the class to it', async () => {
    await asTeacher(async (trx) => {
      await trx
        .updateTable('curriculum_version')
        .set({ status: 'published', published_at: new Date() })
        .where('id', '=', a.draftId)
        .execute();
      await trx
        .updateTable('class')
        .set({ pinned_version_id: a.draftId })
        .where('id', '=', a.classId)
        .execute();
    });
    expect(await latestAudit(t.db, a.orgId, 'version.published')).toMatchObject({
      actor_id: a.teacherId,
      target_type: 'curriculum_version',
      target_id: a.draftId,
      curriculum_id: a.curriculumId,
      before: { status: 'draft' },
      after: { status: 'published' },
    });
    expect(await latestAudit(t.db, a.orgId, 'class.updated')).toMatchObject({
      actor_id: a.teacherId,
      target_id: a.classId,
      before: { pinned_version_id: a.publishedId },
      after: { pinned_version_id: a.draftId },
    });
  });

  it('records retention setting changes (F6-F2)', async () => {
    await withOrg(app, a.orgId, async (trx) => {
      await actAs(trx, a.adminId);
      await trx
        .updateTable('organization')
        .set({ text_retention_days: 30 })
        .where('id', '=', a.orgId)
        .execute();
    });
    expect(await latestAudit(t.db, a.orgId, 'organization.updated')).toMatchObject({
      actor_id: a.adminId,
      before: { text_retention_days: 90 },
      after: { text_retention_days: 30 },
    });
  });

  it('writes nothing when nothing audited changed', async () => {
    const count = async () =>
      (
        await t.db
          .selectFrom('audit_event')
          .select(sql<number>`count(*)::int`.as('n'))
          .executeTakeFirstOrThrow()
      ).n;
    const before = await count();
    await asTeacher((trx) =>
      trx
        .updateTable('class_library_doc')
        .set({ index_status: 'indexed', indexed_at: new Date() })
        .where('class_id', '=', a.classId)
        .execute(),
    );
    await asTeacher((trx) =>
      trx.updateTable('class').set({ name: `Class a` }).where('id', '=', a.classId).execute(),
    );
    expect(await count()).toBe(before);
  });

  it('refuses an actor from another organization', async () => {
    const code = await errorCode(() =>
      withOrg(app, a.orgId, async (trx) => {
        await actAs(trx, b.teacherId);
        await trx
          .updateTable('class')
          .set({ name: 'Renamed' })
          .where('id', '=', a.classId)
          .execute();
      }),
    );
    expect(code).toBe(PG.foreignKey);
  });

  it('is append-only for the app role, and refuses TRUNCATE for everyone (F6-F6)', async () => {
    for (const statement of [
      sql`UPDATE audit_event SET action = 'tampered'`,
      sql`DELETE FROM audit_event`,
      sql`TRUNCATE audit_event`,
    ]) {
      const code = await errorCode(() => withOrg(app, a.orgId, (trx) => statement.execute(trx)));
      expect(code).toBe(PG.insufficientPrivilege);
    }
    // Even the owner: the triggers refuse every role.
    for (const statement of [
      sql`UPDATE audit_event SET action = 'tampered'`,
      sql`DELETE FROM audit_event`,
      sql`TRUNCATE audit_event`,
    ]) {
      expect(await errorCode(() => statement.execute(t.db))).toBe(PG.insufficientPrivilege);
    }
  });

  it('logs a secret setting as changed with its value redacted (F6-S2)', async () => {
    await withOrg(app, a.orgId, async (trx) => {
      await actAs(trx, a.adminId);
      await trx
        .updateTable('class_config')
        .set({
          config: json({
            course: { pass_mark: 80 },
            connector: { kind: 'drive', client_secret: 'live-secret-123', apiKey: 'sk-abc' },
          } as unknown as ClassConfig),
        })
        .where('class_id', '=', a.classId)
        .execute();
    });
    const row = await latestAudit(t.db, a.orgId, 'class_config.updated');
    expect(JSON.stringify(row)).not.toMatch(/live-secret-123|sk-abc/);
    expect(row!.detail.changed).toContain('config.connector');
    expect(row!.after!['config.connector']).toEqual({
      kind: 'drive',
      client_secret: '[redacted]',
      apiKey: '[redacted]',
    });

    await withOrg(app, a.orgId, async (trx) => {
      await actAs(trx, a.adminId);
      await writeAudit(trx, a.orgId, {
        action: 'connector.updated',
        targetType: 'connector',
        before: { password: 'old-pass' },
        after: { password: 'new-pass', nested: [{ access_token: 'tok-1' }] },
      });
    });
    const written = await latestAudit(t.db, a.orgId, 'connector.updated');
    expect(written).toMatchObject({
      actor_id: a.adminId,
      before: { password: '[redacted]' },
      after: { password: '[redacted]', nested: [{ access_token: '[redacted]' }] },
    });
  });

  it('redacts the same keys in SQL and TypeScript', async () => {
    const sample = {
      password: 1,
      Secret_Key: 2,
      api_key: 3,
      apikey: 4,
      private_key: 5,
      refresh_token: 6,
      token: 7,
      credentials: 8,
      input_tokens: 9,
      tone: 10,
      prompt_template: 11,
      keys: [{ bearer: 12 }],
    };
    const { rows } = await sql<{
      v: unknown;
    }>`SELECT app.redact_secrets(${JSON.stringify(sample)}::jsonb) AS v`.execute(t.db);
    expect(rows[0]!.v).toEqual(redactSecrets(sample));
    expect(redactSecrets(sample)).toMatchObject({ input_tokens: 9, tone: 10, prompt_template: 11 });
    expect(new RegExp(SECRET_KEY_PATTERN, 'i').test('password')).toBe(true);
  });

  it("lists a class's history for Teacher Settings (F6-U2)", async () => {
    const history = await withOrg(app, a.orgId, (trx) => classHistory(trx, a.classId));
    const actions = history.map((h) => h.action);
    for (const action of [
      'class_config.updated',
      'library_setting.changed',
      'class_library_doc.added',
      'explanation.approved',
      'version.published',
      'curriculum_defaults.updated',
    ]) {
      expect(actions).toContain(action);
    }
    const due = history.findLast((h) => h.changed.includes('config.units'))!;
    expect(due).toMatchObject({ actorName: 'Teacher a', actorId: a.teacherId });
    expect(history.map((h) => h.at.getTime())).toEqual(
      [...history.map((h) => h.at.getTime())].sort((x, y) => y - x),
    );
    // Org B's changes never appear, and B sees none of A's.
    expect(await withOrg(app, b.orgId, (trx) => classHistory(trx, a.classId))).toEqual([]);
  });
});

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

describe.skipIf(!hasDatabase)('student export and delete (F6-F7, F6-S1, F6-S3)', () => {
  let t: TestDatabase;
  let app: Db;
  let a: Org;
  let b: Org;
  let dir: string;
  let store: DirectoryExportStore;
  const email = 'student-a@example.org';

  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedWithAdmin(t.db, 'a');
    b = await seedWithAdmin(t.db, 'b');
    await t.db.updateTable('app_user').set({ email }).where('id', '=', a.studentId).execute();
    await addSession(t.db, a.orgId, a.studentId);
    await t.db
      .insertInto('ai_interaction')
      .values({
        org_id: a.orgId,
        class_id: a.classId,
        user_id: a.studentId,
        persona: 'tutor',
        model: 'test-model',
        request: json({ messages: [{ role: 'user', content: 'Why does rain fall?' }] }),
        response: json({ content: 'Clouds get heavy.' }),
      })
      .execute();
    app = await t.loginAs(APP_ROLE);
    dir = await mkdtemp(join(tmpdir(), 'ideamap-exports-'));
    store = new DirectoryExportStore(dir);
  });
  afterAll(async () => {
    await t?.drop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const request = (actorId: string, orgId = a.orgId) => ({
    orgId,
    actorId,
    studentId: a.studentId,
  });

  it('refuses a teacher, a student and an admin of another org (F6-S1)', async () => {
    for (const [req, code] of [
      [request(a.teacherId), 'forbidden'],
      [request(a.studentId), 'forbidden'],
      // B's admin acting for B can't see A's student...
      [request(b.adminId, b.orgId), 'not_found'],
      // ...and can't act for A at all.
      [request(b.adminId, a.orgId), 'forbidden'],
    ] as const) {
      for (const run of [exportStudent, deleteStudent]) {
        const error = await run(app, req, store).catch((e: unknown) => e);
        expect(error, `${run.name} ${JSON.stringify(req)}`).toBeInstanceOf(PrivacyError);
        expect((error as PrivacyError).code).toBe(code);
      }
    }
    // Nothing was written or removed.
    expect(await readdir(dir)).toEqual([]);
    const name = await t.db
      .selectFrom('app_user')
      .select('name')
      .where('id', '=', a.studentId)
      .executeTakeFirstOrThrow();
    expect(name.name).toBe('Student a');
  });

  it("exports all of a student's records as one readable JSON file", async () => {
    const result = await exportStudent(app, request(a.adminId), store);
    const file = await readFile(join(dir, result.ref), 'utf8');
    expect(file).toBe(result.body);
    const record = JSON.parse(file) as StudentRecord;
    expect(record).toMatchObject({
      format: 'ideamap.student-record',
      org_id: a.orgId,
      student: { id: a.studentId, name: 'Student a', email },
    });
    expect(record.enrollments).toHaveLength(1);
    expect(record.interaction_events).toHaveLength(2);
    expect(record.interaction_text).toMatchObject([{ body: 'Why does rain fall?' }]);
    expect(record.generated_map_views).toHaveLength(1);
    expect(record.ai_outputs).toHaveLength(1);
    expect(record.ai_interactions).toHaveLength(2);
    expect(record.progress_snapshots).toHaveLength(1);
    expect(record.auth_sessions).toHaveLength(1);
    expect(record.auth_sessions[0]).not.toHaveProperty('token_hash');
    // Readable: indented, not one long line.
    expect(file.split('\n').length).toBeGreaterThan(20);
    expect(await latestAudit(t.db, a.orgId, 'student.exported')).toMatchObject({
      actor_id: a.adminId,
      target_id: a.studentId,
    });
  });

  it('removes personal data and text, keeps pseudonymous events, and audits it', async () => {
    const eventsBefore = await t.db
      .selectFrom('interaction_event')
      .selectAll()
      .where('student_id', '=', a.studentId)
      .orderBy('seq')
      .execute();

    const result = await deleteStudent(app, request(a.adminId), store);
    expect(result).toEqual({
      interactionText: 1,
      aiInteractions: 2,
      progressSnapshots: 1,
      enrollments: 1,
      authSessions: 1,
      exportFiles: 1,
    });

    const user = await t.db
      .selectFrom('app_user')
      .selectAll()
      .where('id', '=', a.studentId)
      .executeTakeFirstOrThrow();
    expect(user).toMatchObject({
      name: REMOVED_STUDENT_NAME,
      email: null,
      sso_provider: null,
      sso_subject: null,
      roster_source_id: null,
      role: 'student',
    });

    // Events are untouched, and their text reference resolves to the removed marker.
    const eventsAfter = await t.db
      .selectFrom('interaction_event')
      .selectAll()
      .where('student_id', '=', a.studentId)
      .orderBy('seq')
      .execute();
    expect(eventsAfter).toEqual(eventsBefore);
    const ref = (eventsAfter[1]!.payload as { text_ref: string }).text_ref;
    const texts = await withOrg(app, a.orgId, (trx) => resolveTexts(trx, [ref]));
    expect(texts.get(ref)).toEqual(REMOVED_TEXT);

    const audit = await latestAudit(t.db, a.orgId, 'student.deleted');
    expect(audit).toMatchObject({
      actor_id: a.adminId,
      target_type: 'student',
      target_id: a.studentId,
    });

    // Org B's student is untouched.
    const other = await t.db
      .selectFrom('app_user')
      .select('name')
      .where('id', '=', b.studentId)
      .executeTakeFirstOrThrow();
    expect(other.name).toBe('Student b');
  });

  it('leaves no trace of name or email in any table or export file (F6-S3)', async () => {
    const { rows: tables } = await sql<{ schema: string; name: string }>`
      SELECT n.nspname AS schema, c.relname AS name FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
        AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    `.execute(t.db);
    expect(tables.length).toBeGreaterThan(30);
    const hits: string[] = [];
    for (const table of tables) {
      const { rows } = await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM ${sql.table(`${table.schema}.${table.name}`)} r
        WHERE r::text ILIKE ${'%Student a%'} OR r::text ILIKE ${`%${email}%`}
      `.execute(t.db);
      if (rows[0]!.n > 0) hits.push(`${table.schema}.${table.name}`);
    }
    expect(hits).toEqual([]);

    const files = await readdir(dir, { recursive: true });
    for (const f of files) {
      const content = await readFile(join(dir, f), 'utf8').catch(() => '');
      expect(content).not.toContain(email);
    }
    expect(files.filter((f) => f.endsWith('.json'))).toEqual([]);

    // The audit record of the deletion holds the pseudonymous id only.
    const audit = await latestAudit(t.db, a.orgId, 'student.deleted');
    expect(JSON.stringify(audit)).not.toMatch(/Student a|example\.org/);
  });

  it('is safe to repeat', async () => {
    const again = await deleteStudent(app, request(a.adminId), store);
    expect(again).toEqual({
      interactionText: 0,
      aiInteractions: 0,
      progressSnapshots: 0,
      enrollments: 0,
      authSessions: 0,
      exportFiles: 0,
    });
  });
});

describe.skipIf(!hasDatabase)('retention settings and role (F6-F2)', () => {
  let t: TestDatabase;
  let a: Org;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedWithAdmin(t.db, 'a');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('defaults typed text and AI transcripts to 90 days, exports to 7, per org', async () => {
    const org = await t.db
      .selectFrom('organization')
      .select(['text_retention_days', 'ai_retention_days', 'export_retention_days'])
      .where('id', '=', a.orgId)
      .executeTakeFirstOrThrow();
    expect(org).toEqual({
      text_retention_days: 90,
      ai_retention_days: 90,
      export_retention_days: 7,
    });
    const app = await t.loginAs(APP_ROLE);
    await withOrg(app, a.orgId, (trx) =>
      trx
        .updateTable('organization')
        .set({ text_retention_days: 30, ai_retention_days: 14, export_retention_days: 1 })
        .where('id', '=', a.orgId)
        .execute(),
    );
    for (const set of [{ text_retention_days: 0 }, { ai_retention_days: 4000 }]) {
      const code = await errorCode(() =>
        withOrg(app, a.orgId, (trx) =>
          trx.updateTable('organization').set(set).where('id', '=', a.orgId).execute(),
        ),
      );
      expect(code).toBe(PG.check);
    }
  });

  it("gives the retention role only due rows' ids and dates, never their text", async () => {
    await t.db
      .updateTable('organization')
      .set({ text_retention_days: 90 })
      .where('id', '=', a.orgId)
      .execute();
    const old = await t.db
      .insertInto('interaction_text')
      .values({
        org_id: a.orgId,
        class_id: a.classId,
        student_id: a.studentId,
        kind: 'chat',
        body: 'Old message',
        created_at: sql<Date>`now() - interval '100 days'`,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    // Works without PUBLIC's default EXECUTE on the org function, should it be revoked.
    await sql`REVOKE ALL ON FUNCTION app.current_org_id() FROM PUBLIC`.execute(t.db);
    const retention = await t.loginAs(RETENTION_ROLE);
    const visible = await retention.selectFrom('interaction_text').select('id').execute();
    expect(visible.map((r) => r.id)).toEqual([old.id]);
    expect(
      await errorCode(() => retention.selectFrom('interaction_text').select('body').execute()),
    ).toBe(PG.insufficientPrivilege);
    expect(await errorCode(() => retention.selectFrom('app_user').select('id').execute())).toBe(
      PG.insufficientPrivilege,
    );
    expect(
      await errorCode(() =>
        retention
          .insertInto('audit_event')
          .values({ org_id: a.orgId, action: 'x', target_type: 'x' })
          .execute(),
      ),
    ).toBe(PG.insufficientPrivilege);
    // Events stay out of reach.
    expect(
      await errorCode(() =>
        retention.deleteFrom('interaction_event').where('id', '=', testUlid()).execute(),
      ),
    ).toBe(PG.insufficientPrivilege);
  });
});

describe.skipIf(!hasDatabase)('audit redaction of flattened paths (QA F6-E2)', () => {
  let t: TestDatabase;
  let app: Db;
  let a: Org;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedWithAdmin(t.db, 'a');
    app = await t.loginAs(APP_ROLE);
  });
  afterAll(async () => {
    await t?.drop();
  });

  const SECRET = 'synthetic-token-value';
  const withToken = (n: number) =>
    json({ course: { pass_mark: n }, token: SECRET, input_tokens: 5 } as unknown as ClassConfig);

  it('redacts a config token on insert, update and delete, keeping token counts', async () => {
    const asAdmin = <T>(fn: Parameters<typeof withOrg<T>>[2]) =>
      withOrg(app, a.orgId, async (trx) => {
        await actAs(trx, a.adminId);
        return fn(trx);
      });
    await asAdmin((trx) =>
      trx.deleteFrom('class_config').where('class_id', '=', a.classId).execute(),
    );
    await asAdmin((trx) =>
      trx
        .insertInto('class_config')
        .values({ org_id: a.orgId, class_id: a.classId, config: withToken(60) })
        .execute(),
    );
    // Old and new token values differ, so the token itself is a changed field.
    await asAdmin((trx) =>
      trx
        .updateTable('class_config')
        .set({
          config: json({
            course: { pass_mark: 61 },
            token: `${SECRET}-2`,
            input_tokens: 6,
          } as unknown as ClassConfig),
        })
        .where('class_id', '=', a.classId)
        .execute(),
    );
    await asAdmin((trx) =>
      trx.deleteFrom('class_config').where('class_id', '=', a.classId).execute(),
    );

    const rows = await t.db
      .selectFrom('audit_event')
      .selectAll()
      .where('target_type', '=', 'class_config')
      .where('actor_id', '=', a.adminId)
      .orderBy('at')
      .orderBy('id')
      .execute();
    expect(rows.map((r) => r.action)).toEqual([
      'class_config.deleted',
      'class_config.created',
      'class_config.updated',
      'class_config.deleted',
    ]);
    expect(JSON.stringify(rows)).not.toContain(SECRET);
    const [, created, updated, deleted] = rows;
    expect(created!.after).toMatchObject({ config: { token: '[redacted]', input_tokens: 5 } });
    expect(updated!.detail.changed).toEqual([
      'config.course',
      'config.input_tokens',
      'config.token',
    ]);
    expect(updated!.before).toMatchObject({
      'config.token': '[redacted]',
      'config.input_tokens': 5,
    });
    expect(updated!.after).toMatchObject({
      'config.token': '[redacted]',
      'config.input_tokens': 6,
    });
    expect(deleted!.before).toMatchObject({ config: { token: '[redacted]', input_tokens: 6 } });
  });

  it('redacts trigger-shaped paths the same way in SQL and TypeScript', async () => {
    const shaped = {
      'config.token': SECRET,
      'config.input_tokens': 5,
      'config.output_tokens': 6,
      'config.connector': { client_secret: SECRET, refresh_token: SECRET, kind: 'drive' },
      'config.personas': [{ persona_id: 'tutor', prompt_template: 'Hi {name}.' }],
      token: SECRET,
      'source.api_key': SECRET,
      tokens_used: 3,
    };
    const { rows } = await sql<{ v: unknown }>`
      SELECT app.redact_secrets(${JSON.stringify(shaped)}::jsonb) AS v
    `.execute(t.db);
    expect(rows[0]!.v).toEqual(redactSecrets(shaped));
    expect(JSON.stringify(rows[0]!.v)).not.toContain(SECRET);
    expect(rows[0]!.v).toMatchObject({
      'config.input_tokens': 5,
      'config.output_tokens': 6,
      tokens_used: 3,
      'config.connector': { kind: 'drive' },
    });
    expect(isSecretKey('config.token')).toBe(true);
    expect(isSecretKey('config.input_tokens')).toBe(false);
  });
});

describe.skipIf(!hasDatabase)('student export covers every stored field (QA F6-E3)', () => {
  let t: TestDatabase;
  let app: Db;
  let a: Org;
  let dir: string;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedWithAdmin(t.db, 'a');
    await t.db
      .updateTable('ai_interaction')
      .set({ input_tokens: 123, output_tokens: 456, redacted_at: new Date('2026-10-01T00:00:00Z') })
      .where('user_id', '=', a.studentId)
      .execute();
    await addSession(t.db, a.orgId, a.studentId);
    app = await t.loginAs(APP_ROLE);
    dir = await mkdtemp(join(tmpdir(), 'ideamap-export-fields-'));
  });
  afterAll(async () => {
    await t?.drop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('exports every column of every section except the listed omissions', async () => {
    const result = await exportStudent(
      app,
      { orgId: a.orgId, actorId: a.adminId, studentId: a.studentId },
      new DirectoryExportStore(dir),
    );
    const record = JSON.parse(result.body) as StudentRecord;
    const sources: Record<keyof typeof RECORD_OMITS, string> = {
      student: 'app_user',
      enrollments: 'enrollment',
      interaction_events: 'interaction_event',
      interaction_text: 'interaction_text',
      generated_map_views: 'generated_map_view',
      ai_outputs: 'ai_output',
      ai_interactions: 'ai_interaction',
      progress_snapshots: 'progress_snapshot',
      auth_sessions: 'auth_session',
    };
    for (const [section, table] of Object.entries(sources) as [
      keyof typeof RECORD_OMITS,
      string,
    ][]) {
      const { rows } = await sql<{ column_name: string }>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
      `.execute(t.db);
      const expected = rows
        .map((r) => r.column_name)
        .filter((c) => !(RECORD_OMITS[section] as readonly string[]).includes(c))
        .sort();
      const value = record[section];
      const first = Array.isArray(value) ? value[0] : value;
      expect(first, section).toBeDefined();
      const keys = Object.keys(first!).filter((k) => k !== 'class_name');
      expect(keys.sort(), section).toEqual(expected);
    }
    expect(record.ai_interactions.find((r) => r.input_tokens === 123)).toMatchObject({
      input_tokens: 123,
      output_tokens: 456,
      redacted_at: '2026-10-01T00:00:00.000Z',
    });
  });
});

describe.skipIf(!hasDatabase)(
  'deleting a student removes every export holding them (QA F6-E1)',
  () => {
    let t: TestDatabase;
    let app: Db;
    let a: Org;
    let b: Org;
    let dir: string;
    let store: DirectoryExportStore;

    beforeAll(async () => {
      t = await freshDatabase();
      a = await seedWithAdmin(t.db, 'a');
      b = await seedWithAdmin(t.db, 'b');
      app = await t.loginAs(APP_ROLE);
      dir = await mkdtemp(join(tmpdir(), 'ideamap-export-history-'));
      store = new DirectoryExportStore(dir);
    });
    afterAll(async () => {
      await t?.drop();
      if (dir) await rm(dir, { recursive: true, force: true });
    });

    async function newStudent(org: Org, label: string) {
      const user = await t.db
        .insertInto('app_user')
        .values({
          org_id: org.orgId,
          role: 'student',
          name: `Pupil ${label}`,
          email: `pupil-${label}@example.org`,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await t.db
        .insertInto('enrollment')
        .values({ org_id: org.orgId, class_id: org.classId, student_id: user.id })
        .execute();
      return user.id;
    }

    /** A class progress report naming `students`, made as the class's teacher. */
    async function classReport(org: Org, label: string, students: string[] | null) {
      return withOrg(app, org.orgId, async (trx) => {
        await actAs(trx, org.teacherId);
        const job = await trx
          .insertInto('export_job')
          .values({
            org_id: org.orgId,
            kind: 'class_progress',
            class_id: org.classId,
            status: 'succeeded',
            created_by: org.teacherId,
            finished_at: new Date(),
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        // null: an export whose contents were never recorded.
        if (students) await recordExportSubjects(trx, org.orgId, job.id, students);
        const names = await trx
          .selectFrom('app_user')
          .select(['name', 'email'])
          .where('id', 'in', students ?? [org.studentId])
          .execute();
        const ref = `class-progress/${org.orgId}/${label}.json`;
        await store.put(ref, JSON.stringify(names));
        await trx
          .updateTable('export_job')
          .set({ result_ref: ref })
          .where('id', '=', job.id)
          .execute();
        return { id: job.id, ref };
      });
    }

    const refOf = async (id: string) =>
      (
        await t.db
          .selectFrom('export_job')
          .select('result_ref')
          .where('id', '=', id)
          .executeTakeFirstOrThrow()
      ).result_ref;
    const exists = async (ref: string) =>
      readFile(join(dir, ref), 'utf8').then(
        () => true,
        () => false,
      );
    const remove = (studentId: string, org = a) =>
      deleteStudent(app, { orgId: org.orgId, actorId: org.adminId, studentId }, store);

    it('removes a report naming a student who has since left the class', async () => {
      const leaver = await newStudent(a, 'leaver');
      const stayer = await newStudent(a, 'stayer');
      const withLeaver = await classReport(a, 'with-leaver', [leaver, stayer]);
      const withoutLeaver = await classReport(a, 'without-leaver', [stayer]);
      const otherOrg = await classReport(b, 'org-b', [b.studentId]);

      // The student leaves the class (or moves to another) before the deletion.
      await t.db.deleteFrom('enrollment').where('student_id', '=', leaver).execute();

      const result = await remove(leaver);
      expect(result.exportFiles).toBe(1);
      expect(await exists(withLeaver.ref)).toBe(false);
      expect(await refOf(withLeaver.id)).toBeNull();
      // Files that don't hold the student, and other orgs' files, are kept.
      expect(await exists(withoutLeaver.ref)).toBe(true);
      expect(await refOf(withoutLeaver.id)).toBe(withoutLeaver.ref);
      expect(await exists(otherOrg.ref)).toBe(true);
      expect(await refOf(otherOrg.id)).toBe(otherOrg.ref);

      // Repeating the deletion finds nothing more and keeps the others.
      expect((await remove(leaver)).exportFiles).toBe(0);
      expect(await exists(withoutLeaver.ref)).toBe(true);
    });

    it('removes a student-naming report whose contents were never recorded', async () => {
      const unknown = await classReport(a, 'unrecorded', null);
      const pupil = await newStudent(a, 'unrecorded');
      await t.db.deleteFrom('enrollment').where('student_id', '=', pupil).execute();
      expect((await remove(pupil)).exportFiles).toBe(1);
      expect(await exists(unknown.ref)).toBe(false);
      expect(await refOf(unknown.id)).toBeNull();
    });

    it('never leaves a file naming a student when export and delete race', async () => {
      /** Slow writes, so the delete arrives while the export is mid-write. */
      const slow: ExportStore = {
        put: async (key, body) => {
          await new Promise((r) => setTimeout(r, 150));
          await store.put(key, body);
        },
        remove: (key) => store.remove(key),
      };
      for (let round = 0; round < 4; round++) {
        const label = `race-${round}`;
        const pupil = await newStudent(a, label);
        const request = { orgId: a.orgId, actorId: a.adminId, studentId: pupil };
        const exporting = exportStudent(app, request, slow);
        // Delete first on even rounds, export first on odd rounds.
        if (round % 2 === 0) await new Promise((r) => setTimeout(r, 20));
        const settled = await Promise.allSettled([exporting, deleteStudent(app, request, slow)]);
        expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'fulfilled']);
        const files = await readdir(dir, { recursive: true });
        for (const f of files.filter((name) => name.endsWith('.json'))) {
          const content = await readFile(join(dir, f), 'utf8');
          expect(content, f).not.toContain(`Pupil ${label}`);
          expect(content, f).not.toContain(`pupil-${label}@example.org`);
        }
      }
    });
  },
);
