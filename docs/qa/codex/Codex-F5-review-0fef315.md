Reviews: F5

## Publication-time base change

The mandatory pre-push pull advanced `idea-map` from the tested base `dfc44cf7fafc88ee51272a402d6aed080783e09f` to `be6697d6fa97aa681d65a68abf7280928ed49b4c`, including F4cx1 application merge `45d89c54c840610e02670ff04efcfe1678bbbc1e`. This is **not documentation-only drift**: database migration registration and a new migration/test changed. The results above remain exact evidence for the pinned scratch tree; they are not an all-must PASS on the latest base and do not authorize merging a stale PR. The coordinator must synchronize and obtain appropriate current-tree integration evidence, including the documented F5/F6 migration-number collision where relevant. The separate coordinator F4cx1 report is attributed evidence, not a claim that this Codex session reran or independently certified previously blocked probes. No such rerun was attempted.

# F5 independent rerun · PR15 · 0fef315

Verdict: **FAIL — canonical F5-E1 remains partially resolved.** The original sequential 401/network/500 loss is fixed and independently retested. A new edit queued while replay awaits a response is still deleted by the old replay snapshot. Same criterion F5-U3, same Medium/P2 finding, not a duplicate task. All other F5 criteria pass in the required local/mock-provider scope.

## Exact integration and first failure

- PR head: `0fef3158643c89068a69c706ff315c43237c4078`; **HEAD tree** `9efbbd84f3544f3aa23be27626bb8679a8f5997a`.
- Pinned base: `dfc44cf7fafc88ee51272a402d6aed080783e09f`.
- Worktree: `/home/kevin/codex-qa-2026-10-22/f5-review-0fef315`.
- Initial `git merge --no-commit --no-ff <base>` conflicted in **docs/ARCHITECTURE.md**; no integrated tree could be written. Reviewer stopped integration and notified parent before install/tests.
- Parent resolved that documentation conflict using apply_patch: preserve F5 questions 8/9 verbatim; retain the base's settled D14/C5 note as question 10. No application change. Resolution staged by parent, independently checked by reviewer.
- **Actually tested index tree:** `a27fa5c7d5004009e6ec0ce36013de3571df07d2`, not the plain HEAD tree. `git diff --check` passes; no unstaged diff. Sixteen staged base-integration paths remain deliberately retained. No source fixtures or implementation fixes.

Parent supplied exact-head green [build 39896077909](https://github.com/tenkevin/mind-your-tutor/actions/runs/39896077909) and [plan 39896077893](https://github.com/tenkevin/mind-your-tutor/actions/runs/39896077893). This reviewer did not independently fetch those logs. CI on plain HEAD does not itself validate this scratch merge; fresh local checks below tested its actual integrated tree. Any future coordinator integration must preserve the documented resolution and recheck task-code equality/current-base/exact-head CI.

Read current AGENTS/HANDOFF/STATUS/QA README/F5 criteria and prior immutable F5 FAIL report at dc3c902, plus correction code/tests. No additional AGENTS found. Never read `pnpm-lock.yaml` or `project/support.js`.

## Scope, environment and fresh validation

Linux x86_64, Node 22.22.0 / pnpm 10.28.0. PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`. Dedicated new disposable container `codex-qa-f5-0fef315`, image `pgvector/pgvector:pg16`, dynamically published at **127.0.0.1:32788**, synthetic `qa_f5`. No existing DB/volume used. Existing DB/API test harnesses create/drop their own synthetic databases.

Reviewed complete F5 task paths against the pinned base and correction against the previous reviewed head. API, student app, auth migrations and OneRoster implementation have an **empty diff versus dc3c902**; F5 correction changes teacher replay/UI/tests. Other old-to-new differences include accepted C2cx5/F1d baseline work, which was covered by fresh integration tests rather than mistaken for F5 changes. Prior source conclusions about unchanged auth flow are carried forward; every runtime result below is fresh, not copied from the old report.

No implementation/task/published-report/remote changes, claims, commits or merges. No new/custom adversarial DB security probes, prior blocked shadow-table action, PR13 review action or PR17 code/test. Only existing accepted auth/isolation/baseline suites and harmless in-memory recovery checks. Baseline UI changes came from the pinned base; no separate PR13 validation was attempted.

| Fresh command/check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Exit 0; 263 packages |
| `pnpm build` | Exit 0 across workspace |
| `pnpm lint` | Exit 0 |
| `pnpm format:check` | Exit 0 |
| `pnpm typecheck` | Exit 0 across workspace |
| `node scripts/plan.mjs check` | Exit 0; plan: ok |
| `DATABASE_URL=<dedicated QA DB> IDEAMAP_PERF_VERBOSE=1 pnpm test` | First attempt exit 0 |
| Existing targeted auth P1, verbose | Exit 0; p95 overhead **3.46 ms < 5 ms** |
| Fresh actual-browser mock sign-in | Teacher/student and unenrolled refusal pass; both 400 px screens visually inspected |
| Independent recovery harness | First run exit **1**: 10 sequential/control cases pass; 2 in-flight queued-edit cases fail |

Full-root counts: DB **165/165**, API **65/65**, contracts **217/217**, connectors **111/111**, domain **96/96**, tracker **172/172**, UI **78/78**, teacher **18/18**, student **3/3**, AI **6/6**, worker **1/1**. DB Vitest duration 49.49 s; API 7.71 s. No baseline failure/retry. Root checks used a `set -e` shell, so any failed earlier command would have stopped the run.

Fresh targeted P1 command:

```
DATABASE_URL=<dedicated QA DB> IDEAMAP_PERF_VERBOSE=1 \
pnpm --filter @ideamap/api exec vitest run src/policy.test.ts \
  -t 'adds under 5 ms' --reporter=verbose --silent=false
```

Existing test: 1,000 authenticated warmups, 1,000 health baseline requests, 1,000 authenticated measured requests. Auth p95 **3.57 ms**, baseline **0.11 ms**, difference **3.46 ms**. Test 3,732 ms; Vitest 4.97 s; 1 passed/17 deliberately filtered. Local in-process Fastify-inject overhead, not production network latency. F5 ran first in the agreed heavy window; C4 was released immediately after full/performance completion, before report drafting.

Fresh developer CLI ran against dedicated `qa_f5`, seeded sample roles and started mock IdP/API. Documented teacher/student dev commands served 5173/5174. Chromium followed real local mock-provider redirects: teacher and student /api/me 200 with correct role/org, Secure/HttpOnly/Lax host-only cookies. At 400×800 both screens have exactly Google/Clever/ClassLink buttons, no password, document width 400. Unenrolled actual browser flow displays the exact plain refusal. Browser harness did not intercept fetch. Network-idle waits are not timing evidence.

## Per-criterion verdicts

| Check | Result | Evidence |
|---|---|---|
| F5-F1 must | PASS | Fresh API end-to-end and actual teacher/student browser mock SSO; session cookie and correct /me id/role/org. |
| F5-F2 must | PASS | Unchanged single adapter/config interface inspected; fresh tests sign in all three mock issuers and add a configured provider. Real presets remain unverified as criteria permit. |
| F5-F3 must | PASS | Fresh same-identity repeat, verified-email first link and cross-provider same-email refusal tests; no silent duplicate. |
| F5-F4 must | PASS | Fresh registry enforces policies, enumerates 15 URLs/17 non-HEAD method routes and sweeps all 13 protected method/route combinations. Signed-out 401; wrong role/class/org 403. Public start/provider discovery are required sign-in flow. |
| F5-F5 must | PASS | Fresh unrelated-class config/roster/library refusal and reassigned-teacher success; D11 uploads scoped. |
| F5-F6 must | PASS | Fresh author edit success; using teacher/other-author refusal. |
| F5-F7 must | PASS | Fresh sign-out replay, staff 8-hour/student 2-hour idle, activity, configured limits and absolute expiry tests. |
| F5-F8 should | PASS | Fresh OneRoster sample creates expected users/classes/enrolments once; repeated import creates zero and stays in org. |
| F5-S1 must | PASS | Fresh existing code/S256 PKCE/nonce and bad-state/nonce/audience/expiry/key/issuer tests. No new security probe. |
| F5-S2 must | PASS | Fresh Set-Cookie tests/browser flags; source session storage contains pending edit bodies, never session cookie/token. |
| F5-S3 must | PASS | Fresh existing foreign/missing-origin and bad/missing-CSRF method cases refused; valid PUT accepted. |
| F5-S4 must | PASS | Fresh existing app-role queries see zero org B rows under org A, route requests refuse cross-org ids. No custom DB probe. |
| F5-S5 must | PASS | Fresh synthetic identity-PII minimization test; unchanged allowed-claim and storage source audit carried forward. |
| F5-S6 must | PASS | Fresh existing absolute/protocol-relative/backslash/control redirect tests; valid local return path retained. |
| F5-S7 must | PASS | Fresh 50-failed-callback, per-IP reset and fixed-response/random-id tests. |
| F5-S8 must | PASS | Fresh config/env-example tests; env-only secret reads and empty names inspected. Prior targeted key-header source search carried forward because auth source unchanged; not an exhaustive forensic scan. |
| F5-S9 must | PASS | Fresh audit actor/action/target/time tests for sign-in, role change and sign-out. |
| F5-P1 must | PASS | Fresh root and verbose benchmark, p95 overhead 3.46 ms. |
| F5-P2 should | PASS | Fresh existing mock sign-in→/me under 1,000 ms assertion. |
| F5-U1 must | PASS | Fresh real-browser 400 px teacher/student views and screenshots, readable/no overflow/no password. |
| F5-U2 must | PASS | Fresh API and browser: “Your school account isn't linked to a class yet. Ask your teacher.” |
| F5-U3 must | **FAIL** | Sequential errors fixed; concurrent new/latest queued edit lost on old replay acknowledgement (canonical F5-E1 below). |
| F5-U4 should | PASS | Fresh documented mock/API CLI and seeded roles work; separate app commands as README states. |

## Errors

### Canonical F5-E1 remains open · Medium/P2 · In-flight replay overwrites newer queued edits

**Resolved portion:** independent cases cover 401, 500 and network failure at the first, middle and final request across three URLs. All nine preserve failed/unattempted writes appropriately and recover every edit exactly once on successful retry. New `{saved,pending}` counts are correct; 401 return path preserved. Pre-replay latest-value replacement and other-account exclusion pass (tenth control). Existing teacher tests now also cover sequential recovery; new Shell test confirms pending/retry message markup.

**Remaining loss:** `apps/teacher/src/auth/session.ts:118` snapshots queue into local `kept`. `save` at lines 119–122 blindly replaces/removes the storage key from that snapshot. After awaiting a request at line 128, lines 136–137 remove the old acknowledged write and save the stale remainder without reading or merging storage changes that occurred during the await.

Independent reproduction:

```
node --max-old-space-size=256 \
  /home/kevin/codex-qa-2026-10-22/evidence/f5-replay-probe-0fef315.mjs
```

The harness transpiles exact production session.ts with the installed TypeScript, changing only the contracts import to the reviewed worktree's build. Everything else is synthetic in-memory storage/responses. It does not touch a database, host application data or network.

1. Queue PUT A with body `{edit:70}` and start replay; hold its response unresolved.
2. While replay is awaiting acknowledgement, use exported `stashWrite` to queue B `{edit:75}`. Variant: replace A with its newer autosave `{edit:75}`.
3. Release the older A request with 200.
4. Both variants return **`{saved:1,pending:0}`** and storage becomes **`[]`**. B was never sent; newer A was never sent. Neither is retained for retry.

Expected: acknowledge only the exact old queue item/version sent; retain later edits/new URLs. Actual: both are erased. Parent independently reran the exact harness and obtained the same two failures (`f5-parent-replay-0fef315.txt`). This is the existing no-edit-loss recovery finding, now narrowed to in-flight queue updates, not a new fix ID. Full Teacher Settings forms await T1; the public F5 queue helper and its latest-autosave contract are already implemented and tested. This is not a claim that a currently shipped settings form was exercised end to end.

Suggested correction: use a per-write revision/id and, after acknowledgement, remove only the acknowledged revision from the **latest** stored queue; preserve later same-URL replacements and newly queued URLs. Serialize overlapping replay operations or otherwise make acknowledgements safe against shared-store changes. Keep user scoping and existing failed-write retention. Regress both variants above, including a later retry that actually sends retained payloads; test simultaneous replay/retry calls without duplicate persistence or stale queue restoration.

## Suggestions

1. The same in-memory harness calls replay twice before the first response resolves and observes duplicate PUTs, each reporting saved:1. Current Try again is not disabled while pending; StrictMode is enabled in the development app. Add replay serialization/in-flight UI state while fixing E1. Duplicate-call observation is supporting concurrency evidence, **not** a separate security or must-fix finding.
2. Earlier source limitation remains: used OIDC states and callback rate limiting are per process. Current architecture now documents this deployment question; no distributed replay/rate-limit experiment was performed or claimed. Real Clever/ClassLink tenant-claim presets remain explicitly unverified pending school configuration.

## Artifacts, cleanup and limitations

All new artifacts under `/home/kevin/codex-qa-2026-10-22/evidence/`; no old immutable report edited:

- `f5-integration-first-0fef315.txt`: original documentation merge conflict, preserved.
- `f5-build-0fef315.txt`, `f5-baseline-0fef315.txt`, `f5-performance-0fef315.txt`: fresh build/check/test/timing output.
- `f5-replay-probe-0fef315.mjs`, `f5-replay-first-0fef315.txt`: first independent harness run (exit 1), sequential passes and concurrent losses retained. No retry to hide failure.
- `f5-browser-0fef315.mjs` / `.txt`, plus `f5-teacher-400-0fef315.png`, `f5-student-400-0fef315.png`, `f5-unenrolled-400-0fef315.png`.

Dedicated container stopped and retained; review-owned CLI/mock/Vite servers stopped by exact validated PIDs. No unstaged edits; integrated index remains `a27fa5c7d5004009e6ec0ce36013de3571df07d2`. No arbitrary scope expansion, new DB adversarial probe or blocked-review reroute. Real school providers, production proxy/deployment and future complete Teacher Settings UI remain outside verified scope. Green baseline/CI does not close the reproduced E1 failure. Stop after this report.

## Parent review and routing

Parent read this report, inspected the production replay code and harness, and independently reproduced both in-flight data-loss variants (first exit 1 retained). Suggested correction and regression coverage above address the remaining error. Keep canonical **F5-E1** open on PR #15; do not duplicate the earlier sequential-loss finding or mark it fully fixed. Priority: Medium/P2, correct before F5 acceptance. No newly confirmed cross-org disclosure was found in this scoped rerun. This report is batched with completed C4/C6 QA; no emergency security push was warranted by the evidence. QA made no implementation changes and did not merge a task.
