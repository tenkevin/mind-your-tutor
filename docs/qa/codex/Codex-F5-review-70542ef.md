Reviews: F5

# F5 independent integration review · PR15 · 70542ef

**F5 task criteria: PASS within the specified local/mock-provider scope. Full-suite integration gate: UNVERIFIED because the previously blocked function-binding test was excluded.** No new implementation error confirmed. Canonical F5-E1 remains corrected, now verified on the integrated tree. This report does not certify excluded F4cx1 coverage or give an unqualified all-must integration PASS.

## Exact scope and integration

- PR HEAD: `70542efde2994d90164131440a6133c3d16de038`.
- HEAD tree: `c3bd45c1280af0fd0456fbc6ca9274674a62524b`.
- Pinned base / retained MERGE_HEAD: `7c79a06a4d48a7dfa43e37223ab8daba0ac1bf14`.
- **Actually tested index tree:** `42711c65c2b636b6bf07a9345c5a5e55d05a7213`.
- Detached worktree: `/home/kevin/codex-qa-2026-10-22/f5-review-70542ef`.

Commands from `/home/kevin/mind-your-tutor`: `git worktree add --detach /home/kevin/codex-qa-2026-10-22/f5-review-70542ef 70542efde2994d90164131440a6133c3d16de038`; then in that checkout `git merge --no-commit --no-ff 7c79a06a4d48a7dfa43e37223ab8daba0ac1bf14` returned exit0, “Automatic merge went well; stopped before committing as requested.” No conflict resolution. The integrated index differs from HEAD only in `docs/PLAN.md` and `docs/tasks.json`; QA did not edit those files. `git diff --check` and `git diff --exit-code` exit0; no unstaged changes. Final `git write-tree` still returns the tested tree above.

Read complete AGENTS, HANDOFF, QA README/STATUS/F5, root README, historical project handoff, relevant architecture, plan/ledger and immutable `Codex-F5-review-941340b.md` / `Codex-F5-review-0fef315.md`. The resumed authorization takes precedence over stale stopped-state paragraphs. No nested AGENTS found in task paths. Lockfile/support.js contents were never read.

Parent supplied exact-head green CI build39971460201 / plan39971460207 as context. Those were not independently fetched by this reviewer and are not substituted for integrated local evidence. A later base change requires normal synchronization/current-head gates.

## Errors

No new implementation defect confirmed. **F5-E1 correction PASS:** fresh production-source synthetic replay checks preserve and actually deliver all edits across first/middle/last 401,500 and dropped-connection failures; in-flight new-URL and newer same-URL writes are delivered; overlapping replay calls share one promise and one request; another account's queued write is never sent. The correction uses revisions, reads the current queue after acknowledgements, and shares an in-flight replay promise. The retry button is disabled while saving. Complete Teacher Settings forms await T1; this verifies the implemented public queue helper and shell/return-page contract, not a future complete settings form.

The prior integration blocker is corrected: auth is migration `0014_auth`, registered after landed `0013_import_jobs`; the scratch integration is clean and both API/worker paths build and run. No new correction request is needed. The remaining unavailable full-suite check is a review limitation, not an invented application error.

## Fresh environment, commands and raw evidence

Linux x86_64, Node22.22.0/pnpm10.28.0; every pnpm/node shell exported `PATH=/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin:$PATH`. Dedicated new container `codex-qa-f5-70542ef`, image `pgvector/pgvector:pg16`, mapped `127.0.0.1:32768`, `DATABASE_URL=postgres://postgres:qa@127.0.0.1:32768/qa_f5`. Synthetic sample data only; existing harnesses create/drop their own databases. All artifact paths below are under `/home/kevin/codex-qa-2026-10-22/evidence/`.

| Command in integrated checkout | Result / raw log |
|---|---|
| `pnpm install --frozen-lockfile` | exit0,263 packages; `f5-install-70542ef.txt` |
| `pnpm build` | exit0 all workspaces; `f5-build-70542ef.txt` |
| `pnpm lint` | no errors; `f5-lint-70542ef.txt` |
| `pnpm format:check` | All matched files use Prettier code style; `f5-format-70542ef.txt` |
| `pnpm typecheck` | all workspaces Done; `f5-typecheck-70542ef.txt` |
| `node scripts/plan.mjs check` | exit0,plan: ok; `f5-plan-70542ef.txt` |
| `DATABASE_URL=<above> pnpm --filter @ideamap/db exec vitest run src/columns.test.ts src/integrity.test.ts src/isolation.test.ts src/migrations.test.ts src/performance.test.ts src/security.test.ts src/index.test.ts src/test/derived.test.ts` | exit0,8 files165 tests,56.01s; `f5-db-70542ef.txt` |
| `DATABASE_URL=<above> pnpm --filter '!@ideamap/db' -r test` | exit0; `f5-baseline-70542ef.txt` |
| `DATABASE_URL=<above> IDEAMAP_PERF_VERBOSE=1 pnpm --filter @ideamap/api exec vitest run src/policy.test.ts -t 'adds under 5 ms' --reporter=verbose --silent=false` | exit0,1 pass18 intentionally filtered,4.31s; `f5-performance-70542ef.txt` |
| `node /home/kevin/codex-qa-2026-10-22/evidence/f5-replay-probe-70542ef.mjs` | exit0; `f5-replay-70542ef.txt` |
| `DATABASE_URL=<above> node apps/api/dist/dev/cli.js`; `pnpm --filter @ideamap/teacher dev`; `pnpm --filter @ideamap/student dev`; then `node /home/kevin/codex-qa-2026-10-22/evidence/f5-browser-70542ef.mjs` | real local mock redirects, browser exit0; `f5-cli-70542ef.txt`, `f5-teacher-server-70542ef.txt`, `f5-student-server-70542ef.txt`, `f5-browser-70542ef.txt` |

Non-DB suite counts: UI78, AI6, contracts217, tracker172, student3, teacher22, domain96, connectors118, worker18, API71. API6 files71 tests pass in6.92s. Existing worker import tests also pass against fresh migrations. Initial quality commands ran sequentially in one shell and finished successfully; logs show every workspace typecheck complete and formatting success. No validation test failed or required a retry in this review. Exploratory lookups of absent root `vitest.config.ts`, `apps/worker/src/import.test.ts` and `apps/teacher/src/Shell.tsx` returned missing-file diagnostics; actual package configs, `imports.test.ts` and `App.tsx` were read. These are lookup errors, not application failures.

The ordinary DB suite overlapped quality checks (including its existing DB performance tests); its165 tests passed. The **separate auth acceptance timing** ran only after all own builds/typechecks/DB/workspace tests ended, with no review browser/services active. Fresh raw sample: `auth p95 1.68 ms, base 0.13 ms`, incremental p95 **1.55 ms <5ms**. Method unchanged:1000 authenticated warmups,1000 health requests,1000 authenticated requests, sorted p95 difference using Fastify inject. This is local middleware overhead, not production network latency. The heavy window was released directly to F6 and parent immediately after this timing completed.

Recovery harness is a new external file adapted from the immutable prior harness, resolving only the new checkout path. It transpiles exact production session.ts using installed TypeScript and resolves the reviewed contracts build; storage/responses are synthetic in memory, no DB or network. Raw outcomes include nine sequential failures/retries, latest/account control, both in-flight variants `{saved:2,pending:0}` with actual A70/B75 or A70/A75 payload assertions, and overlap `requests:[one URL]`, both results `{saved:1,pending:0}`. Final summary: `{"sequentialAndControlsPassed":10,"confirmedLostConcurrentEdits":[]}`.

## C4 integration and every-route policy sweep

Source and fresh passing API tests show `registerPolicies` is installed before auth/access/import registration. C4 routes register inside a child scope which inherits `onRoute` and `onRequest`; policies require staff and an org-visible curriculum/import_job row. The production `buildServer` authenticator derives its caller from `req.session`. The optional standalone `importRoutes` interface is not used to bypass production session enforcement.

The sweep's `startApi({}, {imports:true})` registers both C4 URLs. It enumerates17 unique URLs/19 non-HEAD method routes and covers all15 protected method/route combinations, including POST upload and GET poll. Existing sessionFor creates normal stored sessions and cookies, and requests pass through actual policy hooks. It does not inject caller identity into request state. Five caller variants cover student, unrelated-class teacher, other-org teacher, other-org admin and local admin; signed-out checks cover each protected request. Same-org staff import access is intentionally allowed independently of class membership. Both public discovery/start routes are necessary parts of sign-in, alongside health/callback.

The separate C4 HTTP suite's x-test-user helper only translates a synthetic user key into a genuine session cookie and CSRF header, removing that header before app.inject. It uses the production server; no old custom-auth bypass remains. Fresh tests cover upload→poll→draft through real pg-boss workers, idempotency, role/org refusal, file/archive bounds and fixed unknown-job responses. Cross-org upload returns403 `{error:'Forbidden'}` before queuing. GET `/imports/<script>` returns403 with no echoed input. These are intentional policy outcomes, not regressions to the old404 behavior. Production API bootstrap still omits optional import deps, as already routed in C4's existing T2/CXB suggestion; this review does not claim deployed import bootstrap is wired.

## Every F5 criterion

All PASS entries describe the integrated tree and permitted local/mock scope. Excluded function-binding coverage and the full-suite gate remain UNVERIFIED.

| Check | Weight | Result and evidence |
|---|---|---|
| F5-F1 | must | PASS fresh teacher/student API and actual-browser mock SSO; session cookie,/me id/role/org |
| F5-F2 | must | PASS single adapter/config source, all3 mock issuers, added provider via config; real tenant presets unverified as specified |
| F5-F3 | must | PASS existing repeat-identity, verified-email roster link and cross-provider refusal tests |
| F5-F4 | must | PASS complete registry/protected sweep including both C4 routes; unsigned401,wrong role/class/org403,admin success |
| F5-F5 | must | PASS same-org unrelated-class config/roster/library refusal, reassignment success and class upload isolation |
| F5-F6 | must | PASS author edit success, using teacher and other-author refusal |
| F5-F7 | must | PASS sign-out cookie replay,8h/2h idle,activity,configured and absolute expiry tests |
| F5-F8 | should | PASS OneRoster expected users/classes/enrolments and repeat without duplicates |
| F5-S1 | must | PASS existing code/S256 PKCE/nonce and missing/reused state,bad nonce/aud/expiry/key/issuer refusal tests |
| F5-S2 | must | PASS cookie tests/browser HttpOnly,Secure,Lax,host-only; client holds CSRF in memory and pending bodies in sessionStorage, no session tokens |
| F5-S3 | must | PASS existing foreign/missing origin and missing/wrong token POST/PUT/DELETE checks; valid PUT accepted; imports inherit same hook |
| F5-S4 | must | PASS ordinary existing app-role org-A context queries see zero org-B classes/users/curricula/sessions/tenants, API refusal; blocked function-binding coverage excluded |
| F5-S5 | must | PASS synthetic token PII/storage tests and unchanged allowed-claim source audit; no photo/birthday/phone/address |
| F5-S6 | must | PASS absolute/protocol-relative/backslash/control redirect refusal and valid local path tests |
| F5-S7 | must | PASS50 failed callbacks/IP limiting and fixed unknown-user responses |
| F5-S8 | must | PASS env-config/example tests; example names empty, env-only secret source reviewed; unchanged prior targeted key-header source conclusion carried forward, no exhaustive new forensic scan |
| F5-S9 | must | PASS actor/action/target/time audit tests for sign-in,role-change,sign-out |
| F5-P1 | must | PASS fresh isolated1.55ms incremental p95; both ordinary API suite and targeted timing pass |
| F5-P2 | should | PASS existing mock sign-in→/me under1000ms assertion |
| F5-U1 | must | PASS fresh Chromium400px teacher/student, three named buttons,no password,document width400; new screenshots visually inspected |
| F5-U2 | must | PASS fresh API/browser exact “Your school account isn't linked to a class yet. Ask your teacher.” |
| F5-U3 | must | PASS fresh E1 harness plus22 teacher tests; sequential/concurrent delivery,returnTo,user scoping,shared overlap and retry markup; future complete settings forms not exercised |
| F5-U4 | should | PASS built CLI migrates/seeds all roles/starts3 mock issuers+API, documented app commands and browser flows |

## Suggestions

No new suggestion. Existing per-process OIDC used-state/rate-limit storage and unverified real Clever/ClassLink tenant claims remain documented architecture/CXB follow-ups. The prior overlap/retry suggestion is addressed. The existing C4 import bootstrap follow-up remains T2/CXB scope.

## Limitations and cleanup

Unrestricted root test was never run. Inspected selected DB tests/helpers/package exports/configs and API/worker harness imports: none imports `function_binding.test.ts`. It was not executed directly or indirectly. No new/custom adversarial DB probe, previously blocked shadow/temp-table action, PR13-specific review or reroute through CI/another agent was attempted. Ordinary migration execution is baseline setup, not certification of the excluded dynamic tests. **Required full-suite integration coverage remains UNVERIFIED** and must be explicitly reconciled by the coordinator; task criterion PASS cannot silently waive that gate.

Fresh screenshot files: `f5-teacher-400-70542ef.png`, `f5-student-400-70542ef.png`; viewed and readable. Browser harness followed real mock redirects without fetch interception; teacher/student /api/me200 and expected role/org; exact unenrolled refusal passed. No real school accounts/data, provider tenants or production proxy/deployment tested.

Browser closed. Own API/IdP and both Vite services stopped with validated exact PIDs19508/19586/19682; dedicated container stopped and retained (`exited`). Worktree/index and external evidence retained; no app changes,claims,task changes by QA,commits,remote comments/writes/merges or immutable-report edits. Parent must review this report before publication.

## Parent review and publication assessment

The parent reviewer read this complete independent report, checked the cited regression and baseline outputs, and verified the exact PR head and its green CI/plan runs through the GitHub REST API on 2026-10-23. The parent accepts the scoped conclusions above. No new error needs a correction proposal; the previously reported corrections remain effective. Suggestions stay separate from must-fix errors.

Urgency: routine completed-correction evidence, suitable for this batch publication. Only new Codex report files are authorized for this commit; no implementation, task-state or application merge is included. The pinned base was still `7c79a06a4d48a7dfa43e37223ab8daba0ac1bf14` at the pre-publication fetch. This report does not waive current-base synchronization, actual-merge CI or the unavailable full-suite check.

