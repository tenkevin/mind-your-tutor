# QA criteria: C6cx1 · Fix Codex error C6-E4 (carriage return in CSV)

Done when: a lone carriage return in a curriculum cell survives a CSV export opened in a representative application, or the CSV export refuses it with a located, actionable message; XLSX keeps preserving it.
Source: `docs/qa/codex/Codex-C6-review-750a50b.md`, error C6-E4. C6 is merged (`3715aa6`); fix on current `idea-map`.

> C6-E4 — Low: a valid pack with `ideas[0].notes='one\rtwo'` exports to a CSV whose `Ideas.csv` K2 holds `one\rtwo`, but LibreOffice opens it as `one\ntwo`. `csvCell` (`packages/connectors/src/export.ts:95–107`) quotes the CR and emits it without refusal. The XLSX export preserves it.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C6cx1-F1 | must | The Codex case | Export a pack with notes `one\rtwo` (and a title with a leading CR) to CSV | Either the value opens unchanged in LibreOffice (headless), or the export returns a refusal naming the tab, row, column and idea, and telling the teacher to use the XLSX export |
| C6cx1-F2 | must | XLSX unchanged | Export the same pack to XLSX and open it in LibreOffice | `one\rtwo` preserved, as now |
| C6cx1-F3 | must | Round trip | Reimport the emitted files with C1 | CSV (if exported) and XLSX reimport equal to the source pack |
| C6cx1-F4 | must | Other text unchanged | Run the C6 export tests and C6-F7 checks | All pass; CRLF and LF inside cells behave as before |
| C6cx1-F5 | must | Regression test | Read the tests | A test with a lone CR fails on the current code and passes on the fix |
| C6cx1-F6 | must | Everything passes | Root lint, format:check, typecheck, test with DATABASE_URL (including `function_binding.test.ts`), build, plan check, on the head merged with current `idea-map` | All exit 0; CI green on the exact head |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C6cx1-S1 | must | Formula safety kept | Leading-CR formula-like titles, and all six formula prefixes | Still neutralized; zero formula cells in CSV or XLSX |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C6cx1-P1 | must | No slowdown | C6-P1 and C6-P2 | Within their existing budgets |

## Usability

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C6cx1-U1 | must | Plain refusal (if chosen) | Read the refusal | Plain language; names the cell; offers XLSX; the CSV is not half-written |
