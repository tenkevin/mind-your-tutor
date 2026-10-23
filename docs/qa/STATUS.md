# QA coordination status

Routine coordination lives here, in `docs/PLAN.md`, and in `docs/HANDOFF.md`. Fetch `origin/idea-map` and inspect the relevant immutable `Codex-*` reports and `codex-ledger.json` before asking another session for status. This is a snapshot, not a substitute for live PR heads and CI. Only `docs/tasks.json`, updated through `scripts/plan.mjs`, owns task status.

Direct cross-session messages are for urgent findings/actionable blockers, or a startup assignment when an idle reviewer needs to be activated. Do not send repeated acknowledgments or routine status messages. Save detailed reports and evidence in files; batch routine publication, preserving immutable Codex reports. Never infer QA PASS from an agent launch or a builder's own tests.

## Queue

| Task / PR | Evidence and state | Next action / owner |
|---|---|---|
| F4cx3 / #14 | Merged at `3f4d845`; independent premerge PASS and actual merge CI/plan both green. Saved [completion report](reports/F4cx3.md). | Complete; coordinator marked done. |
| F4b / #12 | Independent QA PASS on `252f5fa`, DB 161/161; carried to `8e8f58c` after empty task-path diff and green CI. Merged at `fbb453d`. | Actual merge CI/plan green; completion recorded in [F4b report](reports/F4b.md). Local independent report: `/home/kevin/codex-qa-2026-10-22/reports/Codex-F4b-review-252f5fa.md`. |
| C1cx1 + C1 / #8 | Independent PASS on integrated tree `f6aed92` (head `0ef9072` + base `9269dd2`): 101 importer and 161 DB tests, bounded crash regressions pass. Report: `/home/kevin/codex-qa-2026-10-22/reports/Codex-C1-C1cx1-review-0ef9072.md`. | Coordinator synchronizes current base, verifies unchanged task code and exact-head CI, merges once, then checks actual merge CI before marking both done. |
| F2cx1 / #13 | Synchronized head `c7883aa`; no UI changes during synchronization. Builder browser measurements pass, but independent review did not run. | **Unverified:** delegated QA turn failed with automated cybersecurity-risk block. Do not treat builder results as independent QA or retry/reroute the blocked review. Evidence: `/home/kevin/codex-qa-2026-10-22/evidence/pr13-review-launch-block.md`. |
| C8 / #11 | Independent PASS on `4098239`, including DB 161/161; carried to `1ddf542` with empty task diff and green CI. Merged at `9269dd2`. First derive timing failure and successful unchanged retry retained in independent report. | Actual merge CI/plan green; marked done, [completion report](reports/C8.md). C2cx5 is claimed for the issue-storage correction. |
| F1c / #10 | Merged at `834a340`; actual merge CI/plan green. [Completion and independent report](reports/F1c.md). | Done. Mandatory ambient-global/process follow-up remains [F1d](F1d.md), now claimed by codex-f1d; M3 depends on it. |
| F5 / #15 | Open; no independent completion report recorded here. | Independent QA after urgent fixes; apply F5 criteria and scoped tenant/class checks. |
| F4cx1 / #17 | Builder candidate `c6f069448fd21df9c2e1591d6545f8fb58d0bbc7`; check green and build pending when sampled. | Builder finishing validation; then independent QA after exact-head CI green. |
| C2cx5 | Claimed by codex-c2cx5 after verified C8 completion. | Luna-high `/root/f2_ci_fix` implements existing criteria in `/home/kevin/coordinator-worktrees/c2cx5`; independent QA required. |
| F1d / #16 | Builder complete at `5b8e9262044c3e889f5b01b10528b3f45dea368e`; integrated checks passed, tracker 168/168 and DB 161/161; exact-head build/check green. | Next independent QA assignment. Builder evidence `/tmp/f1d-integrated-*.log`; no independent approval yet. |

## Reviewer and builder boundaries

- Coordinator: Codex thread `01a1662b-d926-7331-be84-5327b29f9d3e`; owns claims, criteria, routing, integration checks and merges.
- Independent QA coordinator: Codex thread `01a165ed-292f-7d71-8826-a8193dd72a3e`; owns independent evidence and new immutable reports, not implementation or task-state changes.
- C1cx1 builder: local agent `/root/c1_memory_fix`, worktree `/home/kevin/coordinator-worktrees/c1cx1`; updates the existing `task/C1-import` branch.
- F2cx1 integration is complete; its builder has finished the separate T1 criteria draft. [T1 criteria](T1.md) are published before the task is claimable.

## Pending design clarification

C5's affected-student count is not defined precisely in architecture §7. The user has been asked whether it means all enrolled students in selected classes or only students whose recorded progress changes; see architecture §12. C5 criteria remain a local draft pending this clarification. This does not block the urgent fix queue.
