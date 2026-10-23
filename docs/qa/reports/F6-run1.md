Reviews: F6

# Independent QA: PR #20 — privacy baseline

Verdict: **FAIL** on head `0412b2cb0230bc269e12ab8015cf11197207f840`. Baseline and retention/performance checks pass, but student deletion leaves historical exports containing identifiers; source review also finds an audit-redaction defect and incomplete export metadata.

Pinned base: `02d7dd7b40982df0d56f2e629acf9a132f857fa0`. Plain head tree: `011c4ed431830fedf2debe368facf14d280fe6f7`. **Actual tested integrated index tree: `5946597e783c590a6416cfa59c1853c7add3b1c1`**, after a conflict-free scratch merge. Two independent component reviewers used that same tree; neither wrote the implementation. The QA coordinator read both complete reports, relevant production code and reproduction output, and independently confirmed the pure-function redaction counterexample.

This is engineering QA against F6 criteria, not legal-compliance certification. F6-E1 below is the same finding already published immediately in `Codex-F6-E1-historical-exports-0412b2c.md` at `d28194a`; do not route it twice. C5's separate confirmed product decision was published in that same commit.

## Validation and provenance

Exact-head [CI](https://github.com/tenkevin/mind-your-tutor/actions/runs/39896430223) and [plan](https://github.com/tenkevin/mind-your-tutor/actions/runs/39896430227) succeeded. Those remote results apply to the plain head; independent local tests apply to the integrated tree above.

Linux, Node22.22.0 / pnpm10.28.0. Frozen install, root lint, format:check, typecheck, build and plan check all passed. Full DB-backed root suite passed on its **first attempt,47.22seconds**:

| Workspace | Passed tests |
|---|---:|
| DB |188/188 |
| Worker |8/8 |
| API |6/6 |
| Contracts |217/217 |
| Domain |96/96 |
| Connectors |104/104 |
| Tracker |172/172 |
| UI |78/78 |
| AI |6/6 |
| Teacher |2/2 |
| Student |1/1 |

Separate privacy/inventory focused tests passed24 with3 deliberately filtered; API6/6 also passed separately. No existing product test failed. The independent historical-export harness first failed before the feature call because its synthetic class omitted required teacher_id; that QA fixture error is preserved, and only the external fixture was corrected. Its next run confirmed the product defect.

Performance used unchanged repository workloads, sequentially after the other reviewer released its heavy-work window:

- Retention:1,000,000text rows,500,000due,default5,000-row batches; **5,061ms**,100batches. Concurrent inserts431; worst18.32ms. Passes5-minute criterion.
- Audit save cost:30warmups,300audited then300plain saves. p95audited3.421219ms/plain2.013130ms; **added1.408089ms**, below10ms. Fixed run order/cache effects remain a limitation; harness emits aggregate p95, not every raw sample.
- Existing event ingestion:28,550rows/s. Full root retained its million-event/10,000-chunk and million-text workloads.

The expected connection-loss warning is from the supplied test interrupting only its own synthetic backend; all assertions pass. Nonfatal existing AJV date-format warnings remain.

## Criteria

| Criterion | Weight | Result | Evidence / limit |
|---|---|---|---|
| F1 inventory completeness |must|PASS|Live catalogue and format checks pass; deliberate added field/table detected; inventory read |
| F2 per-org retention |must|PASS|90-day text/AI and7-day export defaults, overrides and bounds tested |
| F3 due-only deletion/replay inputs |must|PASS|Two-org89/90/91-day cases; events unchanged; missing text resolves to removed marker; expired/recent exports distinguished |
| F4 rerun/interruption |must|PASS|Zero-change rerun, abort between committed batches, owned-backend interruption and successful resumption |
| F5 config/publish audit |must|PASS|Actor/org/target/before/after/time for due dates, personas, rarity, defaults, library, approvals, publish/pin |
| F6 append-only audit |must|PASS|Existing UPDATE/DELETE/TRUNCATE denial tests pass |
| F7 export/delete completeness |must|FAIL|Historical export survives deletion(E1); export metadata omitted(E3) |
| S1 restricted export/delete |must|PASS within current interface|Existing app-role/API tests; default-deny or injected authenticated caller; real F5 SSO integration not present/certified |
| S2 audit secrets |must|FAIL, source-demonstrated|Flattening config.token defeats anchored token matcher(E2); pure-function evidence; no new SQL probe |
| S3 deletion completeness |must|FAIL|Synthetic historical export still contains name/email after deletion(E1) |
| S4 backups |should|PASS, documentation only|35-day requirement and restore/deletion replay documented; no deployed backup audit |
| P1 retention scale |must|PASS|5,061ms at exact million-row workload |
| P2 audit overhead |must|PASS|1.408089ms added p95 |
| U1 school-readable inventory |must|PASS|Plain-English summary and per-area tables; readability does not validate completeness promises disproved above |
| U2 class history |should|PASS|Existing classHistory query tests actor/action/fields/time and scoping; no finished UI claimed |

Whole-day retention matches the documented policy: day90 retained, day91 removed for a90-day setting. Preserving event bytes and resolving missing text demonstrates preserved replay inputs, not a separate complete tracker replay implementation.

## Errors

### F6-E1 — High/P1: student deletion misses historical class exports

Canonical source: immediate report `Codex-F6-E1-historical-exports-0412b2c.md`. Location: `packages/db/src/privacy.ts:401–415`.

Cleanup selects class_progress exports using **current enrollment only**. Independent ordinary lifecycle: enroll synthetic student, create/register named class-progress export, unenroll, call deleteStudent for the same org. Actual result: exportFiles0; export_job.result_ref unchanged; file retains synthetic name and email. The deletion succeeds and clears the account while leaving that copy.

The harness used a migration-owner connection for synthetic setup/functional lifecycle; it does not establish isolation. Existing separate app-role/API tests provide that evidence. Only its exact synthetic export file was removed afterward. No user data was touched.

**Suggested correction:** retain durable per-export student membership/provenance and remove every containing file regardless of later enrollment. A deliberately chosen/documented conservative wider cleanup may be an alternative. Regression: export → unenrollment/move → deletion → verify file absent and reference cleared; repeat deletion and preserve unrelated-org files. Current membership alone cannot prove absence. Route to the existing unmerged F6 PR, not a duplicate finding.

### F6-E2 — Medium/P2: flattened token field bypasses audit redaction

Locations: `packages/db/src/migrations/0012_privacy.ts:25`,`:223–225`,`:252–253`; mirrored redactor `packages/db/src/privacy.ts:24`.

The audit trigger converts a changed config child named token into the dotted key config.token **before** redaction. The matcher recognizes a bare token through `^token$`, which does not match config.token. Recursive processing cannot recover the original key after its scalar value is flattened.

Independent exported pure-function result, also rerun by the parent:

```text
redactSecrets({config:{token:'synthetic-only'}})
  -> {config:{token:'[redacted]'}}
redactSecrets({'config.token':'synthetic-only'})
  -> {'config.token':'synthetic-only'}
```

The SQL trigger produces that exact dotted-key shape and uses the same pattern. Thus source analysis shows old/new values can enter immutable audit JSON. **No custom SQL/database redaction reproduction was run.** The current teacher UI exposes no top-level token field; this concerns the generic audited JSON configuration/credential handling already exercised by repository fixtures. No real credential was used.

**Suggested correction:** redact while original key boundaries remain available, or match secret leaf names consistently in dotted paths without redacting token-count fields. Regress INSERT/UPDATE/DELETE parity, old and new values, and exact trigger-shaped inputs. Existing nested connector-secret and raw SQL/TypeScript parity tests alone miss this transformation.

### F6-E3 — Low/P3: student export drops stored AI metadata

Location: `packages/db/src/privacy.ts:285–290`. The AI interaction projection omits input_tokens,output_tokens,redacted_at, although those fields are stored and inventoried. They are not represented elsewhere or recoverable from conversation content. Under F7's complete-record promise, this is an export omission.

Evidence is the explicit source projection, not a separate custom-metadata runtime run. Existing tests check selected content/row counts, not all fields. This finding does not request redundant ledger copies or unrelated people's records.

**Suggested correction:** include those nonredundant fields and assert preservation of nondefault counts and nonnull redacted_at. A maintained export-field coverage test should detect future omissions. Alternatively, a narrower export contract must be explicitly approved/documented rather than claiming completeness.

## Suggestions

- Add a bounded concurrent export/delete lifecycle regression when correcting E1. Source has no shared per-student coordination; an in-flight file write may race cleanup. This possibility was **not reproduced** and is not an additional confirmed error.
- Schedule deployment explicitly: scheduleRetention registers the daily pg-boss job, but its test uses a mock and the worker entrypoint only exports the helper. CLI does a real one-off run. No deployed daemon/bootstrap was verified.
- Refresh inventory and migration ordering when F5/F4cx1/F6 eventually integrate. Multiple open branches introduce0012 migrations; do not infer independent branch PASS proves their combined schema.
- Backup expiry/operator procedures are documented requirements, not tested infrastructure. Pseudonymous-event retention follows F6's criteria; this report does not settle a district-specific legal/DPA requirement.

## Artifacts and cleanup

Complete external reports:
- `/home/kevin/codex-qa-2026-10-22/evidence/f6-privacy-0412b2c.md`
- `/home/kevin/codex-qa-2026-10-22/evidence/f6-baseline-0412b2c.md`

Their exact commands and raw outputs are retained alongside:
- f6-delete-history-0412b2c.mjs; f6-delete-history-first-0412b2c.txt; f6-delete-history-result-0412b2c.txt.
- f6-privacy-db-tests-0412b2c.txt; f6-privacy-api-tests-0412b2c.txt.
- f6-retention-functional-0412b2c.txt; f6-p1-0412b2c.txt; f6-p2-0412b2c.txt; f6-root-0412b2c.txt.

Main validation command was `DATABASE_URL=<dedicated disposable DB> pnpm test --disableConsoleIntercept`. Worktrees f6-privacy-0412b2c and f6-baseline-0412b2c remain at the recorded scratch merge: six intentional staged base-integration paths, no unstaged source edits. This is not a clean-HEAD claim.

Dedicated containers codex-qa-f6-privacy-0412b2c(localhost32787) and codex-qa-f6-0412b2c(localhost32786) were stopped and retained. No existing/host database was used. No previously blocked F4 shadow-table or PR13-specific action was retried; ordinary accepted-base UI tests do not certify that historical review.

F6-E1 was pushed immediately due to privacy-deletion importance. Remaining findings are published at completed-review handoff. No implementation fixes, PR comments, task-state changes or merges were made. Current base advanced with plan/report updates after the pinned review; before any later merge, coordinator must verify synchronization, any changed task/schema paths, exact-head CI and actual merge CI. Green baseline cannot override these failed must criteria.
Reviews: F6

# Immediate QA finding: student deletion misses historical class exports

Verdict: **FAIL — confirmed High/P1 F6-F7 and F6-S3 defect.** This is an early finding, not the complete PR review. Remaining baseline/performance checks continue independently. No implementation change or merge is authorized by this report.

PR #20 head: 0412b2cb0230bc269e12ab8015cf11197207f840. Pinned base: 02d7dd7b40982df0d56f2e629acf9a132f857fa0. Tested integrated index tree: 5946597e783c590a6416cfa59c1853c7add3b1c1 after a conflict-free scratch merge. Head itself is not the integrated tree. Independent reviewer and parent both inspected the relevant source and external reproduction harness.

## Errors

### F6-E1 — deleting a former class member leaves their named export intact

Location: packages/db/src/privacy.ts:401–415. deleteStudent builds the class-progress export cleanup set from current enrollment rows only. A class export can outlive a student's enrollment, so this set is incomplete.

An ordinary synthetic lifecycle reproduced the defect in a dedicated disposable database and export directory:

1. Enroll a synthetic student in a class and create a class_progress export containing their synthetic name and email.
2. Remove the enrollment, representing the student leaving that class.
3. Call deleteStudent for that student as the same organization's admin.
4. Observe exportFiles = 0, the export_job.result_ref unchanged, and the file still containing the student's name/email.

Account pseudonymization does not remove that remaining copy. This violates the explicit F7/S3 acceptance requirement and the inventory's promise to remove any export file that could hold the student's name. No claim about legal compliance or actual production disclosure is made; the reproduction uses only synthetic data.

Suggested correction: track which students each export contains independently of current enrollment, and use that durable provenance for deletion. A conservative cleanup policy may also work if its wider file-removal scope is explicitly chosen and documented. Do not rely solely on current memberships. Regress export → unenrollment → student deletion, including repeated deletion and unrelated-org preservation. Coordinate export/deletion concurrency as part of the lifecycle design; no concurrent-race reproduction is claimed here.

## Suggestions

Keep completed/exported-file provenance available for the lifetime of the file. The regression and correction above are mandatory parts of F6-E1, not separate optional work or duplicate fix tasks. F6 remains unmerged; route the correction to its existing PR according to coordinator policy.

## Evidence and urgency

External artifacts under /home/kevin/codex-qa-2026-10-22/evidence/:

- f6-delete-history-0412b2c.mjs: bounded ordinary lifecycle harness; no privilege probe or blocked shadow-table action.
- f6-delete-history-first-0412b2c.txt: first harness attempt failed before the feature call because the synthetic class omitted its required teacher_id. This is a QA fixture error, preserved separately; the corrected synthetic fixture reproduced the implementation defect without changing application code.
- f6-delete-history-result-0412b2c.txt: successful reproduction output retained by the independent reviewer.

Only the exact synthetic export file created by the harness was removed afterward through its store API. No user data was touched. Dedicated QA database cleanup is reported in the completed review.

Publish immediately because a high-priority privacy-deletion defect could otherwise be missed while relying on green CI. Existing passing tests cover current enrollment, not this historical membership case. This finding prevents an all-must PASS regardless of the remaining baseline outcome. A later complete report will reference F6-E1 rather than duplicate it.
