Reviews: C6

# Independent re-QA: C6 / PR #21 / 750a50b

**Verdict: FAIL (C6-F7); full-suite integration also UNVERIFIED due the required excluded test.** Prior C6-E1/E2/E3 correction retests pass. Reviewer: independent Codex, 2026-10-23. This is a new external report; no published Codex report is changed.

Reviewed PR head `750a50b638866e1b0718d01e052c2e466ce6775f`, plain head tree `1f044bca57392cf4263dc78a99cdd57684301892`. Pinned base/actual detached HEAD `7c79a06a4d48a7dfa43e37223ab8daba0ac1bf14`, base HEAD tree `7abba541fb00e5ec811473eb67fe80857e0d6c41`. Fresh worktree `/home/kevin/codex-qa-2026-10-22/c6-review-750a50b`; `git merge --no-commit --no-ff 750a50b638866e1b0718d01e052c2e466ce6775f` succeeded without conflict. **Actual integrated index tree `57fc426ee352fe654c50c7f8e04f67c01ed21a71`**, eight staged task paths, no QA implementation edits. Local checks target that combined tree, not the plain PR tree.

Read AGENTS, complete HANDOFF/QA STATUS/README, QA README, current C6 criteria, immutable `Codex-C6-review-8cc23ab.md`, architecture decisions/core split/import/export/tracker sections, raw field spec, sample README, prototype CSV generation and C6 implementation. Frozen install does not constitute reading lockfile content. Never read `pnpm-lock.yaml` or `project/support.js`.

Current F7 explicitly requires UTF-8 BOM CSV, CRC/XML-valid formula-free OOXML, and both CSV/XLSX opening and converting in headless LibreOffice with cell content preserved. Excel/Sheets manual checks belong to the user before L1 under the coordinator's published reconciliation; this report does not repeat the old Excel/Sheets UNVERIFIED criterion.

## Errors

### C6-E4 — Low/P3: ordinary lone carriage return changes on required LibreOffice CSV opening

Current criterion **C6-F7** requires both CSV and XLSX to open and convert in headless LibreOffice with every cell content preserved. A canonical valid pack with `ideas[0].notes='one\rtwo'` passes `parsePack` unchanged, and C1 reimports both emitted formats preserving the exact CR. `packReport` → `csvExport.write` returns a successful ZIP; its `Ideas.csv` K2 contains `one\rtwo`. LibreOffice 24.2.7.2 opens that CSV as **`one\ntwo`** (CR becomes LF). Native XLSX conversion/reopen retains the changed value. The corresponding original XLSX opens and converts to native XLSX with exact `one\rtwo` preserved.

This is a required representative-application fidelity failure, **not** XML character dropping or a formula execution. Source CSV writer `csvCell` (`packages/connectors/src/export.ts:95–107`) quotes the CR and emits it without refusal. The importer roundtrip alone does not expose the application conversion change. Reproduction and byte/source equality: `c6-cr-proof-750a50b.mjs/.txt`; actual LO input/output cells: `c6-libreoffice-final-750a50b.txt`, file `cr-water-cycle-pack-2026-10-22--Ideas.csv`, cell K2. Preserve raw carriage-return fidelity or return an explicit located, actionable refusal for unrepresentable CSV text directing the teacher to lossless XLSX; XLSX already preserves this value. No application fix made.

A separate synthetic leading-CR formula title has the same CSV CR→LF normalization (`Ideas.csv` B7: apostrophe+CR+`=1+1` becomes apostrophe+LF+`=1+1`). It is still neutralized, with zero formula cells. This is additional observation, not the ordinary accepted-pack counterexample above.

## Suggestions

The documented formula-safe CSV reimport apostrophe limitation remains, and is now explicitly disclosed in connectors README. Future API report integration must implement org/class authorization before selecting curriculum data; there is no export route at this library layer. Neither is a newly demonstrated authorization defect.

## Criteria and correction retests

| Check | Weight | Result | Evidence |
|---|---|---|---|
| C6-F1 | must | PASS | Blank template has exact eight spec tabs plus Read me, key/value Course; untouched XLSX imports with no error. Required examples are marked in help. |
| C6-F2 | must | PASS | Independent vm executes prototype templateCSV; every original sample column/row matches, including persona prompt; extra explanation matches raw spec. |
| C6-F3 | must | PASS | Independent help/spec type, required and missing-behavior equality for all columns; real LO opening. |
| C6-F4 | must | PASS | Both sample CSV ZIP and XLSX reimport deep-equal canonical parsed fixture. |
| C6-F5 | must | PASS | Exactly error/warning/info; shuffled source becomes serious-first; messages/titles/IDs/fix fields exact. Long 500-title check preserves all titles and IDs across continuation rows. |
| C6-F6 | must | PASS | Independent per-code fixture membership/count/units matches, framework named, uncoded rain listed. 500 valid 124-char titles (62,998 chars joined) and IDs preserved in two rows in both formats. |
| C6-F7 | must | FAIL | CRC/XML/BOM/no-formula checks pass; LO opens and native-XLSX converts 72 files/sheets, 70 preserve all cells. Two CSV CR cases normalize CR to LF: ordinary accepted notes plus synthetic formula fixture, E4. |
| C6-F8 | must | PASS | Public csv/xlsx targets implement architecture kind/write interface; registry and report builders exported. |
| C6-F9 | should | PASS | Draft rows have exact Assessment columns and values; CSV BOM/safe filename. |
| C6-S1 | must | PASS for executed neutralization | All six prefixes CSV-safe/XLSX-text; zero formulas in all generated XML and actual LO cells before/after conversion. First four formula-like titles roundtrip XLSX exactly; CSV literal safety-prefix limitation documented. |
| C6-S2 | conditional must | N/A | No curriculum-export HTTP route or DB selector at this pure library layer. |
| C6-S3 | must | PASS structural | Only spec curriculum fields projected; injected student/progress/transcript/email sentinels absent. No student DB reads. |
| C6-P1 | must | PASS | 240 individual exports (6 builders × 2 formats × 20), max 3.822747 ms <300 ms; raw first/all samples retained. |
| C6-P2 | must | PASS | 2000 ideas/6000 links/2000 assessment: 118.928478 ms, final OS peak 107120 KiB (<256 MiB), 259443-byte XLSX. |
| C6-U1 | must | PASS | Safe lowercase topic/date filenames (generic dated template), accents/punctuation slugged. |
| C6-U2 | must | PASS | Plain columns, idea titles, sorted severity, frozen header pane every XLSX; actual LO opening. |
| C6-U3 | should | PASS | Tab names/Teacher Settings/Curriculum Pack terms and spec help match. |

**Prior corrections:** E1 fixed by marked required Course examples. E2 fixed at public boundary: accepted BELL preserved exactly in CSV/XLSX importer roundtrips and native XLSX conversions; 500 ordinary titles/IDs and long data-check lists continued without loss. Over 32767 cells reject with sheet/row/column and shorten instruction; broken-surrogate CSV rejects with exact location and retype/XLSX instruction. E3 fixed by explicit comma/semicolon refusal in public pack and draft builders (`Assessment`, row 2, `key_points`, offending item, reword instruction). Contracts accept original examples unchanged. No silent meaning change observed in those retests.

## Commands, first observations and evidence

Fresh adapted copies: `c6-functional-750a50b.mjs`, `c6-perf-750a50b.mjs`, `c6-xml-750a50b.py`; new independent conversion/content harness `c6-lo-750a50b.py`. Generated files in `c6-files-750a50b/`. Prior immutable harnesses/artifacts preserved.

## Integration limitation and safety boundary

Current `packages/db/src/function_binding.test.ts` MUST NOT execute, directly or indirectly. Imported ordinary baseline files and shared configuration/helpers were inspected first. Unrestricted root `pnpm test` will not run. Allowed DB baseline uses only explicit filenames: index, columns, security, performance, isolation, integrity, migrations and test/derived. Full-suite integration therefore remains **UNVERIFIED** regardless of all permitted checks succeeding. This report cannot supply an unqualified all-must integration PASS. No previously blocked F4 shadow/temp-table or PR13-specific action is retried, rephrased or rerouted. No custom/adversarial DB probes. No actual school data/cloud exports.

QA only: no application fix, task claim/state change, commit, remote write/comment or actual merge. Scratch staged merge is intentional and retained. Parent owns publication, routing and integration decisions.

## Completed commands and observed results

Environment: Node **22.22.0**, pnpm **10.28.0**, PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`, LibreOffice **24.2.7.2**. New disposable pgvector/Postgres 16 container `codex-qa-c6-750a50b`, ID `8259cd164ddc74cde3b3932272141cb1499f682a80f6d2ac739800f6d43e4b0a`, localhost 32770→5432; synthetic QA password only. Initial immediate `pg_isready` returned no response/exit2 during startup; subsequent readiness succeeded before any database suite. No other DB/container used.

F6 explicitly released the heavy/performance window before C6 install/build/performance. Benchmarks ran sequentially before LO and baseline workloads. Heavy window was released to the parent for C5 only after all C6 installs/builds/tests/checks and service cleanup completed.

Commands below ran from the fresh integrated worktree with the PATH prefix above. Each command retained a separate raw log in `evidence/` with matching `c6-*-750a50b` name.

```sh
pnpm install --frozen-lockfile
pnpm build
node /home/kevin/codex-qa-2026-10-22/evidence/c6-functional-750a50b.mjs
/usr/bin/time -f 'C6_sample maxRSS_KiB=%M elapsed=%e exit=%x' node /home/kevin/codex-qa-2026-10-22/evidence/c6-perf-750a50b.mjs sample
/usr/bin/time -f 'C6_large maxRSS_KiB=%M elapsed=%e exit=%x' node /home/kevin/codex-qa-2026-10-22/evidence/c6-perf-750a50b.mjs large
python3 /home/kevin/codex-qa-2026-10-22/evidence/c6-xml-750a50b.py
node /home/kevin/codex-qa-2026-10-22/evidence/c6-cr-proof-750a50b.mjs
pnpm --filter '!@ideamap/db' -r test
DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32770/postgres pnpm --filter @ideamap/db exec vitest run src/index.test.ts src/columns.test.ts src/security.test.ts src/performance.test.ts src/isolation.test.ts src/integrity.test.ts src/migrations.test.ts src/test/derived.test.ts
DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32770/postgres pnpm --filter @ideamap/worker --filter @ideamap/api test
pnpm lint
pnpm format:check
pnpm typecheck
node scripts/plan.mjs check
```

All commands above exit0. Functional first attempt `c6-functional-first-750a50b.txt` passes; expanded run adds accepted ordinary internal-CR generated files, retains identical prior assertions and passes (`c6-functional-expanded-750a50b.txt`). Tiny dedicated CR proof independently asserts parsePack deep equality and exact importer CR preservation in both formats. No implementation/helper assertions modified. Independent Python ZIP CRC/XML validation initially passed 13 workbooks; expanded run includes CR workbook, all 14 pass (`c6-xml-expanded-750a50b.txt`). All CSV/inner ZIP members independently checked UTF8BOM; every XLSX worksheet frozen, zero formula nodes.

P1 log retains every one of 240 samples, including first observations; warm later observations are not called cold starts. Max 3.822747 ms. P1 command maxRSS 91920 KiB / elapsed 0.33 s includes Node setup/import, separate from individual export timers. P2 times report construction plus writer, excludes fixture construction/hash/import; same independent 2000-idea / 6000-link / 2000-assessment input as prior report, SHA256 `07afd8071a91db697eb6b7bec4657fc88dfadebddd0d559d133d1684d9b65349`. Export 118.928478 ms, 259443 bytes; Node resourceUsage 106992 KiB and independent final OS high-water 107120 KiB (~104.61MiB), total command 0.29 s. No budget reduction/workload override.

Permitted baseline results: DB **161/161 across 8 explicit files**,45.79s; connectors **138/138 across 7 files**; contracts 217; domain 96; tracker 172; UI 78; AI 6; student 1; teacher 2. First non-DB recursive baseline omitted DATABASE_URL, so its API 5 / worker 17 DB tests were explicitly **skipped**, not called passes. Corrected follow-up runs just API/worker with DATABASE_URL: **API7/7 and worker18/18**, no skips. Raw first skip counts remain in `c6-other-baseline-750a50b.txt`; DB-backed follow-up in `c6-api-worker-db-750a50b.txt`. This is completion of previously unexecuted baseline coverage, not a hidden failed-assertion retry. Unrestricted root tests remain unrun due the excluded function_binding file.

## LibreOffice full-cell evidence and harness corrections

Dedicated task-only profile `/home/kevin/codex-qa-2026-10-22/evidence/c6-lo-profile-750a50b`, localhost 20750. No existing user LO instance touched. Launch:

```sh
libreoffice -env:UserInstallation=file:///home/kevin/codex-qa-2026-10-22/evidence/c6-lo-profile-750a50b --headless '--accept=socket,host=localhost,port=20750;urp;StarOffice.ServiceManager' --norestore --nodefault --nofirststartwizard
/usr/bin/python3 /home/kevin/codex-qa-2026-10-22/evidence/c6-lo-750a50b.py
```

Harness uses independent Python CSV scanner/ZIP+ElementTree OOXML cell extraction, compares **every nonempty source cell and checks extra cells**, detects formulas through UNO cell types, converts, reopens, and compares every cell again. CSV options are UTF8/comma/double-quote and text columns to retain exact text/numeric-looking identifiers. It extracts every CSV member of generated report ZIPs. It never uploads files. CSV-generated sheet names have no source-sheet identity and are not part of the cell-content pass bar; workbook source names are compared.

All raw first failures retained:

1. Original script `c6-lo-first-750a50b.py`, raw `c6-libreoffice-first-750a50b.txt`:63 jobs, 7 failures,exit1. Initial conversion destination ODS dropped BELL and normalized CR on save, even though XLSX opened exactly. This was an inappropriate lossless target choice for text outside XML1.0; changing destination to native XLSX preserves those characters. Separate CSV CR normalization was already present during input opening.
2. Script snapshot `c6-lo-xlsx-first-750a50b.py`, raw `c6-libreoffice-xlsx-750a50b.txt`:63 jobs, 50 failures,exit1. All XLSX original content survives native XLSX save/reopen; CSV-derived temporary names exceeded XLSX 31-character sheet-name limit. Treating those generated names as source cells was a harness error. Corrected comparison ignores generated CSV sheet names while still comparing every cell plus sheet count. The actual CSV CR difference remains.
3. Final script `c6-lo-750a50b.py`, raw `c6-libreoffice-final-750a50b.txt`:added accepted ordinary internal-CR fixture for 72 jobs; **70 preserve every source/opened/converted cell (all 14 XLSX plus 56 CSV),2 CSV fail input CR equality**, exit1. All 72 have **zero formula cells** before and after conversion. Both final failures are detailed in E4; no content assertion was relaxed to erase them. Native XLSX conversion output is retained in `c6-files-750a50b/lo-converted-xlsx/`; ODS outputs retained separately in `lo-converted/`; extracted CSV inputs retained in `lo-csv-inputs/`.

All script copies, first/expanded/final outputs and generated artifacts remain external. LO desktop.terminate closes only this dedicated instance after each run; launch processes exited. Task profile retained as evidence.

## Final identity, CI attribution and cleanup

Install/build/lint/format/typecheck/plan and all permitted suites succeeded on actual combined tree `57fc426ee352fe654c50c7f8e04f67c01ed21a71`. Final HEAD `7c79a06a4d48a7dfa43e37223ab8daba0ac1bf14`, MERGE_HEAD `750a50b638866e1b0718d01e052c2e466ce6775f`, index tree unchanged. Exactly 8 C6 task paths staged by scratch merge, no unstaged changes/conflicts/source overrides/test artifacts in repo. No commit was made.

Parent read-only REST supplied exact-head successful CI [build39971348497](https://github.com/tenkevin/mind-your-tutor/actions/runs/39971348497) and [plan39971348730](https://github.com/tenkevin/mind-your-tutor/actions/runs/39971348730) for 750a50b. This report attributes that remote evidence to parent; its independent local checks test the combined tree above. Exact current-head/base sync, expected-head merge and actual merge CI remain coordinator duties. Green CI does not close E4 or the intentionally unexecuted full-suite gate.

Dedicated DB container stopped successfully and inspected status `exited`; retained stopped for evidence. All dedicated LO processes terminated; task artifacts retained. Heavy window released to parent for C5. No existing service/database changed, no remote write/comment/merge, no application fix, no task claim/state change. **C6-F7 FAIL; prior E1–E3 fixed; full-suite integration UNVERIFIED.**

## Parent review and publication reconciliation — 2026-10-27

The parent reviewer read the complete final report and inspected the ordinary CR proof and final LibreOffice output. The parent agrees with C6-E4 and the located-refusal/lossless-XLSX correction proposed above. This low-priority fidelity finding was suitable for batch publication; no formula execution or privacy disclosure was demonstrated.

These runtime results are from 2026-10-23. C6 has since merged as `3715aa6`. At publication preparation, `origin/idea-map` is `f9513f0`; `git diff 750a50b origin/idea-map -- packages/connectors/src/export.ts` is empty. The responsible writer is unchanged. This confirms source applicability, not a new full runtime review of the merged tree. The later Claude completion report's PASS does not include this ordinary-CR counterexample. The coordinator should reconcile E4 against the current criterion and route any required merged-work correction. Parent did not run or reroute excluded tests.

F5/F6 reports were already published in commit `25b4084`; this publication adds only the previously pending new C5 and C6 reports. No existing report, implementation or task status is changed.
