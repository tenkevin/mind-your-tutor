# Codex suggestions waiting for a task's criteria

Not a task to claim (placeholder). The coordinator moves each item into `docs/qa/<ID>.md` as a **should** check when it writes that task's criteria, then strikes it here.

| From | Suggestion | Goes to |
|---|---|---|
| Codex-F1c-tracker.md F1c-S1 | Detect forbidden I/O transitively, in helpers the tracker imports (resolved-import policy plus a guard test where a permitted helper reads a file and the guard must fail) | M1/M3 criteria when their spec exists |
| Codex-F2-ui.md | ~~Cross-browser (Firefox, WebKit), 200% zoom and screen-reader checks on real screens~~ | Routed to T1-U1/U2/U3 |
| Codex-F3-contracts.md F3-S2 | Friendly, located error messages for ClassConfig and CurriculumVersion edits (not raw zod text) | Routed to T3-U3 |
| Codex-F4-database.md | Independent tenant and class CRUD probes beyond the existing suite | F5 QA run (added to the QA prompt), then T-task criteria |
| Codex-F2-ui.md | ~~Shared JS chunk named `jsx-runtime-*`: rename if useful, with a build-artifact check~~ | Routed to T1-U4 |
| F1c independent PR QA, findings 2–7 ([comment](https://github.com/tenkevin/mind-your-tutor/pull/10#issuecomment-6354124154)) | Computed-constructor access, runtime guard scope/async handling, local-time-zone APIs, relative imports, object-URL randomness and future allowed-package dependency coverage; distinguish existing build rejection from actual runtime guarantees | M1/M3 criteria when specified; mandatory finding 1 routed separately to F1d |
| C8 independent review at 4098239 ([saved report](reports/C8.md)) | Keep semantic answer oracles over all original links, including hidden links, and explicit map-link truth wording in future consumers/exports; retain failed and successful timings and isolate performance benchmarks without silently raising limits | C6/C9 and future tooling criteria, before claim |
| Codex-F4cx1-review-3e97696.md | Align guard comment with its actual predicates; retain exhaustive owned-function inventory when auth adds a definer; document forward-only 0012 rollback. No new runtime requirement or permission to rerun blocked probes | Future permitted F4cx1 follow-up before review resumes |
| Codex-C9-review-2ae52d4.md C9-SUG1 | Recheck completed whitespace-only cells when a CSV row becomes the logical header, or document their treatment; preserve headerless Course values and bounded data cells | Future importer criteria; deferred at C9 stop boundary |
| Codex-C9-review-2ae52d4.md | Retain exact benchmark scripts/data hashes, baseline commits, raw samples and environment; distinguish cold/first runs from warmed alternating comparisons | Future tooling/performance criteria |
| Codex-C9-review-2ae52d4.md | Polish the missing-Personas info into two sentences; existing meaning is correct | Future importer usability criteria |
| Codex-C2cx5-review-7dd6511.md | Checker issues name affected ids and fix columns but not source rows; a UI may resolve ids to imported rows | Routed to T2 criteria |
| Codex-F5-review-dc3c902.md S2 | Auth callback used-state and failed-callback limiter are per process (`apps/api/src/routes/auth.ts:57`, `:118`, `limiter.ts`); share or document before multi-process deployment | Deployment / L1 criteria |
| Codex-F6-review-0412b2c.md | Retention job is registered (`scheduleRetention`) but no deployed worker bootstraps it; verify a real daily run | Deployment / L1 criteria |
| Codex-F6-review-0412b2c.md | F5, F4cx1 and F6 each add a `0012` migration: renumber and re-run the inventory on the combined schema; separate branch PASSes don't prove the combination | Coordinator, at each of those merges |
| Codex-F6-review-0412b2c.md | Backup expiry and operator procedures are documented, not tested | Deployment / L1 criteria |
| Codex-C4-review-7623133.md C4-P3 | Parallel imports run 5.07x one import (budget 2x): one batch-size-1 worker. Assert the real budget and add bounded worker concurrency | Worker/scale criteria before L1 |
| Codex-C4-review-7623133.md | `apps/api/src/index.ts` starts `buildServer()` without import dependencies; wire imports and the authenticator into the API bootstrap | Routed to T2 criteria |
| Codex-C6-review-8cc23ab.md | A formula-safe CSV keeps its leading apostrophe on C1 reimport; define a reversible representation (don't strip every apostrophe) | Importer/exporter criteria |
| Codex-C6-review-8cc23ab.md | When an export API exists, enforce org/class authorization before choosing the pack (C6-S2) | Routed to T2-S3 |
| C6 criteria reconciliation | Open the template, pack, data-check and alignment exports in real Excel and Google Sheets (accents, frozen header, formula-like text shown as text) | Manual check by the user, L1 criteria |
| Codex-F6-review-b52d29e.md S1 | Any class-export producer must take the student privacy lock **before** collecting identifying data, then record subjects and write in the same transaction | Next class-export producer criteria (T-tasks / M5) |
| agent-f6 (PR #20, 9583e75) | A class config save writes both F5's summary audit row (`class_config.update`) and F6's field-level row (`class_config.updated`). Pick one convention | T3 criteria (config edits) |
| Claude QA C5 run 1 (PR #23) | The idempotent repeat returns the original publish result even after the state has moved on; the DB guard still allows pinning an archived version (only the API refuses it) | T8 criteria / later hardening |
| Coordinator sync of C5 (838582d) | F6-P2 audit-cost check `privacy.test.ts:484` is timing-flaky under load (10.9 ms vs < 10 ms bar; passes on re-run). Make the measurement robust (more samples, warm-up, median of runs) without raising the bar | F6 follow-up / tooling criteria |
| agent-a1 (PR #28) | C6 export template example row (`packages/connectors/src/reports.ts`) carries a shortened copy of the Ms. Ivy fixture prompt, missing "Praise effort…"; make it match the fixture | Importer/exporter criteria |
| Claude QA A1 run 1 | AI rate limits are in memory per API process; with N replicas the effective limit is N×. Decide whether per-class limits must hold across replicas | Deployment / L1 criteria |
| Claude QA T3 run 1 ([report](reports/T3-run1.md)) | Field-level audit paths from dotted keys are ambiguous; authors who don't teach a class have no UI path to the defaults editor | Later T-task criteria |
| Codex-C5-review-6f43575.md S2 | The default API executable starts `buildServer()` without the optional publish dependencies; wire publish (and imports) into the bootstrap | Deployment / T8 criteria |
| Codex-C5-review-6f43575.md S3 | Keep the D14 label and count: all unique enrolled students in the selected classes, including those without progress or whose progress won't change | T8 criteria |
| agent-m2b, PR #30 ([comment](https://github.com/tenkevin/mind-your-tutor/pull/30#issuecomment-6452862377)) | M2-P1 passed on CI only after `ANALYZE` on the freshly seeded tables. A freshly bulk-loaded production database could stall ingest the same way. Check which ingest queries depend on planner statistics, and whether the deploy or import path should run `ANALYZE` | Deployment / L1 criteria |


## Deferred by the user (2026-10-28)

- **A7 on-device NER accuracy on children's writing.** Measure recall on a realistic set of children's writing (nicknames, misspellings, lower case) and set a bar. Deferred by the user; add to a later privacy task's criteria before the pilot widens. A7's 98.3% is on the builder's own 58-identifier set.
- **A7 model licence.** `gagan3012/bert-tiny-finetuned-ner` states no licence; accepted for now (D33), revisit before release.
- **A3 object-storage files after a class is deleted.** Deleting a class cascades its uploads' rows, passages and embeddings, but the original files in object storage stay until a storage sweep exists (A3 PR #38 decisions). Add a sweep (or delete files with the class) to a later storage/privacy task's criteria. No student PII is involved (D31).
- **M2-P1 is sensitive to a busy database (2026-10-28).** After the A1 sync, CI p95 reached 316–980 ms when earlier test suites left the shared Postgres busy; M2 now waits for autovacuum and CHECKPOINTs before measuring, giving 8.5 ms. The test measures a quiet database, so production ingest under concurrent load (imports, retention deletes) is unmeasured. Add a loaded-database ingest check to S1 or deployment criteria.
- **A6 drafts don't use library passages yet (2026-10-28).** A3 wasn't merged when A6 was built, so drafts use the idea's objective, notes, unit, links and key points. Once A3 merges, add library passages to `draftContext` (A6 PR #42 decisions); put this in A11's or A4's criteria.
