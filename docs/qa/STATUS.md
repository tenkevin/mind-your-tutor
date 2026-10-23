# QA coordination status

Routine coordination lives here, in `docs/PLAN.md`, and in `docs/HANDOFF.md`. Fetch `origin/idea-map` and inspect the relevant immutable `Codex-*` reports and `codex-ledger.json` before asking another session for status. This is a snapshot, not a substitute for live PR heads and CI. Only `docs/tasks.json`, updated through `scripts/plan.mjs`, owns task status.

Direct cross-session messages are for urgent findings/actionable blockers, or a startup assignment when an idle reviewer needs to be activated. Do not send repeated acknowledgments or routine status messages. Save detailed reports and evidence in files; batch routine publication, preserving immutable Codex reports. Never infer QA PASS from an agent launch or a builder's own tests.

## Queue

**Stop boundary:** user requested “After C9, stop.” C9 is the final task to complete through independent QA and verified merge. Finish current F1d review/F5 integration to handoff only; do not start new C2cx5/F5 reviews or follow-on implementation.

| Task / PR | Evidence and state | Next action / owner |
|---|---|---|
| F4cx3 / #14 | Merged at `3f4d845`; independent premerge PASS and actual merge CI/plan both green. Saved [completion report](reports/F4cx3.md). | Complete; coordinator marked done. |
| F4b / #12 | Independent QA PASS on `252f5fa`, DB 161/161; carried to `8e8f58c` after empty task-path diff and green CI. Merged at `fbb453d`. | Actual merge CI/plan green; completion recorded in [F4b report](reports/F4b.md). Local independent report: `/home/kevin/codex-qa-2026-10-22/reports/Codex-F4b-review-252f5fa.md`. |
| C1cx1 + C1 / #8 | Independent PASS; merged at `649f46a` after unchanged-code verification and exact-head CI. Actual merge CI/plan green; both tasks done. [Combined completion report](reports/C1.md). | C9 claimed after user authorized moving on from the isolated review blockage. C4 also needs C2cx5. |
| F2cx1 / #13 | Synchronized head `c7883aa`; no UI changes during synchronization. Builder browser measurements pass, but independent review did not run. | **Unverified:** delegated QA turn failed with automated cybersecurity-risk block. Do not treat builder results as independent QA or retry/reroute the blocked review. Evidence: `/home/kevin/codex-qa-2026-10-22/evidence/pr13-review-launch-block.md`. |
| C8 / #11 | Independent PASS on `4098239`, including DB 161/161; carried to `1ddf542` with empty task diff and green CI. Merged at `9269dd2`. First derive timing failure and successful unchanged retry retained in independent report. | Actual merge CI/plan green; marked done, [completion report](reports/C8.md). C2cx5 is claimed for the issue-storage correction. |
| F1c / #10 | Merged at `834a340`; actual merge CI/plan green. [Completion and independent report](reports/F1c.md). | Done. Mandatory ambient-global/process follow-up remains [F1d](F1d.md), now claimed by codex-f1d; M3 depends on it. |
| F5 / #15 | Integration frozen at `a827f1c12db0c21bba21a29f288847c24331f4aa`, base `738b4f8`. Local full checks, DB 165/API 65, and exact-head CI passed. Includes landed 0011 isolation then auth 0012; no blocked PR17 code/tests. | Parked for later current-base synchronization and independent QA. Evidence: `/home/kevin/coordinator-takeover-2026-10-22/F5-integration-handoff-a827f1c.md`. |
| F4cx1 / #17 | **QA coverage blocked:** latest synchronized head `3e97696` CI green, but required dynamic shadow-table tests repeat probes stopped by the original automated security-filter interruption (Codex-F4-database.md). | Keep unverified. Independent reviewer cannot certify F1/F2/F4/S1 or full-suite F5; source/permitted evidence only. Do not rerun or delegate the blocked tests through another path; builder/CI results are not independent PASS. |
| C2cx5 / #18 | Builder complete at `4762bf0d8e2d32e42e9b9604dbd793fcd7258747`: contracts 212, domain 94, connectors 101, DB 161; root checks passed. No migration changed; import level is derived consistently from severity. | Exact-head CI passed. Independent review deferred by the C9 stop boundary; future current-base synchronization required before merge. |
| F1d / #16 | Fresh independent all-must PASS at `0dd326d` + base `738b4f8`, integrated tree `76e6f81`; 210 ambient cases, tracker 172, DB 161. Published [report](codex/Codex-F1d-review-0dd326d.md). Current remote head `a56c820` is a metadata-only synchronization. | Parked unmerged at the user C9-only stopping boundary; future merge requires latest-base synchronization and exact-head CI. |
| C9 | Claimed by codex-c9 on verified importer base; existing D12/D13 and written C9 criteria govern the work. | Luna `/root/c1_memory_fix` to build in `/home/kevin/coordinator-worktrees/c9`; no new product decisions. |

## Reviewer and builder boundaries

- Coordinator: Codex thread `01a1662b-d926-7331-be84-5327b29f9d3e`; owns claims, criteria, routing, integration checks and merges.
- Independent QA coordinator: Codex thread `01a165ed-292f-7d71-8826-a8193dd72a3e`; owns independent evidence and new immutable reports, not implementation or task-state changes.
- C9 primary builder: local Luna agent `/root/c1_memory_fix`, worktree `/home/kevin/coordinator-worktrees/c9`; earlier C1cx1 and F1d work is handed off.
- C9 persona component: local Luna agent `/root/f2_ci_fix`, worktree `/home/kevin/coordinator-worktrees/c9-personas`; commit `06263e4` handed to primary builder. Its C2cx5 work is frozen at the head above.

## Pending design clarification

C5's affected-student count is not defined precisely in architecture §7. The user has been asked whether it means all enrolled students in selected classes or only students whose recorded progress changes; see architecture §12. C5 criteria remain a local draft pending this clarification. This does not block the urgent fix queue.
