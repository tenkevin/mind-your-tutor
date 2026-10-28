Reviews: C6cx1

# Independent QA: PR #32, head 29b23ff

**Verdict: FAIL for C6cx1-F4's inherited C6-F7 requirement; C6cx1-F6 remains UNVERIFIED.** The intended lone-carriage-return correction passes: CSV refuses with a located actionable message, and XLSX preserves `one\rtwo` through C1 and LibreOffice. A broader CRLF fixture exposes existing LibreOffice normalization in both formats. This is inherited behavior, not a regression introduced by this PR. It still prevents an all-must PASS under the written every-cell fidelity requirement.

Independent gate owner: Sol. Luna's prior work is supporting mechanical evidence, audited below; it is not this verdict. Original unpublished draft preserved as `c6cx1-review-29b23ff-luna-draft.md`. No published Codex file changed.

## Errors

### C6cx1-E1 — Low/P3: inherited CRLF normalization fails required representative-application fidelity

Reproduction: import the ordinary water-cycle fixture with C1, clone its canonical pack, set `ideas[0].notes = 'a\r\nb\nc'`, then call `packReport` and each of `csvExport.write` and `xlsxExport.write`. Both return files successfully. In generated `crlf-water-cycle-pack-2026-10-22.xlsx`, Ideas K2 contains the original CRLF+LF string; the zipped `Ideas.csv` K2 does too. LibreOffice 24.2.7.2 opens **both** as `a\nb\nc`. Native XLSX conversion and reopen retains that normalized value. No formula executes. LF-only fixtures preserve every cell. The original lone-CR XLSX fixture also preserves every cell.

Raw `c6cx1-29b23ff/lo-sol-escalated.log` identifies both affected files/cells and exact expected/actual strings; 82 jobs, 2 failures, exit 1. This is an actual application input difference, not a generated-sheet-name comparison, CSV universal-newline read, or XML parser artifact: the XLSX expected matrix decodes `&#13;` into CR; CSV ZIP members are decoded directly from bytes. The other 80 jobs preserve every nonempty source cell and detect no extra cells.

Source: `packages/connectors/src/export.ts:121` only refuses `/\r(?!\n)/` (declared at 94), so CRLF still reaches successful CSV generation at 132. XLSX `xml` at169–175 writes CR as `&#13;` and `xlsxCell` at204–220 emits it successfully. Both keep source bytes but do not meet the application-fidelity bar for this accepted text.

Baseline attribution: `writer-diff.patch` compares pinned base 63855ef against PR head. The entire XLSX implementation is unchanged. CSV changes only add idea-location/refusal handling, and the new guard does not match CRLF. Therefore the CRLF behavior follows the same preexisting serialization path. No baseline runtime certification is claimed. An optional baseline comparison harness failed before loading either writer because Node `execFileSync(git show)` returned `spawnSync git EPERM`; `baseline-proof.log` preserves that infrastructure failure. It was not retried or rerouted.

C6cx1-F4 explicitly requires the C6-F7 checks to pass; C6-F7 requires every cell's content preserved through opening/conversion. CRLF/LF behaving as before satisfies the separate no-regression clause, but does not erase this inherited fidelity failure. The earlier representative matrix did not include CRLF and cannot certify this new case.

Concrete correction: preserve exact accepted line endings through the supported application, or return a located actionable refusal before returning a file for text that cannot survive it. Because the current criteria explicitly require CRLF to behave as before and F7 requires preservation, the coordinator must reconcile any broader refusal approach against those requirements explicitly; QA has not changed the acceptance bar or silently treated CRLF and LF as equal. Do not recommend XLSX as lossless for CRLF on this LibreOffice evidence.

## Criteria

| Must criterion | Result | Evidence |
|---|---|---|
| C6cx1-F1 | PASS | `repro-final.log` independently names Ideas, row 2, notes, idea Water cycle, and recommends XLSX for `one\rtwo`; leading-CR `\r=1+1` title likewise refuses at Ideas row 2 title. No file is returned. New writer guard inspected. |
| C6cx1-F2 | PASS for exact lone-CR notes | `cr-water-cycle-pack-2026-10-22.xlsx` opens/converts/reopens in LibreOffice with every cell identical, including `one\rtwo`; C1 notes equality verified. Synthetic leading-CR titles remain text in XLSX/LibreOffice. |
| C6cx1-F3 | PASS for canonical accepted pack and notes case | Sample CSV ZIP/XLSX deep-equal C1 roundtrips in independent functional harness; lone-CR CSV is refused, XLSX deep equality is covered by the 146-test suite. Leading CR/tab in a synthetic title is trimmed by existing C1 normalization, so blanket equality for such uncanonicalized titles is not claimed. |
| C6cx1-F4 | FAIL | Connector suite 146/146 and independent original sample/report checks pass; LF and lone-CR XLSX pass LO. Full 82-job matrix fails only CRLF XLSX and Ideas.csv content equality, E1. CRLF/LF writer behavior is unchanged from base. |
| C6cx1-F5 | PASS by source/test assessment | New regression test at export.test.ts:485 covers notes refusal, exact location/idea/action, leading-CR title, unchanged CRLF/LF C1 roundtrip and lone-CR XLSX equality. Base export.ts has no lone-CR refusal and would resolve instead of meeting the asserted ExportRefused; current suite 146/146. No baseline test execution claimed. |
| C6cx1-F6 | UNVERIFIED | Audited Luna mechanical logs: frozen install, root lint/format/typecheck/build/plan checks passed on combined tree. Exact-head CI build40566273630/check40566273620 success supplied by parent. Required root DB suite including function_binding.test.ts remains prohibited and unrun; green CI does not close it. |
| C6cx1-S1 | PASS in executed formats/refusals | All six prefixes present in generated formula XLSX, text styling independently checked, no formula XML. CSV exports with lone CR refuse; remaining five-prefix CSV pack/check/alignment/draft matrix opens as text. All 82 LO jobs have zero formula cells before/after conversion. |
| C6cx1-P1 (C6-P1/P2) | PASS | Fresh independent 240 sample timings: maximum 3.924626ms<300ms. Large 2,000 ideas / 6,000 links / 2,000 assessments:126.831729ms<5s; final OS peak112240KiB (~109.61MiB)<256MiB. |
| C6cx1-U1 | PASS | Plain refusal identifies cell and idea, explains inability, offers XLSX/retyping, says export stopped. In-memory writer rejects promise before returning FileRef, including multi-sheet exports; no partially downloadable file. |

C6-F7 detail: generated 16 XLSX files pass independent ZIP CRC/all XML validation, frozen panes and zero formula nodes (`xml.log`). All ordinary report variants, templates with/without samples, pack, data checks, alignment and assessment drafts are generated in both formats with BOM CSV; ZIP CSV members included. LO opens/converts 16 XLSX and 66 CSV inputs. Exactly 80/82 preserve every cell, so F7 remains FAIL. Manual Excel/Google Sheets is outside this reconciled criterion and not claimed executed.

## Trees, evidence ownership and commands

PR head/HEAD `29b23ff1788bf8def67a62bfe55e44505cbfc659`; pinned base/MERGE_HEAD `63855ef1146ed1245f0d294cfb6493ae7ca52dc0`; tested integrated index tree **`9e732afd5058653d46334100835ce5982696c90c`**, unchanged at final identity check. Existing clean scratch merge was retained, not redone. Base additions since the pin through parent-supplied 0e5eb63 are historical T2/M2 reports only, not runtime changes. The scratch merge itself includes base A1 application changes, not merely documentation; staged merge paths are intentional. No unstaged application edits. Worktree `/home/kevin/codex-qa-2026-10-27/c6cx1-29b23ff`.

Read reviewer guide, applicable AGENTS/HANDOFF/QA STATUS/README, C6cx1/C6 criteria, both prior Codex C6 reports, relevant architecture/import-export interface, connector README, fixture README, writer and changed tests. Never read lockfile/support.js contents. Restrictions on function_binding/importing suites, shadow/temp-table probes, PR13-specific review and custom adversarial DB probes preserved. No unrestricted root suite, own DB, real data, accounts or keys used.

Node 22.22.0 / pnpm 10.28.0 via PATH `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`. Existing successful supporting logs in `evidence/c6cx1-29b23ff/`: `connectors-test.log` 146/146, `lint.log`, `format-check.log`, `typecheck.log`, `build.log`, `plan-check.log`. These were inspected rather than needlessly repeated. Parent supplies successful exact-head CI; local combined-tree evidence and remote head CI are separate.

New independent harnesses are adapted copies of historical 750a50b functional/perf/XML/LO harnesses; originals untouched. All artifacts under `/home/kevin/codex-qa-2026-10-27/evidence/c6cx1-29b23ff/`:

```sh
node c6-functional-29b23ff.mjs                    # functional-first.log, exit 0
/usr/bin/time -f 'sample OSpeakKiB=%M elapsed=%e exit=%x' node c6-perf-29b23ff.mjs sample
/usr/bin/time -f 'large OSpeakKiB=%M elapsed=%e exit=%x' node c6-perf-29b23ff.mjs large
/usr/bin/python3 c6-xml-29b23ff.py                # xml.log, exit 0
/usr/bin/python3 c6-lo-29b23ff.py                 # lo-sol-escalated.log, exit 1, 82 jobs / 2 failures
```

Commands use absolute external harness paths; scripts import only built public connectors/domain/contracts APIs. Functional harness asserts prototype sample rows/raw spec help, report sorting/membership, exact fixture roundtrips, located refusals, wide report continuation preservation and student-field projection. New handling expects CSV lone-CR refusal rather than weakening it into success; five-prefix CSV and six-prefix XLSX reports both retained. Added CRLF/LF fixtures expose E1; no assertion relaxed or rerun to hide it.

Performance runs ran sequentially in the parent-assigned window before LO. P1 is 6 builders × 2 formats × 20 runs; raw first and subsequent warm observations retained in `perf-sample.log`, first observations are not process cold starts. Max 3.924626ms; full command 0.34s/91856KiB includes process startup. P2 includes report construction/write, excludes fixture construction/import/hash; deterministic input SHA256 `07afd8071a91db697eb6b7bec4657fc88dfadebddd0d559d133d1684d9b65349`, 259,443 output bytes. Node peak 112112 KiB; `/usr/bin/time` final OS peak 112240 KiB,command 0.31s,exit 0. No reduced budget/workload.

LibreOffice 24.2.7.2 dedicated listener used own profile `lo-sol-profile`,localhost:20761; no user instance touched. Existing Luna listener failures/NoConnect retained. Sol launcher required normal sandbox escalation and succeeded; sandbox client failed NoConnect/Invalid argument (`lo-sol-first.log`), then approved external client completed the full matrix (`lo-sol-escalated.log`). This was an ordinary sandbox socket limitation, not security filtering. Harness snapshots every nonempty cell plus extra cells/sheet count, checks actual UNO formula types, saves native XLSX, reopens, compares again, then calls desktop.terminate. Dedicated LO closed; no QA services remain. Heavy window released to parent. No product source fixes, task-state changes, commit, remote write or actual merge.

Raw evidence SHA256:

- `lo-sol-escalated.log`: `7de23b4aeeccd1c7f1984bfa2c3cd32d0b275b12ec6df27a3238ba3330304cc7`
- `functional-first.log`: `68d74b5c440b558d8d54fc310052df5de4745762c828718e5ce6fa8c7dc3c4d7`
- `perf-large.log`: `36c5de674f8a47fe9a3d60daab2fc05f44eda619f4909d1bd82d1afb708eb019`
- `writer-diff.patch`: `79b6460d032fe9f5b7a9c9d66904048f8c1356d04beac5d253a88360a24807d2`

Luna's first repro assertions failed on a location object's additional text property and existing C1 leading-CR title normalization; first/corrected/final logs retained. Those are harness expectation corrections, not suppressed product failures. Sol's independent LO CRLF failure is retained unchanged. Optional baseline harness EPERM is separate from all completed feature checks.

## Suggestions

No additional suggestions. Preserve the documented CSV safety-apostrophe representation limitation and future API authorization obligations from the prior reports. E1 requires explicit coordinator disposition; F6 stays UNVERIFIED even if all permitted checks pass. The parent owns publication; the implementation coordinator owns integration and merge decisions.

Exact-head CI checked by the parent: [build](https://github.com/tenkevin/mind-your-tutor/actions/runs/40566273630), [plan check](https://github.com/tenkevin/mind-your-tutor/actions/runs/40566273620).
