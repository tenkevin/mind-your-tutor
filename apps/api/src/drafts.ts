import {
  ApproveDraftRequestSchema,
  DRAFT_MAX,
  DRAFT_TABS,
  QUEUES,
  type DraftItem,
  type DraftJobPayload,
  type DraftList,
  type Pack,
} from '@ideamap/contracts';
import { json } from '@ideamap/db';
import { classContent, draftContext, findDraftable } from '@ideamap/domain';
import { inTransaction, type Sender } from '@ideamap/worker';
import type { FastifyInstance } from 'fastify';
import type { Trx } from './db.js';
import { ALL_ROLES, type PolicyDeps, type RoutePolicy } from './policy.js';

// Drafts to approve (ARCHITECTURE.md D9, D12, §11; task A6).
//
//   GET  /api/curricula/:curriculumId/drafts                      the review queue
//   POST /api/curricula/:curriculumId/drafts/:draftId/approve     {text?}: approve, or edit and approve
//   POST /api/curricula/:curriculumId/drafts/:draftId/reject      reject (or withdraw an approval)
//   POST /api/curricula/:curriculumId/drafts/:draftId/redraft     ask for a new draft of a rejected one
//   GET  /api/classes/:classId/content                            what students may read: sheet values, else approved text
//
// Who reviews: the curriculum's author, an admin, or a teacher of a class that uses it
// (the F5 `curriculum` scope). Drafts are staff-only; the student route reads approved
// text only. Every decision is an AuditEvent.

export const DRAFT_STAFF_POLICY: RoutePolicy = {
  roles: ['admin', 'author', 'teacher'],
  scope: { kind: 'curriculum', param: 'curriculumId', edit: false },
};
export const CLASS_CONTENT_POLICY: RoutePolicy = {
  roles: ALL_ROLES,
  scope: { kind: 'class', param: 'classId', students: true },
};

export interface DraftRoutesOptions {
  /** Queues the redraft job. */
  boss: Sender;
}

type CurriculumParams = { Params: { curriculumId: string } };
type DraftParams = { Params: { curriculumId: string; draftId: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function latestVersion(trx: Trx, curriculumId: string) {
  return trx
    .selectFrom('curriculum_version')
    .select(['id', 'pack'])
    .where('curriculum_id', '=', curriculumId)
    .orderBy('number', 'desc')
    .limit(1)
    .executeTakeFirst();
}

export function draftRoutes(
  app: FastifyInstance,
  deps: Pick<PolicyDeps, 'now'>,
  options: DraftRoutesOptions,
): void {
  const record = (
    trx: Trx,
    session: { orgId: string; userId: string },
    curriculumId: string,
    action: string,
    draftId: string,
    detail: Record<string, unknown>,
  ) =>
    trx
      .insertInto('audit_event')
      .values({
        org_id: session.orgId,
        actor_id: session.userId,
        action,
        target_type: 'content_draft',
        target_id: draftId,
        curriculum_id: curriculumId,
        detail: json(detail),
        at: deps.now(),
      })
      .execute();

  app.get<CurriculumParams>(
    '/api/curricula/:curriculumId/drafts',
    { config: { policy: DRAFT_STAFF_POLICY } },
    async (req, reply) => {
      const { curriculumId } = req.params;
      const list = await req.withOrg(async (trx): Promise<DraftList> => {
        const version = await latestVersion(trx, curriculumId);
        if (!version) return { items: [], waiting: 0 };
        const pack = version.pack as Pack;
        const rows = await trx
          .selectFrom('content_draft')
          .selectAll()
          .where('curriculum_id', '=', curriculumId)
          .orderBy('created_at')
          .orderBy('id')
          .execute();
        // Only rows the sheet still leaves empty: a sheet value takes precedence (D9).
        const gaps = findDraftable(pack);
        const open = new Set(gaps.map((g) => `${g.kind}/${g.key}`));
        const have = new Set(rows.map((r) => `${r.kind}/${r.row_key}`));
        const items: DraftItem[] = [];
        for (const row of rows) {
          if (!open.has(`${row.kind}/${row.row_key}`)) continue;
          const context = draftContext(pack, row.kind, row.row_key);
          if (!context) continue;
          items.push({
            id: row.id,
            kind: row.kind,
            tab: DRAFT_TABS[row.kind],
            key: row.row_key,
            status: row.status,
            draft: row.draft_text,
            approved: row.approved_text,
            context,
          });
        }
        const approvedIdeas = new Set(
          (
            await trx
              .selectFrom('approved_explanation')
              .select('idea_id')
              .where('curriculum_id', '=', curriculumId)
              .execute()
          ).map((a) => `idea_explanation/${a.idea_id}`),
        );
        const waiting = gaps.filter(
          (g) => !have.has(`${g.kind}/${g.key}`) && !approvedIdeas.has(`${g.kind}/${g.key}`),
        ).length;
        return { items, waiting };
      });
      return reply.header('cache-control', 'no-store').send(list);
    },
  );

  app.post<DraftParams>(
    '/api/curricula/:curriculumId/drafts/:draftId/approve',
    { config: { policy: DRAFT_STAFF_POLICY } },
    async (req, reply) => {
      const parsed = ApproveDraftRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success || !UUID.test(req.params.draftId)) {
        return reply.code(400).send({ error: 'Invalid request' });
      }
      const session = req.session!;
      const { curriculumId, draftId } = req.params;
      const outcome = await req.withOrg(async (trx) => {
        const row = await trx
          .selectFrom('content_draft')
          .selectAll()
          .where('id', '=', draftId)
          .where('curriculum_id', '=', curriculumId)
          .forUpdate()
          .executeTakeFirst();
        if (!row || row.status === 'rejected') return 'missing' as const;
        const text = parsed.data.text ?? row.approved_text ?? row.draft_text;
        if (text.length > DRAFT_MAX[row.kind]) return 'long' as const;
        const edited = text !== row.draft_text;
        await trx
          .updateTable('content_draft')
          .set({
            status: 'approved',
            approved_text: text,
            decided_by: session.userId,
            decided_at: deps.now(),
          })
          .where('id', '=', draftId)
          .execute();
        if (row.kind === 'idea_explanation') {
          // D9's per-curriculum store, which the rest of the product already reads.
          await trx
            .insertInto('approved_explanation')
            .values({
              curriculum_id: curriculumId,
              idea_id: row.row_key,
              org_id: session.orgId,
              text,
              source: 'ai',
              approved_by: session.userId,
            })
            .onConflict((oc) =>
              oc.column('curriculum_id').column('idea_id').doUpdateSet({
                text,
                source: 'ai',
                approved_by: session.userId,
                approved_at: deps.now(),
              }),
            )
            .execute();
        }
        const detail = { kind: row.kind, key: row.row_key };
        if (edited) {
          await record(trx, session, curriculumId, 'draft.edit', draftId, {
            ...detail,
            from: row.approved_text ?? row.draft_text,
            to: text,
          });
        }
        await record(trx, session, curriculumId, 'draft.approve', draftId, { ...detail, edited });
        return { id: draftId, status: 'approved' as const, text };
      });
      if (outcome === 'missing') return reply.code(404).send({ error: 'Not found' });
      if (outcome === 'long') return reply.code(400).send({ error: 'The text is too long.' });
      return outcome;
    },
  );

  app.post<DraftParams>(
    '/api/curricula/:curriculumId/drafts/:draftId/reject',
    { config: { policy: DRAFT_STAFF_POLICY } },
    async (req, reply) => {
      if (!UUID.test(req.params.draftId)) return reply.code(400).send({ error: 'Invalid request' });
      const session = req.session!;
      const { curriculumId, draftId } = req.params;
      const found = await req.withOrg(async (trx) => {
        const row = await trx
          .selectFrom('content_draft')
          .selectAll()
          .where('id', '=', draftId)
          .where('curriculum_id', '=', curriculumId)
          .forUpdate()
          .executeTakeFirst();
        if (!row || row.status === 'rejected') return false;
        await trx
          .updateTable('content_draft')
          .set({
            status: 'rejected',
            approved_text: null,
            decided_by: session.userId,
            decided_at: deps.now(),
          })
          .where('id', '=', draftId)
          .execute();
        if (row.kind === 'idea_explanation') {
          // A withdrawn approval stops reaching students.
          await trx
            .deleteFrom('approved_explanation')
            .where('curriculum_id', '=', curriculumId)
            .where('idea_id', '=', row.row_key)
            .where('source', '=', 'ai')
            .execute();
        }
        await record(trx, session, curriculumId, 'draft.reject', draftId, {
          kind: row.kind,
          key: row.row_key,
          was: row.status,
        });
        return true;
      });
      if (!found) return reply.code(404).send({ error: 'Not found' });
      return { id: draftId, status: 'rejected' as const };
    },
  );

  app.post<DraftParams>(
    '/api/curricula/:curriculumId/drafts/:draftId/redraft',
    { config: { policy: DRAFT_STAFF_POLICY } },
    async (req, reply) => {
      if (!UUID.test(req.params.draftId)) return reply.code(400).send({ error: 'Invalid request' });
      const session = req.session!;
      const { curriculumId, draftId } = req.params;
      const queued = await req.withOrg(async (trx) => {
        const row = await trx
          .selectFrom('content_draft')
          .selectAll()
          .where('id', '=', draftId)
          .where('curriculum_id', '=', curriculumId)
          .where('status', '=', 'rejected')
          .forUpdate()
          .executeTakeFirst();
        const version = await latestVersion(trx, curriculumId);
        if (!row || !version) return false;
        // With the rejected row gone, the next draft job treats the gap as new.
        await trx.deleteFrom('content_draft').where('id', '=', draftId).execute();
        const payload: DraftJobPayload = {
          org_id: session.orgId,
          curriculum_id: curriculumId,
          version_id: version.id,
        };
        await options.boss.send(QUEUES.draftMissing, payload, { db: inTransaction(trx) });
        await record(trx, session, curriculumId, 'draft.redraft', draftId, {
          kind: row.kind,
          key: row.row_key,
        });
        return true;
      });
      if (!queued) return reply.code(404).send({ error: 'Not found' });
      return reply.code(202).send({ id: draftId, status: 'queued' as const });
    },
  );

  app.get<{ Params: { classId: string } }>(
    '/api/classes/:classId/content',
    { config: { policy: CLASS_CONTENT_POLICY } },
    async (req, reply) => {
      const body = await req.withOrg(async (trx) => {
        const klass = await trx
          .selectFrom('class')
          .select(['curriculum_id', 'pinned_version_id'])
          .where('id', '=', req.params.classId)
          .executeTakeFirstOrThrow();
        let version = trx
          .selectFrom('curriculum_version')
          .select(['id', 'pack'])
          .where('curriculum_id', '=', klass.curriculum_id)
          .where('status', '=', 'published');
        version = klass.pinned_version_id
          ? version.where('id', '=', klass.pinned_version_id)
          : version.orderBy('number', 'desc').limit(1);
        const row = await version.executeTakeFirst();
        if (!row) return null;
        // Approved text only: a pending or rejected draft is never selected here.
        const approved = await trx
          .selectFrom('content_draft')
          .select(['kind', 'row_key', 'approved_text'])
          .where('curriculum_id', '=', klass.curriculum_id)
          .where('status', '=', 'approved')
          .execute();
        return classContent(
          row.id,
          row.pack as Pack,
          approved.map((a) => ({ kind: a.kind, key: a.row_key, text: a.approved_text! })),
        );
      });
      if (!body) return reply.code(409).send({ error: 'No curriculum has been published yet.' });
      return reply.header('cache-control', 'no-store').send(body);
    },
  );
}
