Reviews: F5

# F5 independent HEAD-only supplemental review

Overall verdict: **UNVERIFIED — current-base integration blocked**. Exact-head replay correction passes the independent recovery regression checks. This supplements, without editing, `f5-review-941340b.md`, which preserves the first merge conflict. The preliminary scratch report is first-attempt evidence only; this final report does not assign a new implementation-defect ID for routine branch synchronization.

## Exact scope

PR15 HEAD: `941340be077f8f23314e119fd26f8a39c6c406f2`; HEAD tree and actually tested HEAD-only index tree: `ceed28be3341b5200134b3be061b322eef289f8f`.
Pinned current base: `224a3d0c04969e078044be6c01d02240fc50760d`. No integrated index tree exists: scratch merge is unmerged and `git write-tree` exits 128. Integration-conflicted worktree remains `/home/kevin/codex-qa-2026-10-22/f5-review-941340b`; no conflict resolution performed.

Parent explicitly authorized a separate detached HEAD-only regression checkout after the integration stop: `/home/kevin/codex-qa-2026-10-22/f5-head-941340b`. All runtime results below refer solely to that checkout. Current-base C4 route integration and full-suite integration remain UNVERIFIED. Parent independently verified successful exact-head [CI build 39905593235](https://github.com/tenkevin/mind-your-tutor/actions/runs/39905593235) and [plan 39905593227](https://github.com/tenkevin/mind-your-tutor/actions/runs/39905593227) through REST; those are context, not fresh local integration evidence.

Read AGENTS, HANDOFF, QA README/STATUS/F5, relevant architecture, immutable `Codex-F5-review-0fef315.md`, replay source/tests and API policy tests. API, student and contracts have an empty task-path diff from previously reviewed 0fef315; source conclusions for unchanged auth flow are carried forward and freshly exercised by ordinary existing API tests. Current head also contains F4cx1 migration/registration/schema changes; permitted DB baseline was freshly run, while prohibited function-binding tests were excluded.

## Errors

No new implementation defect confirmed in this head-only rerun. Canonical **F5-E1 correction passes** within the implemented queue-helper contract: all nine first/middle/last 401/500/network cases retain failed/unattempted edits and actually deliver every payload after retry; new URL and latest same-URL edits queued during await both reach the server; overlapping calls share one promise/request; account control never sends another account's edit. Same-client serialization, revision acknowledgement, and fresh queue reads implement the prior correction recommendation. Existing teacher test also exercises latest in-flight edit failure then successful later retry.

## Integration gate

Integration blocker remains: builder must synchronize the PR with current idea-map, resolve application/config/export/migration/lockfile conflicts, then provide a new exact head and CI for independent integrated-tree checks. Head-only results cannot close that gate. No implementation fix was made by QA.

## Environment and reproducible validation

Linux x86_64; Node22.22.0/pnpm10.28.0 via `export PATH=/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin:$PATH`. Dedicated fresh pgvector container `codex-qa-f5-941340b`, image `pgvector/pgvector:pg16`, database URL `postgres://postgres:qa@127.0.0.1:32790/qa_f5`. Synthetic sample data only. Test harness creates/drops separate databases on this server.

| Command in HEAD-only checkout | Result |
|---|---|
| `pnpm install --frozen-lockfile` | exit0,263 packages |
| `pnpm build` | exit0 across workspace |
| `pnpm lint` | exit0 |
| `pnpm format:check` | exit0, All matched files use Prettier code style |
| `pnpm typecheck` | exit0 across workspace |
| `node scripts/plan.mjs check` | exit0, `plan: ok` |
| `DATABASE_URL=<above> pnpm --filter '!@ideamap/db' -r test` | exit1, API performance first failure retained below; other tests pass |
| `DATABASE_URL=<above> pnpm --filter @ideamap/db exec vitest run src/columns.test.ts src/integrity.test.ts src/isolation.test.ts src/migrations.test.ts src/performance.test.ts src/security.test.ts src/index.test.ts src/test/derived.test.ts` | exit0,8 files165 tests,46.14sec |
| `DATABASE_URL=<above> IDEAMAP_PERF_VERBOSE=1 pnpm --filter @ideamap/api exec vitest run src/policy.test.ts -t 'adds under 5 ms' --reporter=verbose --silent=false` | unchanged isolated retry exit0,1 passed17 filtered,3.98sec |
| `node /home/kevin/codex-qa-2026-10-22/evidence/f5-replay-probe-941340b.mjs` | exit0; independent production-source in-memory harness |
| `DATABASE_URL=<above> node apps/api/dist/dev/cli.js`, plus documented teacher/student dev commands, then `node /home/kevin/codex-qa-2026-10-22/evidence/f5-browser-941340b.mjs` | CLI seeds all roles/mock issuers; browser exit0 |

Non-DB suite counts: worker1, AI6, contracts217, tracker172, UI78, student3, teacher22, domain96, connectors111, API64 passed/1 failed. API first run9.52sec. Root unrestricted test command was never run. Inspected imports/configuration/helpers: selected baseline tests do not import excluded `function_binding.test.ts`. No previously blocked shadow/temp-table probe, custom adversarial DB probe, or PR13-specific review was run. Accepted baseline suites are not a claim to close the blocked reviews.

First command-environment failure: initial chain used temporary `PATH=... pnpm build && pnpm lint ...`; build finished then `zsh:1: command not found: pnpm`, exit127. Corrected shell environment with `export PATH=...`; reran lint/format/typecheck/plan successfully, no app change. Two exploratory source lookups named nonexistent `apps/api/.env.example` / `apps/api/src/identities.ts` and returned missing-file diagnostics; root `.env.example` was then read, names empty, config tests passed. These lookup errors do not represent app defects.

First P1 failure (while this reviewer's typecheck was also running):

```text
FAIL src/policy.test.ts > performance (F5-P1) > adds under 5 ms p95 of auth to a protected no-op route
AssertionError: expected 5.03790299999946 to be less than 5
src/policy.test.ts:471:22
Tests 1 failed |64 passed(65)
```

All quality processes had ended before isolated unchanged P1 rerun; no review DB baseline/browser process overlapped that rerun. Raw retry:

```text
auth p95 1.81 ms, base 0.09 ms
✓ adds under 5 ms p95 of auth to a protected no-op route 2755ms
Test Files 1 passed(1)
Tests 1 passed|17 skipped(18)
Duration 3.98s
```

This is about1.72ms incremental p95 under the unchanged5ms budget; not a claim of stable production latency. Existing method uses1000 authenticated warmups,1000 health requests,1000 authenticated requests, sorted p95 difference, Fastify inject. First contended sample remains a recorded failure; isolated retry supports only scoped performance acceptance.

Independent recovery raw outcomes:

```text
sequential failure/retry PASS: outcome401 failAt0,1,2; retries saved3,2,1 pending0
sequential failure/retry PASS: outcome500 failAt0,1,2; first saved2 pending1; retry saved1 pending0
sequential failure/retry PASS: network failAt0,1,2; first saved0/1/2 pending3/2/1; retries saved3/2/1 pending0
latest pre-replay autosave/account isolation PASS
in-flight new-url: result{saved:2,pending:0},after[]; assertions confirm sends A70,B75
in-flight newer-same-url: result{saved:2,pending:0},after[]; assertions confirm sends A70,A75
overlapping replay: requests["/api/classes/class-a/config"],both results{saved:1,pending:0},remaining[]
{"sequentialAndControlsPassed":10,"confirmedLostConcurrentEdits":[]}
```

Harness transpiles exact session.ts with installed TypeScript and resolves reviewed contracts build; remaining data/storage/fetch responses are synthetic in memory. No DB/network involved. Unlike the old harness expectation, new replay consumes in-flight later edits in the same call, so assertion checks actual sent payloads and drained queue. No stalled/hung probe or hidden retry.

Browser uses Chromium and real local mock redirects, with no intercepted fetch: teacher/student `/api/me`200, proper roles and Example District A, HttpOnly/Secure/SameSite Lax host-only session cookies. At400px both DOM scroll widths400, exactly Google/Clever/ClassLink named buttons and zero password fields. Unenrolled alert exactly `Your school account isn't linked to a class yet. Ask your teacher.` No new screenshot claim; unchanged screen source/previous visual conclusions plus fresh DOM/browser flows support U1 scope.

## Every criterion — HEAD-only results

These are scoped results; **each remains UNVERIFIED for current-base integration**.

| Check | Weight | HEAD-only result/evidence |
|---|---|---|
| F5-F1 | must | PASS existing teacher/student end-to-end and fresh browser mock SSO,/me/cookie |
| F5-F2 | must | PASS unchanged config interface/presets; config tests/new configured provider,all3 mock issuers |
| F5-F3 | must | PASS repeated identity,rostered verified-email link,cross-provider refusal tests |
| F5-F4 | must | PASS reviewed-head registry/all protected route policy sweep; **C4 new routes absent here/integration UNVERIFIED** |
| F5-F5 | must | PASS same-org unrelated-class config/roster/library refusal and membership success |
| F5-F6 | must | PASS author edit/using teacher and other-author refusal |
| F5-F7 | must | PASS sign-out cookie replay,8h/2h idle,configured/absolute expiry tests |
| F5-F8 | should | PASS OneRoster repeated sample creates no duplicates and correct org |
| F5-S1 | must | PASS existing PKCE/code/nonce,state/aud/expiry/key/issuer tests |
| F5-S2 | must | PASS cookie tests and browser flags; unchanged token/storage source conclusion |
| F5-S3 | must | PASS existing origin/CSRF method tests |
| F5-S4 | must | PASS existing ordinary app-role org context zero-row/API refusal tests; excluded function-binding coverage remains UNVERIFIED |
| F5-S5 | must | PASS synthetic forbidden-PII claim/storage test and unchanged source conclusion |
| F5-S6 | must | PASS absolute/protocol-relative/backslash/control redirect refusal/local return tests |
| F5-S7 | must | PASS50 callbacks/rate limit and fixed unknown-account responses |
| F5-S8 | must | PASS config/env names tests,root empty example,env-only unchanged config source; no exhaustive new forensic scan |
| F5-S9 | must | PASS sign-in/role change/sign-out audit actor/action/target/time tests |
| F5-P1 | must | PASS isolated unchanged1.72ms incremental p95; first contended5.037903ms FAIL retained |
| F5-P2 | should | PASS existing mock→/me subsecond assertion |
| F5-U1 | must | PASS fresh400px named buttons/no password/no overflow; unchanged visual conclusions carried forward |
| F5-U2 | must | PASS fresh browser exact plain refusal and existing unknown/unenrolled tests |
| F5-U3 | must | PASS correction regression in public queue helper/return-page contract; complete Teacher Settings form awaitsT1,not exercised |
| F5-U4 | should | PASS built developer CLI,seeded roles,documented app startup/browser mock flow |

## Suggestions

Parent independently reran the exact external recovery harness and confirmed exit0, actual delivery of both in-flight new/latest payloads, and a single overlapping request. Parent raw evidence: `/home/kevin/codex-qa-2026-10-22/evidence/f5-parent-replay-941340b.txt`. This independently supports F5-E1 correction on HEAD only; integration remains blocked.

Prior architectural limits remain: per-process used-state/rate-limit storage and unverified real Clever/ClassLink tenant claims are documented decisions/questions, not freshly validated deployment behavior. No new suggestion added. Prior overlapping-replay suggestion is addressed by shared in-flight promise and disabled retry UI.

## Cleanup and handoff

Dedicated container stopped and retained. Review-owned mock/API and both Vite sessions stopped via their exact exec sessions; browser closed. Head-only checkout clean, `git write-tree` still `ceed28be3341b5200134b3be061b322eef289f8f`. Conflicted integration checkout retained unchanged. F6 heavy window released directly after browser/DB/performance completion. No shared cleanup, app edits,claims/task-state changes,commits,remote writes/comments/merges,real school data/provider requests,or immutable-report edits. Evidence created via apply_patch only; lockfile/support.js contents never read. Parent must review both reports before publication. No all-must PASS issued.

## Parent review and next action

Parent read both complete reviewer reports, the production replay correction, external harness and actual conflict hunks, and independently reran the recovery harness successfully. **F5-E1 is corrected at the reviewed head; F5 as integrated into current idea-map is not certified.** Do not route the initial scratch report's temporary F5-E2 label as a new fix task.

Required integration work on the existing PR: preserve both F5 auth/policy registration and C4 import routes, assign the auth migration a distinct ordered identifier after the landed `0013_import_jobs`, retain both contract/connector exports, and reconcile dependencies/test configs. Re-run the every-route policy sweep with the C4 routes registered, then obtain exact-head CI and independent current-tree evidence. The unresolved files are API package/index/build+typecheck configs/Vitest config, connector index, contracts index, database README/migration index, and lockfile metadata. QA did not read lockfile contents or resolve these conflicts.

Urgency: completed-review batch publication. The known edit-loss correction is verified on this head, but the integration gate prevents treating that as merge readiness. No new high-severity product defect was confirmed. Only this new report is published; implementation, task states, and PR merges remain untouched.
