Reviews: C5

# C5 independent review — PR #23 — 6f43575

**Verdict: FAIL.** Two medium-priority functional errors are confirmed: accepted assessment questions can disappear from the diff, and two concurrent publishes to different classes can produce an unexpected HTTP 500. The agreed D14 audience count, ordinary publish/rollback behavior and performance probes pass. The unrestricted full-suite gate is separately **UNVERIFIED** because the previously blocked function-binding test was excluded.

**Publication reconciliation, 2026-10-27:** runtime testing below took place on 2026-10-23. C5 subsequently merged as `956c515`; current `origin/idea-map` is `f9513f0` at publication preparation. Source comparison finds `packages/domain/src/diff.ts` unchanged and the stale-status read/lock/update sequence still present in `publishing.ts`. Later changes add F5 policy integration, F6 actor attribution and audit scope fields; they do not change these two mechanisms. This is historical runtime evidence with current source confirmation, not a fresh full test of the merged tree. Route 403/404 expectations and auth/bootstrap suggestions below describe the reviewed head; consult the newer C5 completion report for subsequent auth integration. The two errors now concern merged work and need coordinator routing as fix tasks after current-head verification.

## Reviewed tree

- PR head: `6f43575628cd945670ed7246bfce08406bcd3db4`.
- Head tree: `b979c1df14d4f13273b55cb5388b7719ae2c5003`.
- Pinned base: `7c79a06a4d48a7dfa43e37223ab8daba0ac1bf14`.
- Actual integrated index tree: `c87807b06d08a56dd4dea35f614a38c7835270e3`.
- Detached worktree: `/home/kevin/codex-qa-2026-10-22/c5-review-6f43575`.

The head was merged with the pinned base using `git merge --no-commit --no-ff`; the scratch merge was clean. Only plan/task metadata differs from the PR head. No application code was edited. The parent reviewed C5 directly; a separate Sol reviewer independently checked both source findings and their severity. The parent then reproduced both against the actual integrated tree. F5, F6 and C6 used separate reviewers. Heavy checks were staggered; C5 ran after C6 released its window.

GitHub REST verification on 2026-10-23 found PR #23 still open at this exact head, with successful [CI](https://github.com/tenkevin/mind-your-tutor/actions/runs/39972236757) and [plan](https://github.com/tenkevin/mind-your-tutor/actions/runs/39972237092) runs. Green CI does not override the independent failures below or certify excluded coverage.

## Errors

### C5-E1 — Medium / P2: assessment diff hides accepted questions and depends on row order

`packages/domain/src/diff.ts:31` reduces Assessment rows to the first nonempty question for each idea. Multiple nonempty Assessment rows for the same idea/unit are accepted by `parsePack` and produce no `checkPack` error. The spec and schema contain no uniqueness constraint that makes the later rows invalid.

Fresh independent reproduction starts with fixture A (only `aquifer` removed from `ground.requires`). Append a second valid `sun` Assessment row, copying the original unit and key points and setting question to `Second valid question about the Sun?`. Both packs parse and have zero data-check errors.

1. Change only that second question to `Changed second valid question about the Sun?`. Actual diff: `empty: true`, `assessment_changed: []`. The accepted question edit is hidden from the teacher's review.
2. Keep all content unchanged and reverse Assessment row order. Actual diff: `empty: false`, with the original Sun question shown as replaced by the second question. Reordering rows invents a content change.

The ordinary one-question fixture passes all six change kinds, but these valid inputs violate the broader assessment-change behavior and **C5-F3** row-order determinism. The source reviewer independently confirmed the schema/checker permits the input; runtime assertions establish that this is not just a hypothetical duplicate-row concern.

**Correction proposed:** compare all accepted assessment questions using a stable, order-independent representation, and extend the diff payload as needed so changes are visible. Match the same accepted/skipped-row rules as the checker. Add regressions for editing/removing a later question and reordering unchanged rows. Do not silently discard accepted rows or introduce a new uniqueness restriction without reconciling the existing input contract.

Evidence: `c5-independent-first-6f43575.txt`, two failed assertions with complete before/after questions and diff JSON; harness `c5-independent-6f43575.test.ts`, the two Assessment tests. The related source observation that a warning-only skipped assessment row can win the same first-row selection is not reported as a separately runtime-proven defect.

### C5-E2 — Medium / P2: concurrent publishes cache stale draft status and one fails

`apps/api/src/publishing.ts:339` reads the version before taking the curriculum lock. Both requests can read `status='draft'`. After the first publishes and commits, the second obtains the lock but continues using its earlier status. Its conditional `UPDATE ... WHERE status='draft'` at line396 returns no rows; `executeTakeFirstOrThrow()` throws, and the route returns HTTP500.

Fresh independent HTTP reproduction uses a newly migrated synthetic database, a teacher authorized for two classes on one curriculum, one valid draft, and different idempotency keys. Two requests publish the same draft to different classes. An identity Kysely plugin pauses only the first two version-read results until both have completed, then releases them together. It changes no query, row or production source; it makes a possible READ COMMITTED ordering deterministic. The normal curriculum lock serializes subsequent execution.

Actual responses are **201 and 500** (`{"error":"Something went wrong. Try again."}`). The successful class is pinned; the second class remains unpinned. Sequentially publishing an already-published version is supported, so the equivalent concurrent valid request should not fail because of cached state. Same-key retries return through the audit lookup and are unaffected by this particular reproduction. There is no evidence of a partial transaction, cross-org disclosure or irreversible corruption.

**Correction proposed:** after acquiring the curriculum lock, reload the version state, or acquire a consistent version lock/read before making the draft-to-published decision. Keep permission checks and idempotency lookup intact. Add controlled concurrent tests for distinct keys, no key and a repeated shared key; verify both intended class pins and the expected audit counts. This is an extended publish correctness failure; the existing injected-failure atomicity test can still pass.

Evidence: `c5-independent-first-6f43575.txt`, `versionReadsBeforeLock:2`, both HTTP bodies and resulting class pins; harness `c5-independent-6f43575.test.ts`, concurrent same-draft test. Independent source review agrees with the observed failure mechanism.

Both findings were suitable for publication at the end of the original review batch: the PR was then open, neither demonstrated a privacy leak or irreversible loss, and no urgent remote implementation action was needed. They remain medium-priority correctness failures; publication was interrupted and is now being completed at the user's instruction. The coordinator owns routing to `<ID>cx<n>` tasks now that C5 is merged; QA does not change task state.

## Suggestions

1. When F5 and C5 are combined, register all four publish/diff/preview/pin routes in the real session policy sweep. This C5 tree contains C4 but not F5; its route tests inject the documented authentication interface. They do not certify SSO, CSRF or production auth integration.
2. Carry API/bootstrap wiring into the next related integration task: the default executable currently starts `buildServer()` without optional publish dependencies, just as C4 imports use optional registration. This review verifies the implemented domain/API interface, not a deployed Publish screen (T8).
3. Preserve the D14 label and count semantics in T8: all unique enrolled students in the selected classes, including those without progress and those whose progress will not change. The independent counts are 4, 2 and 0; no product decision remains open here.

## Criteria and evidence

The criterion results below distinguish ordinary required scenarios from the newly found edge cases. All security results are scoped to the current authentication seam and permitted existing database tests.

| Criterion | Result | Evidence |
|---|---|---|
| F1: six change kinds | Ordinary fixture PASS; assessment coverage FAIL for accepted later questions | Repository tests and independent six-kind test; E1 |
| F2: empty and first publish | PASS | Existing domain/API assertions |
| F3: stable row-order-independent diff | FAIL | Normal fixture passes, accepted multi-question reorder fails; E1 |
| F4: selected class pins, old version unchanged | Ordinary scenario PASS; concurrent variant FAIL | Existing tests, independent selected-class publish; E2 |
| F5: errors block; warnings/info allow | PASS | Existing HTTP error/warning/info cases and located refusal assertions |
| F6: unique enrolled audience | PASS | Independent 4/2/0 HTTP counts, including no progress records; existing unchanged-progress and org isolation cases |
| F7: published rollback only | PASS | Independent HTTP rollback and existing draft/archived refusals |
| F8: atomic failure and same-key repeat | PASS for specified scenarios | Existing deliberate transaction failure preserves pins/status/audit; independent repeat201→200 same body; distinct-key concurrency is E2 |
| F9: no event/progress rewrite | PASS | Existing before/after counts and content hashes |
| F10: all checks including unrestricted root suite | UNVERIFIED / not met | Permitted checks below; excluded function-binding suite and independent failures remain |
| S1: caller/class/org permissions | PASS at authentication seam | Existing ordinary API cases, no-session401, wrong role/class403, other-org404, own teacher/admin success |
| S2: class/version organization and curriculum | PASS for permitted existing tests | API refusals and existing ordinary DB guard assertions; no excluded shadow-table coverage |
| S3: audit actor/classes/from/to without student data | PASS | Existing audit assertions; source stores hashed idempotency key |
| S4: diff contains no student identifiers | PASS | Payload source and existing response inspection |
| P1: 2,000-idea diff under500ms | PASS | Independent cold4.518250ms; warm6.807359,3.031030,2.960433,2.463557,3.258693ms; median3.031030ms |
| P2: 30 classes,3,000 enrollments,one query,under200ms | PASS | Independent1840 unique students; cold11.370627ms; warm10.191355,10.536024,10.558368,10.300347,9.992369ms; median10.300347ms; plugin counts exactly one query each |
| U1: readable titles/units and old/new names | PASS for represented changes | Independent diff JSON and existing assertions; E1 omitted rows remain a functional error |
| U2: located actionable refusal | PASS | Existing unmodified sample refusal names tab/column and tells user to fix/reimport |
| U3: Students receiving this update label | PASS | Literal response/schema/docs label, D14 semantics |

The P1 fixture has2000 ideas and Assessment rows;200 ideas (10%) have title/question changes. Input SHA256 `de31f1626722e730d8aaacb58e45645f8a8ae6ee43238e10b75c55871698fdb5`. P2 uses30 selected classes,100 enrollments each, overlapping60-student windows,1840 unique students. These are ordinary synthetic functional/performance fixtures. Timings ran after all C5 quality commands and other reviewers' heavy work, before the baseline suites, with no own builds or browser running. Unrelated host activity was not controlled.

## Commands and artifacts

Evidence root: `/home/kevin/codex-qa-2026-10-22/evidence/`. Linux, Node22.22.0, pnpm10.28.0. All node/pnpm commands use PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`. Dedicated new Docker container `codex-qa-c5-6f43575`, ID `dcb6c7f8c521e04a931e81f1dd022a55d34acd71a60deab3662c611d415c8847`, image `pgvector/pgvector:pg16`, localhost32771. A read-only availability query found vector0.8.7; existing migration setup enables it in each fresh test database. No pre-existing DB or real student data was used.

`DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32771/postgres` for runtime commands. Existing harnesses create/drop synthetic databases. Authenticated HTTP requests use the current C5 interface; ordinary app-role scope enforces the existing database policy.

Quality commands in the integrated checkout: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `node scripts/plan.mjs check`. All exit0 on their first execution. Logs are `c5-{install,build,lint,format,typecheck,plan}-6f43575.txt`; exact commands and exits also appear in `c5-quality-results-6f43575.json`.

Permitted baseline commands:

```sh
pnpm --filter @ideamap/db exec vitest run src/columns.test.ts src/integrity.test.ts src/isolation.test.ts src/migrations.test.ts src/performance.test.ts src/security.test.ts src/index.test.ts src/test/derived.test.ts
pnpm --filter '!@ideamap/db' -r test
```

Both commands exit0 on first execution. Explicit DB baseline:161 tests across8 files,45.35s. Other workspace counts: API22, worker18, domain103, connectors111, contracts217, tracker172, UI78, AI6, teacher2, student1; no skipped DB-backed tests. Raw logs are `c5-db-6f43575.txt` and `c5-baseline-6f43575.txt`; command/exit metadata is `c5-baseline-results-6f43575.json`.

Independent harness command, from `/home/kevin/codex-qa-2026-10-22` with the same PATH and database environment:

```sh
./c5-review-6f43575/node_modules/.bin/vitest run --config evidence/c5-independent-6f43575.config.mjs --reporter=verbose --disableConsoleIntercept
```

It ran7 tests: **4 passed,3 failed**, exit1,2.76s. The three failures are the two manifestations of E1 and the one E2 concurrency reproduction. Complete raw output is `c5-independent-first-6f43575.txt`; assertions were not weakened or retried to obtain a green result. The external harness/config and command runner are retained beside this report. No source file or repository test was modified. Initial exploratory reads of absent `packages/api/package.json` and `docs/spec/curriculum-pack.md` were lookup mistakes, corrected to actual app/spec paths; they are not product failures. Before executing the harness, its fixture was corrected to remove only `aquifer` while keeping `coll`, matching A exactly; there was no run against the preliminary fixture.

## Limitations and cleanup

Read current AGENTS, HANDOFF, QA README/STATUS, plan/ledger, architecture, C5 criteria, fixture README and relevant implementations/tests before execution. The user-authorized QA scope remains separate from implementation coordination. Lockfile and `project/support.js` contents were not read.

The previously blocked `packages/db/src/function_binding.test.ts` was never run, directly or through an importing suite; selected files/import chains were inspected before execution. No unrestricted root `pnpm test`, new/custom adversarial DB security probe, F4 shadow/temp-table retry, PR13-specific re-review or reroute through another agent/CI was performed. Existing ordinary baseline/guard tests are not certification of the excluded checks. Full-suite coverage remains UNVERIFIED even though exact-head CI is green.

No real SSO, production deployment, T8 UI or C7 progress migration is certified. F5/F6/C6 branches were reviewed separately against C4/current pinned base, not merged together here. A subsequent combined tree needs its normal synchronization and integration gates.

At publication reconciliation the dedicated container was inspected and is stopped (`exited`, finished2026-10-27T00:42:42.726295219Z). This reviewer did not claim to have stopped it earlier. Existing harnesses dropped their temporary databases. The scratch index is still `c87807b06d08a56dd4dea35f614a38c7835270e3`, with only the intended merge metadata staged and no unstaged implementation changes. Worktree and artifacts are retained.

Only this new Codex report is intended for publication alongside the other new reports. No application change, task-state/claim update, existing Codex-file edit or application PR merge is included.
