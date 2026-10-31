Reviews: C5cx1

# C5cx1 independent Sol review — PR #33 — `7005308`

**Scoped feature result: PASS. C5cx1-F6 remains UNVERIFIED; this is not an all-must PASS.** Independent source review and fresh Sol checks confirm that the original C5-E1 defect is corrected: later accepted questions are visible, sorting removes row-order dependence, and repeated identical questions retain their multiplicity. No new source error was confirmed. The full root suite includes an unavailable test and cannot be certified by this reviewer.

## Errors

None confirmed within the permitted review scope. F6 is unavailable as detailed below, rather than a demonstrated application failure.

## Suggestions

No additional product suggestions. Before merging, the coordinator must complete the separate unavailable full-suite gate, synchronize with the current integration branch, and confirm exact-head and actual merge CI under the repository integration rules.

## Reviewed tree and independence

- PR head / scratch HEAD: `700530865b026b8fb00f4de3b5fd882e10a0d44f`; head tree `59c3e0cdbb5bcc989e1e2b33444cf0dd2b59dbf5`.
- Pinned integration base / MERGE_HEAD: `63855ef1146ed1245f0d294cfb6493ae7ca52dc0`; base tree `917cb9f7f3064d70eacd25f4fb6fb1ffe398875b`.
- Actual scratch integrated index tree, before and after Sol checks: `c71655bda4270d6c553c842a374a0d1fa6efbaf9`.
- Checkout: `/home/kevin/codex-qa-2026-10-27/c5cx1-7005308`. Its predecessor-created clean `--no-commit --no-ff` merge was retained; Sol did not redo or commit it. Staged changes are the intended integration merge, and `git diff --name-only` reports no unstaged source changes.
- Publication base subsequently advanced to `0e5eb63`. Direct `git diff --name-only 63855ef... 0e5eb63` lists only the historical T2 and M2 integration Codex report files. This review certifies the pinned integrated application tree, not a new scratch merge of those report files.

This reviewer did not implement the change. Sol independently read the reviewer guide, applicable AGENTS/HANDOFF/QA documents, C5cx1 and C5 criteria, architecture decisions/pipeline, original `Codex-C5-review-6f43575.md`, fixture rules, and relevant implementation/contracts/tests. The fix commit `f9bef60657c58a5b7db1350e9a13de097684d47e` changes only domain diff logic/tests and the publish diff contract. `questions()` was compared directly with `checks.ts` Assessment handling: both use the first Ideas row, skip unknown ideas/units, skip mismatched known units, retain the checker's special case for an idea with an unknown unit, and ignore blank/null questions. No assessment uniqueness constraint was added. `minus()` consumes frequency counts rather than a set, so duplicate additions/removals remain visible.

Earlier Luna work is used only as explicitly identified mechanical execution evidence: retained build/lint/format/typecheck and HTTP publish logs were inspected by Sol. Its handoff and conclusions were not treated as independent gate judgment. Domain tests and the external harness lacked raw predecessor logs, so Sol ran the needed checks with retained output. No new database run was necessary.

## Criterion results

| Criterion | Result | Evidence |
|---|---|---|
| C5cx1-F1: later question edit | PASS | Fresh repository regression shows old/new later question, idea title/unit. Sol harness changes a third accepted question; the separate multiset edit asserts complete before/after and removed/added text. |
| C5cx1-F2: row-order independence | PASS | Repository property-style regression covers 200 seeded shuffles. Independent Sol harness enumerates 24 index permutations on each side of a four-row multiset edit (576 paired cases, including duplicate values), requiring the same complete diff; reversal of unchanged multi-question rows remains empty. |
| C5cx1-F3: add/remove | PASS | Repository regression adds a third/removes a second question. Independent duplicate-copy addition/removal checks ensure multiplicity is preserved; paired permutations check simultaneous removals/additions. |
| C5cx1-F4: checker agreement | PASS | Source comparison above; independent `parsePack`/`checkPack` assertions accept repeated question rows without errors. Unknown idea, unknown unit, mismatched unit, whitespace and null question rows leave the diff empty in both directions. |
| C5cx1-F5: existing C5 behavior/contracts | PASS | Fresh `diff.test.ts` 11/11, including six change kinds, empty/first publish, rename identity, one-question fixture, add/clear and missing-unit name. Independent six-kind payload validates through `CurriculumDiffSchema`; contract now contains question arrays, added/removed arrays and draft unit. Retained Luna real-session HTTP publish suite 15/15, including API diff/reorder/schema integration and ordinary publish/rollback/audit/isolation checks. |
| C5cx1-F6: root checks/full suite/CI | UNVERIFIED | Retained mechanical root lint/format/typecheck/build logs pass; fresh Sol plan check passes. Parent REST verification supplies successful exact-head build `40567144414` and check `40567144329`. Full root test suite, including `function_binding.test.ts`, is unavailable under the standing execution restriction. CI does not substitute for that missing independent execution. |
| C5cx1-S1: curriculum-only diff | PASS | Static payload and contract expose idea/unit/question fields only; pure diff has no student input. Independent exact payload assertions and retained HTTP S4 evidence support the same conclusion. |
| C5cx1-P1: 2,000 ideas × three questions | PASS | Independent cold 20.016308 ms; five warm runs 10.964726, 9.022690, 9.739506, 8.811989, 8.105861 ms; median 9.022690 ms, below C5's unchanged 500 ms budget. |
| C5cx1-U1: readable change | PASS | Exact independent payload quotes complete old/new and removed/added text, `idea_id`, title `The Sun`, unit 1 / `Water goes up`; contract validation succeeds. |

## Commands, failures and raw evidence

Evidence directory: `/home/kevin/codex-qa-2026-10-27/evidence/c5cx1-7005308/`. Linux, Node `v22.22.0`, pnpm `10.28.0`. Every command below ran from the scratch checkout with PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin:/usr/bin:/bin`. Fresh Sol commands all exited 0:

```sh
pnpm --filter @ideamap/domain exec vitest run src/diff.test.ts --reporter=verbose
pnpm exec vitest run --config ../evidence/c5cx1-7005308/c5cx1-sol.config.mjs --reporter=verbose --disableConsoleIntercept
node scripts/plan.mjs check
pnpm exec vitest run --config ../evidence/c5cx1-7005308/c5cx1-sol.config.mjs --reporter=verbose -t 'diffs 2,000 ideas'
```

Logs: `sol-diff-tests.log` (11/11), `sol-independent-first.log` (5/5), `sol-plan.log` (`plan: ok`), `sol-perf-artifact.log` (targeted performance test 1/1; four intentionally filtered tests). Harness/config: `c5cx1-sol.test.ts`, `c5cx1-sol.config.mjs`. The harness is a new copy of the retained predecessor harness, independently audited and extended with the exhaustive multiset permutations. No source assertion was changed.

The first Sol external run passed every assertion, including its performance budget, but `--disableConsoleIntercept` suppressed its console timing JSON. That evidence-output gap justified one isolated performance rerun on the identical workload/budget, with an added `writeFileSync` of `sol-perf-samples.json` and ordinary console interception. No acceptance assertion was weakened. First output is retained. The samples above come from this documented rerun; its cold sample means the first diff call in that isolated process, not a claim that machine-wide caches were cold.

Performance input has 2,000 synthetic ideas, 6,000 accepted Assessment rows and 200 ideas (10%) with title/second-question edits. It asserts 200 renames and 200 question changes with three before/after questions each. Input SHA256: `eed73163b1c1374cae545ddc625542ddb52a759bdbec57cc3fe7114b7fefb9ea`. Runs were serialized after C6 released its runtime window; Sol ran no parallel build or service. Unrelated host activity was not controlled. The slot was released immediately after these checks.

Retained Luna mechanical commands were `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, and `DATABASE_URL=postgres://postgres:qa_c5cx1@127.0.0.1:55438/postgres pnpm --filter @ideamap/api exec vitest run src/publish.test.ts --reporter=verbose`. Logs are `lint.log`, `format.log`, `typecheck.log`, `build.log`, `publish-tests.log`; publish has 15 passed, zero skipped. The first DB attempt failed before executing tests with sandbox `connect EPERM`; `publish-tests-sandbox-failure.log` retains all 15 skipped and failed suite setup. The same approved dedicated-DB command then passed. Luna's handoff also discloses earlier harness include-path and duplicate Vitest-instance setup errors in session history, whose raw file artifacts are unavailable. Those do not establish a source defect or count toward Sol's passing evidence. Sol's first fresh harness execution succeeded. Initial source lookups for nonexistent `contracts/src/diff.ts` and `publishing.ts` were corrected to `publish.ts`; these were lookup mistakes, not product errors.

Exact-head CI links supplied by parent REST verification: [build](https://github.com/tenkevin/mind-your-tutor/actions/runs/40567144414), [check](https://github.com/tenkevin/mind-your-tutor/actions/runs/40567144329). This reviewer did not fetch job logs or claim fresh CI against the scratch integrated tree.

## Exclusions and cleanup

No `pnpm-lock.yaml` or `project/support.js` contents were read. No `function_binding.test.ts`, importing suite, unrestricted root tests, prohibited shadow/temp-table probe, custom adversarial DB security probe, or rerouted historically blocked action was executed. Full-suite F6 remains UNVERIFIED regardless of green scoped tests and CI. C5cx2 concurrency is separate work; this report does not claim its correction. No UI/deployment or real-account behavior is certified.

Sol created no container or database and ran only pure TypeScript checks. Predecessor handoff records its own disposable `pgvector/pgvector:pg16` container `codex-qa-c5cx1-7005308` stopped and temporary fixture databases dropped; parent confirmed no QA services running at resume. Sol did not restart or access another database. No student data, provider keys, source fixes, task state, remote writes, or existing Codex file edits were used. Scratch merge and evidence remain retained; final index tree is unchanged.
