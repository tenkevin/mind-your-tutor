Reviews: F6

# Independent F6 rerun · PR20 · b52d29e

**Overall: UNVERIFIED / integration blocked.** The required current-base scratch merge conflicts. Separate, explicitly authorized **exact-head feature/regression checks pass**, including correction of prior F6-E1/E2/E3. This is not an all-must integrated PASS or permission to merge. Engineering QA only; synthetic data, no legal-compliance certification.

Reviewed head: `b52d29e4b9c255ffa2e94e8dc4b08166c236f36b`. Pinned base: `224a3d0c04969e078044be6c01d02240fc50760d`. Plain HEAD tree: `c36e91092b1e5e68f8ddd01e27d7403f87f8763f`.

- Scratch integration worktree: `/home/kevin/codex-qa-2026-10-22/f6-review-b52d29e`. HEAD and MERGE_HEAD remain the exact head/base above. **Actual integrated index tree: unavailable**, because 12 paths are unmerged; `git write-tree` exits128. No conflict resolution or integrated execution attempted.
- Separate tested worktree: `/home/kevin/codex-qa-2026-10-22/f6-head-b52d29e`, detached at exact head. **Actual tested index tree: `c36e91092b1e5e68f8ddd01e27d7403f87f8763f`**, equal to HEAD tree before and after execution; final `git status --short` empty. Generated build/dependency files are ignored artifacts, not source edits.
- Parent verified exact-head [build39905554419](https://github.com/tenkevin/mind-your-tutor/actions/runs/39905554419) and [plan39905554427](https://github.com/tenkevin/mind-your-tutor/actions/runs/39905554427) green. I did not independently inspect those remote logs. They cannot replace current-base independent integration evidence or the excluded review actions.

## Integration blockers

First command: `git worktree add --detach .../f6-review-b52d29e b52d29e4b9c255ffa2e94e8dc4b08166c236f36b`, then `git merge --no-commit --no-ff 224a3d0c04969e078044be6c01d02240fc50760d`. Merge exited1. Raw first output is preserved in `f6-merge-first-b52d29e.txt`. Conflicts: API package.json/index.ts/tsconfig.build.json/tsconfig.json/vitest.config.ts; worker index.ts/tsconfig.build.json/tsconfig.json/vitest.config.ts; DB README/migrations index; pnpm-lock.yaml. Git's path metadata was inspected; lockfile contents were never read.

Source comparison also identifies required synchronization work: current base C4 migration `0013_import_jobs.ts` adds `import_job.steps` and `import_job.idempotency_key`; neither appears in F6's head inventory/schema. A head-only catalogue PASS does not cover those current-base fields. Refresh inventory and schema during synchronization and rerun catalogue coverage. C4/F5/F6 migration numbering must be reconciled sequentially by the coordinator/builders; do not drop either migration. Combined auth-schema export/delete coverage also needs review when F5 lands. These are integration follow-ups on the existing PR, not new head-only runtime defects or new defect IDs.

## Errors

**No new confirmed exact-head defect found in the permitted scope.** Prior errors are corrected at this head:

- **F6-E1, historical exports:** `export_subject` records durable membership; deletion finds it independently of current enrollment. Unknown-provenance student-naming files are conservatively removed across the same org, a broader scope now explicitly documented. Supplied regression removes the former member's report, preserves another known nonmember's report and another org's file, and safely repeats. Independent external harness reproduces the original export→unenrollment→delete lifecycle with both tracked and legacy files: all three identifying files (tracked class, legacy class, student record) removed and result_ref cleared; unrelated tracked file retained; repeat removes0. The harness uses a migration-owner connection for fixture/ordinary lifecycle work and is not isolation evidence.
- **F6-E2, dotted token redaction:** TypeScript checks the final dotted segment, and SQL does the same before audit insertion. Supplied existing tests independently pass INSERT/UPDATE/DELETE old/new-value and SQL/TS parity checks, preserving input/output token counts. Independent **in-memory only** counterexample rerun now returns `config.token:"[redacted]"` and preserves counts5/6. No custom SQL security probe was introduced.
- **F6-E3, AI metadata export:** selectAll plus narrowly listed redundant-key omissions preserves input_tokens/output_tokens/redacted_at. Existing catalogue-based per-section field-coverage test passes. Independent runtime JSON export preserves123/456 and `2026-10-01T00:00:00.000Z` exactly. Redundant org/student keys are represented by the enclosing record; redundant event-ledger copies and unrelated people's records are not newly demanded.

Independent public-function overlap checks additionally pass both controlled orders: export holds the lock mid-write, then delete removes its file; delete holds the lock mid-removal, then the waiting export collects only the pseudonymised account. Original name/email do not reappear. External harness/output: `f6-regressions-b52d29e.mjs`, `f6-harness-b52d29e.txt`.

## Criteria — exact head only

Every result below is scoped to the plain head. Current-base full-suite integration remains **UNVERIFIED**, irrespective of these results.

| Criterion | Weight | Head-only result | Evidence / limit |
|---|---|---|---|
|F6-F1 inventory completeness|must|PASS|Live catalogue/format/added-column detection tests pass; full inventory read. C4 current-base fields remain a synchronization requirement above.|
|F6-F2 per-org retention|must|PASS|90-day text/AI,7-day exports; per-org override and constraint tests pass.|
|F6-F3 due-only deletion/replay inputs|must|PASS|Two-org29/30/31/89/90/91-day fixture; only due text/AI removed, events deep-equal, removed text resolves marker, recent exports kept. This verifies replay inputs, not a separate complete tracker replay product.|
|F6-F4 rerun/interruption|must|PASS|No-change rerun; abort after committed100-row batch then resume900; supplied owned-backend interruption retains200 in-flight rows and rerun removes200.|
|F6-F5 audit writes|must|PASS|Due date/persona/rarity/defaults/library/approval/publish/pin records include actor/org/target/before/after/time.|
|F6-F6 append-only|must|PASS|Existing app-role and owner UPDATE/DELETE/TRUNCATE denials pass.|
|F6-F7 complete export/delete|must|PASS in current schema|Existing lifecycle, maintained export-field coverage and independent E1/E3 checks above; auth-schema combination not tested.|
|F6-S1 authorization|must|PASS within current interface|DB/API tests reject teacher/student/other-org admin; own-org admin succeeds. API defaults to noSignIn and tests inject authenticated callers; real F5 SSO integration absent from this head.|
|F6-S2 audit secrets|must|PASS|Existing nested and corrected dotted-token audit tests plus independent in-memory check.|
|F6-S3 deleted identifiers absent|must|PASS in tested fixtures|Existing all-table/export-folder search passes; independent historical and overlap lifecycle checks pass. No real school data used.|
|F6-S4 backups|should|PASS, documentation only|35-day backup/PITR requirement, restore-before-service retention and deletion replay documented; no deployed infrastructure verification.|
|F6-P1 retention scale|must|PASS|Exactly1,000,000 rows/500,000due, default5000-row batches:10,496ms,100batches,823 concurrent inserts,worst22.294355ms; below300000ms/1000ms budgets.|
|F6-P2 audit cost|must|PASS|30warmups,300audited then300plain saves: p95 3.813087ms/2.104532ms, added1.708555ms<10ms. Fixed order/cache effects and aggregate-only reporting remain limitations.|
|F6-U1 school-readable inventory|must|PASS|Plain-English district summary; purpose/personal-data/source/visibility/retention/deletion by area; DPA and operator limits stated.|
|F6-U2 class history|should|PASS|Existing history lists actor/action/changed fields/before/after/time, descending order, no other-org entries; finished UI not claimed.|

Whole-day retention is the documented policy: day90 retained, day91 removed for a90-day setting. This preserves the previously reviewed interpretation and workload.

## Commands, baseline and first failures

Linux; Node22.22.0/pnpm10.28.0. All successful commands explicitly use PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`. F5 released its heavy window before these installs/builds/tests; F6 performance runs were sequential. Other unrelated host activity was not under my control.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm format:check
pnpm typecheck
node scripts/plan.mjs check
```

All corrected-environment commands exit0. First install attempt omitted the prescribed PATH and exited127, `zsh:1: command not found: pnpm`; `f6-install-first-b52d29e.txt` retains it. Only environment invocation changed. No application source/test/assertion/workload was corrected or relaxed; no feature test failed. Additional harmless missing-path/environment-read diagnostics are retained in `f6-preparation-notes-b52d29e.txt`. This rerun's independent fixture includes teacher_id from its first execution; it did not repeat the old harness's missing-teacher_id failure.

Disposable container creation: `docker run -d --name codex-qa-f6-b52d29e -e POSTGRES_PASSWORD=qa_disposable -p 127.0.0.1::5432 pgvector/pgvector:pg16`; ID `a753b7fbd63a120e90fd999f4ed482743f82c4225ce17f9219f7ee25cd194144`, inspected localhost32791. `pg_isready` succeeded; `createdb -U postgres qa_f6` created only the independent harness DB. Existing tests each create/drop their own migrated databases and synthetic app/retention logins. No existing DB/volume used.

The following commands use `DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32791/postgres` and the toolchain PATH above:

```sh
IDEAMAP_PERF_VERBOSE=1 pnpm --filter @ideamap/db exec vitest run src/privacy.test.ts src/inventory.test.ts --reporter=verbose --disableConsoleIntercept
IDEAMAP_PERF_VERBOSE=1 pnpm --filter @ideamap/worker exec vitest run --reporter=verbose --disableConsoleIntercept
pnpm --filter @ideamap/db exec vitest run src/columns.test.ts src/index.test.ts src/integrity.test.ts src/isolation.test.ts src/migrations.test.ts src/performance.test.ts src/security.test.ts src/test/derived.test.ts --disableConsoleIntercept
pnpm -r --filter '!@ideamap/db' --filter '!@ideamap/worker' test
F6_QA_URL=postgres://postgres:qa_disposable@127.0.0.1:32791/qa_f6 node /home/kevin/codex-qa-2026-10-22/evidence/f6-regressions-b52d29e.mjs
```

All exit0 on first execution. Focused DB33/33 (2files,6.42s), worker8/8 (2files,30.87s), ordinary DB remainder163/163 (8files,46.87s), event insertion15,360rows/s. Total permitted DB coverage196tests across10files. Other package counts: API6, contracts217, domain96, connectors104, tracker172, UI78, AI6, teacher2, student1. Raw outputs: `f6-focused-b52d29e.txt`, `f6-worker-b52d29e.txt`, `f6-db-baseline-b52d29e.txt`, `f6-other-baseline-b52d29e.txt`. Build/lint/format/typecheck/plan outputs retained under matching names. P1 row overrides and other performance size overrides were unset; exact supplied million-row workload unchanged. Benchmarks emit aggregates, not individual timing samples; no raw-sample array is claimed. Expected connection-loss warning comes from the supplied owned-backend interruption test, which passes.

## Exclusions

Read complete AGENTS/HANDOFF/QA STATUS/README, F6 criteria, relevant architecture, inventory, DB README, immutable `Codex-F6-review-0412b2c.md` and early E1 report, both prior external reports, production correction paths and existing new tests before execution. Inspected imports first. `function_binding.test.ts` and any importing suite were **not executed**. No full root `pnpm test` was run; permitted baseline was partitioned with explicit DB filenames. Thus **full-suite integration remains UNVERIFIED**, including the intentionally excluded F4 review. Neither blocked F4 shadow-table actions nor PR13-specific review was retried/rephrased/rerouted. Ordinary accepted UI baseline is not certification of that historical review. No new/custom adversarial DB probe, external browser action, actual student data, or lockfile/support.js content read.

## Suggestions

1. Future class-export producers must acquire the student privacy lock **before collecting/snapshotting identifying data**, then record subjects and write in the same transaction. Current exportStudent does this correctly. The recordExportSubjects API/README says before file writing, which alone is insufficient for a producer that previously read a stale snapshot. No current public class-progress producer demonstrates that failure here; this is a source-level future contract/documentation follow-up, not a confirmed new defect.
2. Keep deployed scheduling explicit: scheduleRetention is tested through a mock and CLI supports a one-off job; no running production scheduler/bootstrap was demonstrated. Backup expiry/operator procedures likewise remain documented infrastructure requirements.

## Cleanup and handoff

`docker stop codex-qa-f6-b52d29e` succeeded. Container retained, stopped, with only synthetic harness fixtures. Existing test databases/login roles and test export directories were removed by their harnesses; independent export directory removed in finally. No review servers started. Heavy/performance work is finished. Both worktrees/evidence retained. Conflicted integration worktree still has exactly the12 unmerged paths; head-only worktree remains clean with the exact tested tree above.

No implementation edit, task-state/claim change, commit, published Codex-file modification, remote write/comment or merge. New external evidence only, created with apply_patch. Parent owns publication and current-base coordination; this report cannot clear the unresolved integration/full-suite gate.

## Parent review and routing

Parent read the complete report, production correction/migration, inventory, independent lifecycle harness and raw results, and separately reran the in-memory F6-E2 counterexample successfully (`evidence/f6-parent-redaction-b52d29e.txt`). **F6-E1, F6-E2 and F6-E3 are corrected on the reviewed head within the tested scope.** No new implementation error is assigned. Retain the separate current-base integration block; a successful head-only inventory cannot certify absent C4 columns or the future F5 auth schema.

Required next work stays on the existing PR: synchronize current idea-map without dropping the import/retention functionality, allocate distinct ordered migrations, update inventory/schema for `import_job.steps` and `import_job.idempotency_key`, and retest the actual combined tree with exact-head CI and appropriate independent coverage. Carry the before-snapshot privacy-lock guidance into the next class-export producer's criteria. No new fix task is warranted solely for normal branch synchronization.

Urgency assessment: the earlier High/P1 deletion finding now has positive correction evidence, with no newly confirmed privacy leak in this rerun. Publish the completed reports as a batch; do not treat that correction as authorization to bypass the integration gate. QA changed no implementation or task state and merged no PR.
