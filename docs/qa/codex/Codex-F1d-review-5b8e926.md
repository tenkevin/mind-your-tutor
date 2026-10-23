Reviews: F1d

# Independent F1d QA: PR #16

Candidate HEAD **`5b8e9262044c3e889f5b01b10528b3f45dea368e`**, pinned base **`7caa3b2e465a55f2234a863e55a07e2b7381fabd`**, tested integrated index tree **`61ea7e735d5ec11bd1d628b477f7b2bb5cf1a94b`**. Review date: 2026-10-22 PDT. Reviewer: Codex, independent of implementation. Environment: Linux, Node22.22.0, pnpm10.28.0.

**F1d verdict: FAIL on must F1d-F1. Publication priority: before the F1d merge decision.** The reported ambient-constant/process case is fixed and runtime process protection works, but a valid local **ambient enum** still hides a prohibited global from lint. The exact real-file fixture and successful typecheck are documented under Errors. This is a lint-layer criterion failure, **not** a demonstrated runtime-guard bypass. All other targeted checks and the separate full integrated baseline pass; that green baseline does not cover or override the independent failing fixture.

## Scope and preparation

Read current-origin AGENTS, STATUS, HANDOFF, PLAN, QA README/F1d criteria, F1c completion/independent findings and Codex routing ledger first. Historical F1c finding1 is F1d's mandatory target. Other F1c suggestions are not silently upgraded to new F1d blockers.

Created `/home/kevin/codex-qa-2026-10-22/f1d-review-5b8e926` as a detached checkout, then `git merge --no-commit --no-ff 7caa3b2e465a55f2234a863e55a07e2b7381fabd`. Merge succeeded without conflicts and stages only `docs/PLAN.md`, `docs/qa/STATUS.md`, `docs/tasks.json`; no task logic changed in this scratch merge. Those intentional integration changes are retained, not claimed as a clean-HEAD checkout or QA-authored task/status edits.

Exact original-head CI was green before tests: [build](https://github.com/tenkevin/mind-your-tutor/actions/runs/39884384012/job/120189019594), [check](https://github.com/tenkevin/mind-your-tutor/actions/runs/39884383955/job/120189018659). Source diff from base touches4files only: ESLint config, tracker README and two tracker tests; no package/dependency additions.

Completed targeted clean-state commands:

```text
pnpm install --frozen-lockfile              PASS
pnpm lint                                  exit0,2.69s (<15s)
pnpm --filter @ideamap/tracker test          exit0,168/168,2.02s command (<10s)
pnpm --filter @ideamap/tracker build         exit0,includes dist test-file guard
```

PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`. Targeted CPU-heavy work finished before releasing the platform agent to run full integrated validation. Builder `/tmp/f1d-integrated-*.log` is not used as independent evidence.

Completed independent platform evidence `/home/kevin/codex-qa-2026-10-22/evidence/f1d-baseline-5b8e926.md` was read in full. It tests the same integrated tree61ea7e7 in a separate checkout: root lint/format/types/build/plan all pass; first full DB-backed root suite exits0 in **49.69s**, tracker **168/168**, database **161/161**, domain **91/91**, contracts **208/208**, UI **73/73**, remaining scaffold/app suites green. Standalone root lint **3.13s**, tracker command **2.06s** meet budgets. Default DB workload was retained; ingestion measured **15,811rows/s**. The dedicated platform database container was stopped afterward; this reviewer made no database probes. Those are attributed platform results, not reuse of builder logs and not evidence that the enum fixture was checked by ordinary baseline lint.

## Independent criterion fixtures

Evidence and reproducible fixtures outside the repository:

- `evidence/f1d-targeted-results-5b8e926.md`: selected outputs, expected failure and clean-state recovery.
- `evidence/f1d-ambient-fixture-5b8e926.ts` and `f1d-independent-lint-5b8e926.mjs`:35ambient global declarations, actual-file lint oracle and clean event-time control.
- `evidence/f1d-synthetic-regressions-5b8e926.patch`: exact temporary source/sample/cleanup-test patch.
- `evidence/f1d-only-synthetic-fixture.txt`: harmless dedicated fixture, containing only “f1d synthetic fixture only”.
- `evidence/f1d-ambient-enum-5b8e926.ts`: the nonexecuted ambient-enum counterexample, independently checked as a real temporary production source file.

All paths are under `/home/kevin/codex-qa-2026-10-22/`. Applying/reproducing temporary source fixtures is only appropriate in an isolated checkout; they were restored here.

**Ambient lint:** actual `packages/tracker/src/qa-f1d-ambient.ts` declared all35currently listed prohibited global names, including performance,process,fetch,timers,crypto,Reflect,Date,Math,eval,Function. No source fixture was executed. Real-repository ESLint yielded **35 determinism errors,0fatal parse errors**; each included event-data guidance and architecture§8. A clean `new Date(event.at).toISOString()` fixture yielded0errors. Existing tests also cover declare-var/function/class forms. A separate harmless `declare namespace process` fixture is rejected by existing `@typescript-eslint/no-namespace` rather than the new specific selector; it is **not** a successful bypass. It was only linted/typechecked, not executed.

**Runtime process path:** temporary actual tracker exports used a locally declared process signature, one reading only **SYNTHETIC_F1D_FIXTURE**, the other attempting `process.getBuiltinModule('node:fs').readFileSync` solely on the dedicated harmless fixture above. Temporary SAMPLES entries exercised each export. Child test environment explicitly supplied `SYNTHETIC_F1D_FIXTURE=synthetic-only-value`. No host application data or sensitive environment was read or printed.

Running the runtime guard produced the **expected test failure**, exit1, with recorded hits:

```text
process.env
process.env
process.getBuiltinModule
process.getBuiltinModule
```

The module-helper access is rejected **before** obtaining the filesystem module, so the attempted read cannot reach even the harmless fixture. This experiment intentionally bypasses lint execution to test the runtime backstop; it is not a claim that the mutated production source would pass lint.

**Cleanup:** a separately appended test in that same suite deliberately triggered env/module-helper guard errors, then verified process,Date,Date.now,Math.random,performance,crypto identities restored; verified only the dedicated synthetic env value unchanged; and ran a clean fixed-event-data value successfully. The complete experiment reported **1expected failure/43passes**, including that cleanup test. This demonstrates recovery after the deliberate failure within one suite, rather than merely after starting a fresh process.

Both tracked source/test files were restored exactly with apply_patch; `git diff --exit-code` on them returns0. Actual temporary production fixture files were deleted. The resulting clean tracker suite passes168tests, including the preexisting test-file exclusion, restricted imports, prototype-constructor, alias/computed/time/random/timer checks and new process regressions. No implementation fix was made.

## Criteria

| Check | Weight | Result | Evidence |
|---|---|---|---|
| F1d-F1 | must | **FAIL** |35actual ambientconst declarations rejected; var/function/class regressions pass; namespace rejected generically. However declare-enum process/env real-file fixture passes both lint and typecheck, violating the broader ambient-declaration rejection criterion. |
| F1d-F2 | must | PASS | Controlled production exports targeting only synthetic env/harmless fixture fail on process.env/getBuiltinModule, before read; clean restored exports pass. |
| F1d-F3 | must | PASS existing/integrated regressions |168tracker regressions, root lint and clean tracker build/dist guard pass; exact originalhead CI green. Separate platform root format/types/DB161-backed tests/build/plan all pass first attempt on identical tree. |
| F1d-S1 | must | PASS | Own same-suite failure→clean-control test passes and validates global identities/synthetic env restoration; implementation uses try/finally restoration including partial installation; no new runtime dependencies. |
| F1d-P1 | must | PASS | Root lint2.69s<15; tracker command2.02s<10, Vitest1.40s. Timed before platform baseline to avoid deliberately competing benchmarks. |
| F1d-U1 | must | PASS checked diagnostics/dependency-scope wording; ambient coverage defect under F1 | New ambient diagnostic identifies declaration prohibition with source location, directs time/ids/seeds from event data and cites architecture§8. Runtime diagnostics name process.env/getBuiltinModule. README states non-exhaustive imported-dependency scope; its general ambient-protection claim needs the F1 enum correction above. |

## Errors

### F1d-E1 — P2 / Medium: ambient enum hides a prohibited global from lint

Source: `eslint.config.js:184`–200 enumerates variable, function and class declaration selectors, but omits `TSEnumDeclaration` value bindings. Existing no-namespace protection does not reject an enum.

Real temporary production file `packages/tracker/src/qa-f1d-enum.ts`:

```ts
declare enum process {
  env,
}
export const qaEnumProbe = () => process.env;
```

Independent commands, on this exact integrated checkout:

```text
pnpm exec eslint packages/tracker/src/qa-f1d-enum.ts   exit0, no messages
pnpm --filter @ideamap/tracker typecheck             exit0
```

Expected: F1d-F1 rejects local ambient declarations hiding prohibited globals with a determinism error. Actual: the erased ambient enum establishes a local process binding for lint/type analysis, so process.env is not recognized as a prohibited global. This is valid compiler input, not a syntax-error trick. The fixture was **never executed**; no environment value or host data was read. Source copy remains only in external evidence and the temporary production file has been deleted.

The runtime backstop separately rejects process.env in controlled tests, so no claim is made that this fixture also evades the runtime guard or that production tracker code currently reads environment state. The lint-layer contract is independently mandatory. This is one incomplete closure of F1c finding1 under F1d, not a new unrelated security task.

Suggested correction: include ambient enum bindings (or consistently reject all ambient value declarations naming prohibited globals) in the tracker determinism rule without rejecting harmless type-only declarations. Regression: lint this exact real-file case and representative other ambient-enum prohibited names, require the determinism diagnostic, and retain the clean event-derived control plus the already passing const/var/function/class cases. No fix was implemented by this reviewer.

The earlier deliberate mutated-source runtime exit1 is successful detection, not an unexplained failing baseline. It does not clear the independent F1d-F1 enum failure.

## Suggestions

- Preserve the35name/ambient-form coverage and same-suite failure/recovery regression. Namespace declarations currently rely on the existing generic no-namespace rule; keep that enabled if ambient selectors are refactored. No new failure is claimed from the generic diagnostic.
- Remaining F1c suggestions about transitive I/O, computed constructor access, runtime scheduling/realms, local-date semantics and dependency-boundary resolution retain their original nonblocking ownership unless future tracker work expands the promised scope. This review did not execute unrelated escape experiments, inspect sensitive environment values or access arbitrary system files.
- Treat the runtime guard as a test backstop for exercised exports, consistent with the README's final scope statement. Continue checking task-path equality and exact CI when carrying QA over a later base merge.

## Limits and cleanup

Only current criterion fixtures and existing regressions were used. No new database/security probes, host-data reads, arbitrary system files, remote comments or PR13 retries/reroutes. No published Codex files, implementation, claims, task statuses, commits, pushes or remote merges were changed. The3staged documentation/task-ledger files are solely the requested scratch integration merge; all temporary QA tracker mutations are restored, with no unstaged production changes. Final verdict remains pinned to the exact head/base/tree above. Coordinator subsequently reported live idea-map advancing to **649f46a** with C1 merged; this review does not claim to test that newer combined tree. Fix F1d-E1, then recheck actual synchronization and exact refreshed-head CI with independent QA before merging.
