import { RESOLVED_FLAG_DAYS, RETENTION_ROLE, type Db, type ExportStore } from '@ideamap/db';
import { sql, type Transaction } from 'kysely';
import type { Database } from '@ideamap/db';

// The retention job (ARCHITECTURE.md §10; task F6). Deletes typed student text, AI
// transcripts and ended sign-in sessions once they are past their organization's
// retention period, and removes expired export files. Periods are per organization (organization.*_retention_days);
// the data inventory (docs/privacy/data-inventory.md) lists them.
//
// It runs as `ideamap_retention`, which can see and delete only rows that are already
// due and can't read their text, so a bug here can't delete anything early. Tracker
// events are out of its reach: events refer to text by id and a missing text resolves
// to a "removed" marker (§8.2), so replay is unaffected.
//
// Work happens in small batches, each its own transaction: an interrupted run loses
// at most one uncommitted batch, and running again carries on. Row locks only, so
// inserts keep working while it runs.

export const RETENTION_QUEUE = 'privacy-retention';
/** Daily at 03:17 UTC. */
export const RETENTION_CRON = '17 3 * * *';
export const DEFAULT_BATCH_SIZE = 5000;

export interface RetentionOptions {
  /** Rows per transaction. */
  batchSize?: number;
  /** Removes expired export files; without one, export files are left for a later run. */
  store?: ExportStore;
  /** Checked between batches; an aborted run stops cleanly after the current batch. */
  signal?: AbortSignal;
  /** Called after each committed batch. */
  onBatch?: (batch: { kind: RetentionKind; orgId: string; rows: number }) => void;
}

export type RetentionKind =
  'interaction_text' | 'ai_interaction' | 'auth_session' | 'safety_flag' | 'export_files';

export interface RetentionResult {
  interaction_text: number;
  ai_interaction: number;
  auth_session: number;
  /** Resolved safety flags past 30 days (D32); flags that go with their transcript aren't counted. */
  safety_flag: number;
  export_files: number;
  /** True when the signal stopped the run before it finished. */
  aborted: boolean;
}

/** Run `fn` in a transaction as the retention role. The login must be a member of it. */
function asRetention<T>(db: Db, fn: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`SET LOCAL ROLE ${sql.id(RETENTION_ROLE)}`.execute(trx);
    return fn(trx);
  });
}

/** Per table: the organization period it follows, and the moment a row's period runs from. */
const DUE = {
  interaction_text: { kind: 'text', from: sql.ref('created_at') },
  ai_interaction: { kind: 'ai', from: sql.ref('created_at') },
  // A session's period runs from when it ended: revoked, or else expired.
  auth_session: { kind: 'session', from: sql`coalesce(revoked_at, expires_at)` },
} as const;

export async function runRetention(
  db: Db,
  options: RetentionOptions = {},
): Promise<RetentionResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError('batchSize must be a positive integer');
  }
  const result: RetentionResult = {
    interaction_text: 0,
    ai_interaction: 0,
    auth_session: 0,
    safety_flag: 0,
    export_files: 0,
    aborted: false,
  };
  const stopped = () => {
    if (options.signal?.aborted) result.aborted = true;
    return result.aborted;
  };

  // The retention role sees every organization's id and periods, nothing else.
  const orgs = await asRetention(db, (trx) =>
    trx.selectFrom('organization').select('id').orderBy('id').execute(),
  );

  // Resolved safety flags first (D32), so they're counted before a transcript's own
  // deletion carries away any that are still open. The role's policy shows only flags
  // resolved over RESOLVED_FLAG_DAYS ago; the explicit condition mirrors it for the index.
  for (const { id: orgId } of orgs) {
    for (;;) {
      if (stopped()) return result;
      const deleted = await asRetention(db, async (trx) => {
        const r = await sql`
          DELETE FROM safety_flag WHERE id IN (
            SELECT id FROM safety_flag
            WHERE org_id = ${orgId} AND status = 'resolved'
              AND resolved_at < now() - make_interval(days => ${RESOLVED_FLAG_DAYS + 1})
            ORDER BY resolved_at
            LIMIT ${batchSize})
        `.execute(trx);
        return Number(r.numAffectedRows ?? 0);
      });
      if (deleted > 0) {
        result.safety_flag += deleted;
        options.onBatch?.({ kind: 'safety_flag', orgId, rows: deleted });
      }
      if (deleted < batchSize) break;
    }
  }

  for (const table of ['interaction_text', 'ai_interaction', 'auth_session'] as const) {
    const { kind, from } = DUE[table];
    for (const { id: orgId } of orgs) {
      for (;;) {
        if (stopped()) return result;
        // The policy shows only due rows; the explicit cutoff lets the
        // (org_id, created_at) indexes find them.
        const deleted = await asRetention(db, async (trx) => {
          const r = await sql`
            DELETE FROM ${sql.table(table)} WHERE id IN (
              SELECT id FROM ${sql.table(table)}
              WHERE org_id = ${orgId}
                AND ${from} < app.retention_cutoff(${orgId}, ${kind})
              ORDER BY ${from}
              LIMIT ${batchSize})
          `.execute(trx);
          return Number(r.numAffectedRows ?? 0);
        });
        if (deleted > 0) {
          result[table] += deleted;
          options.onBatch?.({ kind: table, orgId, rows: deleted });
        }
        if (deleted < batchSize) break;
      }
    }
  }

  const store = options.store;
  if (store) {
    for (;;) {
      if (stopped()) return result;
      // The file goes first, then its reference, in one transaction: an interrupted
      // batch leaves references to files that are gone, which the next run clears.
      const removed = await asRetention(db, async (trx) => {
        const due = await trx
          .selectFrom('export_job')
          .select(['id', 'org_id', 'result_ref'])
          .where('result_ref', 'is not', null)
          .orderBy('created_at')
          .limit(batchSize)
          .execute();
        for (const job of due) await store.remove(job.result_ref!);
        if (due.length > 0) {
          await trx
            .updateTable('export_job')
            .set({ result_ref: null })
            .where(
              'id',
              'in',
              due.map((j) => j.id),
            )
            .execute();
        }
        return due.length;
      });
      if (removed > 0) {
        result.export_files += removed;
        options.onBatch?.({ kind: 'export_files', orgId: '*', rows: removed });
      }
      if (removed < batchSize) break;
    }
  }
  return result;
}

/** The parts of PgBoss the schedule needs. */
export interface RetentionQueue {
  createQueue(name: string): Promise<void>;
  schedule(
    name: string,
    cron: string,
    data?: object | null,
    options?: { tz?: string },
  ): Promise<void>;
  work(name: string, handler: () => Promise<unknown>): Promise<string>;
}

/** Run the retention job daily through pg-boss. Rerunning after a failure is safe. */
export async function scheduleRetention(
  boss: RetentionQueue,
  run: () => Promise<RetentionResult>,
  cron: string = RETENTION_CRON,
): Promise<void> {
  await boss.createQueue(RETENTION_QUEUE);
  await boss.schedule(RETENTION_QUEUE, cron, null, { tz: 'UTC' });
  await boss.work(RETENTION_QUEUE, run);
}
