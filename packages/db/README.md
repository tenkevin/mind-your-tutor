# @ideamap/db

Postgres schema, migrations and typed queries (ARCHITECTURE.md §3, §5, §8, §10).

## Local database

Needs Docker. From the repo root:

```
pnpm db:up        # Postgres 16 + pgvector on localhost:5433 (packages/db/compose.yaml)
pnpm db:migrate   # apply every pending migration
pnpm db:status    # list applied and pending migrations
pnpm db:reset     # drop everything and migrate again (a clean database in about a second)
pnpm db:stop      # stop the container (data is kept in a volume)
```

The commands connect to `DATABASE_URL`, defaulting to the compose database
(`postgres://postgres:postgres@localhost:5433/ideamap`, a local-only password).

## Tests

The database tests run as part of `pnpm test` when `DATABASE_URL` points at a server
where that role may create databases. Each test file creates its own database, migrates
it from empty and drops it afterwards.

```
DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres pnpm --filter @ideamap/db test
```

Without `DATABASE_URL` they are skipped locally. In CI (`CI` is set) they fail instead.
`performance.test.ts` seeds 1,000,000 events and 10,000 chunks; set
`IDEAMAP_PERF_EVENTS` and `IDEAMAP_PERF_CHUNKS` to change that, and
`IDEAMAP_PERF_VERBOSE=1` to print the query plans.

## Migrations

Migrations use [Kysely](https://kysely.dev)'s migrator, and queries use Kysely's typed
query builder, so one dependency covers both. Each migration is a TypeScript file in
`src/migrations/` holding plain SQL, one per concern, listed in `src/migrations/index.ts`.
Pending migrations run in one transaction under a lock. Never edit a migration that has
run; add a new one.

| Migration          | Creates                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 extensions    | pgvector, the `app` schema, `app.current_org_id()`, shared trigger functions                                                                       |
| 0002 app role      | `ideamap_app` (no superuser, no BYPASSRLS, no DDL)                                                                                                 |
| 0003 job queue     | the pg-boss schema (`pgboss`), from pg-boss's own construction SQL                                                                                 |
| 0004 tenancy       | `organization`, `app_user`                                                                                                                         |
| 0005 curricula     | `curriculum`, `curriculum_version`, `curriculum_defaults`, `approved_explanation` (D9)                                                             |
| 0006 library       | `library_doc`, `chunk` (with a `vector(1024)` embedding)                                                                                           |
| 0007 classes       | `class` (with `pinned_version_id`), `class_config`, `enrollment`                                                                                   |
| 0008 tracker       | `interaction_event` (monthly partitions), `interaction_event_key`, `interaction_text`, `generated_map_view`, `ai_output`, `progress_snapshot`      |
| 0009 jobs, audit   | `import_job`, `export_job`, `audit_event`, `ai_interaction`                                                                                        |
| 0010 class library | `class_library_setting` (per shared document: `use_for` or `off`), `class_library_doc`, `class_chunk` (D11)                                        |
| 0012 privacy       | retention settings, the `ideamap_retention` role, audit triggers, audit `class_id`/`curriculum_id`/`before`/`after`, `student_record` exports (F6) |

## Roles and row-level security

- **Migration role:** runs migrations and owns every table. Creating pgvector needs a
  superuser (or `rds_superuser` and the like on a managed host).
- **App role, `ideamap_app`:** what the API and workers use. Migrations create it
  `NOLOGIN` with no password. A deployment gives it a login outside the migrations, for
  example `ALTER ROLE ideamap_app LOGIN PASSWORD '…'` from a secret store, or grants it
  to a login role.

Every table holds one organization's rows and has row-level security enabled and
forced. The app acts for an organization inside a transaction:

```ts
import { createDb, withOrg } from '@ideamap/db';

const db = createDb(process.env.DATABASE_URL!);
const classes = await withOrg(db, orgId, (trx) => trx.selectFrom('class').selectAll().execute());
```

With no organization set, the app role sees no rows.

Class uploads (`class_library_doc`, `class_chunk`; D11) are also scoped to one class by
a restrictive policy: they're visible only inside `withClass(db, orgId, classId, fn)`,
for that class, so one class never sees another's uploads, even in the same
organization. Children reference parents by
`(org_id, id)`, so a row can't point at another organization's data either.

## Append-only and immutable data

- `interaction_event`, `interaction_event_key`, `generated_map_view`, `ai_output` and
  `audit_event` refuse `UPDATE` and `DELETE` for every role, by trigger, and the app role
  is granted only `SELECT` and `INSERT` on them.
- A published or archived `curriculum_version` can't have its body changed or be
  deleted. Status moves draft → published → archived, and archived → published for a
  rollback. A class can't be pinned to a draft.

## Event partitions

`interaction_event` is range-partitioned by month on `recorded_at` (server time, UTC
month boundaries). Migration 0008 creates this month and the next two. Run
`SELECT app.ensure_interaction_event_partitions()` as the migration role at least monthly
(a pg-boss cron job, for example) to keep two months ahead. Old months are retired by
detaching or dropping their partition.

Postgres can't enforce a unique index across partitions unless it includes the
partition key, so the event `id` and `(student_id, seq)` are kept unique by
`interaction_event_key`, filled by a statement-level trigger on every insert.

## Typed access

`src/schema.ts` has a row type for every table. jsonb columns carry the
`@ideamap/contracts` type they hold (`pack: Pack`, `config: ClassConfig`, …) and are
written with `json(value)`, which type-checks the value. `columns.test.ts` compares the
types with the live schema and round-trips rows through the contract schemas. bigint
columns are read as numbers; timestamps as `Date`.

## Privacy: audit, retention, FERPA (F6)

What every column holds, who sees it and how long it's kept is in
[`docs/privacy/data-inventory.md`](../../docs/privacy/data-inventory.md).
`inventory.test.ts` fails if a migration adds a column the inventory doesn't list.

### Audit log

Triggers write an `audit_event` row for every change to `organization`, `class`,
`class_config`, `curriculum_defaults`, `approved_explanation` (D9), `class_library_setting`
and `class_library_doc` (D11), and for every publish, archive or restore of a
`curriculum_version`. `before` and `after` hold only what changed (a jsonb column is
compared one level down, so a due date change reads `config.units`), and any key that
looks like a secret is logged as `[redacted]`. Name the user acting with `actAs`:

```ts
await withOrg(db, orgId, async (trx) => {
  await actAs(trx, userId); // recorded as the actor; must be in the same org
  await trx
    .updateTable('class_config')
    .set({ config: json(next) })
    .where('class_id', '=', id)
    .execute();
});
```

Without `actAs`, the row's own `updated_by` (or `approved_by`, `uploaded_by`) is used.
`writeAudit` records actions no trigger sees, and `classHistory` lists a class's changes
for Teacher Settings. The log refuses `UPDATE`, `DELETE` and `TRUNCATE` for every role.

### Retention

`organization.text_retention_days` and `ai_retention_days` (default 90, §10) and
`export_retention_days` (default 7) are per organization. The worker's retention job
(`apps/worker/src/retention.ts`) deletes what is past them, in batches, as the
`ideamap_retention` role. That role can see and delete only rows that are already due,
and can't read their text. Like the app role it is `NOLOGIN`; give the worker's login
membership:

```sql
GRANT ideamap_retention TO ideamap_worker; -- the worker's login role
```

Run it once by hand with `pnpm --filter @ideamap/worker retention` (`DATABASE_URL` set
to that login, `EXPORT_DIR` to the export directory), or daily with `scheduleRetention`.

### FERPA export and delete

`exportStudent` and `deleteStudent` (in `privacy.ts`, served by `apps/api` at
`POST /privacy/students/:id/export` and `DELETE /privacy/students/:id`) work only for an
admin of the student's organization. Delete removes the student's name, email, roster
ids, typed text, AI transcripts, progress cache, enrollments and export files, and keeps
their tracker events under the pseudonymous id. It is safe to repeat: after a backup
restore, run it again for every `student.deleted` audit row newer than the backup.
