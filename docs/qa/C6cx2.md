# QA criteria: C6cx2 · Fix Codex error C6cx1-E1 (CRLF inside a cell)

Done when: accepted curriculum text containing CRLF either opens unchanged in a representative application from both the CSV and XLSX exports, or line endings are made canonical (LF) where text is accepted, so no export holds text the application changes; text that still can't survive is refused with a located, actionable message.
Source: `docs/qa/codex/Codex-C6cx1-review-29b23ff.md`, error C6cx1-E1. The behaviour is inherited from C6 (merged `3715aa6`), not introduced by C6cx1; C6cx1 (lone CR) merges first. Fix on current `idea-map`.

> C6cx1-E1 — Low/P3: import the ordinary water-cycle fixture with C1, clone its canonical pack, set `ideas[0].notes = 'a\r\nb\nc'`, then call `packReport` and each of `csvExport.write` and `xlsxExport.write`. Both return files successfully. In generated `crlf-water-cycle-pack-2026-10-22.xlsx`, Ideas K2 contains the original CRLF+LF string; the zipped `Ideas.csv` K2 does too. LibreOffice 24.2.7.2 opens **both** as `a\nb\nc`. […] `packages/connectors/src/export.ts:121` only refuses `/\r(?!\n)/`, so CRLF still reaches successful CSV generation. XLSX `xml` writes CR as `&#13;` and `xlsxCell` emits it successfully.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C6cx2-F1 | must | The Codex case | Run the E1 reproduction (notes `a\r\nb\nc`) through CSV and XLSX export, then open, convert and reopen both in headless LibreOffice | Every cell opens equal to the pack the export was made from. If line endings are made canonical on acceptance (C1 import, and any API that accepts curriculum text), the stored notes are `a\nb\nc` and that is what every export and LibreOffice show; otherwise the export refuses with a refusal naming the tab, row, column and idea |
| C6cx2-F2 | must | One rule everywhere | Import CSV, XLSX and pack JSON whose cells hold CRLF, lone CR and LF | The same rule applies in every import path and every export (pack, templates, data-check, alignment and draft reports); C6cx1's lone-CR handling still holds; the rule is written in `docs/spec/` |
| C6cx2-F3 | must | C6-F7 again | Rerun the full C6-F7 matrix with CRLF, lone-CR and LF fixtures added | Every report in both formats opens and converts in headless LibreOffice with every cell's content preserved |
| C6cx2-F4 | must | Round trip | Reimport the emitted files with C1 | Equal to the stored pack |
| C6cx2-F5 | must | Regression test | Read the tests | A CRLF test fails on the current code and passes on the fix |
| C6cx2-F6 | must | Everything passes | Root lint, format:check, typecheck, test with DATABASE_URL (including `function_binding.test.ts`), build, plan check, on the head merged with current `idea-map` | All exit 0; CI green on the exact head |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C6cx2-S1 | must | Formula safety kept | All six formula prefixes, with and without leading line breaks | Still neutralized; zero formula cells in CSV or XLSX |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C6cx2-P1 | must | No slowdown | C6-P1, C6-P2 and C1's import budgets | Within their existing budgets |

## Usability

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C6cx2-U1 | must | Plain refusal (if any) | Read any refusal | Plain language; names the cell; says what to do; no file is half-written |
