Reviews: F4cx3

# Independent review: PR #14, F4cx3

Reviewed PR head: **3641f00758e294a03aadf828a016325ebe48b099**. Pinned integration base: **56b88f334810223ffc88057c100cff1385b176dc**. Tested scratch merged tree: **6afd90c849522036bb6b5922c4b4982aaf9dda75**. Date2026-10-22 America/Los_Angeles. Independent Sol-medium QA; reviewer did not implement the fix. Coordinator read the complete report and evidence excerpts and independently inspected the diff and tested-tree identity.

**Publication priority: prompt, on completion of the urgent fix review.** The result can unblock coordinator synchronization and merge preparation, but does not waive the gates below.

**Premerge executable criteria: PASS. Overall task: incomplete, with F4cx3-F5 PENDING the coordinator's actual merge and post-merge CI.** No newly discovered code error. Root typecheck and full DB-backed root tests pass on the scratch combination. The canonical F4-E3 fixture/typecheck/roundtrip failure is corrected in the tested code. This does not itself authorize merging or establish green CI on an uncreated merge commit.

Routing: this report revalidates the existing F4-E3 correction under task F4cx3. Do not create duplicate tasks for F4-E3 or for the pending post-merge gate. Published Codex files were not changed.

## Scope and evidence

Read the coordinator takeover README and PR audit, current AGENTS, QA README, F4cx3 criteria, and the four-file PR diff. The QA README requires testing the PR as it would land, so a separate detached scratch worktree merged the **pinned base into the PR head**, using `git merge --no-commit --no-ff 56b88f334810223ffc88057c100cff1385b176dc`. The merge was clean, with no conflict resolution or implementation edits. `git write-tree` identifies the exact tested tree above; **there is no scratch merge commit**.

Worktrees:

- PR head: `/home/kevin/codex-qa-2026-10-22/f4cx3-head-3641f00`.
- Before/baseline: `/home/kevin/codex-qa-2026-10-22/f4cx3-before-56b88f3`.
- Combined: `/home/kevin/codex-qa-2026-10-22/f4cx3-combined-56b88f3`.

Node22.22.0, pnpm10.28.0, Linux x86_64 host. PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`. Frozen installs succeeded independently in all three worktrees (258 packages, lockfile unchanged). DB tests used only the retained synthetic QA container **codex-qa-f4-20261022-derive**. Its mapping was inspected after restart: **127.0.0.1:32770→5432**. Existing test harnesses created and dropped their own disposable databases. The default performance workload remained **1,000,000 events and10,000 chunks**; no size overrides or new security probes were used. Container was stopped after testing. No unrelated service or database was touched.

PR-only change: **four files,123 insertions,2 deletions**, exclusively:

```text
packages/db/src/columns.test.ts
packages/db/src/integrity.test.ts
packages/db/src/test/derived.test.ts
packages/db/src/test/derived.ts
```

The fixture is manually complete because DB does not depend on domain. It is explicitly documented as the single positive `VersionDerived` fixture, containing ranked_links, full layout and quizzes. Both formerly failing sites call `validDerived()`. The added fixture tests parse through `VersionDerivedSchema` unchanged and verify that calls return fresh copies. The DB typed roundtrip now additionally compares the returned derived body with the original fixture.

The scratch merged tree differs from the pinned base only in those four fix files; it differs from the PR head only in the base's documentation/plan changes. Production `packages/contracts` and `packages/db/src/schema.ts` are unchanged. No added suppression, `as any`, skipped test or dependency was found. DB production build excludes `src/test` and `*.test.ts`; built dist contains no derived test fixture. Intentional invalid immutability-update bodies remain in the separate negative integrity cases, and the fixture module explicitly distinguishes them.

## Criterion results

| Check | Weight | Result | Evidence |
|---|---|---|---|
| F4cx3-F1 root typecheck | must | PASS | `pnpm typecheck` exit0 on both exact PR head and scratch merged tree |
| F4cx3-F2 DB-backed root tests | must | PASS | Full root `DATABASE_URL=... pnpm test` on scratch merged tree exit0; DB144/144, including typed version roundtrip and valid draft replacement/status transitions |
| F4cx3-F3 shared valid fixture | must | PASS | Both sites import/use `validDerived`; complete typed fields; `derived.test.ts`2/2 passes, including VersionDerivedSchema parse |
| F4cx3-F4 strict contract preserved | must | PASS | No production contract/schema diff; no added type suppressions, `as any` or skips |
| F4cx3-F5 post-merge idea-map CI | must | **PENDING** | Actual coordinator merge has not happened. Exact branch CI and local scratch success are not substitute evidence |
| F4cx3-S1 tests only | must | PASS | Four test/helper files only; helper not shipped in built DB dist |
| F4cx3-P1 DB timing within10% | must | PASS measured | Before39.68s wall; after42.02s wall, **+5.90%**; same host/container/default workload, one sequential pair, variance caveat below |
| F4cx3-U1 single documented positive fixture | must | PASS | `src/test/derived.ts:3-15` documents shared positive/schema-valid fixture, hand-built dependency rationale and separate invalid bodies |

Additional scratch checks: `pnpm lint`, `pnpm format:check`, `pnpm build`, `node scripts/plan.mjs check` all exit0 (`plan: ok`). The root DB-backed suite passes all workspaces: DB144, contracts208, domain74, UI73, tracker56, teacher2, API2, and ai/connectors/student/worker1 each. DB portion of the full root run took43.02s; this separate whole-repo run is **not** substituted for the comparable DB-only timing measurement. F1c remains unmerged at the tested base, so tracker56 tests do not imply its runtime guard exists here.

Reproduction commands (use the inspected current container mapping if restarted):

```sh
export PATH=/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin:$PATH
cd /home/kevin/codex-qa-2026-10-22/f4cx3-combined-56b88f3
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32770/postgres pnpm test
node scripts/plan.mjs check
```

The shown password belongs only to the retained disposable QA container. The documented compose startup was substituted with that explicitly authorized isolated container, preserving the existing baseline suite without touching the developer database.

### Before/after evidence for canonical F4-E3 and performance

Timed command, run sequentially first in baseline worktree then in combined worktree:

```sh
/usr/bin/time -f 'DB elapsed=%e exit=%x' \
  env DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32770/postgres \
  pnpm --filter @ideamap/db test
```

| Snapshot | DB result | Vitest duration | Command wall |
|---|---|---|---|
| Base56b88f3 |141 pass,1 expected failure (6 files) |38.87s |39.68s,exit1 |
| Combined tree6afd90c8 |144 pass (7 files) |41.23s |42.02s,exit0 |

The baseline reproduces the **existing** canonical F4-E3 roundtrip failure: missing `derived.ranked_links`, `derived.layout.rank`, `derived.layout.positions`, `derived.quizzes`. The fix replaces the partial objects at both original sites and passes the same roundtrip plus the new fixture tests. This is evidence that the error is corrected in the tested combination; it does **not** mean the live unmerged base has already been repaired.

Measured wall increase: `(42.02 /39.68 -1) ×100 =5.90%`, below the10% limit. Vitest-only durations likewise differ by about6.07%. This is one sequential pair on a shared host, with normal OS/database cache and workload variance; it is not a statistically precise performance claim. Baseline intentionally retains its known failing assertion while the remaining DB workload runs; after adds two small fixture tests. No performance workload was reduced to obtain the pass.

### Exact-head CI and integration gate

Read-only REST with `env -u GH_TOKEN -u GITHUB_TOKEN gh api` verified PR head3641f007 and exact-head checks:

- [build job120166518897](https://github.com/tenkevin/mind-your-tutor/actions/runs/39877484643/job/120166518897): success,00:20:07–00:22:30UTC2026-10-23.
- [plan check120166517645](https://github.com/tenkevin/mind-your-tutor/actions/runs/39877484320/job/120166517645): success,00:20:06–00:20:12UTC.

The PR head did **not** contain pinned base56b88f3: `git rev-list --left-right --count base...head` reports **9 base-only /1 head-only commits**, and the ancestor check fails. Passing branch CI alone does not satisfy the integration gate. Coordinator must synchronize the PR with current base, verify task-path changes/QA applicability, and obtain green checks on that exact synchronized head before merging; afterward F4cx3-F5 requires successful `ci` and `plan` on the actual merge commit.

Precision correction: PR REST `.base.sha` initially reported **56bd3be**, an **ancestor** of56b88f3, not a newly advanced branch tip. Direct REST `git/ref/heads/idea-map` confirmed56b88f3 at test start. During testing the coordinator reported a later base **639bd2684e5b996a2af6e095c9a3e35af205c924**, adding only `docs/qa/codex/Codex-C1-S2-reconciliation-9ce1018.md`. The tests remain pinned to the exact base/tree stated here; this later documentation-only publication is not represented as retested, and final synchronization/CI remains the coordinator's gate.

### Built-in Codex review

At the user's request, `codex review --base 56b88f334810223ffc88057c100cff1385b176dc` also reviewed the PR in a read-only sandbox with Sol-medium. It found no actionable diff defects. CLI session: `01a16638-2ea1-72b3-9ef5-4c870e2788fd`; resolved diff merge-base: `c932f2d3aac46cea04d21e1733f09aeeaa0e4fda`. Its own attempted tests could not run because pnpm was absent from that subprocess PATH; actual executable results above come from the independent QA toolchain, not the source-only CLI review. Retained evidence: `/home/kevin/codex-qa-2026-10-22/evidence/f4cx3-cli-review-3641f00.md` and `f4cx3-validation-3641f00.txt` in the same directory (the latter contains selected output excerpts, not complete logs).

## Errors

No new error found in the F4cx3 four-file fix. **Canonical F4-E3 is corrected in the exact PR head/scratch combined code tested here**, without weakening the contract or bypassing tests. Reuse its existing F4cx3 routing; no duplicate finding/task is proposed.

**F4cx3-F5 is PENDING, not an error/new task and not a PASS.** Overall task completion must wait for the coordinator's merge and successful post-merge CI. The outstanding synchronization/exact-head-CI workflow is likewise a merge gate, not a code defect invented by this review.

## Suggestions

- Carry this QA forward only after comparing any synchronized head's task paths and satisfying the documented current-base/exact-head CI gate. Re-run affected checks if implementation changes; documentation-only synchronization does not itself imply a new fixture defect.
- Interpret the single-pair timing result within its variance limits. It meets the written10% bar in this measurement; repeated benchmarking is unnecessary unless later CI or code changes reveal a regression.

Cleanup: retained QA DB container stopped; no preview servers were started in this review. PR-head and baseline worktrees are tracked-clean. Scratch worktree intentionally retains the staged, uncommitted pinned-base merge for review, with **no unstaged changes or conflicts** and unchanged tree6afd90c849522036bb6b5922c4b4982aaf9dda75. The independent tester made no production fixes, temporary adversarial probes, task changes, published-report changes, remote changes or GitHub writes. The coordinator publishes only this new report from an isolated publication worktree.
