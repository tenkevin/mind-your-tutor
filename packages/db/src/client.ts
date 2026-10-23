import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import { ACTOR_SETTING, CLASS_SETTING, ORG_SETTING } from './migrations/helpers.js';
import type { Database, JsonText } from './schema.js';

export type Db = Kysely<Database>;

const INT8 = 20;

/** bigint columns (seq, last_seq) are read as numbers; anything unsafe throws. */
function parseInt8(value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`bigint ${value} is not a safe integer`);
  return n;
}

const types = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    oid === INT8 && format !== 'binary'
      ? parseInt8
      : pg.types.getTypeParser(oid, format)) as typeof pg.types.getTypeParser,
};

export function createPool(connectionString: string, config: pg.PoolConfig = {}): pg.Pool {
  const pool = new pg.Pool({ connectionString, types, ...config });
  // A connection can end under us (a server restart, a killed backend). The query in
  // flight fails and the pool replaces the connection; without these listeners the
  // 'error' event would crash the process instead.
  const lost = (error: Error) => {
    console.warn(`database connection lost: ${error.message}`);
  };
  pool.on('error', lost);
  pool.on('connect', (client) => client.on('error', lost));
  return pool;
}

export function createDb(connectionString: string, config: pg.PoolConfig = {}): Db {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: createPool(connectionString, config) }),
  });
}

/**
 * Run `fn` in a transaction that acts for one organization. Row-level security
 * (ARCHITECTURE.md §10) shows and accepts only that organization's rows; outside
 * `withOrg` the app role sees none.
 */
export function withOrg<T>(db: Db, orgId: string, fn: (trx: Transaction<Database>) => Promise<T>) {
  return db.transaction().execute(async (trx) => {
    await sql`SELECT set_config(${ORG_SETTING}, ${orgId}, true)`.execute(trx);
    return fn(trx);
  });
}

/** JSON text for a jsonb column. Arrays need this: pg would send them as Postgres arrays. */
export function json<T>(value: T): JsonText<T> {
  return JSON.stringify(value) as JsonText<T>;
}

/** pgvector text for an embedding. */
export function toVector(values: readonly number[]): string {
  if (!values.every(Number.isFinite)) throw new RangeError('An embedding must be finite numbers.');
  return `[${values.join(',')}]`;
}

export function fromVector(text: string): number[] {
  return JSON.parse(text) as number[];
}

/**
 * As `withOrg`, also acting for one class. Class uploads (class_library_doc,
 * class_chunk; D11) are visible only inside `withClass` for their own class.
 */
export function withClass<T>(
  db: Db,
  orgId: string,
  classId: string,
  fn: (trx: Transaction<Database>) => Promise<T>,
) {
  return withOrg(db, orgId, async (trx) => {
    await sql`SELECT set_config(${CLASS_SETTING}, ${classId}, true)`.execute(trx);
    return fn(trx);
  });
}

/**
 * Name the user the transaction acts for. Audit rows written by triggers (0012) and
 * by `writeAudit` record them as the actor. Call inside `withOrg`: the user must
 * belong to that organization, or the audited write fails.
 */
export async function actAs(trx: Transaction<Database>, actorId: string): Promise<void> {
  await sql`SELECT set_config(${ACTOR_SETTING}, ${actorId}, true)`.execute(trx);
}
