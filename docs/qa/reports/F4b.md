# QA report: F4b · PR #12 · merge fbb453d66c2cc35e69e58656b5e3e34aaa2e11b2

Verdict: PASS
Independent QA: Codex coordinator thread `01a165ed-292f-7d71-8826-a8193dd72a3e`; implementation/integration coordinator: `01a1662b-d926-7331-be84-5327b29f9d3e`.

Independent report retained at `/home/kevin/codex-qa-2026-10-22/reports/Codex-F4b-review-252f5fa.md`; selected output evidence at `/home/kevin/codex-qa-2026-10-22/evidence/f4b-validation-252f5fa.txt`. Coordinator read the complete report. Security evidence is the existing isolation suites plus static inspection, not new adversarial probes or a claim of exhaustive resistance.

Exact tested head `252f5fa50eb084b35353d20c6353fe158229c3eb` passed root lint/format/typecheck/build/plan and full DB-backed tests: 161 database tests, 15,852 events/second. Synchronization to `8e8f58ca92a676136800bb7aae123a7ddddd732d` changed only five documentation/task files, with empty `packages/db` diff. QA was carried forward under the documented merge-only rule, not described as a new test run.

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

Before merge, the coordinator verified current base and candidate build/check success, `behind_by: 0`, unchanged expected PR head, and task-path equality. After squash merge `fbb453d`, both [ci](https://github.com/tenkevin/mind-your-tutor/actions/runs/39881916129) and [plan](https://github.com/tenkevin/mind-your-tutor/actions/runs/39881916071) succeeded.

No new error. F4cx1 still owns remaining guard qualification; F4-E2 is not declared resolved here. Nonblocking source-inferred downgrade caveat: migration 0011 allows same event IDs across orgs, while its down migration restores a global ID primary key. A populated downgrade therefore needs a preflight/forward-fix policy; no populated downgrade probe was run. Route this documentation suggestion to F4cx1-U2.
