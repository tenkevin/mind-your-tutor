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

| Migration             | Creates                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 extensions       | pgvector, the `app` schema, `app.current_org_id()`, shared trigger functions                                                                  |
| 0002 app role         | `ideamap_app` (no superuser, no BYPASSRLS, no DDL)                                                                                            |
| 0003 job queue        | the pg-boss schema (`pgboss`), from pg-boss's own construction SQL                                                                            |
| 0004 tenancy          | `organization`, `app_user`                                                                                                                    |
| 0005 curricula        | `curriculum`, `curriculum_version`, `curriculum_defaults`, `approved_explanation` (D9)                                                        |
| 0006 library          | `library_doc`, `chunk` (with a `vector(1024)` embedding)                                                                                      |
| 0007 classes          | `class` (with `pinned_version_id`), `class_config`, `enrollment`                                                                              |
| 0008 tracker          | `interaction_event` (monthly partitions), `interaction_event_key`, `interaction_text`, `generated_map_view`, `ai_output`, `progress_snapshot` |
| 0009 jobs, audit      | `import_job`, `export_job`, `audit_event`, `ai_interaction`                                                                                   |
| 0010 class library    | `class_library_setting` (per shared document: `use_for` or `off`), `class_library_doc`, `class_chunk` (D11)                                   |
| 0011 isolation        | event key ledger written only by its trigger function; class-scoped library settings; no TEMP for PUBLIC (F4 QA findings)                     |
| 0012 function binding | Trusted `search_path` for every app function; schema-qualified relation access and a fail-closed class pin guard (F4cx1)                      |

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

A class's library settings and uploads (`class_library_setting`, `class_library_doc`,
`class_chunk`; D11) are also scoped to one class by a restrictive `class_scope` policy:
they're visible and writable only inside `withClass(db, orgId, classId, fn)`, for that
class, so one class never sees or changes another's settings or uploads, even in the
same organization. Children reference parents by `(org_id, id)`, so a row can't point
at another organization's data either.

The event key ledger (`interaction_event_key`) is readable by the app role but not
writable. Its rows are written only by `app.record_interaction_event_keys()`, the
trigger on `interaction_event`. The function is `SECURITY DEFINER`, owned by the
migration role, with its persistent relation references qualified as `public.*` and
`search_path` pinned to `pg_catalog, pg_temp`. It refuses any row that isn't
for a student of the organization the transaction acts for. The ledger references the
student by `(org_id, student_id)` and keys event ids by `(org_id, id)`, so one
organization can't write, block or probe another's keys.

The app role holds only the table privileges each migration grants. It can execute
only `app.current_org_id()` and `app.current_class_id()` in the `app` schema (trigger
functions fire without EXECUTE). Every function in `app` pins `search_path` to the
trusted `pg_catalog, pg_temp` order; every persistent relation reference in a function
is schema-qualified. Keep this rule for every new function and verify the full
function/trigger/definer inventory with `src/function_binding.test.ts`.
`PUBLIC` has no `TEMP` on the database, so the app role can't create temporary tables
either; the tests also grant TEMP in a disposable database to verify the function
binding remains safe when that defense is absent.

### Rolling back migration 0011

Migration 0011 changes event ids from globally unique to unique per organization. Its
downgrade restores a global primary key on `interaction_event_key(id)`. After 0011,
different organizations may legitimately record the same event id, so a populated
ledger can contain rows that cannot fit that older constraint. Before considering the
downgrade, run this preflight as the migration role:

```sql
SELECT id, array_agg(org_id ORDER BY org_id) AS organizations, count(*) AS copies
FROM public.interaction_event_key
GROUP BY id
HAVING count(*) > 1;
```

Any returned row blocks the downgrade. Do not delete or rewrite ledger rows to make
the constraint fit: event history is append-only. Keep migration 0011 applied and
ship a forward correction that preserves the per-organization keys. An empty-database
down/up check verifies migration mechanics only; it does not establish that this
downgrade is safe with populated data.

The isolation tests are `src/security.test.ts` (organization and class scope, the app
role), `src/isolation.test.ts` (the ledger, class-scoped settings and privileges), and
`src/function_binding.test.ts` (function inventory and temporary-table shadowing):

```
DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres \
  pnpm --filter @ideamap/db exec vitest run src/security.test.ts src/isolation.test.ts src/function_binding.test.ts
```

## Append-only and immutable data

- `interaction_event`, `interaction_event_key`, `generated_map_view`, `ai_output` and
  `audit_event` refuse `UPDATE` and `DELETE` for every role, by trigger, and the app role
  is granted only `SELECT` and `INSERT` on them (only `SELECT` on `interaction_event_key`).
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
`interaction_event_key`, filled by a statement-level trigger on every insert (the id is
unique per organization). Replay queries should bound `recorded_at`, for example from
the latest progress snapshot, so old partitions are skipped (ARCHITECTURE.md §8.5).

## Typed access

`src/schema.ts` has a row type for every table. jsonb columns carry the
`@ideamap/contracts` type they hold (`pack: Pack`, `config: ClassConfig`, …) and are
written with `json(value)`, which type-checks the value. `columns.test.ts` compares the
types with the live schema and round-trips rows through the contract schemas. bigint
columns are read as numbers; timestamps as `Date`.
