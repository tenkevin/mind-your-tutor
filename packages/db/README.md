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

| Migration        | Creates                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 extensions  | pgvector, the `app` schema, `app.current_org_id()`, shared trigger functions                                                                  |
| 0002 app role    | `ideamap_app` (no superuser, no BYPASSRLS, no DDL)                                                                                            |
| 0003 job queue   | the pg-boss schema (`pgboss`), from pg-boss's own construction SQL                                                                            |
| 0004 tenancy     | `organization`, `app_user`                                                                                                                    |
| 0005 curricula   | `curriculum`, `curriculum_version`, `curriculum_defaults`, `approved_explanation` (D9)                                                        |
| 0006 library     | `library_doc`, `chunk` (with a `vector(1024)` embedding)                                                                                      |
| 0007 classes     | `class` (with `pinned_version_id`), `class_config`, `enrollment`                                                                              |
| 0008 tracker     | `interaction_event` (monthly partitions), `interaction_event_key`, `interaction_text`, `generated_map_view`, `ai_output`, `progress_snapshot` |
| 0009 jobs, audit | `import_job`, `export_job`, `audit_event`, `ai_interaction`                                                                                   |

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

With no organization set, the app role sees no rows. Children reference parents by
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
