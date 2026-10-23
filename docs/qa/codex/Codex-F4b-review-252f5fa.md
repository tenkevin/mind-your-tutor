Reviews: F4b

# Independent QA: PR #12 synchronized head

**Verdict: PASS on exact head252f5fa50eb084b35353d20c6353fe158229c3eb**, including existing isolation/security/migration suites and the resolved PR14 fixture integration. Pinned current base: **3f4d8458772f87dc6a49397bd2e9d8550ad29d78**. Tested integrated tree: **8315b4ff5fe38eabf7d17c5d627508f57ae0f43c**. Date2026-10-22 America/Los_Angeles. Independent Codex QA, not the implementer.

Root lint/format/typecheck/build/plan and full DB-backed tests pass. DB **161/161 across8files**; existing F4-P3 ingest **15,852 rows/s**, above5,000. Exact-head CI build/check both succeed. At final verification the live `idea-map` ref remained the pinned base, which is an ancestor of this head (**0behind/3ahead**). Actual remote merge and post-merge CI remain coordinator actions, not actions performed or claimed by this review.

Security evidence is limited to **existing repository suites plus static source inspection**. No new adversarial/security probes were constructed, executed or used to recreate the previously blocked shadow-table scenarios. Passing these tests is not a claim of exhaustive independent exploit resistance.

## Scope and validation

Prior round: exact old head **7ed7c1c19e378183949de9552f9e31377bc31ab7**, old pinned base **0c3e2796ec5385e375453adde0206d8dd6864856**, scratch tree **a88049a90dd7c1f1ff6068283f9dacd3213d2d8e**. That round passed DB159/159, ingest15,221rows/s, but warned about the incoming PR14 fixture conflict; its local historical report (`/home/kevin/codex-qa-2026-10-22/reports/Codex-F4b-review-7ed7c1c.md`) remains a separate historical artifact. **This report freshly tests the newer synchronized head, not a carried-forward PASS on the older head.**

Fresh detached worktree: `/home/kevin/codex-qa-2026-10-22/f4b-synced-252f5fa`. Current AGENTS/QA README/F4b criteria, historical F4 report, architecture §8/§10/D11, old/new diff and fixture resolution were inspected. The QA README's integration check is satisfied because the head already contains the pinned current base: ancestor check exits0; `git merge --no-commit --no-ff 3f4d8458772f87dc6a49397bd2e9d8550ad29d78` reports **Already up to date**. Thus the tested integrated tree is exactly the head tree above; no scratch resolution, merge commit, implementation edit or untested combination was introduced.

Compared with7ed7c1c, production migration0011, `isolation.test.ts` and `security.test.ts` are unchanged. The synchronized fixture sites now use PR14's shared `validDerived()`; `derivedData()` was removed from seed.ts. `VersionDerivedSchema` parse/fresh-copy tests and the typed roundtrip equality assertion are retained and pass in this rerun. The old fixture-overlap warning is **resolved in this tested head**, not left as an outstanding conflict.

Environment: Linux x86_64, Node22.22.0, pnpm10.28.0. PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`. Fresh frozen install succeeded (258packages; no lockfile changes). Only the dedicated synthetic QA container **codex-qa-f4b-20261022**, originally created uniquely for this F4b review, was reused sequentially after its prior run finished. Its inspected mapping after restart was **127.0.0.1:32772→5432**. Prior retained F4/derive and coordinator databases were untouched. Each existing DB test file creates/drops its own disposable database. This dedicated container was stopped again at completion.

Commands in the fresh synchronized worktree:

```sh
export PATH=/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin:$PATH
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
node scripts/plan.mjs check
DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32772/postgres \
  pnpm test --disableConsoleIntercept
```

All exit0; plan prints `plan: ok`. The shown password is synthetic and belongs only to that disposable QA container. `--disableConsoleIntercept` changes logging only, preserving output of the existing ingest-rate test. No test sources/configurations were modified. Default performance data remained **1,000,000events/10,000chunks**, with the existing100,000-event,200×500-batch ingestion assertion. DB duration **46.57s**. Other root suites: contracts208, domain74, UI73, tracker56, teacher2, API2, ai/connectors/student/worker1 each, all pass. Existing AJV ignored-date-format warnings became visible with console interception disabled; they did not fail tests and are outside this F4b change.

## Criteria

| Check | Weight | Result | Evidence |
|---|---|---|---|
| F4b-F1 right-school ledger | must | PASS, suite/source | Existing isolation tests assert composite(org_id,student_id) FK, SELECT-only ledger privilege, denied direct app insert, definer owner and pinned search_path |
| F4b-F2 no cross-school blocking/probing | must | PASS, existing suite | Existing two-org regression verifies foreign-student taken/free seq attempts fail identically without unique leakage, no foreign-key visibility, and orgB's genuine next event succeeds |
| F4b-F3 class-scoped settings | must | PASS, existing suite | Existing cases check no other-class reads,0-row updates/deletes, denied other-class insert/move and successful own-class update |
| F4b-F4 normal use/migrations | must | PASS | DB161/161 includes isolation/security/integrity/columns, shared derived fixture, normal triggers/queue, migration-up/no-op/down-up/reset and performance |
| F4b-F5 partition pruning note | should | PASS | Architecture §8.5 and DB README explicitly recommend recorded_at bounds from snapshot time |
| F4b-S1 minimal privileges | must | PASS, suite/source | Existing tests enumerate grants, assert ledger has no app INSERT/UPDATE/DELETE, only needed app-schema functions execute, PUBLIC TEMP denied; normal operations pass |
| F4b-S2 safe definer | must | PASS, tested checks/static | Existing org/owner/search_path checks pass; unchanged0011 qualifies public ledger/student references and app context function, pins pg_catalog,pg_temp and checks org/member consistency before writes |
| F4b-P1 ingest | must | PASS | Existing F4-P3 logs **15,852rows/s**, above5,000 |
| F4b-U1 isolation documentation | must | PASS | README covers org/class scope for settings/uploads, ledger definer/FK/grants, TEMP and exact isolation test commands |

The app-role cases use the repository's existing `asApp` harness (`SET LOCAL ROLE` plus transaction-local context). No new real-login role, alternative context attacks or shadow-table experiments were added. The coordinator separately reviewed source (local static artifact `/home/kevin/codex-qa-2026-10-22/evidence/f4b-static-review-7ed7c1c.md`); its production conclusions apply here because those task files are unchanged, while its former fixture-conflict warning is superseded by the verified synchronization above.

Exact-head CI read via REST with GH_TOKEN/GITHUB_TOKEN unset:

- [build120178691072/run39881189884](https://github.com/tenkevin/mind-your-tutor/actions/runs/39881189884/job/120178691072): **success**,2026-10-23 00:57:31–00:59:36UTC.
- [plan check120178689962/run39881189894](https://github.com/tenkevin/mind-your-tutor/actions/runs/39881189894/job/120178689962): **success**,00:57:31–00:57:36UTC.

## Errors

No new reproducible error found in synchronized head252f5fa. The written F4b must criteria pass within the stated existing-suite/static-review scope, and the PR14 shared-fixture integration now passes fresh root validation. No duplicate task is proposed for prior findings.

Canonical status remains precise: migration0011 structurally qualifies the old **F4-E1** ledger destination and strengthens its ownership/grants checks; no fresh custom shadowing exploit was run. **F4-E2 is not declared fully resolved**: migration0007's `guard_class_pin` remains unqualified, F4b denies default app TEMP, and planned **F4cx1** owns structural guard hardening. This review does not silently replace that existing work with a broader security PASS.

## Suggestions

- Retain the already-noted **source-inferred populated-downgrade caveat**:0011 permits equal event ids across orgs, but down restores global PK(id), which cannot be added if such valid duplicates exist. Empty down/up tests pass; no populated downgrade experiment was done. A runbook preflight/forward-fix policy should preserve append-only history. This is nonblocking guidance, not a new required security probe or duplicate error task.
- Keep the evidence boundary when handing off: full existing isolation-suite regression coverage and source inspection passed; independent new adversarial checks were intentionally not performed. Post-merge base CI must still be checked by the coordinator.

Cleanup: dedicated container stopped; no preview server started. Fresh worktree `git status --short` is empty and `git diff --exit-code` succeeds at exact head252f5fa/tree8315b4ff. No source fixes, task changes, commits, pushes, PR comments, published-report edits, remote changes or new probes were made. Selected actual output excerpts are retained in `/home/kevin/codex-qa-2026-10-22/evidence/f4b-validation-252f5fa.txt`.
