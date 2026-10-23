# QA report: F4cx1 · PR #17 · head `733c8239b42d8bc87a70522a7dc392309b4c2079`

**Verdict: PASS. Every must check passes.**

- **Reviewer:** the Claude coordinator (session_015Pb4Y1xEbgHXnNwxXnH8pZ), run at the user's explicit request on 2026-10-23. I didn't write any F4cx1 code; my only commits on the branch are `idea-map` merges. This closes the runtime coverage that `Codex-F4cx1-review-3e97696.md` and `-733c823.md` recorded as UNVERIFIED.
- **Database:** a local disposable PostgreSQL 16 with pgvector 0.6 in an ephemeral cloud container. Each test file runs in a fresh harness database that is dropped afterwards, and only synthetic data is used. Node 22 and pnpm (frozen install).
- **Integrated tree:** the head merged with `idea-map` @ `dfc44cf` (clean merge, scratch commit `58e1ee2`).

## Independent probes

These are my own probes, separate from the builder's `function_binding.test.ts`. I wrote them as a temporary vitest file using the repo harness; the file wasn't committed and was deleted after the run.

- They run as `ideamap_app`, with `SET LOCAL search_path = pg_temp, public, app`, which is hostile because `pg_temp` comes first.
- Temporary tables have the full column shape of the tables they shadow.
- Events are spread across three monthly partitions (now, about 1 month back and about 2 months back).

| Id | Weight | Result | Evidence |
|---|---|---|---|
| F4cx1-F1 | must | PASS | **TEMP revoked:** a duplicate event id in another month, a duplicate (student, seq) in another month, and a duplicate of both were each rejected with `23505`. A new seq in another month was accepted. `public.interaction_event_key` holds exactly 1 row for the id. **TEMP granted,** with a same-name `pg_temp.interaction_event_key` in place: identical results (`23505` ×3, control accepted, 1 public key row). The builder's tests (4/4) also pass. |
| F4cx1-F2 | must | PASS | TEMP granted, hostile search_path, with a full-shape `pg_temp.curriculum_version`: pinning to the draft was refused `23514` with the temp table empty, and refused `23514` with a temp row claiming the draft is `published`. Pinning to another org's version: `23514`. Inserting a new class pinned to the draft: `23514`. Pinning to the published version and to an archived version both succeeded. The class pin was unchanged after rollback. |
| F4cx1-F3 | must | PASS | Independent `pg_proc` inventory: every non-extension function in `app` and `public`. All 9 pin `search_path=pg_catalog, pg_temp`, with `pg_temp` last and no untrusted schema. Only `app.record_interaction_event_keys()` is SECURITY DEFINER. All 5 trigger functions are in the inventory. The list matches the builder's `APP_FUNCTION_INVENTORY` exactly. |
| F4cx1-F4 | must | PASS | `packages/db/src/function_binding.test.ts` (migration 0012) holds both Codex reproductions under the app role. All 4 tests pass against the real database. |
| F4cx1-F5 | must | PASS | On the head: lint, format:check, typecheck, build and plan check exit 0, and the full `CI=1` test run passes (db 165, tracker 159, contracts 213, connectors 104, domain 93, ui 73, others green). On the integrated tree: static checks exit 0, and the tests pass with db 170 (165 plus my 5 probes), tracker 172, contracts 217, domain 96 and connectors 104. Exact-head CI is green. |
| F4cx1-S1 | must | PASS | `has_database_privilege(app, db, 'TEMP')` = false by default, and `CREATE TEMP TABLE` as the app role fails `42501`. F1 and F2 above also pass with TEMP granted. |
| F4cx1-S2 | should | PASS (existing suite) | `security.test.ts` and `isolation.test.ts` cross-org and cross-class CRUD tests pass (part of db 165). I didn't write new CRUD probes. |
| F4cx1-P1 | must | PASS | F4-P3: 100,000 events in batches of 500 ran at **11,870 rows/s**, above the 5,000 bar. |
| F4cx1-U1 | must | PASS | `packages/db/README.md` lines 89–100 state the rule (qualify relations, pin `search_path` to `pg_catalog, pg_temp`) and point to `src/function_binding.test.ts`. |
| F4cx1-U2 | should | Not assessed | Already tracked in CXB from Codex 3e97696. |

## Found during testing

- Migration number collision: F4cx1 adds `0012_function_binding`, and F5 (#15) and F6 (#20) each add their own `0012`. Whichever merges second must renumber, and the inventory test must be re-run on the combined schema (CXB already has this). F6's new privacy functions must join the inventory and pin `search_path`.
- My first probe run inserted into past months without creating their partitions and got `23514`. That was my fixture error, not a product defect; the corrected run creates partitions with `app.create_interaction_event_partition`.

Raw outputs (in the session scratchpad): `static.txt`, `tests.txt`, `probe.txt`, `perf.txt`, `int-static2.txt` and `int-tests.txt`.

---
Coordinator completion: tested tree `58e1ee2` (head 733c823 + idea-map dfc44cf) pushed as the PR head; exact-head CI green, 0 behind, idea-map green. Squash-merged as `45d89c5`. Report also posted on PR #17.
