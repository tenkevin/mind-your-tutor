Reviews: C2cx5

# Independent QA: C2cx5 / PR18

Reviewer Codex, independent of implementation. Candidate `7dd6511c217e9e45a51afa8cc02428e4957de1fb`; pinned current base `a514122f6566355d36a15c025a6ad721794124bf`; tested HEAD/index tree `d79960034e7cae471175d0c6cbc6fda0670d4ae7`. Detached worktree `/home/kevin/codex-qa-2026-10-22/c2cx5-review-7dd6511`. Base is ancestor; explicit `git merge --no-commit --no-ff a514122...` reports Already up to date. No scratch task-code changes. Parent conveyed explicit user resumption authorizing PR15/17/18 QA, superseding historical stopped docs for this assignment only.

Verdict: **PASS, all must criteria**, on the exact pinned candidate/tree after an unchanged full-root retry passed. First full-root derive timing failure remains preserved below. No confirmed implementation defect found. This is independent QA, not merge approval or a certification of PR15/17.

Read current AGENTS/HANDOFF/QA STATUS/README, architecture D1–D13 and pipeline, C2cx5 criteria, original canonical C2-E5 and C8 confirmation, current C9 completion/report. Read candidate diff: only five files, contracts version schema/test, DB schema/columns test and domain tests. No DB migration changes. Never read pnpm-lock.yaml or project/support.js. No PR13/blocked PR17 shadow tests, novel DB probes or implementation fixes.

## Criteria

| Criterion | Result | Evidence |
|---|---|---|
|F1 both issue kinds and lossless roundtrip|PASS|Independent actual JSON importer warning plus checkPack sample issues: all original fields deep-equal after tagging, version JSON roundtrip deep-equal.1import+3data-check issues.|
|F2 publishing gates|PASS|Original sample's prerequisite data error prevents publication; corrected prerequisite plus one null objective/two null questions yields3draftable warnings and allows publication. Real missing-title import blocker added to that valid pack prevents publication.|
|F3 one shared data-check type|PASS|contracts/src/data-checks.ts owns DataCheckIssueSchema/type; domain/checks.ts imports contract type and returns it; no duplicate shape.|
|F4 consumers/typecheck/DB|PASS|Root typecheck and full root retry pass, DB161/161. Independent ordinary DB columns6/6 separately pass including mixed tagged import/data-check jsonb roundtrip. First root stopped on derive timing before complete DB result.|
|F5 full baseline and CI|PASS after unchanged retry|Lint/format/typecheck/build/plan exit0; exact-head CI build/plan green. First root exit1 on existing derive time1442.69ms>1000 retained. Quiet-window full root retry exits0 in50.54sec, all suites pass.|
|S1 bounded10k affected issues|PASS|Retained C8 broken-root10kchain produces2grouped issues preserving9999downstream IDs+root; tagged issue field79524bytes, version using sample pack94911bytes. Existing contracts overflow test passes.|
|P1 version validation<50ms|PASS|Independent version with C8 grouped9999downstream issue: first23.539807ms;20following samples1.98–10.86ms, median3.694532ms; all21below50, assertions retained.|
|U1 distinguishable issues/location|PASS|Discriminated origin import/data_check; normalized level from import severity; import tab/row/column/value/fallback/code/source/suggestion retained; data-check kind/items/fix.tab/column(s)/draftable retained. Checker fix shape does not supply exact row numbers; IDs/unit numbers identify items.|

## Independent behavior and C9 conflict resolution

External `c2cx5-probes-7dd6511.mjs` uses built public exports. It adds an unknown persona prompt variable to the real fixture, obtains actual import issues and data checks, and compares every original field after normalization. Normalized import level is derived from severity, so a contradictory supplied level cannot hide a blocker (existing contracts regression also verifies this). C9 objective/question warnings preserve draftable:true during storage; publication is allowed after removing the sample's unrelated intentional unknown prerequisite. The unmodified sample remains blocked. A missing required title creates a genuine importer blocks_import issue and prevents publication when stored alongside warnings. No hypothetical publish endpoint is claimed; these are contract gates for future C4.

Typed storage uses VersionIssue[] at packages/db/src/schema.ts:85; legacy raw PackIssue rows normalize to origin import on read. Stored contract at packages/contracts/src/curriculum-version.ts:44–85 retains both original shapes and limits UTF8serialized issue bytes to strictly below1000000. Publish refinement at116–125 rejects import blockers and any error-level data check. It does not incorrectly treat C9 warning severity as an error. Shared DataCheckIssue schema remains unchanged, so C9 draftable fields survive the merge resolution.

Budget/performance construction is the retained C8 direct checker10000-idea broken-root chain, consistent with repository regression; it produces grouped issues stored on a **valid sample pack version**. It does not claim a10000idea pack satisfies current PackSchema's5000idea cap, nor that an arbitrarily large full curriculum body fits1MB. The acceptance budget specifically concerns the issues jsonb field; independently recorded sample-version total is also below1MB. Measurements include entire CurriculumVersionSchema.parse and issue-byte serialization, exclude checkPack/input construction. Independent output/raw timing samples retained in `c2cx5-probes-output-7dd6511.txt`; script itself asserts each<50ms. Concurrent sibling QA and root workload may affect timings; no relaxed threshold or workload reduction.

## Commands and first failure

Runtime Node22.22.0/pnpm10.28.0, PATH `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin:$PATH`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm format:check
pnpm typecheck
node scripts/plan.mjs check
node /home/kevin/codex-qa-2026-10-22/evidence/c2cx5-probes-7dd6511.mjs
```

All above exit0. Build output validates full workspace. Lint no findings, all files formatted, plan:ok. Frozen install258packages; no lockfile changes.

Dedicated synthetic DB created with `docker run -d --name codex-qa-c2cx5-7dd6511 -e POSTGRES_PASSWORD=qa_disposable -p 127.0.0.1::5432 pgvector/pgvector:pg16`; inspected localhost32783. `docker exec codex-qa-c2cx5-7dd6511 pg_isready -U postgres` ready before tests. No other container/database touched.

```sh
/usr/bin/time -f 'C2CX5_ROOT elapsed=%e exit=%x' env DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32783/postgres pnpm test --disableConsoleIntercept
```

First run elapsed21.16sec exit1: `packages/domain/src/derive/derive.test.ts:513`, derives2000ideas6000links timing **1442.690402ms**, required<1000. Domain95pass/1fail. Contracts217,tracker159,UI73,AI6,API2,teacher2,student1,worker1 passed. pnpm stops on first failing package; no completed DB/connectors result was captured, so no claim those finished. Full first stdout preserved `c2cx5-root-first-7dd6511.txt`. This changed no derive implementation; concurrent other QA/F5 workloads were authorized and timing contention is plausible, not established causation. Parent notified immediately; retry waits until heavy sibling work clears.

Separate ordinary existing roundtrip run:

```sh
env DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32783/postgres pnpm --filter @ideamap/db exec vitest run src/columns.test.ts
```

Exit0,6/6,1file,1.37sec; mixed issue jsonb roundtrip assertion passes.

Read-only REST independently confirms build [39893177549](https://github.com/tenkevin/mind-your-tutor/actions/runs/39893177549) and plan [39893177488](https://github.com/tenkevin/mind-your-tutor/actions/runs/39893177488) success on exact candidate7dd6511. Current-base expected ancestor check succeeded; live future-base synchronization remains coordinator responsibility.

## Errors

No confirmed implementation error. The initial existing derive timing failure does not reproduce after the sibling finishes heavy checks; candidate/data/assertions unchanged. This supports contention/warmth as an explanation, without claiming the host was perfectly isolated. No implementation correction is indicated by this review.

## Suggestions

Checker issues identify affected IDs and fix columns but omit precise row fields; a future UI may resolve those IDs to imported rows if desired. This PR retains every field the checker currently emits and import rows retain exact row numbers. No new task is proposed by this QA.

No remote writes/comments/claims/merges/published Codex edits. Only external QA artifacts added via apply_patch; application source untouched.

## Completed unchanged retry and cleanup

Sibling F5 reviewer explicitly released its heavy/timing window before retry; it had no more root/build workload planned. Repeated the exact full-root command above, changing only `/usr/bin/time` output label to C2CX5_ROOT_RETRY. No source changes, overrides, reduced workloads or omitted tests. **Exit0,50.54sec**, root all green: DB161/161(8files46.62sec),domain96/96,contracts217/217,connectors104/104,tracker159/159,AI6,UI73,API2,teacher2,student1,worker1. Existing DB ingestion **16081rows/sec** above5000. Existing million-event/10000chunk workload retained. Existing nonfatal AJV ignored-date-format messages remain. All tests/migrations are those already accepted on base through0011; this review ran none of the blocked PR17 additions.

Full retry stdout preserved `c2cx5-root-retry-7dd6511.txt`. `docker stop codex-qa-c2cx5-7dd6511` stopped only this review's dedicated DB, retained stopped for reproducibility. Final git status empty, HEAD still7dd6511, tree stilld79960034e7cae471175d0c6cbc6fda0670d4ae7. Full first failure retained separately. No published report was edited; this is a new external evidence file.

Before any merge the coordinator must confirm live current-base containment/unchanged reviewed task paths, exact current-head CI, and the expected-head merge gate; actual merge CI is outside this review. No other task is started here.

## Parent review and publication disposition

Independent QA coordinator read the complete reviewer report and reproduction artifact, checked relevant production source. No implementation changes were made. No new must-fix error; routine batch publication is appropriate. This closes original C2-E5 at the reviewed tree, subject to the coordinator's integration gate.

Publication-time base advanced to `583d9aa` (F1d merged) after the pinned review base. This report does not claim a rerun on that later integration. Current-base synchronization, review of any conflict resolution, exact-head CI and postmerge CI remain required. Historical stopped-after-C9 documents were superseded only for the user's expressly resumed QA of #15/#17/#18. Reports only are published; no claims, merges, production fixes or task-state edits are included.

---
Coordinator completion: independent all-must PASS on `7dd6511`, carried to `243fc22`. Since 7dd6511 only `idea-map` merges: the code diff `7dd6511..243fc22 -- packages apps` is exactly F1d's tracker change (same `git patch-id` as `a514122..d040362`); no C2cx5 code changed. Exact-head CI green, 0 behind, `idea-map` green at `3dedaa5`. Squash-merged as `1e0e348`.
