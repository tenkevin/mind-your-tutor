import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MemoryObjectStore } from '@ideamap/connectors';
import { APP_ROLE, ORG_SETTING, createDb, migrateUp, type Db } from '@ideamap/db';
import { sql } from 'kysely';
import type { PgBoss } from 'pg-boss';
import type { Caller, OrgScope } from '../imports.js';
import { createBoss } from '../queue.js';

// Test databases, as in packages/db's harness: DATABASE_URL names a server and a role
// that may create databases. Each test file migrates its own database and drops it.
// Without DATABASE_URL the database tests are skipped locally, and fail in CI.

export const adminUrl = process.env.DATABASE_URL;
if (!adminUrl && process.env.CI) {
  throw new Error('DATABASE_URL must be set in CI: the database tests may not be skipped.');
}
export const hasDatabase = Boolean(adminUrl);

export const fixture = (name: string) =>
  readFileSync(new URL(`../../../../fixtures/water-cycle/${name}`, import.meta.url));

export interface TestDatabase {
  url: string;
  db: Db;
  drop(): Promise<void>;
}

export async function freshDatabase(): Promise<TestDatabase> {
  const name = `ideamap_test_${randomBytes(6).toString('hex')}`;
  const admin = createDb(adminUrl!, { max: 1 });
  await sql`CREATE DATABASE ${sql.id(name)}`.execute(admin);
  await admin.destroy();
  const url = new URL(adminUrl!);
  url.pathname = `/${name}`;
  const db = createDb(url.toString(), { max: 8 });
  const drop = async () => {
    await db.destroy();
    const again = createDb(adminUrl!, { max: 1 });
    await sql`DROP DATABASE IF EXISTS ${sql.id(name)} WITH (FORCE)`.execute(again);
    await again.destroy();
  };
  try {
    await migrateUp(db);
  } catch (error) {
    await drop();
    throw error;
  }
  return { url: url.toString(), db, drop };
}

/**
 * The API's and worker's view of the database: the app role (no superuser, row-level
 * security enforced), acting for one organization. `SET LOCAL ROLE` drops the test
 * connection's own privileges for the transaction.
 */
export function appScope(db: Db): OrgScope {
  return (orgId, fn, options) =>
    (options?.isolation
      ? db.transaction().setIsolationLevel(options.isolation)
      : db.transaction()
    ).execute(async (trx) => {
      await sql`SET LOCAL ROLE ${sql.id(APP_ROLE)}`.execute(trx);
      await sql`SELECT set_config(${ORG_SETTING}, ${orgId}, true)`.execute(trx);
      return fn(trx);
    });
}

export interface Org {
  orgId: string;
  curriculumId: string;
  teacher: Caller;
  student: Caller;
}

/** One organization with a teacher, a student and an empty curriculum. */
export async function seedOrg(db: Db, label: string): Promise<Org> {
  const org = await db
    .insertInto('organization')
    .values({ name: `Test school ${label}` })
    .returning('id')
    .executeTakeFirstOrThrow();
  const user = (role: 'teacher' | 'student') =>
    db
      .insertInto('app_user')
      .values({ org_id: org.id, role, name: `Test ${role} ${label}` })
      .returning('id')
      .executeTakeFirstOrThrow();
  const teacher = await user('teacher');
  const student = await user('student');
  const curriculum = await db
    .insertInto('curriculum')
    .values({ org_id: org.id, title: `Water cycle ${label}`, created_by: teacher.id })
    .returning('id')
    .executeTakeFirstOrThrow();
  return {
    orgId: org.id,
    curriculumId: curriculum.id,
    teacher: { orgId: org.id, userId: teacher.id, role: 'teacher' },
    student: { orgId: org.id, userId: student.id, role: 'student' },
  };
}

/** A started pg-boss on the test database, polling quickly. */
export async function startBoss(url: string, supervise = false): Promise<PgBoss> {
  const boss = createBoss(url, { supervise });
  boss.on('error', () => undefined);
  await boss.start();
  return boss;
}

export const store = () => new MemoryObjectStore();
