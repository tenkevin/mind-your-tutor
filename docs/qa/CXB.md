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
