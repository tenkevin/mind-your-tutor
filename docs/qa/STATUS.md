# QA coordination status

Routine coordination lives here, in `docs/PLAN.md`, and in `docs/HANDOFF.md`. Fetch `origin/idea-map` and inspect the relevant immutable `Codex-*` reports and `codex-ledger.json` before asking another session for status. This is a snapshot, not a substitute for live PR heads and CI. Only `docs/tasks.json`, updated through `scripts/plan.mjs`, owns task status.

Direct cross-session messages are for urgent findings/actionable blockers, or a startup assignment when an idle reviewer needs to be activated. Do not send repeated acknowledgments or routine status messages. Save detailed reports and evidence in files; batch routine publication, preserving immutable Codex reports. Never infer QA PASS from an agent launch or a builder's own tests.

> **Gate `MD` cleared by the user on 2026-10-23.** Tracing work follows D15–D30 and the §8 spec v1 exactly; see AGENTS.md.

## Queue (snapshot 2026-10-28, `idea-map` at `1d92bf8`)

Reviewer: **Codex**. A `Codex-*` file reviewing a PR's current head is its QA report. Codex's runner excludes `packages/db/src/function_binding.test.ts`; the coordinator closes any full-suite must locally (Postgres 16 + pgvector, PR synced with current `idea-map`) before merging, as it did for F4cx1, F5 and A1.

Every open PR below is CI green and `mergeable_state: clean`, but **behind `idea-map` by A1's application merge** (`438a939`), so each needs a sync and fresh exact-head CI before merge. Fix tasks (`cx`) merge first.

| Priority | Task / PR | Head | Behind | Review history | Next action |
|---|---|---|---|---|---|
| 1 | C6cx1 #32 (agent-c6cx1) | `29b23ff` | 13 | None yet | Codex review; then sync and merge |
| 2 | C5cx1 #33 (agent-c5cx1) | `7005308` | 12 | None yet | Codex review; then sync and merge |
| 3 | C5cx2 #34 (agent-c5cx2) | `0c56a73` | 11 | None yet | Codex review; then sync and merge |
| 4 | M2 #30 (agent-m2b, finished) | `38c0782` | 8 | M2-P1 failed earlier on CI (p95 298–325 ms). Fixed by `ANALYZE` after seeding: CI p95 49 ms, 5,581 events/s (run annotation "M2-P1 report") | Codex re-review of the current head |
| 5 | M3 #31 (agent-m3) | `a022010` | 22 | None yet | Codex review |
| 6 | T2 #27 (agent-t2) | `1afe366` | 18 | Claude QA run 1 FAIL at `41221d8` ([report](reports/T2-run1.md)); fixes pushed since | Codex review of the current head |
| 7 | T3 #29 (agent-t3) | `d25e18d` | 19 | Claude QA run 1 FAIL at `e195f98` ([report](reports/T3-run1.md)); fixes pushed since | Codex review of the current head |
| 8 | A2 #37 (agent-a2) | `f45d60f` | 2 | None yet; builder reports every must met locally, full suite incl. `function_binding.test.ts` | Codex review. Merge **before A5** (A5 swaps in A2's guardrails) and sync A7 after it (both touch `gateway.ts`) |
| 9 | A7 #36 (agent-a7) | `60f0234` | 3 | None yet; builder reports musts plus F8/F9 met locally | Codex review; §12 q12 assumptions are open user decisions |
| 10 | A5 #35 (agent-a5) | `fdd993e` | 2 | None yet | Codex review; after A2 merges, the builder replaces the stand-in guardrails (`packages/ai/src/evals/guardrails.ts`) with A2's |
| 11 | A3 #38 (agent-a3) | `d0863c4` | 2 | None yet. Coordinator flagged A3-S3 (teacher-level FERPA delete of uploads missing) to the builder, 01:30 UTC | Builder fixes A3-S3; then Codex review |

**Built 2026-10-28** in four Sonnet cloud sessions (ids in HANDOFF §roles): A2 #37, A3 #38, A5 #35, A7 #36, rows 8–11 above.

**Builder decisions (2026-10-28), read from the sessions' final replies, which cloud sessions don't send back on their own:**
- **A2:** only the new student message is moderated on input (earlier turns are client-held, as in A1). A `safety_flag` is deleted with its transcript at the district's AI retention period (90-day default, D22/§10). The moderator defaults to the gateway's own model and fails closed. **Settled as D32:** deleted at the retention period, or 30 days after resolution if sooner (new must A2-S4, sent to the builder).
- **A3:** the uploaded original is deleted once its passages are stored. That means a future embedding vendor (§12 q6) can't re-embed without re-upload. **Settled as D31:** materials are kept permanently and never deleted (A3-S3 revised; the FERPA-delete request to the builder is withdrawn). Scanned PDFs are reported as unreadable, not OCR'd. Missing teacher-level FERPA delete (A3-S3) is a must gap, sent back to the builder.
- **A5:** CI replays recorded replies, not the A1 mock model (the mock lives in `apps/api`; A5-F4 allows recorded or mock). Recordings are hand-written; someone with a model key must run `eval:live -- --record`, and every template edit needs a re-record. Uses stand-in guardrails until A2 merges. **D34:** ground truth will be teacher-approved replies (placeholder A5b, §12 q14 open); the hand-written recordings are an interim seed.
- **A7:** recorded in ARCHITECTURE §12 q12 on its branch as assumptions, not settled: the device layer is rules plus word lists behind `EntityRecognizer`; the device never receives the roster. **Settled as D33:** an on-device ML NER model, never a roster on the device (new must A7-F10, sent to the builder). Which model is still open.

**Criteria ready, waiting on merges:** T4, T5, T7 (T3); T6, T8, A6 (T2); A4 (A3, T2); A8 (A7); A9 (A2, M2, A7); M4 (M3); M5, S1 (M2, M3); M6 (M3, A9); M7 (M3); A10 (A9, A5, M6); C7 (S1); S2 (S1, M4); S3 (S2, T4); S4 (S2, A2, A7, A8); L1 (the pilot set). **After the pilot:** X1 and X2 have no criteria yet.

## Recent completions

| Task | PR | Merge | Evidence |
|---|---|---|---|
| A1 | #28 | `438a939` (done `6d573f0`) | Codex scoped PASS at `070cb66` plus the coordinator's A1-F9 full-suite run, `function_binding.test.ts` 4/4: [report](reports/A1.md). A1 QA suggestions went to A7-F8/F9 (`bd3dc97`) and CXB |
| C5 | #23 | `956c515` | [report](reports/C5.md); Codex C5 errors became C5cx1 and C5cx2 |
| S5 | #26 | `5325cb3` | [report](reports/S5.md) |
| C6 | #21 | `3715aa6` | [report](reports/C6.md); Codex C6-E4 became C6cx1 |
| M1 | #25 | `7ebd9fe` | [report](reports/M1.md) |
| T1 | #24 | `1e87d66` | [report](reports/T1.md) |

Older completions (F-, C1–C4, C8, C9 and fix tasks) have reports in `reports/`, and their history is in git (`git log -- docs/qa/STATUS.md`).

## Retained branches

`wip/M2-ingest-perf` and `wip/M2-one-statement` stay (user, 2026-10-27). They hold earlier M2 performance experiments; the root cause turned out to be missing planner statistics, not Docker's port proxy.

## Policy update (user, 2026-10-24)

- **Claude QA pauses after the current runs.** Independent Claude QA finishes on A1 (#28), T2 (#27) and T3 (#29). No new Claude QA sessions after that. From Monday, Codex reviews PRs and merged work; a Codex file reviewing a PR's current head is its QA report for the integration gate. PRs opened before then (M2 #30, M3) wait for Codex.
- **Cheaper models for new sessions.** Builders use Sonnet for everyday implementation. Haiku is for high-volume, classification, triage and fast sub-agent work. Sessions already running keep their model until they finish.
- **Question 13 settled as D30:** feedback teaching events carry the acting teacher's pseudonymous id, used so each teacher's labelled examples weigh equally. Built in A9 (criteria A9-F7, A9-F8, A9-S4).
