# QA coordination status

Routine coordination lives here, in `docs/PLAN.md`, and in `docs/HANDOFF.md`. Fetch `origin/idea-map` and inspect the relevant immutable `Codex-*` reports and `codex-ledger.json` before asking another session for status. This is a snapshot, not a substitute for live PR heads and CI. Only `docs/tasks.json`, updated through `scripts/plan.mjs`, owns task status.

Direct cross-session messages are for urgent findings/actionable blockers, or a startup assignment when an idle reviewer needs to be activated. Do not send repeated acknowledgments or routine status messages. Save detailed reports and evidence in files; batch routine publication, preserving immutable Codex reports. Never infer QA PASS from an agent launch or a builder's own tests.

## Queue

## Monday QA queue (as of 2026-10-23 17:00 UTC)

Merged since resume, with QA: F1d, C2cx5, F2cx1 (waived), F4cx1, C4, F5 (`ab906a1`).

**Needs independent QA, highest priority first:**
1. **F6 #20.** agent-f6 is re-integrating with F5: privacy routes moving into F5's policy registry, migrations 0014_auth + 0015_privacy, and an inventory covering F5's tables. Review the new head when it's pushed; the earlier F6 checks passed on d498f5c.
2. **T1** (PR pending, agent-t1): the teacher shell; unlocks T2 and T3.
3. **C5 #23** at `6f43575`: first run; criteria in docs/qa/C5.md (D14 count).
4. **C6 #21** at `750a50b`: re-run after the C6-E1/E2/E3 fixes; C6-F7 reconciled.

Coordinator note: Codex's runner excludes `function_binding.test.ts`. The coordinator closes that gate locally (Postgres 16 + pgvector) before merging, as it did for F4cx1 and F5.

**Criteria ready, waiting on merges:** A1 (F6), T2 (T1), T3 (T1), T4 (T3), T5 (T3), T6 (T2), T7 (T3, A1), T8 (T2, C5), A2 (A1), A5 (A1).
**Blocked on a human spec:** M1–M5 (ARCHITECTURE §8.6); S1–S4 and C7 wait on them.

**Resumed 2026-10-23 03:00 UTC.** Since resume:
- F1d #16 merged `d040362` (independent PASS on 0dd326d, carried through idea-map-only merges).
- C2cx5 #18 merged `1e0e348` (Codex PASS on 7dd6511; reports/C2cx5.md).
- F5 #15: Codex FAIL F5-U3 / F5-E1 (replay drops unsaved edits; reports/F5-run1.md), sent to agent-f5 (session_01AYeTudGSKkBJvcQNYGhdaK, currently waiting on a user permission prompt).
- F4cx1 #17: still UNVERIFIED (shadow-table probes not run by the reviewer); merge blocked, decision with the user.
- F2cx1 #13: QA waived by the user; merges once synced and CI green.
- Started: C4 (session_01P6h1XLCiwhqAA3bZfrZ1vc), C6 (session_01LLC8sn3PT6WN32yeD5MBbG); F6 asked to resume (session_013Z7VfQwMGUwAwFob4Ra6U1).
The table below is the pre-resume snapshot.

| Task / PR | Evidence and state | Next action / owner |
|---|---|---|
| F4cx3 / #14 | Merged at `3f4d845`; independent premerge PASS and actual merge CI/plan both green. Saved [completion report](reports/F4cx3.md). | Complete; coordinator marked done. |
| F4b / #12 | Independent QA PASS on `252f5fa`, DB 161/161; carried to `8e8f58c` after empty task-path diff and green CI. Merged at `fbb453d`. | Actual merge CI/plan green; completion recorded in [F4b report](reports/F4b.md). Local independent report: `/home/kevin/codex-qa-2026-10-22/reports/Codex-F4b-review-252f5fa.md`. |
| C1cx1 + C1 / #8 | Independent PASS; merged at `649f46a` after unchanged-code verification and exact-head CI. Actual merge CI/plan green; both tasks done. [Combined completion report](reports/C1.md). | Complete; C9 is also done. C4 remains deferred and also needs C2cx5. |
| F2cx1 / #13 | Frozen head `c7883aa53bf1ece835d9725ed5c8a40665d831bb`; no UI changes during synchronization. Builder browser measurements pass, but independent review did not run. | **Unverified:** delegated QA turn failed with automated cybersecurity-risk block. Do not treat builder results as independent QA or retry/reroute the blocked review. Evidence: `/home/kevin/codex-qa-2026-10-22/evidence/pr13-review-launch-block.md`. |
| C8 / #11 | Independent PASS on `4098239`, including DB 161/161; carried to `1ddf542` with empty task diff and green CI. Merged at `9269dd2`. First derive timing failure and successful unchanged retry retained in independent report. | Actual merge CI/plan green; marked done, [completion report](reports/C8.md). C2cx5 PR #18 is parked pending independent QA. |
| F1c / #10 | Merged at `834a340`; actual merge CI/plan green. [Completion and independent report](reports/F1c.md). | Done. Mandatory ambient-global/process follow-up remains [F1d](F1d.md), independently passing but unmerged at PR #16; M3 depends on it. |
| F5 / #15 | Integration frozen at `a827f1c12db0c21bba21a29f288847c24331f4aa`, base `738b4f8`. Local full checks, DB 165/API 65, and exact-head CI passed. Includes landed 0011 isolation then auth 0012; no blocked PR17 code/tests. | Parked for later current-base synchronization and independent QA. Evidence: `/home/kevin/coordinator-takeover-2026-10-22/F5-integration-handoff-a827f1c.md`. |
| F4cx1 / #17 | **QA coverage blocked:** frozen head `3e97696f49816aa9a487d9efbc1fca2acbf6381a` CI green, but required dynamic shadow-table tests repeat probes stopped by the original automated security-filter interruption (Codex-F4-database.md). | Keep unverified. Independent reviewer cannot certify F1/F2/F4/S1 or full-suite F5; source/permitted evidence only. Do not rerun or delegate the blocked tests through another path; builder/CI results are not independent PASS. |
| C2cx5 / #18 | Builder complete at `4762bf0d8e2d32e42e9b9604dbd793fcd7258747`: contracts 212, domain 94, connectors 101, DB 161; root checks passed. No migration changed; import level is derived consistently from severity. | Exact-head CI passed. Independent review deferred by the C9 stop boundary; future current-base synchronization required before merge. |
| F1d / #16 | Fresh independent all-must PASS at `0dd326d` + base `738b4f8`, integrated tree `76e6f81`; 210 ambient cases, tracker 172, DB 161. Published [report](codex/Codex-F1d-review-0dd326d.md). Frozen remote head `a56c820225f4d7bac77f893f9019279c4f88ea7f` is a metadata-only synchronization. | Parked unmerged at the user C9-only stopping boundary; future merge requires latest-base synchronization and exact-head CI. |
| C9 / #19 | Independent all-must PASS on `2ae52d4`, final head `79e4494`; merged `73feaab` with actual build/plan green. Full root checks/DB 161 pass. [Completion report](reports/C9.md). | Done; coordinator stopped. Suggestions deferred in CXB. |

## Reviewer and builder boundaries

- Coordinator: Codex thread `01a1662b-d926-7331-be84-5327b29f9d3e`; owns claims, criteria, routing, integration checks and merges.
- Independent QA coordinator: Codex thread `01a165ed-292f-7d71-8826-a8193dd72a3e`; owns independent evidence and new immutable reports, not implementation or task-state changes.
- C9 primary builder (completed/stopped): local Luna agent `/root/c1_memory_fix`, worktree `/home/kevin/coordinator-worktrees/c9`; earlier C1cx1 and F1d work is handed off.
- C9 persona component (completed/stopped): local Luna agent `/root/f2_ci_fix`, worktree `/home/kevin/coordinator-worktrees/c9-personas`; component and null-default follow-up merged with C9. Its C2cx5 work is frozen at the head above.

## Pending design clarification

C5's affected-student count is not defined precisely in architecture §7. The user has been asked whether it means all enrolled students in selected classes or only students whose recorded progress changes; see architecture §12. C5 criteria remain a local draft pending this clarification. It remains deferred; no task is being started while coordination is stopped.

## C9 performance evidence clarification

The builder withdrew its unsubstantiated C2 6.12ms-versus-9.3ms comparison. Independent paired same-input measurements preserve the 10% regression budget; [C9-P1](C9.md) documents the method and required historical-input limitation. Independent full-suite verdict is PASS; historical comparison remains unverified as recorded in the immutable report.

## Resume contract

Follow `AGENTS.md` stop/resume protocol. A future explicit resume requires live branch/CI checks, reconciliation of F6 ownership, and current-base synchronization of parked PRs before any merge. Ready/dependent tasks and historical claims are not active assignments. Routine updates remain document-first; the QA coordinator is idle and should receive a startup message only for an authorized concrete review.
