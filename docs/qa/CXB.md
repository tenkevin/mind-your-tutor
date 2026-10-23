# Codex suggestions waiting for a task's criteria

Not a task to claim (placeholder). The coordinator moves each item into `docs/qa/<ID>.md` as a **should** check when it writes that task's criteria, then strikes it here.

| From | Suggestion | Goes to |
|---|---|---|
| Codex-F1c-tracker.md F1c-S1 | Detect forbidden I/O transitively, in helpers the tracker imports (resolved-import policy plus a guard test where a permitted helper reads a file and the guard must fail) | M1/M3 criteria when their spec exists |
| Codex-F2-ui.md | ~~Cross-browser (Firefox, WebKit), 200% zoom and screen-reader checks on real screens~~ | Routed to T1-U1/U2/U3 |
| Codex-F3-contracts.md F3-S2 | Friendly, located error messages for ClassConfig and CurriculumVersion edits (not raw zod text) | T3 criteria |
| Codex-F4-database.md | Independent tenant and class CRUD probes beyond the existing suite | F5 QA run (added to the QA prompt), then T-task criteria |
| Codex-F2-ui.md | ~~Shared JS chunk named `jsx-runtime-*`: rename if useful, with a build-artifact check~~ | Routed to T1-U4 |
| F1c independent PR QA, findings 2–7 ([comment](https://github.com/tenkevin/mind-your-tutor/pull/10#issuecomment-6354124154)) | Computed-constructor access, runtime guard scope/async handling, local-time-zone APIs, relative imports, object-URL randomness and future allowed-package dependency coverage; distinguish existing build rejection from actual runtime guarantees | M1/M3 criteria when specified; mandatory finding 1 routed separately to F1d |
| C8 independent review at 4098239 ([saved report](reports/C8.md)) | Keep semantic answer oracles over all original links, including hidden links, and explicit map-link truth wording in future consumers/exports; retain failed and successful timings and isolate performance benchmarks without silently raising limits | C6/C9 and future tooling criteria, before claim |
| Codex-F4cx1-review-3e97696.md | Align guard comment with its actual predicates; retain exhaustive owned-function inventory when auth adds a definer; document forward-only 0012 rollback. No new runtime requirement or permission to rerun blocked probes | Future permitted F4cx1 follow-up before review resumes |
| Codex-C9-review-2ae52d4.md C9-SUG1 | Recheck completed whitespace-only cells when a CSV row becomes the logical header, or document their treatment; preserve headerless Course values and bounded data cells | Future importer criteria; deferred at C9 stop boundary |
| Codex-C9-review-2ae52d4.md | Retain exact benchmark scripts/data hashes, baseline commits, raw samples and environment; distinguish cold/first runs from warmed alternating comparisons | Future tooling/performance criteria |
| Codex-C9-review-2ae52d4.md | Polish the missing-Personas info into two sentences; existing meaning is correct | Future importer usability criteria |
| Codex-C2cx5-review-7dd6511.md | Checker issues name affected ids and fix columns but not source rows; a UI may resolve ids to imported rows | T2 criteria |
| Codex-F5-review-dc3c902.md S2 | Auth callback used-state and failed-callback limiter are per process (`apps/api/src/routes/auth.ts:57`, `:118`, `limiter.ts`); share or document before multi-process deployment | Deployment / L1 criteria |
| Codex-F6-review-0412b2c.md | Retention job is registered (`scheduleRetention`) but no deployed worker bootstraps it; verify a real daily run | Deployment / L1 criteria |
| Codex-F6-review-0412b2c.md | F5, F4cx1 and F6 each add a `0012` migration: renumber and re-run the inventory on the combined schema; separate branch PASSes don't prove the combination | Coordinator, at each of those merges |
| Codex-F6-review-0412b2c.md | Backup expiry and operator procedures are documented, not tested | Deployment / L1 criteria |
| Codex-C4-review-7623133.md C4-P3 | Parallel imports run 5.07x one import (budget 2x): one batch-size-1 worker. Assert the real budget and add bounded worker concurrency | Worker/scale criteria before L1 |
| Codex-C4-review-7623133.md | `apps/api/src/index.ts` starts `buildServer()` without import dependencies; wire imports and the authenticator into the API bootstrap | T2 criteria |
| Codex-C6-review-8cc23ab.md | A formula-safe CSV keeps its leading apostrophe on C1 reimport; define a reversible representation (don't strip every apostrophe) | Importer/exporter criteria |
| Codex-C6-review-8cc23ab.md | When an export API exists, enforce org/class authorization before choosing the pack (C6-S2) | T2/T-task criteria |
| C6 criteria reconciliation | Open the template, pack, data-check and alignment exports in real Excel and Google Sheets (accents, frozen header, formula-like text shown as text) | Manual check by the user, L1 criteria |
