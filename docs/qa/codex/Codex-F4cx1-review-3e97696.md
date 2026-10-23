Reviews: F4cx1

# Independent QA: PR #17 — limited review

Verdict: **UNVERIFIED; not an all-must PASS.** No new must-fix implementation defect was confirmed. Required runtime evidence is unavailable because the new shadow-table tests repeat actions stopped after the original automated security-filter interruption. They were not executed, retried, or delegated through another route. Keep PR #17 unverified; green builder/CI results do not substitute for the missing independent checks.

Reviewed head: `3e97696f49816aa9a487d9efbc1fca2acbf6381a`. Pinned base: `500682e749055dd997375e915ff4b413120bcea7`, already an ancestor. Tested head/integrated tree: `9d144adce51aeb011f1302525318880e17576dfa`. The assigned earlier head `3d18a23db259f1917d064d9a2d0b65a00394f061` has no DB task-code difference from this synchronized head. Independent Codex QA, 2026-10-22 PDT; separate source and baseline reviewers, with both artifacts read by the QA coordinator.

## Evidence and scope

Only four task files differ from pinned base: DB README, new migration `0012_function_binding.ts`, its registry entry, and `function_binding.test.ts`. Existing F4b migration, security/isolation tests, and all eight allowed DB test files remain unchanged. Source inspection finds the nine current application functions accounted for, qualified persistent relation references, deliberate function search paths, a draft-pin guard that rejects missing/unexpected states, and preservation of F4b ledger predicates/keys/privileges and class policies. These are source findings, not fresh shadow-probe validation.

Worktree: `/home/kevin/codex-qa-2026-10-22/f4cx1-review-3e97696`. Node 22.22.0 / pnpm 10.28.0. Frozen install, root lint, format, typecheck, build, and plan check all passed. Ten non-DB workspaces passed in 12.66 seconds. The explicit pre-existing eight-file DB allowlist passed **161/161** in 49.41 seconds; ingestion **14,200 events/second**, above 5,000. The default million-event/10,000-chunk performance dataset was retained. No retry was needed.

`function_binding.test.ts` was read but **not executed**. Unrestricted root `pnpm test` was **not run**. The DB command named only `columns`, `integrity`, `isolation`, `migrations`, `performance`, `security`, `index`, and `test/derived` test files. Their imports/configuration were checked for indirect execution of the excluded file. No new security probes were constructed. Full exact commands and selected actual output are in the baseline artifact below.

Exact-head [build](https://github.com/tenkevin/mind-your-tutor/actions/runs/39885906921/job/120193895577) and [plan check](https://github.com/tenkevin/mind-your-tutor/actions/runs/39885906951/job/120193895670) succeeded. Later base synchronization still requires the coordinator's normal unchanged-task-code and exact-head CI gates; this report grants no merge approval.

## Criteria

| Check | Weight | Result | Evidence / limit |
|---|---|---|---|
| F4cx1-F1 event uniqueness under shadowing | must | UNVERIFIED | Qualified ledger destination inspected; required dynamic scenarios not run |
| F4cx1-F2 draft-pin shadowing | must | UNVERIFIED | Qualified lookup and explicit fail-closed checks inspected; required dynamic scenarios not run |
| F4cx1-F3 function inventory | must | PASS, source requirement only | Nine current app functions enumerated; source paths/bindings and catalog-test assertions reviewed; new catalog test not executed |
| F4cx1-F4 regression tests exist | must | PASS, source-only | Criterion says read tests: both app-role reproductions exist in new test file; this does not claim execution |
| F4cx1-F5 complete validation | must | INCOMPLETE | Static/build checks, permitted subset and exact-head CI pass; independent full test suite deliberately not run |
| F4cx1-S1 TEMP defense in depth | must | UNVERIFIED overall | Existing denial baseline passes; new granted-TEMP scenarios not executed |
| F4cx1-S2 broader per-table CRUD | should | NOT RUN | No new broad CRUD probes; existing permitted security/isolation suite only |
| F4cx1-P1 ingestion | must | PASS | Existing performance test measures 14,200 events/s |
| F4cx1-U1 function rule documented | must | PASS | README requires qualification and pinned search path, and points to inventory test |
| F4cx1-U2 populated downgrade guidance | should | PASS | README supplies duplicate-id preflight and forward-fix policy; forbids rewriting history and distinguishes empty-database checks |

F4 above is specifically a source-content criterion, unlike F1/F2's execution requirements. Its source-only PASS refines the preliminary coverage notice; no runtime result is implied.

## Errors

No new confirmed must-fix implementation error. Existing F4-E1/F4-E2 remain owned by F4cx1: structural corrections are visible, but required independent runtime closure is not established. Do not create a duplicate fix task merely for this reviewer coverage limitation, and do not infer that the old errors still reproduce on the corrected head.

The missing required coverage is a **merge-blocking QA limitation**, not an implementation FAIL. It was reported immediately to the coordinator before completion; STATUS/HANDOFF now record PR #17 as unverified. No blocked action was retried to resolve that limitation.

## Suggestions

1. **Low priority — comment accuracy:** `0012_function_binding.ts:23` says the lookup includes organization and curriculum, but its SQL filters only `v.id`. Existing FKs remain authoritative. Align the comment with the implementation; this is not a demonstrated integrity defect.
2. **Future inventory scope:** the new catalog query enumerates the `app` schema. That covers the current hand-written application functions inspected here. If future owned security-relevant functions live elsewhere, expand the inventory rather than treating this test as a whole-database audit.
3. **Rollback documentation:** explain in the runbook that migration 0012's one-step `down` deliberately retains hardened definitions. The source comments already say this; the requested populated-0011 guidance is now addressed.

## Artifacts and handoff

Local evidence, outside the repository:

- `/home/kevin/codex-qa-2026-10-22/evidence/f4cx1-static-3e97696.md`: complete static inventory, source references, F4b preservation and criterion analysis.
- `/home/kevin/codex-qa-2026-10-22/evidence/f4cx1-baseline-3e97696.md`: exact allowed commands, output excerpts, counts, timing, CI and exclusions.

Dedicated synthetic container `codex-qa-f4cx1-baseline-20261022` used localhost port 32779 and was stopped afterward. Worktree remained clean at the recorded tree. No production fix, task-state edit, PR comment, merge, or published-report modification was made. Routine publication is batched with the next completed review; the actionable coverage blocker was already communicated immediately.
