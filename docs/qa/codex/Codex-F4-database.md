Reviews: F4

# Codex F4: database integrity

Reviewed commit: `8d951bc67ac65c9400a71f7d453edbade3d13e6f`.
Review date: 2026-10-22. Independent Sol-medium QA, followed by coordinator review. Node 22.22.0 / pnpm 10.28.0. This is the initial pinned-commit review, not a rerun against later commits. Publication context was inspected at `92963ed9bee24c3451c8d081885bb723320906ba`. No implementation changes or task-status changes were made.

Routing: only entries under **Errors** are proposed must-fix defects. **Suggestions** are nonblocking follow-ups. IDs below identify findings, not newly claimed plan tasks. Check overlapping C8/C9 work before scheduling duplicate fixes.

## Validation and limits

**Verdict: FAIL.** Existing 142 DB tests pass; exact-head build/check CI passed. Independent tests used a disposable pgvector/Postgres 16 container, synthetic rows, and `SET LOCAL ROLE ideamap_app`; `current_user` confirmed the app role. Migrate up 375 ms, repeat up no-op 62 ms, reset 319 ms. Existing large-data tests passed with 1M events and 10k chunks. These suite passes do not detect the errors below.

Further database security probes stopped after an automated security-filter interruption. Both errors below were already reproduced; the coordinator independently reran E1 and inspected E2's completed reproduction and source. No production database was touched. This task head was still current at publication-context inspection.

## Errors

### F4-E1 — High: temporary-table shadowing bypasses event uniqueness

Source: [0008_tracker.ts at reviewed commit](https://github.com/tenkevin/mind-your-tutor/blob/8d951bc67ac65c9400a71f7d453edbade3d13e6f/packages/db/src/migrations/0008_tracker.ts#L65), especially the unqualified ledger reference at line 69.

Reproduction: create valid synthetic organization/student/class/version rows. In a transaction, switch to `ideamap_app` and set `app.org_id`. Create a temporary `interaction_event_key(id text, org_id uuid, student_id uuid, seq bigint, recorded_at timestamptz)`. Insert two rows into **public.interaction_event** using the same valid event ID and student/seq. Roll back.

Actual: current_user is ideamap_app, duplicate group count is **2**, and **public.interaction_event_key is empty**. Expected: the second insertion is rejected. The trigger writes into the temporary ledger, bypassing the real uniqueness constraints. This is a mandatory F4-F4 failure affecting replay/deduplication.

Suggested correction: schema-qualify the ledger and other security-sensitive relation references; use a deliberate safe function search_path. Review TEMP privileges as defense in depth, not a replacement for correct binding.

Regression: under the app role, reject duplicate IDs and student/seq in both ordinary and same-name-temp-table sessions, including across month partitions.

### F4-E2 — High: an empty temporary version table bypasses the draft-pin guard

Source: [0007_classes.ts at reviewed commit](https://github.com/tenkevin/mind-your-tutor/blob/8d951bc67ac65c9400a71f7d453edbade3d13e6f/packages/db/src/migrations/0007_classes.ts#L40), `app.guard_class_pin()`.

Reproduction: create a real draft version. In an app-role transaction with org context, create an empty temporary `curriculum_version(id uuid, status text)`, then set a real class's pinned_version_id to that draft in **public.class**. Roll back.

Actual: update succeeds and read-back pin equals the draft ID. Expected: D2 forbids pinning drafts. The unqualified lookup returns NULL from the empty shadow table; `= 'draft'` does not reject it. The real foreign key checks identity/curriculum, not publication status.

Suggested correction: qualify the real version relation and fail closed for missing/ineligible states. Preserve documented published/archived behavior.

Regression: attempts to pin a real draft fail with normal, empty-shadow, and fake-published-shadow lookup conditions; legitimate pins and tenant/curriculum constraints still work.

## Suggestions

- Review database TEMP permission and unqualified relations as one shared hardening concern; do not count TEMP permission as a third high-severity error.
- Extend independent tenant/class CRUD and performance-plan checks beyond the existing suite. Local throughput threshold success is not an independent CI throughput measurement.
- Current head already contains D11 upload/chunk class scoping; its app-role tests pass. Do not reopen the old org-only upload finding from an earlier F4 commit.

## Coordinator assessment

Both errors are confirmed and need correction before relying on these DB integrity guarantees. The rest of the schema/migration foundation tested well. This report does not claim exhaustive security coverage.
