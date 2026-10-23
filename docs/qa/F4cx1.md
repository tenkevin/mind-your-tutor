# QA criteria: F4cx1 · Fix Codex errors F4-E1 and F4-E2 (temporary-table shadowing)

Done when: no app-role session can bypass event uniqueness or the draft-pin guard by creating a temporary table with the same name.
Source: `docs/qa/codex/Codex-F4-database.md`, errors F4-E1 and F4-E2 (one root cause: unqualified relation names in trigger and guard functions). Suggestions from the same file are included as should checks.

> F4-E1 — High: a temporary `interaction_event_key` makes the trigger in `0008_tracker.ts` (unqualified reference, line 69) write to the temp table, so duplicate event ids and duplicate (student, seq) are accepted.
> F4-E2 — High: an empty temporary `curriculum_version` makes `app.guard_class_pin()` (`0007_classes.ts`) read NULL, so a class can be pinned to a draft, against D2.


Note: F4b (PR #12, migration 0011) already makes `app.record_interaction_event_keys()` SECURITY DEFINER with `search_path = pg_catalog, pg_temp` and schema-qualified tables, and revokes TEMP from the app role. F4cx1 covers what's left (`guard_class_pin` and every other function), and its tests must still pass with TEMP both revoked and granted (F4cx1-S1).

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4cx1-F1 | must | Event uniqueness can't be shadowed | As `ideamap_app` with org context, create a temp `interaction_event_key` with the same columns, then insert two events with the same id, and then two with the same (student, seq), including across month partitions | The second insert is rejected each time; `public.interaction_event_key` holds the keys |
| F4cx1-F2 | must | The draft-pin guard can't be shadowed | With an empty temp `curriculum_version`, and with a temp table that says the draft is `published`, try to pin a real draft | Refused every time. Pinning a published version still works; tenant and curriculum constraints still hold |
| F4cx1-F3 | must | Every security-relevant function is safe | List every trigger, guard and `SECURITY DEFINER` function in the migrations | Each schema-qualifies every relation, or sets `search_path` to trusted schemas with `pg_temp` last. Missing or unexpected states fail closed. A test enumerates the functions and asserts this |
| F4cx1-F4 | must | Regression suite | Read the DB tests | The two Codex reproductions are tests, under the app role, in a new migration's test file |
| F4cx1-F5 | must | Everything passes | Root lint, format:check, typecheck, test (with DATABASE_URL), build, plan check | All exit 0; CI green on the PR head that includes current idea-map |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4cx1-S1 | must | Defence in depth | Check the app role's `TEMP` privilege | Revoked (from F4b), or the PR shows the qualified functions are safe even when TEMP is allowed (tests run both ways) |
| F4cx1-S2 | should | Broader tenant and class CRUD probes (Codex suggestion) | As the app role, try insert, update and delete on every tenant table for another org and another class | Refused or zero rows in every case |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4cx1-P1 | must | No slowdown | Rerun F4-P3 | Still over 5,000 events per second |

## Usability (developers)

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4cx1-U1 | must | Rule written down | Read `packages/db/README.md` | States the rule: qualify relations and pin `search_path` in every function, and points to the enumerating test |
