import {
  ClassConfigSchema,
  ClassLibrarySettingRequestSchema,
  RoleChangeRequestSchema,
  RosterImportRequestSchema,
  type ClassConfig,
  type ClassHeaderResponse,
} from '@ideamap/contracts';
import { parseOneRoster, RosterError } from '@ideamap/connectors';
import { json } from '@ideamap/db';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { audit } from '../db.js';
import { ALL_ROLES, type PolicyDeps } from '../policy.js';
import { importRoster } from '../roster.js';

// The first org- and class-scoped routes (F5-F4 to F5-F6, F5-F8, F5-S9). Later tasks
// add behaviour; the access rules here are what F5 settles. Each route's policy says
// who may call it; handlers only ever query through `req.withOrg`.

type ClassParams = { Params: { classId: string } };

export function accessRoutes(app: FastifyInstance, deps: PolicyDeps): void {
  const at = () => deps.now();

  app.get(
    '/api/session',
    { config: { policy: { roles: ALL_ROLES, scope: { kind: 'org' } } } },
    // A cheap "am I still signed in?" for the apps, and the no-op route for F5-P1.
    () => ({ ok: true }),
  );

  app.get(
    '/api/classes',
    { config: { policy: { roles: ALL_ROLES, scope: { kind: 'org' } } } },
    async (req) => {
      const { role, userId } = req.session!;
      const rows = await req.withOrg((trx) => {
        let q = trx
          .selectFrom('class')
          .select(['id', 'name', 'curriculum_id', 'teacher_id'])
          .orderBy('name');
        if (role === 'student') {
          q = q.where('id', 'in', (eb) =>
            eb.selectFrom('enrollment').select('class_id').where('student_id', '=', userId),
          );
        } else if (role !== 'admin') {
          q = q.where('teacher_id', '=', userId);
        }
        return q.execute();
      });
      return {
        classes: rows.map((r) => ({
          id: r.id,
          name: r.name,
          curriculumId: r.curriculum_id,
          teacherId: r.teacher_id,
        })),
      };
    },
  );

  const classPolicy = (students = false) => ({
    policy: {
      roles: students ? ALL_ROLES : (['admin', 'author', 'teacher'] as const),
      scope: { kind: 'class' as const, param: 'classId', students },
    },
  });

  app.get<ClassParams>('/api/classes/:classId/config', { config: classPolicy() }, async (req) => {
    const row = await req.withOrg((trx) =>
      trx
        .selectFrom('class_config')
        .select(['config', 'updated_at'])
        .where('class_id', '=', req.params.classId)
        .executeTakeFirst(),
    );
    return { config: row?.config ?? {}, updatedAt: row?.updated_at.toISOString() ?? null };
  });

  // The teacher console header (T1): staff only, and only for a class they may see.
  app.get<ClassParams>('/api/classes/:classId/header', { config: classPolicy() }, async (req) => {
    const classId = req.params.classId;
    const header = await req.withOrg(async (trx) => {
      const klass = await trx
        .selectFrom('class as c')
        .leftJoin('class_config as cc', 'cc.class_id', 'c.id')
        .leftJoin('curriculum_defaults as d', 'd.curriculum_id', 'c.curriculum_id')
        .select(['c.name', 'c.curriculum_id', 'cc.config as classConfig', 'd.config as defaults'])
        .where('c.id', '=', classId)
        .executeTakeFirstOrThrow();
      // The published version if there is one, else the newest draft.
      const version = await trx
        .selectFrom('curriculum_version')
        .select(['pack'])
        .where('curriculum_id', '=', klass.curriculum_id)
        .orderBy(sql`published_at is null`)
        .orderBy('number', 'desc')
        .limit(1)
        .executeTakeFirst();
      return { klass, course: version?.pack.course ?? null };
    });
    const { klass, course } = header;
    const pick = (field: 'subject' | 'topic') =>
      klass.classConfig?.course?.[field] ??
      klass.defaults?.course?.[field] ??
      course?.[field] ??
      null;
    return {
      classId,
      className: klass.name,
      subject: pick('subject'),
      topic: pick('topic'),
    } satisfies ClassHeaderResponse;
  });

  app.put<ClassParams>(
    '/api/classes/:classId/config',
    { config: classPolicy() },
    async (req, reply) => {
      const parsed = ClassConfigSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid class config' });
      const { orgId, userId } = req.session!;
      const classId = req.params.classId;
      const config: ClassConfig = parsed.data;
      const now = at();
      await req.withOrg(async (trx) => {
        await trx
          .insertInto('class_config')
          .values({ class_id: classId, org_id: orgId, config: json(config), updated_by: userId })
          .onConflict((oc) =>
            oc.column('class_id').doUpdateSet({ config: json(config), updated_by: userId }),
          )
          .execute();
        await audit(trx, {
          orgId,
          actorId: userId,
          action: 'class_config.update',
          targetType: 'class',
          targetId: classId,
          at: now,
        });
      });
      return { config };
    },
  );

  app.get<ClassParams>('/api/classes/:classId/roster', { config: classPolicy() }, async (req) => {
    const students = await req.withOrg((trx) =>
      trx
        .selectFrom('enrollment as e')
        .innerJoin('app_user as u', 'u.id', 'e.student_id')
        .select(['u.id', 'u.name'])
        .where('e.class_id', '=', req.params.classId)
        .orderBy('u.name')
        .execute(),
    );
    return { students };
  });

  app.get<ClassParams>('/api/classes/:classId/library', { config: classPolicy() }, async (req) => {
    const classId = req.params.classId;
    return req.withOrg(async (trx) => {
      const shared = await trx
        .selectFrom('library_doc as d')
        .innerJoin('class as c', 'c.curriculum_id', 'd.curriculum_id')
        .leftJoin('class_library_setting as s', (j) =>
          j.onRef('s.library_doc_id', '=', 'd.id').onRef('s.class_id', '=', 'c.id'),
        )
        .select(['d.id', 'd.title', 'd.use_for as default_use_for', 's.use_for'])
        .where('c.id', '=', classId)
        .orderBy('d.title')
        .execute();
      // Row-level security limits class uploads to this class (withClass, D11).
      const uploads = await trx
        .selectFrom('class_library_doc')
        .select(['id', 'title', 'use_for', 'index_status'])
        .orderBy('title')
        .execute();
      return {
        shared: shared.map((d) => ({
          id: d.id,
          title: d.title,
          defaultUseFor: d.default_use_for,
          useFor: d.use_for ?? d.default_use_for,
        })),
        uploads: uploads.map((u) => ({
          id: u.id,
          title: u.title,
          useFor: u.use_for,
          indexStatus: u.index_status,
        })),
      };
    });
  });

  app.put<{ Params: { classId: string; libraryDocId: string } }>(
    '/api/classes/:classId/library/:libraryDocId',
    { config: classPolicy() },
    async (req, reply) => {
      const parsed = ClassLibrarySettingRequestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid setting' });
      const { orgId, userId } = req.session!;
      const { classId, libraryDocId } = req.params;
      const useFor = parsed.data.use_for;
      const now = at();
      const saved = await req.withOrg(async (trx) => {
        // The document must belong to this class's curriculum (D11).
        const doc = await trx
          .selectFrom('library_doc as d')
          .innerJoin('class as c', 'c.curriculum_id', 'd.curriculum_id')
          .select(['d.id', 'd.curriculum_id'])
          .where('c.id', '=', classId)
          .where('d.id', '=', libraryDocId)
          .executeTakeFirst();
        if (!doc) return false;
        await trx
          .insertInto('class_library_setting')
          .values({
            class_id: classId,
            library_doc_id: libraryDocId,
            org_id: orgId,
            curriculum_id: doc.curriculum_id,
            use_for: useFor,
            updated_by: userId,
          })
          .onConflict((oc) =>
            oc
              .columns(['class_id', 'library_doc_id'])
              .doUpdateSet({ use_for: useFor, updated_by: userId }),
          )
          .execute();
        await audit(trx, {
          orgId,
          actorId: userId,
          action: 'class_library_setting.update',
          targetType: 'class',
          targetId: classId,
          detail: { library_doc_id: libraryDocId, use_for: useFor },
          at: now,
        });
        return true;
      });
      if (!saved) return reply.code(404).send({ error: 'Not found' });
      return { useFor };
    },
  );

  type CurriculumParams = { Params: { curriculumId: string } };
  const curriculumPolicy = (edit: boolean) => ({
    policy: {
      roles: edit ? (['admin', 'author'] as const) : (['admin', 'author', 'teacher'] as const),
      scope: { kind: 'curriculum' as const, param: 'curriculumId', edit },
    },
  });

  app.get<CurriculumParams>(
    '/api/curricula/:curriculumId/defaults',
    { config: curriculumPolicy(false) },
    async (req) => {
      const row = await req.withOrg((trx) =>
        trx
          .selectFrom('curriculum_defaults')
          .select(['config'])
          .where('curriculum_id', '=', req.params.curriculumId)
          .executeTakeFirst(),
      );
      return { config: row?.config ?? {} };
    },
  );

  // D3: only the curriculum's author (or an admin) edits its defaults; teachers who use
  // it override per class instead (open question 1 may widen this).
  app.put<CurriculumParams>(
    '/api/curricula/:curriculumId/defaults',
    { config: curriculumPolicy(true) },
    async (req, reply) => {
      const parsed = ClassConfigSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid defaults' });
      const { orgId, userId } = req.session!;
      const curriculumId = req.params.curriculumId;
      const config = parsed.data;
      const now = at();
      await req.withOrg(async (trx) => {
        await trx
          .insertInto('curriculum_defaults')
          .values({
            curriculum_id: curriculumId,
            org_id: orgId,
            config: json(config),
            updated_by: userId,
          })
          .onConflict((oc) =>
            oc.column('curriculum_id').doUpdateSet({ config: json(config), updated_by: userId }),
          )
          .execute();
        await audit(trx, {
          orgId,
          actorId: userId,
          action: 'curriculum_defaults.update',
          targetType: 'curriculum',
          targetId: curriculumId,
          at: now,
        });
      });
      return { config };
    },
  );

  app.put<{ Params: { userId: string } }>(
    '/api/users/:userId/role',
    { config: { policy: { roles: ['admin'], scope: { kind: 'user', param: 'userId' } } } },
    async (req, reply) => {
      const parsed = RoleChangeRequestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid role' });
      const { orgId, userId: actorId } = req.session!;
      const target = req.params.userId;
      // An admin can't demote themselves, so an org always keeps the admin who acted.
      if (target === actorId)
        return reply.code(400).send({ error: 'You cannot change your own role' });
      const role = parsed.data.role;
      const now = at();
      const from = await req.withOrg(async (trx) => {
        const before = await trx
          .selectFrom('app_user')
          .select('role')
          .where('id', '=', target)
          .executeTakeFirstOrThrow();
        if (before.role !== role) {
          await trx.updateTable('app_user').set({ role }).where('id', '=', target).execute();
        }
        await audit(trx, {
          orgId,
          actorId,
          action: 'user.role_change',
          targetType: 'app_user',
          targetId: target,
          detail: { from: before.role, to: role },
          at: now,
        });
        return before.role;
      });
      return { id: target, role, previousRole: from };
    },
  );

  app.post(
    '/api/roster/import',
    {
      config: { policy: { roles: ['admin'], scope: { kind: 'org' } } },
      bodyLimit: 16 * 1024 * 1024,
    },
    async (req, reply) => {
      const parsed = RosterImportRequestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid roster import' });
      let roster;
      try {
        roster = parseOneRoster(parsed.data);
      } catch (error) {
        if (error instanceof RosterError) return reply.code(400).send({ error: error.message });
        throw error;
      }
      const { orgId, userId } = req.session!;
      const now = at();
      const result = await req.withOrg(async (trx) => {
        const counts = await importRoster(trx, orgId, parsed.data.curriculumId, roster);
        if ('error' in counts) return counts;
        await audit(trx, {
          orgId,
          actorId: userId,
          action: 'roster.import',
          targetType: 'organization',
          targetId: orgId,
          detail: { ...counts, skipped: counts.skipped.length },
          at: now,
        });
        return counts;
      });
      // The only error: a curriculum this org can't see, answered like any other id (F5-F4).
      if ('error' in result) return reply.code(403).send({ error: 'Forbidden' });
      return result;
    },
  );
}
