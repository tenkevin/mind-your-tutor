# QA coordination status

Routine coordination lives here, in `docs/PLAN.md`, and in `docs/HANDOFF.md`. Fetch `origin/idea-map` and inspect the relevant immutable `Codex-*` reports and `codex-ledger.json` before asking another session for status. This is a snapshot, not a substitute for live PR heads and CI. Only `docs/tasks.json`, updated through `scripts/plan.mjs`, owns task status.

Direct cross-session messages are for urgent findings/actionable blockers, or a startup assignment when an idle reviewer needs to be activated. Do not send repeated acknowledgments or routine status messages. Save detailed reports and evidence in files; batch routine publication, preserving immutable Codex reports. Never infer QA PASS from an agent launch or a builder's own tests.

> **Gate `MD` cleared by the user on 2026-10-23.** Tracing work follows D15–D30 and the §8 spec v1 exactly; see AGENTS.md.

## Queue (snapshot 2026-10-28 04:15 UTC)

Reviewer: **Codex**. A `Codex-*` file reviewing a PR's current head is its QA report. Codex's runner excludes `packages/db/src/function_binding.test.ts`; the coordinator closes any full-suite must locally (Postgres 16 + pgvector, PR synced with current `idea-map`) before merging, as it did for F4cx1, F5 and A1.

**Criteria are ready for every PR below:** each `docs/qa/<ID>.md` exists and the copy on each PR branch matches `idea-map` (checked 2026-10-28 04:15). Review a PR against the criteria version named in its row and its current head. A PR more than 0 behind needs a sync and fresh exact-head CI before merge; a sync that changes no task code keeps a PASS (`git diff <reviewed> <head> -- <task paths>`). Fix tasks (`cx`) merge first.

| Priority | Task / PR | Head | Behind | Criteria (version) | Review history | Next action |
|---|---|---|---|---|---|---|
| 1 | C6cx1 #32 (agent-c6cx1) | `29b23ff` | 36 | `C6cx1.md` (2026-10-27) | None yet | Codex review; then sync and merge |
| 2 | C5cx1 #33 (agent-c5cx1) | `7005308` | 35 | `C5cx1.md` (2026-10-27) | None yet | Codex review; then sync and merge |
| 3 | C5cx2 #34 (agent-c5cx2) | `0c56a73` | 34 | `C5cx2.md` (2026-10-27) | None yet | Codex review; then sync and merge |
| 4 | A2 #37 (agent-a2) | `bea1b71` | 0 | `A2.md` (2026-10-28: A2-S4 per-district flag window, D32) | Synced (one AI setup path: T2's `loadAiConfig(env)` + shared provider/moderation) and Codex's audit suggestion applied with tests (stale view, 4-way concurrent resolve → one audit); CI green | Codex review of `bea1b71` |
| 5 | M2 #30 (agent-m2b) | `97018f5` | 0 | `M2.md` (2026-10-24) | Codex `Codex-M2-integration-38c0782-63855ef.md`: BLOCKED (conflicts). Synced by session_017xAqLf6Rjogb9biR2BjA9c: one backstop (A1's), routes and policies kept. Post-merge CI M2-P1 ran 316–980 ms p95 on a busy shared CI database; fix waits for autovacuum and CHECKPOINTs before measuring (bar unchanged): p95 8.5 ms client / 7.9 ms server on `97018f5` | Codex review of `97018f5` |
| 6 | M3 #31 (agent-m3) | `a022010` | 45 | `M3.md` (2026-10-24) | None yet | Codex review |
| 7 | T2 #27 (agent-t2) | `5caed4d` | 0 | `T2.md` (2026-10-24) | Claude QA run 1 FAIL at `41221d8` ([report](reports/T2-run1.md)); fixes pushed since. Sync session merged `idea-map` at `5caed4d` (CI green; A1 gateway folded into T2's `startServer`, import routes and F5 policies kept; see PR body) | Codex review of `5caed4d` |
| 8 | T3 #29 (agent-t3) | `aa67890` | 0 | `T3.md` (2026-10-24) | Synced (shell holds T3's Course details and T2's Curriculum data; both CSS imports); CI green | Codex review of `aa67890` |
| 9 | A7 #36 (agent-a7) | `cf41793` | 0 | `A7.md` (2026-10-28: A7-F10 ML NER, A7-F11 fails closed, D33) | None yet; builder reports every must plus F8/F9 met locally | Codex review |
| 10 | A5 #35 (agent-a5) | `49be775` | 4 | `A5.md` (2026-10-24; D34 adds no check, baselines are an interim seed) | None yet | Codex review; after A2 merges, the builder replaces the stand-in guardrails with A2's |
| 11 | A3 #38 (agent-a3) | `0ec9c58` | 0 | `A3.md` (2026-10-28: A3-S3 tiered vault and class uploads, D31) | Synced (T2's import tests and every route kept; dev CLI passes the hash embedder); D31 rework included; CI green | Codex review of `0ec9c58` |
| 12 | C6cx2 #39 (agent-c6cx2) | `5b23c8b` | 10 | `C6cx2.md` (2026-10-28) | None yet. Canonical LF on import (`assemblePack`) and on export, so legacy CRLF packs export as a fresh import would store them; lone CR still refused in CSV (C6cx1); LibreOffice matrix run by the builder with ad hoc scripts (no soffice in CI) | Codex review (fix task: merge first) |
| 13 | T8 #40 (agent-t8) | `38ee4a4` | 0 | `T8.md` (2026-10-24) | None yet. New API route `GET /api/curricula/:id/publishing` (F5 policy, in the sweep). **Coordinator change request 2026-10-29, done at `38ee4a4`:** publish routes now wired into `startServer` and `dev/cli.ts`, with `index.test.ts` asserting 401/403 (not 404); rollback offers earlier published versions only (user decision 2026-10-29, T8-F6), and the store refuses newer or current ones. CI green on head; builder's local full suite in CI order passed (function_binding 4/4); not browser-run | Codex review |
| 14 | T6 #41 (agent-t6) | `0223f39` | 2 | `T6.md` (2026-10-24) | None yet. Mapping edits author/admin only; picker options from headers the newest import recorded; server-side paging (100 rows) | Codex review |
| 15 | A6 #42 (agent-a6) | `0b0b1d4` | 1 | `A6.md` (2026-10-24) | None yet. Drafting runs in the API process (holds the key) via an injected writer; bypasses the student rate limiter, bounded by job concurrency 4; new student read route `GET /api/classes/:id/content`; library passages wait for A3 | Codex review |
| 16 | C10 #43 (agent-c10) | `ea9ef53` | 0 | `C10.md` (2026-10-29) | None yet. Fixture Practice rows use a test-only `fixture` bank (production config reports them as errors); D40 columns optional in the parser so the data check blocks publishing with a located error; allow-list via `PRACTICE_SOURCES_FILE`; Practice is tab index 9. Earlier red CI not reproduced (likely timing, F1e) | Codex review |
| 17 | C12 #44 (agent-c12) | `b84777d` | 0 | `C12.md` (2026-10-29, F1 corrected: `layer` sheet-only) | None yet. Uses existing `standard_codes`; `traceTargets` stops at mastered ideas; C3 parity expectations updated for the new fixture. `layer` now sheet-only (not a class override), CI green on `b84777d` | Codex review |
| 18 | **F1e #45 (fix task, merge first)** | `bccb5be` | 0 | `F1e.md` (2026-10-29) | None yet. Serial `pnpm test` (~5.5 min on 2 CPUs); new test-only `@ideamap/testing` best-of-N/median latency helper; no budgets changed, nothing skipped or retried; fixed `imports.test.ts` T2-F5 newest-job race; F1e-F6 (artificial delay on a real test) not run, helper self-tests instead. CI green twice on head; 10/10 loaded local runs | Codex review |

**Built 2026-10-28** in four Sonnet cloud sessions (ids in HANDOFF §roles): A2 #37, A3 #38, A5 #35, A7 #36 (rows 4 and 9–11 above).

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
