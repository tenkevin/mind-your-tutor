# QA report: F1e · PR #45 · commit bccb5be
Verdict: FAIL
Tester: qa-f1e · Date: 2026-10-30

Reviewed head `bccb5be`. Tested as it would land: scratch worktree, `origin/idea-map` at `c91c27f` merged into `bccb5be` (**no conflicts**; local commit `f080e64`, not pushed). Environment: Linux, 4 vCPU, Node 22.22.0, pnpm 10.28.0, PostgreSQL 16.15 with pgvector **0.6.0** (CI's image has a newer pgvector). "Pinned" below means `taskset -c 0,1` on the test process and on every Postgres process.

The serial-run change is sound and the full suite passes 10 of 10 under CPU limits. The FAIL is for three reasons. (1) The imports `importB` race that this task was meant to fix is **not** fixed: T2-F2 and T2-F5 still flake under load at about the same rate as before the PR. (2) F1e-F6 is not met. (3) The F1e-F1 inventory misses a timing test.

| Check | Weight | Result | Evidence |
|---|---|---|---|
| F1e-F1 | must | FAIL | The inventory misses `apps/teacher/src/curriculum/CurriculumData.test.tsx:261`, which asserts `performance.now() - start < 1000` as a single shot. It is unchanged by the PR and absent from the table. `packages/domain/src/lock.test.ts:87` (best-of loop) is not listed either. `packages/connectors/src/storage.test.ts` "refuses a zip bomb whatever sizes its headers claim" has no elapsed assertion, so it cannot be inventoried by budget. It is one of the tests that failed in CI. See Found 2. |
| F1e-F2 | must | PASS | All 36 removed `toBeLessThan`/`toBeGreaterThan` budget literals reappear with the same numbers and comparisons (e.g. 2000, 500, 300, 5000, 5/30 ms overhead, 10 ms, 5,000 rows/s). No `skip`, `retry`, `flaky`, `.only` or `.skipIf` appears among added lines (grep of the PR diff's added lines is empty). Method note, not a budget change: several tests now judge the best of N runs, and the p95 overhead tests judge the minimum over 3 paired rounds. |
| F1e-F3 | must | PASS | `pnpm -r --workspace-concurrency=1 test` plus `fileParallelism: false` in 6 package configs, so no suite shares a CPU with a timing test. Helper `@ideamap/testing` gives best-of-N for latency and median-of-N for median budgets. A warm-up exists in the tests that already had one. |
| F1e-F4 | must | PASS | 10 of 10 pinned full CI-order runs passed, each with 1,685 tests and no failure lines. `pnpm test` took 274, 274, 269, 275, 266, 264, 277, 272, 265 and 261 s; whole runs took 379–395 s. An unrestricted run also passed (test 275 s, total 360 s). The CI order was `pnpm install --frozen-lockfile`, lint, format:check, typecheck, test, build, plan check. Per-test timings for the inventoried tests were not captured by `pnpm test`. The PR's own timing figures were not re-checked. This check is separate from the load flakes in Found 1. |
| F1e-F5 | must | PASS (local) | Forced the 500-event budget to 0.001 and got `AssertionError: validates 500 mixed events: best 2.31 ms is over the 0.00 ms budget (samples: 4.13 ms, 2.91 ms, 3.08 ms, 4.53 ms, 2.31 ms)`. It names the test, the measured value and the budget. The CI annotation was not exercised (that needs a CI run). |
| F1e-F6 | must | FAIL | A doubled operation is not caught. On "an XLSX with 1,000,000 rows" (2000 ms budget) the single operation gave samples 846.15, 829.56 and 360.81 ms, best 360.81 ms. With the operation run twice per sample the best was 659.18 ms and the test **passed** (unmodified and doubled both pass). On "validates 500 mixed events" (20 ms budget) the best is about 2.3 ms, so a 2× slowdown (about 4.6 ms) cannot fail either. It only failed when I made it 40× slower (best 36.25 ms). Best-of-N against a budget with 5–9× headroom hides a 2× slowdown. The builder did not run F6 ("helper self-tests instead"). |
| F1e-F7 | must | PARTIAL | Local, on the merged tree: lint, format:check, typecheck, build and `plan check` exit 0. `pnpm test` with `DATABASE_URL` passes. `function_binding.test.ts` run explicitly passes (4 of 4). The "CI green twice on the exact head" half was not run by QA (I can't trigger CI). The builder reports it. Not verified. |

## Found during testing

1. **The imports newest-job race is not fixed by the PR (suggested weight: must).** The `importB` fix waits for the uploaded job's id. T2-F2 and T2-F5 still fail under load, with the same failures as in CI.
   - Reproduce. In `apps/api`, with Postgres up and 4 busy-loop hogs sharing the pinned CPUs (`for h in 1 2 3 4; do taskset -c 0,1 sh -c 'while :; do :; done' & done`), run `DATABASE_URL=… taskset -c 0,1 pnpm exec vitest run src/imports.test.ts` repeatedly.
   - With the PR head merged: 4 failing runs out of 28 (T2-F5 ×3, T2-F2 ×1). Plain `origin/idea-map` (`c91c27f`): 3 of 20 (T2-F2 ×1, T2-F5 ×2). The PR does not reduce the rate.
   - T2-F2 fails with `AssertionError: expected null to match object { number: 1, status: 'draft', … }`, which is the CI symptom "latest import read as null".
   - T2-F5 fails with `expected { …(8) } to match object { number: 3, can_publish: true }`, receiving `number: 2, can_publish: false`.
   - Cause (code at `apps/worker/src/imports.ts:281`, `getCurriculumData`): it reads the newest job id, then the newest version, then the job view (`loadView`) as separate statements. If the worker commits in between, the response pairs a `succeeded` job with a stale or null version.
   - The helper that still races is `importB` in `apps/api/src/imports.test.ts:~217`. Matching `data.job.id` does not close the gap. A test-only fix: before returning, also require the version to be the job's own (for example, `data.job.version` set and `data.version?.id` equal to it) when the job succeeded. The cleaner product fix is a single snapshot read, which is application code and the coordinator's call.
2. **The zip-bomb test from CI is not shown to be fixed (should).** `storage.test.ts:96` builds and deflates two 120 MB buffers and asserts no time. It ran 1.7–2.4 s pinned and unloaded. Under 4 hogs on 2 CPUs it passed 8 of 8 at 5.7–7.0 s. I could not reproduce the CI failure, and the PR neither touches the test nor sets a `testTimeout` for connectors. The serial run is the only mitigation.
3. **Best-of-N weakens sensitivity to slowdowns (should).** Even for the budget the PR names (1,000,000-row XLSX), a code change that doubles the cost would not fail. If the budgets are meant to catch regressions, they need warm-run medians or tighter headroom, which the coordinator would have to approve as a criteria change.
4. **Test-run cost (info).** `pnpm test` is about 4.5 min on 2 pinned CPUs and the whole CI order about 6.5 min, as the PR says.

Limits of this review: pgvector 0.6.0 locally versus CI's newer image. Postgres stopped on its own after the loop finished, and I restarted it before the load loops. The 10 pinned runs completed before that, with no failures logged. No code was changed or pushed, and `Codex-*` files were not touched.


---
_Generated by [Claude Code](https://claude.ai/code)_

<!-- next -->

# QA report: F1e · PR #45 · commit cf60a397dd192c8cab6b4615fa7b1ec8d6b43528
Verdict: PASS
Tester: qa-f1e-2 · Date: 2026-10-30

Reviewed head `cf60a39`. Merge base with `origin/idea-map` (`82cf0e3`): `006c2f1`. Tested as it would land: scratch branch, `origin/idea-map` (`82cf0e3`) with the PR head merged in (**no conflicts**; local merge `e019a39`, not pushed). Environment: Linux, 4 vCPU, Node 22, pnpm 10.28.0, PostgreSQL 16.15 with pgvector installed from apt. "Pinned" means `taskset -c 0,1` on the test process and on the Postgres processes. Load means 4 busy-loop hogs on `taskset -c 0,1`, killed afterwards by PID.

| Check | Weight | Result | Evidence |
|---|---|---|---|
| F1e-F1 | must | PASS | `CurriculumData.test.tsx` T2-P1 (1000 ms) and `lock.test.ts` S10b-P1 (5 ms) are now inventoried and on the helper (`expectBestUnder`). The zip-bomb test has no elapsed assertion, so it is handled in F8. My re-search of the PR diff found no uncovered `performance.now()` assertion. |
| F1e-F2 | must | PASS | Every `toBeLessThan`/`toBeGreaterThan` literal removed in the diff reappears with the same number and comparison (for example 1000, 2000, 500, 300, 200, 20, 10, 5, 5000, `Math.max(2*one, 5*one+2000)`). The grep of added lines for skip, skipIf, retry, flaky, only and todo is empty. The new zip-bomb 60 s timeout is not a budget. |
| F1e-F3 | must | PASS | Packages run serially (`pnpm -r --workspace-concurrency=1` and `fileParallelism: false`). `@ideamap/testing` gives best-of-N for latency budgets and the median for median budgets. |
| F1e-F4 | must | PASS | 10 of 10 pinned full CI-order runs (install --frozen-lockfile, lint, format:check, typecheck, test, build) passed on the merged tree, each with 1,693 tests. Total seconds per run: 348, 340, 352, 353, 347, 348, 351, 358, 352, 353. Raw per-run logs are in `/tmp/f4_<n>_*.log`. |
| F1e-F5 | must | PASS | In the F6 injections below, failures read like `mapStates on 2,000 ideas (S10b-P1): best 6.57 ms is over the 5.00 ms budget (samples: 8.06 ms, 9.43 ms, 7.14 ms, 7.50 ms, 6.57 ms)`. They name the test, the measured time, the budget and the samples. The CI annotation was not exercised. |
| F1e-F6 | must | PASS | I put a busy-wait in each of the 6 helper-based tests across all 5 packages that use the helper. Each delay was just over its budget, and each test failed with the message above. domain lock S10b-P1: best 6.57 ms vs 5 ms. contracts F3-P2: best 1020.85 ms vs 1000 ms. connectors C6 export: best 301.30 ms vs 300 ms. teacher T2-P1: best 1040.43 ms vs 1000 ms. api auth F5-P2: best 1033.18 ms vs 1000 ms. api policy F5-P1: best round 7.80 ms vs 5 ms. The F5-P1 delay was added to the measured value (+6 ms on authed requests). The scratch edits were reverted (`git checkout`). |
| F1e-F7 | must | PASS | On the merged tree: lint, format:check, typecheck, `pnpm test` with DATABASE_URL (1,693 tests), `function_binding.test.ts` explicitly (4 of 4), build and `plan check` all exit 0. CI ran twice on exact head `cf60a39`: workflow runs 41096300083 (ci) and 41096299944 (plan) each have attempts 1 and 2, all `success`. |
| F1e-F8 | must | PASS | Under load, 20 of 20 runs passed for each of: connectors `storage.test.ts` "refuses a zip bomb whatever sizes its headers claim" (3.2–4.8 s per run, now with an explicit 60 s timeout and no time assertion); domain `lock.test.ts`; teacher `CurriculumData.test.tsx`. The last two are on the best-of-N helper with budgets unchanged. |
| F1e-F9 | must | PASS | `getCurriculumData` now runs one `REPEATABLE READ` transaction (`withOrg(..., {isolation: 'repeatable read'})`), reading the job, its view and the newest version in one snapshot. `OrgScope` and `withOrg` take an optional `options.isolation`. The only caller that passes it is `getCurriculumData` (`apps/worker/src/imports.ts:346`), and `orgScope` in `index.ts` just forwards the options, so other callers are unchanged. The interleaving worker test `F1e-F9` (8 cases) is in the suite and passes. `apps/api` `imports.test.ts` T2-F2, F5 and F7: 20 of 20 passed under load (3 tests each). QA run 1 saw about 15% failures on these. |

## Found during testing

None blocking.

- **Note (info):** best-of-N against budgets with large headroom would not catch a 2x slowdown that still fits the budget. The coordinator's 2026-10-30 clarification limits F6 to operations that exceed the budget, and that holds. If regression sensitivity is wanted, tighter budgets are a separate criteria decision.
- **Limits:** the CI annotation display was not exercised. pgvector here is the apt version, which may differ from CI's image. No code was changed or pushed, and `Codex-*` files were not touched.


---
_Generated by [Claude Code](https://claude.ai/code)_

<!-- next -->

## Coordinator completion record · F1e · 2026-10-30

- **QA:** run 1 FAIL at `bccb5be` (comment 6527569267). Fix head `531ad93` was returned before QA for F1e-F9 (ordering instead of one snapshot; change request 6528480435). Fix session `session_01KbXtJ4MG19qRoe65pjxdm7` added a REPEATABLE READ option to `withOrg`, used only by `getCurriculumData` (`2f57c8d`). Run 2 **PASS** at `cf60a39` (`session_01KbXtJ72bgr1epcC1CaSaR2`, comment 6532048835), with every must check passing, including 10/10 pinned full runs and F8/F9 20/20 under load.
- **Sync:** GitHub update-branch to `ccd4c16`. Every file changed between `cf60a39` and `ccd4c16` equals `origin/idea-map` (docs, `scripts/qa-*.mjs`, `.gitattributes`), so no F1e code changed and the PASS carries (README, "Evidence and merge completion").
- **Gate:** `ccd4c16` 0 behind `idea-map`, CI `check` and `build` green; F1e was the fix for red `idea-map` (user-approved to merge on Claude QA).
- **Merge:** squash `2d871d2`. **Merge CI:** `check` and `build` green on `2d871d2`; `idea-map` is green again (red since `9f0f771`).
- **Deferred:** the run 2 note (best-of-N against generous budgets won't catch a 2x slowdown that still fits) is a criteria question for tighter budgets, not a defect. Other timing overruns seen today outside F1e's list (domain C2-P2, C3-P1/P2, api F5-P1) are listed in `STATUS.md` as known noise; a fix task opens if they turn CI red. Codex reviews F1e after merge (Codex queue B).
