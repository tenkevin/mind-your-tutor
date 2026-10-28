import {
  DRAFT_MAX,
  DraftJobPayloadSchema,
  type ClassConfig,
  type DraftKind,
  type Pack,
  type PersonaOverride,
} from '@ideamap/contracts';
import { draftContext, findDraftable, type DraftContext } from '@ideamap/domain';
import type { OrgScope } from './imports.js';

// Drafting the empty cells of an imported curriculum (ARCHITECTURE.md §7, D9, D12;
// task A6). The import queues one job per new version that has gaps and never waits for
// it (A6-P1). The job asks a `DraftWriter` for one draft per gap and stores each as a
// pending `content_draft` row, which only staff can read; students see a row's text
// only after a teacher approves it. The writer is the AI gateway's (apps/api), so the
// worker holds no model key and builds no prompt.

export interface DraftRequest {
  orgId: string;
  kind: DraftKind;
  key: string;
  pack: Pack;
  /** The curriculum's defaults, whose personas sit under the pack's (D13). */
  personas: readonly PersonaOverride[];
  context: DraftContext;
}

export interface DraftReply {
  text: string;
  model: string;
}

export type DraftWriter = (request: DraftRequest) => Promise<DraftReply>;

export interface DraftDeps {
  scope: OrgScope;
  write: DraftWriter;
  /** Drafts written at once; default 4. */
  concurrency?: number;
}

export interface DraftOutcome {
  drafted: number;
  failed: number;
}

/** Everything the gap list needs: the version's pack and which rows are already settled. */
async function plan(deps: DraftDeps, orgId: string, curriculumId: string, versionId: string) {
  return deps.scope(orgId, async (trx) => {
    const version = await trx
      .selectFrom('curriculum_version')
      .select('pack')
      .where('id', '=', versionId)
      .where('curriculum_id', '=', curriculumId)
      .executeTakeFirst();
    if (!version) return null;
    const pack = version.pack as Pack;
    const known = await trx
      .selectFrom('content_draft')
      .select(['kind', 'row_key'])
      .where('curriculum_id', '=', curriculumId)
      .execute();
    const approved = await trx
      .selectFrom('approved_explanation')
      .select('idea_id')
      .where('curriculum_id', '=', curriculumId)
      .execute();
    const defaults = await trx
      .selectFrom('curriculum_defaults')
      .select('config')
      .where('curriculum_id', '=', curriculumId)
      .executeTakeFirst();
    const settled = new Set([
      ...known.map((k) => `${k.kind}/${k.row_key}`),
      ...approved.map((a) => `idea_explanation/${a.idea_id}`),
    ]);
    const personas = ((defaults?.config as ClassConfig | undefined)?.personas ??
      []) as PersonaOverride[];
    return {
      pack,
      personas,
      targets: findDraftable(pack).filter((t) => !settled.has(`${t.kind}/${t.key}`)),
    };
  });
}

/**
 * Drafts every gap in a version that has no draft or approval yet. Safe to run again:
 * a retry only does what is left. If any draft failed it throws once the rest are
 * stored, so the queue retries just those.
 */
export async function runDrafting(deps: DraftDeps, data: unknown): Promise<DraftOutcome> {
  const {
    org_id: orgId,
    curriculum_id: curriculumId,
    version_id: versionId,
  } = DraftJobPayloadSchema.parse(data);
  const work = await plan(deps, orgId, curriculumId, versionId);
  if (!work) return { drafted: 0, failed: 0 };
  const { pack, personas, targets } = work;

  let drafted = 0;
  let failed = 0;
  const queue = [...targets];
  const worker = async () => {
    for (let target = queue.shift(); target; target = queue.shift()) {
      const context = draftContext(pack, target.kind, target.key);
      if (!context) continue;
      try {
        const reply = await deps.write({ ...target, orgId, pack, personas, context });
        const text = reply.text.trim().slice(0, DRAFT_MAX[target.kind]);
        if (!text) throw new Error('empty draft');
        await deps.scope(orgId, (trx) =>
          trx
            .insertInto('content_draft')
            .values({
              org_id: orgId,
              curriculum_id: curriculumId,
              kind: target.kind,
              row_key: target.key,
              draft_text: text,
              model: reply.model,
              source_version_id: versionId,
            })
            .onConflict((oc) => oc.columns(['curriculum_id', 'kind', 'row_key']).doNothing())
            .execute(),
        );
        drafted += 1;
      } catch {
        failed += 1;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(deps.concurrency ?? 4, targets.length) }, worker),
  );
  if (failed > 0) throw new Error(`${failed} of ${targets.length} drafts failed`);
  return { drafted, failed };
}
