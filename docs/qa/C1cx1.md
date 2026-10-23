# QA criteria: C1cx1 · Bound CSV and ZIP parser memory (C1-E1)

Done when: PR #8 safely refuses the malicious archive families in C1-E1 without process death, preserves normal imports, and passes independent QA. This follow-up is delivered on the existing unmerged C1 PR; C1 cannot merge while it fails.

Source: `docs/qa/codex/Codex-C1-S2-reconciliation-9ce1018.md`, C1-S2 and C1-P3, and the Curriculum Pack spec. One fix task covers both archive variants.

> C1-E1 — High: small ZIP uploads exhaust process memory before limits or duplicate-tab errors are returned

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C1cx1-F1 | must | Normal imports remain equivalent | Run C1 CSV/ZIP/XLSX/JSON fixture equivalence plus quoted, doubled-quote, BOM, CRLF and multiline CSV cases | Existing expected packs and cell values preserved |
| C1cx1-F2 | must | Both archive families return a result | Reproduce eight distinct tab entries with 10 MiB single cells and 100 duplicate `partN/Ideas.csv` entries with 1 MiB cells using the published bounded reproduction | Clear refusal/result, normal process exit, no OOM or timeout; duplicate input is rejected before parsing duplicate contents |
| C1cx1-F3 | must | Integrated checks pass | On the candidate containing current idea-map, run root lint, format, typecheck, build, plan check and DB-backed tests | All pass, with exact-head CI green before merge |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C1cx1-S1 | must | Parsing allocations are bounded | Probe long quoted/unquoted cells and headers, many entries, and genuine/forged ZIP declared sizes | Cell/parse bounds apply before excessive allocation; aggregate and actual inflated-byte budgets remain enforced; no crash |
| C1cx1-S2 | must | Crash regression is isolated | Inspect and execute malicious-input tests in a bounded subprocess/container | Explicit memory/time ceilings, response and exit status asserted; hostile parsing cannot kill the main test runner |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C1cx1-P1 | must | Malicious archives fail fast | Time the two published archive families in the same bounded setup, excluding container startup | Refusal under 2 seconds; no process termination. The 768 MiB container cap is a test safety ceiling, not a product requirement |
| C1cx1-P2 | must | Ordinary workloads retain existing budgets | Repeat C1-P1 and C1-P2 with sample and synthetic workbook | Sample median under 200 ms; ordinary large workbook under 3 seconds and 256 MB peak memory |

## Usability

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C1cx1-U1 | must | Limits are understandable | Read returned long-cell, duplicate-tab and size-limit errors and connector documentation | Identify affected file/tab and applicable limit in plain language; document any added cell limits |
