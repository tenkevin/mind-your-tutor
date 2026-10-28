import {
  FLAG_RETENTION_DAYS_MAX,
  HELP_TEXT_MAX,
  SafetyPolicyUpdateSchema,
  type FlagNotify,
  type SafetyFlag,
  type SafetyPolicy,
} from '@ideamap/contracts';
import { writeAudit } from '@ideamap/db';
import { sql } from 'kysely';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Trx } from './db.js';
import { STAFF, type RoutePolicy } from './policy.js';

// Safety flags and the district's flag policy (ARCHITECTURE.md §9, §10; task A2).
//
// A concerning student message (self-harm, abuse) raises a flag in the same transaction
// as its transcript. The district's policy says who is told: the class teacher, the
// org's admins, or both. Teachers see flags for their own classes only; an admin sees
// per-student detail only here, while handling a flag (D21). A flag holds no text: the
// excerpt is read from the redacted transcript. Raising and resolving are audit events.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXCERPT_CHARS = 240;

const NOTIFY: Record<FlagNotify, { teacher: boolean; admin: boolean }> = {
  teacher_and_admin: { teacher: true, admin: true },
  teacher: { teacher: true, admin: false },
  admin: { teacher: false, admin: true },
};

const NEXT_STEPS = {
  self_harm:
    "Check in with this student today, in person and privately. Follow your district's student-safety procedure, and if you think they may be in immediate danger, contact your school counsellor or emergency services. Then mark the flag as handled.",
  abuse:
    "Speak with this student privately, and follow your district's reporting procedure; teachers are often required to report a concern like this. Then mark the flag as handled.",
} as const;

export async function loadSafetyPolicy(trx: Trx): Promise<SafetyPolicy> {
  const org = await trx
    .selectFrom('organization')
    .select(['flag_notify', 'help_text', 'flag_resolved_retention_days'])
    .executeTakeFirstOrThrow();
  return {
    flagNotify: org.flag_notify,
    helpText: org.help_text,
    flagResolvedRetentionDays: org.flag_resolved_retention_days,
  };
}

/** Raise a flag for a concerning message, per the district's policy; returns that policy. */
export async function raiseFlag(
  trx: Trx,
  flag: { orgId: string; classId: string; interactionId: string; category: 'self_harm' | 'abuse' },
): Promise<SafetyPolicy> {
  const policy = await loadSafetyPolicy(trx);
  const notify = NOTIFY[policy.flagNotify];
  const row = await trx
    .insertInto('safety_flag')
    .values({
      org_id: flag.orgId,
      class_id: flag.classId,
      interaction_id: flag.interactionId,
      category: flag.category,
      notify_teacher: notify.teacher,
      notify_admin: notify.admin,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await writeAudit(trx, flag.orgId, {
    action: 'safety_flag.raised',
    targetType: 'safety_flag',
    targetId: row.id,
    classId: flag.classId,
    detail: {
      category: flag.category,
      notify: policy.flagNotify,
      interaction_id: flag.interactionId,
    },
  });
  return policy;
}

type Viewer = { role: 'admin' } | { role: 'teacher'; userId: string };

/** The flags this viewer is told about, newest first. */
async function listFlags(
  trx: Trx,
  viewer: Viewer,
  where: { classId?: string; flagId?: string; status?: 'open' | 'resolved' },
): Promise<SafetyFlag[]> {
  let q = trx
    .selectFrom('safety_flag as f')
    .innerJoin('class as c', 'c.id', 'f.class_id')
    .innerJoin('ai_interaction as i', 'i.id', 'f.interaction_id')
    .innerJoin('app_user as u', 'u.id', 'i.user_id')
    .select([
      'f.id',
      'f.created_at',
      'f.status',
      'f.resolved_at',
      'f.class_id',
      'c.name as class_name',
      'f.category',
      'u.id as student_id',
      'u.name as student_name',
      sql<string | null>`i.request -> 'messages' -> -1 ->> 'content'`.as('excerpt'),
    ])
    .orderBy('f.created_at', 'desc')
    .limit(200);
  q =
    viewer.role === 'admin'
      ? q.where('f.notify_admin', '=', true)
      : q.where('f.notify_teacher', '=', true).where('c.teacher_id', '=', viewer.userId);
  if (where.classId) q = q.where('f.class_id', '=', where.classId);
  if (where.flagId) q = q.where('f.id', '=', where.flagId);
  if (where.status) q = q.where('f.status', '=', where.status);
  return (await q.execute()).map((r) => ({
    id: r.id,
    createdAt: r.created_at.toISOString(),
    status: r.status,
    resolvedAt: r.resolved_at?.toISOString() ?? null,
    classId: r.class_id,
    className: r.class_name,
    student: { id: r.student_id, name: r.student_name },
    category: r.category,
    excerpt: (r.excerpt ?? '').slice(0, EXCERPT_CHARS),
    nextStep: NEXT_STEPS[r.category],
  }));
}

const CLASS_STAFF: RoutePolicy = {
  roles: STAFF,
  scope: { kind: 'class', param: 'classId', students: false },
};
/** Admins see flags across the district. */
export const ADMIN_FLAGS_POLICY: RoutePolicy = { roles: ['admin'], scope: { kind: 'org' } };
/** Resolving checks the flag's class and the district's policy inside the handler. */
export const RESOLVE_FLAG_POLICY: RoutePolicy = { roles: STAFF, scope: { kind: 'org' } };
export const SAFETY_POLICY_POLICY: RoutePolicy = { roles: ['admin'], scope: { kind: 'org' } };

function viewerOf(req: FastifyRequest): Viewer {
  const { role, userId } = req.session!;
  return role === 'admin' ? { role: 'admin' } : { role: 'teacher', userId };
}

function status(query: unknown): 'open' | 'resolved' | undefined {
  const value = (query as { status?: string }).status;
  return value === 'open' || value === 'resolved' ? value : undefined;
}

function forbidden(reply: FastifyReply) {
  return reply.code(403).send({ error: 'Forbidden' });
}

export function safetyRoutes(app: FastifyInstance): void {
  app.get<{ Params: { classId: string }; Querystring: { status?: string } }>(
    '/api/classes/:classId/safety-flags',
    { config: { policy: CLASS_STAFF } },
    async (req, reply) => {
      const flags = await req.withOrg((trx) =>
        listFlags(trx, viewerOf(req), { classId: req.params.classId, status: status(req.query) }),
      );
      return reply.header('cache-control', 'no-store').send({ flags });
    },
  );

  app.get<{ Querystring: { status?: string } }>(
    '/api/safety-flags',
    { config: { policy: ADMIN_FLAGS_POLICY } },
    async (req, reply) => {
      const flags = await req.withOrg((trx) =>
        listFlags(trx, viewerOf(req), { status: status(req.query) }),
      );
      return reply.header('cache-control', 'no-store').send({ flags });
    },
  );

  app.post<{ Params: { flagId: string } }>(
    '/api/safety-flags/:flagId/resolve',
    { config: { policy: RESOLVE_FLAG_POLICY } },
    async (req, reply) => {
      const { flagId } = req.params;
      if (!UUID.test(flagId)) return forbidden(reply);
      const { orgId, userId } = req.session!;
      const viewer = viewerOf(req);
      const resolved = await req.withOrg(async (trx) => {
        // Only a flag the caller is told about can be handled by them.
        const [flag] = await listFlags(trx, viewer, { flagId });
        if (!flag) return null;
        if (flag.status === 'open') {
          await trx
            .updateTable('safety_flag')
            .set({ status: 'resolved', resolved_at: new Date(), resolved_by: userId })
            .where('id', '=', flagId)
            .where('status', '=', 'open')
            .execute();
          await writeAudit(trx, orgId, {
            action: 'safety_flag.resolved',
            targetType: 'safety_flag',
            targetId: flagId,
            classId: flag.classId,
            before: { status: 'open' },
            after: { status: 'resolved' },
          });
        }
        return (await listFlags(trx, viewer, { flagId }))[0]!;
      });
      if (!resolved) return forbidden(reply);
      return reply.header('cache-control', 'no-store').send(resolved);
    },
  );

  app.get(
    '/api/safety-policy',
    { config: { policy: SAFETY_POLICY_POLICY } },
    async (req, reply) => {
      const policy = await req.withOrg(loadSafetyPolicy);
      return reply.header('cache-control', 'no-store').send(policy);
    },
  );

  app.put(
    '/api/safety-policy',
    { config: { policy: SAFETY_POLICY_POLICY } },
    async (req, reply) => {
      const parsed = SafetyPolicyUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: `Send a flag policy, help text of up to ${HELP_TEXT_MAX} characters, and/or a whole number of days from 1 to ${FLAG_RETENTION_DAYS_MAX}.`,
        });
      }
      const { flagNotify, helpText, flagResolvedRetentionDays } = parsed.data;
      // The organization trigger writes the audit row, with before and after.
      const policy = await req.withOrg(async (trx) => {
        await trx
          .updateTable('organization')
          .set({
            ...(flagNotify !== undefined ? { flag_notify: flagNotify } : {}),
            ...(helpText !== undefined ? { help_text: helpText } : {}),
            ...(flagResolvedRetentionDays !== undefined
              ? { flag_resolved_retention_days: flagResolvedRetentionDays }
              : {}),
          })
          .execute();
        return loadSafetyPolicy(trx);
      });
      return reply.header('cache-control', 'no-store').send(policy);
    },
  );
}
