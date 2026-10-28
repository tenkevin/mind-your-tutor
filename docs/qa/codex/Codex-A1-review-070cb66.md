Reviews: A1

# Independent QA: A1 / PR #28

Scoped result: **PASS** for the permitted task checks and the reported system-prompt fix. Overall all-must verdict: **UNVERIFIED**, because A1-F9 requires a full root database test suite including a specifically prohibited test. This report does not waive that merge gate.

Reviewer: independent Codex QA agent, 2026-10-27. No implementation changes, remote writes, task-state changes or merges were made.

## Exact tree and environment

- PR head: `070cb66b457b3a9146fa1287b94bfee3f9485ea4`.
- Pinned current base: `c3de500e8b7de251ff25df0fdb7a460bdb5539b7`.
- Detached worktree: `/home/kevin/codex-qa-2026-10-27/a1-070cb66`.
- `git merge --no-commit --no-ff c3de500e8b7de251ff25df0fdb7a460bdb5539b7` succeeded without conflicts. Merge adds/updates only PLAN, tasks and two C5/C6 review documents.
- Integrated index tree before and after checks: `276aa934d840474137af616dacb1db9c55fe62f3`. HEAD remains the PR head; there is no synthetic merge commit.
- Node 22.22.0, pnpm 10.28.0, toolchain PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`.
- Disposable own container `codex-qa-a1-070cb66`, image `pgvector/pgvector:pg16`, PostgreSQL 16.15, port 55431. DATABASE_URL `postgres://postgres:postgres@127.0.0.1:55431/ideamap`. Container is now **stopped**, retained for evidence.
- Exact-head REST check evidence is saved in `a1-070cb66/head-ci.json`: build job 120847614745 and plan/check job 120847615068 both success at this head. This is remote CI evidence, not a substitute for forbidden independent coverage.

## Checks and evidence

All log paths below are relative to `/home/kevin/codex-qa-2026-10-27/evidence/`.

| Criterion | Result | Independent evidence |
|---|---|---|
| A1-F1 | PASS | `src/ai/boundary.test.ts` passed, scanning source and built apps; only gateway provider imports SDK. |
| A1-F2 | PASS | DB gateway test fills all registered variables, preserves `{mystery}`, respects layers. External pure functional fixture independently tests pack, curriculum-default and class template/topic sources through compiled gateway, including `{unknown}` preservation. |
| A1-F3 | PASS | Existing gateway strict-body tests reject injected prompt/persona/variables/model and invalid role, zero calls. |
| A1-F4 | PASS | Existing DB fixture verifies student/class limits, Retry-After and unaffected second class. |
| A1-F5/F6 | PASS, within A1 roster backstop scope | Existing DB fixture verifies names/email/phone/roster redaction, pseudonymous provider user, stored tokens and text-free logs. Fixed regression writes named teacher config through real PUT route and verifies provider and stored system redaction with six misses. Independent no-DB gateway fixture verifies all three configuration layers, a single prompt-plus-turn blur, consistent Person A labels, stored prompt and three aggregate misses. |
| A1-F7 | PASS | DB gateway tests timeout, provider failure and malformed output: fixed friendly 502; redacted stored failure/log, no partial reply. SDK adapter tests use local mock HTTP only. |
| A1-F8 | PASS | DB test calls all built-ins with empty Personas; boundary registry-copy test passes. |
| A1-F9 | **UNVERIFIED** | Root build/typecheck/lint/format:check/plan check all exit 0; scoped DB-backed tests below exit 0. Full root test and `function_binding.test.ts` were not executed, under the inherited restriction. |
| A1-S1 | PASS | Boundary test scans browser source/dist. Both apps rebuilt with synthetic server and VITE key canaries; explicit built-bundle scan found neither canary nor provider hosts. Failure-response tests verify secret/provider details absent. No real keys used. |
| A1-S2 | PASS | Gateway signed-out/other-class/other-org tests; full existing every-route role/policy sweep passes with declared AI policies and denied requests before calls. |
| A1-S3 | PASS | Existing gateway tests maintain server persona for instruction-changing messages and refuse student Atlas route. No provider tools are supplied. |
| A1-S4 | PASS | Student-delete DB gateway fixture and worker retention suite (7 tests) pass. Stored rows use F6 ai_interaction table; default retention is 90 days. |
| A1-S5 (should) | PASS | Real config PUT produces audit; subsequent call produces no per-call audit. |
| A1-P1 | PASS | Isolated existing 200-call benchmark after 200-call warm-up: gateway p95 3.34 ms, signed-in baseline p95 0.73 ms, added 2.61 ms against <30 ms. Auth benchmark p95 .83 ms minus public baseline .06 ms = .77 ms against <5 ms. Raw console in performance.log. |
| A1-P2 (should) | NOT MET | JSON reply after completion; no streaming path. Existing known limitation. |
| A1-U1 | PASS | Explicit student AI client suite: 3/3; 429 maps to plain limit message and retryAfterSeconds. |
| A1-U2 (should) | PASS | README documents provider interface, keys, configurable limits, per-process quota, redaction and current name-detection limits. |

## Commands and raw logs

Run from the worktree unless noted, with toolchain PATH and the DATABASE_URL above for database tests.

```
pnpm install --frozen-lockfile                           # install.log, exit 0
pnpm build                                               # build.log, exit 0
pnpm typecheck                                           # typecheck.log, exit 0
pnpm lint                                                # lint.log, exit 0
pnpm format:check                                        # format.log, exit 0
node scripts/plan.mjs check                              # plan.log, exit 0
pnpm --filter @ideamap/api exec vitest run src/ai/gateway.test.ts src/ai/anthropic.test.ts src/ai/boundary.test.ts src/policy.test.ts src/auth.test.ts src/privacy.test.ts src/config.test.ts
# api.log: 7 files, 89 tests PASS, exit 0
pnpm --filter @ideamap/worker exec vitest run src/retention.test.ts
# retention.log: 7 tests PASS, exit 0
pnpm --filter @ideamap/ai exec vitest run
# ai.log: 16 tests PASS, exit 0
pnpm --filter @ideamap/student exec vitest run src/ai.test.ts
# student.log: 3 tests PASS, exit 0
IDEAMAP_PERF_VERBOSE=1 pnpm --filter @ideamap/api exec vitest run src/policy.test.ts -t performance --reporter=verbose --silent=false
# performance.log: 2 performance tests PASS, 21 intentionally filtered out; exit 0
node /home/kevin/codex-qa-2026-10-27/evidence/a1-070cb66/independent-regression.mjs
# independent-regression-final.log: pack/defaults/class 3 PASS, exit 0
IDEAMAP_AI_API_KEY=qa-A1-synthetic-canary-070cb66 VITE_IDEAMAP_AI_API_KEY=qa-A1-vite-canary-070cb66 pnpm --filter @ideamap/teacher --filter @ideamap/student build
# canary-build.log: exit 0
rg -n 'qa-A1-synthetic-canary-070cb66|qa-A1-vite-canary-070cb66|api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com' apps/teacher/dist apps/student/dist
# bundle-scan.log: empty, exit 1 (expected no matches)
```

Each named log is under `evidence/a1-070cb66/`. Benchmark implementation is retained unchanged at `apps/api/src/policy.test.ts`; it measures real policy checks, DB reads, transcript insert and instant mock completion. These are warmed measurements, not cold latency or a historical comparison. The framework prints p95 summaries; it does not persist individual latency samples. This report makes no claim to raw individual samples.

First failures: no application check failed. The initial independent harness wrongly accessed the JSON-string insert parameter as an object, producing an assertion with actual undefined; `independent-regression.log` retains it. Corrected the external fixture by parsing the JSON string, then all three sources passed. A shell attempt used unavailable `python`; reran that fixture-only correction with `python3`. Neither event was a product defect. No application source was changed.

## Errors

None confirmed in the permitted A1 review. The previously reported filled-system backstop error is fixed at this head. A1-F9 remains unavailable and blocks an overall all-must PASS; do not merge based on the scoped result alone. Correction for that gate is coordinator/user resolution of the existing coverage restriction, not re-running or rerouting the prohibited test.

## Suggestions

- Low: retain A1-P2 streaming as a future enhancement; it remains a should check, not a regression.
- Low: preserve documented per-process limits and limited roster-name detection for the existing A7/scaling follow-ups. No new adversarial probes were added.

## Boundaries

Read applicable AGENTS, HANDOFF, QA README/STATUS, A1 criteria/history and architecture D1–D30. No real model call or key was used. No unrestricted root test, forbidden function-binding suite or new adversarial database/security probe was executed. No prior shadow-table probe was reproduced. Only explicit API files, retention file, AI package and student-client file were executed; imports resolve to ordinary helpers, not forbidden suites. Full-suite coverage, including A1-F9, remains UNVERIFIED. The historical report's broader PASS is not adopted.

## Parent review and urgency

The parent reviewer read this complete report, the independent fixture and raw API/performance/regression logs, and reviewed the gateway change. The filled prompt and conversation now pass through one backstop call, preserving consistent labels before provider transmission and storage. No new confirmed defect was found. Exact-head CI and plan successes were independently verified through REST: [CI40085548133](https://github.com/tenkevin/mind-your-tutor/actions/runs/40085548133), [plan40085548172](https://github.com/tenkevin/mind-your-tutor/actions/runs/40085548172).

Publish this completed correction report promptly because A1 is on the critical path and gates A2/A3/A5/A6/A7/T7. This is evidence for the coordinator, not an application merge or waiver of A1-F9. At publication preparation base advanced to `2ded9d59ffa6ace8a6e40bd059c963de10387bd3`; changes since the tested pin are docs/task metadata and `scripts/plan.mjs`, with no application changes. The PR still requires current-base synchronization and the coordinator's normal integration gates. Parent did not rerun or reroute the excluded test.
