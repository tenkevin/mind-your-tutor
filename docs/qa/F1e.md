# QA criteria: F1e · Make wall-clock tests reliable under CI load without loosening budgets

Done when: every test that asserts elapsed time passes consistently on CI's runners and under a loaded parallel `pnpm test`, with every criteria budget unchanged; a failure names the test and its timings.
Sources: `docs/qa/CXB.md` ("Wall-clock tests fail under full-suite load", 2026-10-28); builder reports from A5 #35, A2 #37, A3 #38 and C12 #44 (2026-10-29: connectors `security.test.ts` "an XLSX with 1,000,000 rows" 2,211 ms vs 2,000 ms; api `policy.test.ts` "adds under 5 ms p95 of auth" 5.4–5.6 ms vs 5 ms; connectors zip-bomb tests; domain derive 2,000 ideas under 1 s; C2cx5 under 50 ms); CI `pnpm test` failures on #43 and #44 with no per-test annotation; M2's approach (wait for a quiet database before measuring); `.github/workflows/ci.yml`. A fix task: must-only.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1e-F1 | must | Inventory | Search every `*.test.ts` for elapsed-time assertions | A list in the PR of each test, its file, its budget and the criteria id it serves; none is missed (QA re-runs the search) |
| F1e-F2 | must | Budgets unchanged | Compare each budget before and after | Every number and comparison is identical; no test is skipped, removed, marked flaky, retried to pass, or given `.skipIf` on CI |
| F1e-F3 | must | Load can't distort them | Read the change | Timing tests run where parallel suites can't steal CPU (for example their own Vitest project or a separate CI step after the main suite, run with one worker), and measure what the budget means: warm-up then median or best of N for latency budgets, CPU time where the criterion is about work done |
| F1e-F4 | must | Consistent locally under load | Run the full CI order (fresh database, `pnpm install`, lint, format:check, typecheck, `pnpm test`, build) 10 times in a row with CPUs limited to 2 (`taskset -c 0,1`) | 10 of 10 pass; the PR lists each run's timings for the inventoried tests |
| F1e-F5 | must | Readable failures | Force one budget to fail locally | The failure names the test and prints the measured and budget times; CI shows it as an annotation |
| F1e-F6 | must | Still catches real slowness | Add an artificial delay that doubles one measured operation | The test fails |
| F1e-F7 | must | Everything passes | Root lint, format:check, typecheck, test with DATABASE_URL (including `function_binding.test.ts`), build, plan check, on the head merged with current `idea-map`; then re-run CI on the exact head twice | All exit 0; CI green on the exact head in both runs |
