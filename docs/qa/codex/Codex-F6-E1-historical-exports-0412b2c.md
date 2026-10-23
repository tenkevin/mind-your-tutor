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
