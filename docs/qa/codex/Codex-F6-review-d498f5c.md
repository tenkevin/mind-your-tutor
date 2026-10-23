Reviews: F6

# Independent F6/C4 integration rerun · PR20 · d498f5c

**Permitted F6 feature and integration checks: PASS. Full-suite gate: UNVERIFIED.** The pinned-base scratch merge now succeeds; the C4 inventory/schema integration and prior F6-E1/E2/E3 corrections pass on the actual combined tree. The excluded F4 function-binding suite was not executed. This is not an unqualified all-must/full-suite PASS or permission to merge. Synthetic engineering QA only; no legal-compliance certification.

Reviewed exact head `d498f5cdc4dcf87dd461e8e693389eb7bcc9cbcf`; pinned base `7c79a06a4d48a7dfa43e37223ab8daba0ac1bf14`. Worktree `/home/kevin/codex-qa-2026-10-22/f6-review-d498f5c` is detached at that head. Plain HEAD tree `c6854e992ae3ee4f9340b75b73cc66e5f328be6e`; **actual integrated index tree `004f99f0412d837023d057273c22bd2da7348517`**, identical before and after execution. MERGE_HEAD remains the pinned base. Only `docs/PLAN.md` and `docs/tasks.json` are staged by the scratch merge; no unstaged tracked changes. No commit or actual merge was made.

Parent supplied exact-head green CI: [build39971448156](https://github.com/tenkevin/mind-your-tutor/actions/runs/39971448156), [plan39971448202](https://github.com/tenkevin/mind-your-tutor/actions/runs/39971448202). I did not independently inspect remote logs. These do not replace the excluded independent coverage.

## Errors

**No new confirmed implementation error in the permitted scope.** The previous integration blockers are resolved against this pinned base:

- Privacy migration is registered as `0015_privacy`, after C4's `0013_import_jobs`; comparison with previous `0013_privacy` finds a 100% identical rename. No auth `0014` is present in this combined tree: F5 remains separate, so auth/FERPA integration is not certified here.
- C4's `import_job.steps` and `import_job.idempotency_key` are present in schema types and COLUMNS, and each has all seven inventory answers. Live all-schema catalogue comparison finds neither undocumented nor stale fields. Added-column detection also passes.
- API combines optional import and privacy route registration; worker preserves C4 registration and exports retention. Existing C4 import worker tests pass17/17, including persisted steps, repeated-upload/idempotency behavior, retry/interruption, queue processing and large imports. API11/11 includes import and privacy suites. The privacy test caller always claims admin, while DB-backed teacher/student requests are still refused: authorization reads the stored role. Auth defaults to noSignIn; real F5 integration remains untested.

Prior corrections independently remain effective:

- **F6-E1:** durable subjects find a former class member's export after enrollment removal. Existing regressions remove tracked and legacy student-naming exports, retain unrelated known nonmember and other-org files, and safely repeat. The copied independent lifecycle harness removes exactly three identifying files (tracked class, legacy class, student record), clears their result_ref, preserves the unrelated tracked file and repeats with0 removals. It uses an owner connection for synthetic ordinary fixtures/lifecycle, not isolation evidence.
- **F6-E2:** existing repository SQL tests pass INSERT/UPDATE/DELETE before/after redaction and SQL/TS parity. Independent new evidence is **in memory only**: `config.token` is redacted, nested token is redacted, input/output token counts5/6 survive. No custom SQL/security probe was introduced.
- **F6-E3:** existing per-section catalogue field coverage passes. Independent JSON export preserves input_tokens123, output_tokens456 and redacted_at `2026-10-01T00:00:00.000Z`. Explicit redundant org/student-key omissions retain their prior documented scope.

Independent controlled public-function overlap tests pass both orders: when export pauses during writing, delete waits and removes its eventual file; when delete pauses during removal, the following export contains only the pseudonymised account. Original name/email do not reappear.

## Criteria

All results below describe the actual integrated tree, within the stated exclusions.

| Criterion | Weight | Result | Evidence and limit |
|---|---|---|---|
|F6-F1 every field inventoried|must|PASS|Live catalogue/format/added-column checks; now includes both C4 import fields.|
|F6-F2 configurable retention|must|PASS|Defaults text/AI90days, exports7days; per-org settings and constraints.|
|F6-F3 due-only deletion/replay|must|PASS|Two-org29/30/31/89/90/91-day fixtures; due-only text/AI deletion, events deep-equal, removed-text marker, recent exports retained. Verifies replay inputs, not a separate finished tracker product.|
|F6-F4 rerun/interruption|must|PASS|No-change rerun; stop after committed100-row batch and resume900; owned-backend interruption preserves200 in-flight rows, then rerun removes200.|
|F6-F5 audit writes|must|PASS|Due date/persona/rarity/defaults/library/upload/approval/publish/pin/settings entries carry actor/org/target/before/after/time.|
|F6-F6 append-only audit|must|PASS|Existing privacy app-role/owner UPDATE/DELETE/TRUNCATE denials pass. Does not certify excluded F4 tests.|
|F6-F7 complete export/delete|must|PASS in present schema|Lifecycle and catalogue field-coverage tests plus independent E1/E3/overlap checks. F5 schema integration absent.|
|F6-S1 authorization|must|PASS within interface|DB/API deny teacher/student/other-org admin; own-org admin succeeds. Claimed caller role is ignored. Real F5 SSO not included.|
|F6-S2 audit secrets|must|PASS|Existing nested/dotted SQL tests and independent in-memory counterexample.|
|F6-S3 identifiers absent|must|PASS in fixtures|Existing all-table/export-folder check plus independent historical deletion/overlap lifecycle.|
|F6-S4 backups|should|PASS, docs only|35-day backup/PITR bound and restore-before-service retention/deletion replay documented; no deployed backup verification.|
|F6-P1 retention scale|must|PASS|1,000,000 rows,500,000due;10088ms,100batches,812 concurrent inserts,worst16.477624ms (<300000ms/<1000ms).|
|F6-P2 audit cost|must|PASS|30warmups;300audited then300plain saves; p95 3.974856/3.655848ms, added0.319008ms<10ms.|
|F6-U1 school-readable inventory|must|PASS|District summary and area tables explain purpose/personal-data/source/visibility/retention/deletion; DPA/operator limits stated.|
|F6-U2 class history|should|PASS|Existing readable actor/action/fields/before/after/time list, newest first, other-org entries excluded; no finished UI claimed.|

Whole-day policy unchanged: day90 retained, day91 removed at a90-day limit. Performance workloads and acceptance budgets were unchanged; this head increases only the retention scale test/hook timeout to600seconds, allowing the original million-row seed and5-minute measured deletion bar. P1 row/event/chunk overrides were unset. P2 uses fixed audited-then-plain order, so cache/order effects remain a limit. Benchmarks print aggregates rather than per-operation raw sample arrays; no retained raw-sample array is claimed.

## Commands, evidence and first failures

Linux, Node22.22.0/pnpm10.28.0, PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`. Evidence directory is the containing directory of this report. F5 explicitly released its window before install/build/tests. P2, P1, ordinary DB performance, C4 import tests and other suites ran sequentially; C6 waited until release. Unrelated host activity is outside my control.

Preparation:

```sh
git worktree add --detach /home/kevin/codex-qa-2026-10-22/f6-review-d498f5c d498f5cdc4dcf87dd461e8e693389eb7bcc9cbcf
git merge --no-commit --no-ff 7c79a06a4d48a7dfa43e37223ab8daba0ac1bf14
git rev-parse HEAD HEAD^{tree} MERGE_HEAD
git write-tree
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm format:check
pnpm typecheck
node scripts/plan.mjs check
```

All listed commands completed exit0 on first execution. Merge output is `f6-merge-first-d498f5c.txt`; checks are `f6-install-d498f5c.txt`, `f6-build-d498f5c.txt`, `f6-lint-d498f5c.txt`, `f6-format-check-d498f5c.txt`, `f6-typecheck-d498f5c.txt`, `f6-plan-d498f5c.txt`. **No feature/check failure or corrective retry occurred.** An initial broad AGENTS filename search (`find /home/kevin -name AGENTS.md -not -path '*/node_modules/*' -not -path '*/.git/*' -print`) exited1 for permission-denied unrelated Habitica MongoDB directories; no contents there were read and no retry was made. Repository instructions were located/read directly. No application, assertion, fixture workload or acceptance threshold was edited.

Created own disposable pgvector container:

```sh
docker run -d --name codex-qa-f6-d498f5c -e POSTGRES_PASSWORD=qa_disposable -p 127.0.0.1::5432 pgvector/pgvector:pg16
docker exec codex-qa-f6-d498f5c pg_isready -U postgres
docker exec codex-qa-f6-d498f5c createdb -U postgres qa_f6
```

Container ID `30ae5978db3c093b27f38348ebf11fdf234b83b370f22be13b90192cc7fdbea1`, localhost32769; no existing DB/volume used. Existing suites create/drop independent synthetic databases and login roles. `DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32769/postgres` for the following:

```sh
IDEAMAP_PERF_VERBOSE=1 pnpm --filter @ideamap/db exec vitest run src/privacy.test.ts src/inventory.test.ts --reporter=verbose --disableConsoleIntercept
IDEAMAP_PERF_VERBOSE=1 pnpm --filter @ideamap/worker exec vitest run src/retention.test.ts src/index.test.ts --reporter=verbose --disableConsoleIntercept
pnpm --filter @ideamap/db exec vitest run src/columns.test.ts src/index.test.ts src/integrity.test.ts src/isolation.test.ts src/migrations.test.ts src/performance.test.ts src/security.test.ts src/test/derived.test.ts --disableConsoleIntercept
pnpm --filter @ideamap/worker exec vitest run src/imports.test.ts --reporter=verbose --disableConsoleIntercept
pnpm -r --filter '!@ideamap/db' --filter '!@ideamap/worker' test
F6_QA_URL=postgres://postgres:qa_disposable@127.0.0.1:32769/qa_f6 node /home/kevin/codex-qa-2026-10-22/evidence/f6-regressions-d498f5c.mjs
```

All exit0 on first execution: focused DB33/33 (6.84s), retention worker8/8 (29.87s), ordinary DB163/163 (45.36s;16361event inserts/s), C4 worker17/17 (15.58s). **Permitted DB total196/196 across10 files; worker total25/25 across3 files.** Other counts API11, contracts217, domain96, connectors111, tracker172, UI78, AI6, teacher2, student1. Expected connection-loss message is from the supplied owned-backend interruption test, which passes.

Raw outputs: `f6-focused-d498f5c.txt`, `f6-worker-retention-d498f5c.txt`, `f6-db-baseline-d498f5c.txt`, `f6-worker-imports-d498f5c.txt`, `f6-other-baseline-d498f5c.txt`, `f6-harness-d498f5c.txt`. New harness `f6-regressions-d498f5c.mjs` copies the previous immutable external harness, changing only the tested worktree import path. SHA256 `0f4d16938cd44a0073b37e165903ed8334e5818159ea093a1b9cb571c93c1e29`. Original prior artifacts were preserved.

## Exclusions

Read complete root AGENTS, HANDOFF, QA STATUS/README, root README, F6 criteria, architecture, inventory, DB README, immutable `Codex-F6-review-b52d29e.md` and external prior report; inspected import chains before execution. The first read from `/home/kevin/mind-your-tutor` contained older stopped-state documents; reread the reviewed worktree's resumed-state documents before testing. Parent's explicit startup assignment is the current QA authorization.

`function_binding.test.ts` and any suite importing it were not executed. No full root `pnpm test` was run. Explicit allowed DB filenames partition the baseline; migrations apply existing function-binding schema as necessary, without running its excluded tests. No F4 shadow-temp or PR13-specific review was retried, rephrased or rerouted. Ordinary UI baseline results do not certify historical PR13 review. No new/custom adversarial DB probe, real school data, lockfile/support.js content read, browser service, remote write/comment or deployment. Full-suite gate remains **UNVERIFIED**.

## Suggestions

1. Retain the previous before-snapshot contract: future class-export producers must take `lockStudents` before collecting identifying data, then record subjects and write in the same transaction. The present exportStudent does this. Current recordExportSubjects/README wording only says before writing; no present class-progress producer demonstrates a stale-snapshot leak here. This remains a future-producer documentation/criteria follow-up, not a new confirmed error.
2. Retention scheduling and backup expiry remain deployment requirements: scheduleRetention is mock-tested and the CLI supports one-off jobs, but no running production scheduler or backup system was demonstrated. Existing C4-P3 test result does not independently certify its historical2x parallel-performance budget; no new C4 verdict is issued.
3. When F5 lands, rerun combined inventory, student export/delete and real API authorization coverage against its auth schema. The reserved0014 auth migration is absent here; this review does not infer future compatibility.

## Cleanup and handoff

`docker stop codex-qa-f6-d498f5c` succeeded. Container retained stopped with only synthetic independent fixtures; test harnesses cleaned their temporary DBs/roles/export directories, and independent exports were removed in finally. No server started. F6 released the heavy window to C6 and parent after final checks. Worktree and evidence retained; actual index/HEAD/MERGE_HEAD values above rechecked after tests, with no unstaged source changes.

No implementation edit, task-state/claim change, commit, published Codex-file change, remote write/comment or actual merge. Parent owns full-report review/publication and merge-gate decisions. This report resolves the former pinned-base C4 integration blocker in the permitted scope while preserving the excluded full-suite gate.

## Parent review and publication assessment

The parent reviewer read this complete independent report, checked the cited regression and baseline outputs, and verified the exact PR head and its green CI/plan runs through the GitHub REST API on 2026-10-23. The parent accepts the scoped conclusions above. No new error needs a correction proposal; the previously reported corrections remain effective. Suggestions stay separate from must-fix errors.

Urgency: routine completed-correction evidence, suitable for this batch publication. Only new Codex report files are authorized for this commit; no implementation, task-state or application merge is included. The pinned base was still `7c79a06a4d48a7dfa43e37223ab8daba0ac1bf14` at the pre-publication fetch. This report does not waive current-base synchronization, actual-merge CI or the unavailable full-suite check.

