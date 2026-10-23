# QA criteria: F4b · Close F4 QA findings (event-key ledger isolation, class-scoped library settings)

Done when: findings 1, 2 and 4 in `docs/qa/reports/F4.md` are fixed by a new migration, with database tests.
Sources: `docs/qa/reports/F4.md`, `docs/qa/F4.md` (S1, S2), `docs/ARCHITECTURE.md` §8, §10 and D11.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4b-F1 | must | Event keys belong to the right school | As the app role acting for org A, insert an `interaction_event_key` row (directly, if still allowed) for a student of org B | Refused: a foreign key on `(org_id, student_id)` → `app_user (org_id, id)`, and the app role has no direct `INSERT` on the ledger. Keys are written only by `app.record_interaction_event_keys()` (`SECURITY DEFINER`, owned by the migration role, pinned `search_path`) |
| F4b-F2 | must | No cross-school blocking or probing | Repeat the F4 report's finding 1 sequence end to end | Org A can't create keys for org B's students, can't learn whether an org-B student has a given `seq`, and org B's genuine event insert succeeds |
| F4b-F3 | must | Library settings are class-scoped (D11) | Acting for class A1, read and write `class_library_setting` rows of class A2 in the same org | Reads return nothing; writes are refused (the same restrictive `class_scope` policy as `class_library_doc`) |
| F4b-F4 | must | Normal use still works | Run the full F4 database test suite plus new tests for F4b-F1 to F3 | All pass. Migrations still run cleanly from empty and are a no-op on re-run (F4-F7) |
| F4b-F5 | should | Partition pruning noted for M1 (finding 5) | Read ARCHITECTURE.md §8.5 | A sentence saying replay queries should be bounded by `recorded_at` (for example from the latest snapshot) so old partitions are skipped |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4b-S1 | must | App role privileges are minimal | List the app role's grants on every table and function | No `INSERT`, `UPDATE` or `DELETE` on the event-key ledger; `EXECUTE` only on the functions it needs; `TEMP` revoked from `PUBLIC` on the database (finding 4), or the PR explains why not |
| F4b-S2 | must | `SECURITY DEFINER` is safe | Inspect the function | `search_path` is pinned to trusted schemas; inputs are checked against the caller's `app.org_id`; it can't be used to write another org's rows |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4b-P1 | must | Ingest isn't slowed | Rerun F4-P3 (100,000 events in batches of 500) | Still over 5,000 rows per second |

## Usability (developers)

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4b-U1 | must | The isolation model is written down | Read `packages/db` README | Explains org RLS, class scope (uploads and settings), the ledger function, and how to run the isolation tests |
