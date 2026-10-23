Reviews: F4cx1

# Independent QA: PR #17 — refreshed limited review

Verdict: **UNVERIFIED, not an all-must PASS.** No new implementation error confirmed. The user resumed review, but the previously blocked dynamic shadow-table actions remain excluded. Installing PostgreSQL/pgvector changes environment availability, not that restriction.

Reviewed head: `733c8239b42d8bc87a70522a7dc392309b4c2079`. Pinned base: `a514122f6566355d36a15c025a6ad721794124bf`, already an ancestor. Tested head/index tree: `2bd8418cabc1317787de1b260717f31bb9ad64d3`. Scratch merge reports Already up to date. Detached worktree: `/home/kevin/codex-qa-2026-10-22/f4cx1-review-733c823`. Reviewed on 2026-10-22 PDT by the independent QA coordinator.

## Evidence

Compared the entire DB package against prior reviewed head `3e97696f49816aa9a487d9efbc1fca2acbf6381a`: **no difference**. Four task files differ from pinned base: README, migration0012, migration registry, new function-binding test. Parent reread the migration, README and new test, enumerated nine application functions, inspected allowed-suite imports/config/harness, and reran permitted checks. Previous structural findings and unresolved suggestions remain applicable; old published report is untouched.

Node22.22.0 / pnpm10.28.0; PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`. Frozen install258packages passed. Root lint, format:check, typecheck, build and plan check all passed (sequential && chain exit0). Ten non-DB workspaces passed (sequential workspace chain exit0). Explicit eight-file DB allowlist passed **161/161**,46.55s Vitest /47.29s command wall. Ingestion **15,628 events/second**, above5,000. No failure or retry in this permitted subset. Existing default million-event/10,000-chunk workload retained.

Exact-head [CI](https://github.com/tenkevin/mind-your-tutor/actions/runs/39893180386) and [plan](https://github.com/tenkevin/mind-your-tutor/actions/runs/39893180675) succeeded, independently checked by REST. This is not a substitute for missing independent runtime coverage.

`function_binding.test.ts` was read, **not executed**. Unrestricted root `pnpm test` was **not run**. No custom security probe or blocked action was retried, rephrased or delegated. No indirect import/setup execution of the excluded file exists in the allowed suite.

## Criteria

| Check | Result | Evidence / limit |
|---|---|---|
| F1 event uniqueness under shadowing | UNVERIFIED | Required runtime scenarios not executed |
| F2 draft-pin shadowing | UNVERIFIED | Required runtime scenarios not executed |
| F3 complete function inventory | PASS, source-only | Nine functions accounted for, qualified persistent relations and deliberate paths; catalog regression not executed |
| F4 regression tests exist | PASS, source-only | Criterion requires reading tests; both app-role reproductions present |
| F5 complete validation | INCOMPLETE | Static/build/permitted subset and exact CI pass, independent full suite excluded |
| S1 TEMP defense in depth | UNVERIFIED overall | Prior allowed privilege/isolation baseline passes; granted-TEMP scenarios excluded |
| S2 broader custom CRUD, should | NOT RUN | Existing isolation/security tests only |
| P1 ingestion | PASS |15,628events/s>5,000 |
| U1 function binding documented | PASS | README requires qualification/pinned paths and references inventory |
| U2 populated downgrade guidance, should | PASS | Duplicate-id preflight and forward-fix policy documented; no claim empty rollback proves populated safety |

## Errors

No new confirmed must-fix implementation defect. Existing F4-E1/F4-E2 remain owned by F4cx1, structurally addressed but without required independent runtime closure. Do not duplicate them or infer they still reproduce on this head.

The coverage gap remains merge-blocking. Green CI and an installed database do not convert UNVERIFIED to PASS. This is a reviewer limitation, not an implementation FAIL. It was already reported before this refresh; unchanged blocker can be published in the completed-review batch.

## Suggestions

1. Retain previous low-priority comment correction: migration0012:23 claims org/curriculum predicates, while the lookup filters only version id; existing FKs still enforce relationships. No new integrity defect demonstrated.
2. Expand the inventory if future owned functions appear outside app schema.
3. Add runbook wording for migration0012's intentionally forward-only down behavior; source already documents it.

## Commands and artifacts

Working directory is the detached worktree above, Node22 PATH prefix as stated:

```sh
pnpm install --frozen-lockfile
pnpm lint && pnpm format:check && pnpm typecheck && pnpm build
node scripts/plan.mjs check
pnpm -r --workspace-concurrency=1 --filter '!@ideamap/db' test --disableConsoleIntercept
/usr/bin/time -f 'F4CX1_DB_ALLOWLIST elapsed=%e exit=%x' \
  env DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32785/postgres \
  pnpm --filter @ideamap/db exec vitest run \
  src/columns.test.ts src/integrity.test.ts src/isolation.test.ts \
  src/migrations.test.ts src/performance.test.ts src/security.test.ts \
  src/index.test.ts src/test/derived.test.ts --disableConsoleIntercept
```

Synthetic password above belongs only to dedicated disposable container `codex-qa-f4cx1-733c823`, pgvector/pgvector:pg16, localhost32785. It was ready before tests and stopped afterward, retained for reproducibility. No host PostgreSQL data was altered. Host read-only inspection confirmed PostgreSQL16.15 and installed postgresql-16-pgvector0.6.0; inspecting enabled extensions as postgres required sudo authentication and was not completed.

Retained output excerpts: `/home/kevin/codex-qa-2026-10-22/evidence/f4cx1-baseline-733c823.txt`. Earlier static/non-DB output was partly consumed by a user-interrupted tool call; final chain exit0 was recovered, but no complete transcript is claimed. DB output fully captured. Prior immutable report `Codex-F4cx1-review-3e97696.md` retains detailed static reasoning and original scope.

Final worktree tracked-clean. No source edits, task-state changes, PR comments or merges. Publication-time base advanced to `583d9aa` after pinned review; no later integrated-tree rerun is claimed. Coordinator must preserve current-base/exact-head/postmerge gates. New reports only are published.
