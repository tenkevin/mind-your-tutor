Reviews: F5

# Independent F5 QA · PR15 · dc3c902

Verdict: **FAIL** — one confirmed Medium/P2 must-fix error in F5-U3: unsuccessful replay deletes unsaved teacher edits. Other listed checks pass within the required local/mock-provider scope. Real school providers remain intentionally unexercised.

Head: `dc3c902018b2430f051d57fef6fa3e7155c354e3`. Pinned base: `a514122f6566355d36a15c025a6ad721794124bf`, already an ancestor. Tested tree: `4c56186a6e20a62c5750df7e16bfe7bd5a70905b`. Detached worktree: `/home/kevin/codex-qa-2026-10-22/f5-review-dc3c902`. No scratch merge needed. No implementation, task, published-report or remote changes. Tracked worktree clean before and after.

The user explicitly resumed this review despite stale stopped-after-C9 text in pinned documents. Read AGENTS, HANDOFF, STATUS, PLAN, QA README, F5 criteria, ledger, relevant architecture and all F5 auth/policy/session/roster tests before execution. No additional package AGENTS found. Did not read `pnpm-lock.yaml` or `project/support.js`. Initial fetch failed with “Repository not found”; exact pinned objects were already present, so review continued without a fetch retry. Parent supplied exact-head green CI [build 39893177791](https://github.com/tenkevin/mind-your-tutor/actions/runs/39893177791) and [plan 39893177715](https://github.com/tenkevin/mind-your-tutor/actions/runs/39893177715); this reviewer did not independently fetch those logs.

## Environment and completed validation

Linux x86_64; Node 22.22.0 / pnpm 10.28.0. PATH prefix: `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`.

Dedicated disposable container `codex-qa-f5-dc3c902-20261022`, image `pgvector/pgvector:pg16`, dynamically published only at `127.0.0.1:32784`, synthetic database `qa_f5`. No existing database or volume used. Existing test harnesses created/dropped their separate synthetic databases. Container stopped and retained; review-owned API/mock/Vite processes stopped.

No new/custom adversarial DB probes, blocked shadow-table tests, PR13 actions or PR17 code were executed. Existing accepted baseline DB tests and existing F5 mock-auth/isolation tests only. The independent failing recovery harness uses entirely synthetic in-memory storage/responses, without a database or network.

| Command/check | Outcome |
|---|---|
| `pnpm install --frozen-lockfile` | Exit 0; 263 packages |
| `pnpm build` | Exit 0 across workspace |
| `pnpm lint` | Passed |
| `pnpm format:check` | Passed; all matched files formatted |
| `pnpm typecheck` | Passed across workspace |
| `node scripts/plan.mjs check` | Exit 0; `plan: ok` |
| `DATABASE_URL=<dedicated QA DB> IDEAMAP_PERF_VERBOSE=1 pnpm test` | First full-root attempt exit 0 |
| Existing targeted P1, verbose rerun | Exit 0; auth p95 2.05 ms, base p95 0.13 ms, overhead 1.92 ms |
| Actual Chromium browser normal flows | Teacher/student mock SSO, 400 px sign-in and unenrolled refusal pass |
| Independent session recovery counterexamples | Confirmed queue loss on 401, 500 and network failure |

Full-root counts: API **65/65**, DB **165/165**, contracts **213/213**, connectors **111/111**, domain **93/93**, tracker **159/159**, UI **73/73**, teacher **10/10**, student **3/3**, AI **6/6**, worker **1/1**. DB Vitest duration 73.93 s; API 10.67 s. Source tests use source aliases; the separate build verifies emitted packages. Other reviewer workloads overlapped parts of baseline validation, but F5 had no timing failure.

Performance command:

```
DATABASE_URL=<dedicated QA DB> IDEAMAP_PERF_VERBOSE=1 \
pnpm --filter @ideamap/api exec vitest run src/policy.test.ts \
  -t 'adds under 5 ms' --reporter=verbose --silent=false
```

This existing test performs 1,000 authenticated warmup requests, 1,000 baseline requests and 1,000 measured authenticated requests. First targeted run: 1 passed, 17 deliberately filtered, 4.34 s total. Measured p95 difference **1.92 ms < 5 ms**. This is local Fastify-inject auth overhead, not production network latency. Heavy work was then released to the other reviewer for its quiet retry.

The dev CLI underlying documented `pnpm dev:auth` was independently launched after root build, migrated/seeded dedicated `qa_f5`, and started mock IdP 4010 / API 3000. Documented app commands started teacher 5173 / student 5174. Chromium performed actual mock-provider redirects and cookie handling; the browser harness did not intercept fetch. Screenshots were visually inspected.

## Criterion verdicts

| Check | Weight | Result | Evidence |
|---|---|---|---|
| F5-F1 | must | PASS | Existing OIDC end-to-end test and actual browser sign-in at both app origins. /api/me returns 200, correct teacher/student role and org; session cookie present. |
| F5-F2 | must | PASS | One IdentityProvider/OidcProvider interface; configuration for Google/Clever/ClassLink. Existing tests sign in through all three mock issuers and add a new provider through config only. Real presets documented unverified pending school selection. |
| F5-F3 | must | PASS | Same identity twice, verified-email first link, and clear cross-provider same-email refusal tests pass; auth flow creates no users. |
| F5-F4 | must | PASS | Registry covers 15 URLs / 17 non-HEAD method routes. Missing/empty policy rejected. Existing sweep exercises all 13 protected method/route combinations signed out and with student, other-class, other-org and admin callers. Public provider/start endpoints are required sign-in flow, not data-route exceptions. |
| F5-F5 | must | PASS | Same-org other-class config/roster/library return 403; own class 200. Assigned teacher succeeds. D11 uploads restricted by class context. |
| F5-F6 | must | PASS | Author defaults edit 200; using teacher 403; another author's curriculum refused. |
| F5-F7 | must | PASS | Sign-out cookie replay 401; teacher 8-hour/student 2-hour idle limits, active/idle distinctions, 12-hour absolute cap and configurable limits all pass. |
| F5-F8 | should | PASS | OneRoster sample creates 5 users / 2 classes / 3 enrolments, re-import creates zero, other org unaffected, audit recorded. |
| F5-S1 | must | PASS | Existing mock code flow with S256 PKCE and nonce passes. Missing/mismatched/reused state, absent login cookie, wrong nonce/audience/issuer, expired token and unknown signing key all refused. |
| F5-S2 | must | PASS | Set-Cookie tests and real browser confirm HttpOnly, Secure, SameSite=Lax, host-only. Session token not stored in localStorage; CSRF kept in memory. |
| F5-S3 | must | PASS | Existing foreign/missing-origin and missing/wrong-token POST/PUT/DELETE cases refused; 404 accepted only for methods not registered. Valid PUT succeeds. |
| F5-S4 | must | PASS | Existing app-role org A query sees zero org B class/user/curriculum/session/tenant rows. API cross-org admin requests get 403. Source handlers consistently use transaction-local role/org/class wrapper. No custom DB probe. |
| F5-S5 | must | PASS | Synthetic token's photo, birthday, phone and address do not appear in user/session/audit storage; allowed user columns and source claim filtering checked. |
| F5-S6 | must | PASS | Existing absolute/protocol-relative/backslash/control-character redirect cases stay local; valid local path retained. |
| F5-S7 | must | PASS | Existing 50-failed-callback test limits after 20, leaves other IP unaffected and resets after 61 seconds. Fixed-body/random-id tests pass. |
| F5-S8 | must | PASS | Production secrets read from env with no defaults; blank .env.example names and config tests pass. Targeted tracked-source private-key-header search found none. Test-only synthetic strings are not production credentials. Not an exhaustive credential-forensics claim. |
| F5-S9 | must | PASS | Existing sign-in, role-change and sign-out audit tests inspect actor/action/target/time; source also sets target type/detail. |
| F5-P1 | must | PASS | Existing 1,000-request benchmark passes in root and targeted verbose run; p95 overhead 1.92 ms. |
| F5-P2 | should | PASS | Existing mock sign-in through /me finishes within its 1,000 ms assertion. Browser network-idle waits not used as latency evidence. |
| F5-U1 | must | PASS | Actual 400×800 browser views show Google/Clever/ClassLink buttons, no password input, document width 400 = viewport 400. Screenshots visually inspected. |
| F5-U2 | must | PASS | Existing API test and actual unenrolled browser flow display exact plain refusal, quoted below. |
| F5-U3 | must | **FAIL** | Happy-path single-edit test passes, but unsuccessful replay drops failed/unattempted edits. Counterexamples below. Full Teacher Settings UI awaits T1; current F5 recovery client already violates its no-edit-loss contract. |
| F5-U4 | should | PASS | Documented one-command mock/API CLI independently launched with seeded roles and working browser SSO. App servers need separate commands, as README states. |

Unenrolled browser text: “Your school account isn't linked to a class yet. Ask your teacher.”

## Errors

### F5-E1 · Medium/P2 · Unsuccessful replay deletes unsaved teacher edits

F5-U3 requires expired-session recovery without losing autosaved edits. In `apps/teacher/src/auth/session.ts:102`, replay reads pending writes; **line 103 deletes the entire queue before any write succeeds**. Line 106 calls `send` without checking `Response.ok`. `send` only throws/re-stashes on 401 (line 92), so a 500 response is counted as a successful replay. A network error aborts after all pending storage has already been removed. Repeated 401 re-stashes only the current write and loses later unattempted writes.

Reproduction:

```
PATH=/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin:$PATH \
node /home/kevin/codex-qa-2026-10-22/evidence/f5-session-replay-dc3c902.mjs
```

The external harness transpiles exact production `session.ts` using installed TypeScript, changing only its module import to this worktree's built contracts. All storage/fetch responses are synthetic and in-memory. It seeds two pending PUTs for the same teacher at `/api/classes/class-a/config` and `/api/classes/class-b/config`, loads a valid synthetic /me, and replays:

| First replay response | Observed | Expected |
|---|---|---|
| 401 | First request sent; SignedOut thrown; only first write re-stashed; second unsent write deleted | Failed and unattempted edits both retained for next sign-in |
| 500 | Both requests sent; replay returns 2; queue empty although neither write saved | Failed edits retained; failure surfaced rather than counted as saved |
| Network error | First request attempted; exception; queue empty | All unsuccessful/unattempted edits retained |

500/network variants also demonstrate loss for a single pending edit. Two edits expose the 401 unsent-tail loss. This is ordinary connection/server-failure handling, not a security finding or production DB probe. Existing tests cover only successful replay after reauthentication.

Suggested correction: dequeue each write only after acknowledgement of successful persistence; preserve failed and unattempted writes on 401, network errors and 5xx; count only successful saves and expose failure/retry state. Preserve user isolation and same-URL autosave replacement. Regress at least two URLs with first/midway 401, 500 and network failures, verify retained payloads and safe return path, then successful retry recovers all required edits. No implementation fix applied.

## Suggestions

1. Include transient replay failures and multiple pending URLs in recovery regressions. This belongs to mandatory F5-E1, not a duplicate task/finding.
2. Before multi-process API deployment, document or share callback used-state and failed-callback limiter storage: `apps/api/src/routes/auth.ts:57` and `:118`, plus `limiter.ts`, keep state per process. Existing single-instance criteria pass; distributed deployment was not tested and no demonstrated bypass is claimed.

## Artifacts, cleanup and limitations

All artifacts are outside the repo at `/home/kevin/codex-qa-2026-10-22/evidence/`:

- `f5-baseline-tests-dc3c902.txt`, `f5-baseline-checks-dc3c902.txt`: retained root outputs/counts. Build exit 0 also observed in review tool output.
- `f5-performance-dc3c902.txt`: first targeted verbose P1 measurement.
- `f5-browser-dc3c902.mjs` and `.txt`; screenshots `f5-teacher-400-dc3c902.png`, `f5-student-400-dc3c902.png`, `f5-unenrolled-400-dc3c902.png`.
- `f5-session-replay-dc3c902.mjs` and `.txt`: first-run confirmed counterexamples. Harness exits 0 because it asserts the observed bug, not because the behavior is correct.

No real school accounts, production proxies/deployment, vendor certification or full Teacher Settings implementation tested. Role/org/class validation uses independently executed existing mock tests and source inspection; custom adversarial DB probes were explicitly excluded. Historical F4 defects remain separately F4cx1-owned and were not retried or duplicated here. Container stopped and retained; review-owned servers stopped; tracked tree clean.

This FAIL cannot become PASS from green CI or passing baseline tests alone. Coordinator must recheck current-base synchronization and exact-head CI before any later merge gate.

## Parent review and publication disposition

Independent QA coordinator read the complete reviewer report and reproduction artifact, checked relevant production source, and independently reran the synthetic recovery harness with the same three confirmed failures. No implementation changes were made. F5-E1 is a Medium/P2 merge blocker, not evidence of a tenant-isolation failure. Publish in this immediate completed-review batch; no emergency production action is indicated for the unmerged PR. Correction and regression rerun are required before PASS. Parent confirmation: evidence/f5-parent-confirmation-dc3c902.txt.

Publication-time base advanced to `583d9aa` (F1d merged) after the pinned review base. This report does not claim a rerun on that later integration. Current-base synchronization, review of any conflict resolution, exact-head CI and postmerge CI remain required. Historical stopped-after-C9 documents were superseded only for the user's expressly resumed QA of #15/#17/#18. Reports only are published; no claims, merges, production fixes or task-state edits are included.
