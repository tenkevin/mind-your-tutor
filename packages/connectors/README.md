# Curriculum import connector

CSV imports accept quoted and multiline values, doubled quotes, UTF-8 or UTF-16 byte order marks, and CRLF or LF line endings. To bound parser memory, each CSV header is limited to 1,024 decoded characters and each data cell to 256,000 decoded characters. A longer header or cell refuses that file and identifies the source and limit.

Zip imports first check the sum of declared uncompressed sizes against the remaining 100 MB import budget. CSV archives also match every recognized entry to its canonical pack tab before reading entry data; duplicate tabs are reported without inflating or parsing their contents. Declared sizes are checked again against actual inflated output as entries are read.

The hostile archive regressions must run in a resource-bounded container after `pnpm build`; they are intentionally separate from Vitest so an importer regression cannot kill the test runner:

```sh
docker run --network none --read-only --memory 768m --memory-swap 768m --cpus 1 --pids-limit 64 --ulimit core=0 --rm -v "$PWD":/repo:ro -w /repo/packages/connectors node:22.22.0-bookworm timeout 45s node scripts/c1cx1-bounded.mjs
```

## Exports (C6)

`reports.ts` builds each download as plain sheets, and an `ExportTarget` (`export.ts`, ARCHITECTURE.md §7) writes it: `xlsxExport` as a workbook, `csvExport` as one UTF-8 CSV with a byte order mark (or a zip of CSVs, one per tab, when a report has several sheets).

| Builder                               | File (example)                                                                                                                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `templateReport({ sample })`          | `curriculum-pack-template-2026-10-22.xlsx`: a "Read me" sheet with every column's type, whether it's required and what happens when it's missing, then the eight tabs with the spec's columns (and the prototype's sample rows when `sample` is true) |
| `packReport(pack)`                    | `water-cycle-pack-2026-10-22.xlsx`: a parsed pack as the eight tabs; importing it again gives the same pack                                                                                                                                           |
| `dataCheckReport(pack, issues)`       | `water-cycle-data-checks-2026-10-22.csv`: one row per C2 data check, errors first, with ideas by title and the tab and column to fix                                                                                                                  |
| `alignmentReport(pack)`               | `water-cycle-alignment-2026-10-22.xlsx`: per standards code, the ideas and units that cover it, then the ideas with no code, labelled with the Course framework                                                                                       |
| `assessmentDraftsReport(topic, rows)` | `water-cycle-assessment-drafts-2026-10-22.csv`: Atlas-drafted rows with exactly the Assessment columns                                                                                                                                                |

Nothing exported runs as a formula. A CSV cell that `needsFormulaEscape` gets a leading apostrophe; XLSX cells are always typed values (never formulas), and formula-like text is written as text with Excel's quote prefix, so it reads back unchanged. Exports take curriculum data only.

Nothing exported is cut short or dropped silently:

- Characters XML can't hold (control characters, a lone half of a surrogate pair) are written in XLSX as Excel's `_xHHHH_` escapes, and text that already looks like one has its `_` escaped as `_x005F_`. The XLSX reader decodes these, as Excel and LibreOffice do, so the text reads back exactly.
- A report list too long for one cell (Excel holds 32,767 characters) continues on the rows below, so every idea title and id is kept.
- What can't be written as it is refuses the export with `ExportRefused`, naming the sheet, row and column: a cell over 32,767 characters, a broken character in a CSV, or a list item holding a comma or semicolon (the importer splits list cells on both, so the item would come back as two).
- The blank template carries the spec's examples for the three required Course values (subject, topic and grade), marked in the Read me, so it imports as it is.

Known limit: a CSV keeps the safety apostrophe, so formula-like text exported as CSV comes back from C1 with a leading `'`. XLSX keeps it exactly.
