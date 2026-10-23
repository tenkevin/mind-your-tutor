Reviews: C1

# Codex C1: importer QA

Reviewed commit: `600c5a3813b5ecd9ecce05974dd1cba0bc0f8c12`.
Review date: 2026-10-22. Independent Sol-medium QA, followed by coordinator review. Node 22.22.0 / pnpm 10.28.0. This is the initial pinned-commit review, not a rerun against later commits. Publication context was inspected at `92963ed9bee24c3451c8d081885bb723320906ba`. No implementation changes or task-status changes were made.

Routing: only entries under **Errors** are proposed must-fix defects. **Suggestions** are nonblocking follow-ups. IDs below identify findings, not newly claimed plan tasks. Check overlapping C8/C9 work before scheduling duplicate fixes.

## Validation and limits

**Verdict: executable local checks PASS on the reviewed head.** Build/test/lint/format/typecheck pass; 97 connector tests, 205 contracts tests; production vulnerability audit clean. Independent JSON/CSV/XLSX equivalence, mappings, skip/block locations, ZIP/XXE cases and timezone/percent tests pass.

Real styled XLSX 0.7 becomes 70 and due_date stays 2026-10-30 in UTC, Pacific/Auckland and America/Los_Angeles. Large-workbook targeted test 575 ms; maximum process RSS 137124 KiB (~134 MiB), not aggregate process-tree memory. Existing suite additionally covers large/bomb/macro/entity/path inputs.

**Newer head noted, not yet tested:** publication inspection found PR #8 at `9ce1018f853dab10157b614e92821eb8ffb9cc9d`, with build/check SUCCESS. Thus the initial reviewed head's zero-check-runs observation is historical, not a current CI error. The old architecture-document merge conflict is also historical and must be checked against the newer head before action.

## Errors

No new importer implementation error confirmed in this run. Do not create a task for historical missing CI; the newer head has green checks but has not received this independent runtime audit yet.

## Suggestions

- Keep importer regressions for percent formats, bare-fraction warnings, timezone dates, caps, format equivalence and row locations: these successfully close earlier contract-boundary concerns.
- URL credentials remain accepted: route the shared recommendation to **F3-S5**, adding importer coverage when the validator changes.
- Missing idea objectives intentionally pass row parsing; the absent downstream warning is **C2-E3**, not a separate importer bug.
- Reconcile D12/D13 and **C9** before judging blank unit objectives/questions or built-in persona storage. These decisions postdate the tested commit.
- Production audit passed; maintainer activity was not independently researched.

## Coordinator assessment

This was the strongest end-to-end boundary in the review: hostile file handling and realistic spreadsheet normalization were covered well. The newer C1 commit still needs an independent follow-up audit; green CI alone does not carry over this result.
