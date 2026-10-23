import { QUEUES } from '@ideamap/contracts';
import type { Database } from '@ideamap/db';
import { CompiledQuery, type Transaction } from 'kysely';
import { PgBoss, type Db as BossDb, type Queue } from 'pg-boss';

// The pg-boss queue (ARCHITECTURE.md §3). Its schema is built by the 0003 migration,
// so workers start pg-boss with `migrate: false` and never change it.

export const SCHEMA = 'pgboss';

/** Queue settings: an import retries twice, and a job held for 5 minutes is retried. */
export const QUEUE_OPTIONS = {
  [QUEUES.import]: { retryLimit: 2, retryDelay: 2, expireInSeconds: 300 },
  // Library indexing (§7) runs apart from imports; A3 fills in the work.
  [QUEUES.indexLibrary]: { retryLimit: 3, retryDelay: 30, expireInSeconds: 900 },
} as const satisfies Record<string, Omit<Queue, 'name'>>;

export function createBoss(connectionString: string, options: { supervise?: boolean } = {}) {
  return new PgBoss({
    connectionString,
    schema: SCHEMA,
    migrate: false,
    createSchema: false,
    schedule: false,
    supervise: options.supervise ?? true,
  });
}

/** Creates the queues if they don't exist yet; an existing queue is left as it is. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const [name, options] of Object.entries(QUEUE_OPTIONS)) {
    await boss.createQueue(name, { policy: 'standard', ...options });
  }
}

/**
 * pg-boss's connection for one Kysely transaction, so a job is queued in the same
 * transaction as the rows it refers to: both commit, or neither does.
 */
export function inTransaction(trx: Transaction<Database>): BossDb {
  return {
    async executeSql(text, values = []) {
      const result = await trx.executeQuery(CompiledQuery.raw(text, values));
      return { rows: result.rows as unknown[] as Record<string, unknown>[] };
    },
  };
}

/** The part of pg-boss that queues jobs. */
export type Sender = Pick<PgBoss, 'send'>;
