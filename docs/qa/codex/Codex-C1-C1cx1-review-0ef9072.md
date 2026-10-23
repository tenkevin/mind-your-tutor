Reviews: C1, C1cx1

# Independent importer correction QA: PR #8

Candidate HEAD: `0ef907225a3cc5e10c08276afbd2e3bf7c3ca00b`. Pinned integration base: `9269dd23833367db11026010f214438a5b7d7899` (C8 merged). Tested integrated index tree: **`f6aed92ee9efb9ccc4a02113692b26c0fc192c89`**. Original HEAD tree: `d076b827d489b0ae5778438453914a71537909bf`. Date: 2026-10-22 PDT. Reviewer: Codex, independent of importer implementation.

**C1 and C1cx1 verdict: PASS on the tested integrated tree.** All must criteria pass with the separate integrated baseline completed below. The original small-ZIP process-memory failure does not reproduce in the retained bounded archive families. C1-E1 is resolved for the tested correction and remains one canonical finding covering both variants, not separate duplicate tasks. Existing C2-E5 remains separately owned by C2cx5. This QA PASS is not remote merge approval: synchronize the actual PR head with the live base and obtain refreshed exact-head CI first.

## Scope and integration preparation

Read current origin AGENTS, STATUS, HANDOFF, PLAN, QA README, C1/C1cx1 criteria, routing ledger and immutable prior C1 reports before testing. The earlier broad C1 PASS had been superseded by the C1-S2 reconciliation; this review does not rely on it. Builder `/home/kevin/c1cx1-results` is not independent proof and was not used as the behavioral oracle.

Created isolated detached worktree `/home/kevin/codex-qa-2026-10-22/import-corrected-0ef9072`, then ran `git merge --no-commit --no-ff 9269dd23833367db11026010f214438a5b7d7899`. Merge succeeded without conflicts. It was **not** a no-op: seven domain/contracts C8 files are staged from the requested base merge. `git write-tree` identifies the actual tested tree above. There are no QA-authored application edits, unstaged changes or temporary test files inside the repository; staged merge changes are intentionally retained for reproducibility. No merge commit was made.

Exact candidate CI was green before local execution: [build](https://github.com/tenkevin/mind-your-tutor/actions/runs/39883292017/job/120185488277), [check](https://github.com/tenkevin/mind-your-tutor/actions/runs/39883292040/job/120185488284). These runs validate the original candidate, not the additional integrated C8 tree; the separate baseline must validate the combined tree. Later live-base documentation changes do not silently change this report's pin.

The independent platform agent's completed `/home/kevin/codex-qa-2026-10-22/evidence/c1-baseline-0ef9072.md` was read in full before finalizing this verdict. Its separate fresh worktree has the **identical integrated tree f6aed92**. Root lint, format, typecheck, build and plan check all exit0. The full existing database-enabled root suite passed on its **first attempt**, exit0, **87.75 s** wall: connectors **101/101**, domain **91/91**, tracker **159/159**, contracts **208/208**, database **161/161**, UI **73/73**, remaining app suites green. Existing DB workload retained one million events/ten thousand chunks; ingestion measured **11,427 rows/s**. No benchmark reductions or source edits. This is attributed platform baseline evidence, not this importer's independent security-probe evidence. Heavy importer timing and root baseline were deliberately scheduled sequentially. The dedicated baseline database container was stopped afterward; no prior/coordinator database was touched.

Environment: Linux, Node **22.22.0**, pnpm **10.28.0**. Prepend `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin` to PATH.

Completed local commands on the integrated tree:

```text
pnpm install --frozen-lockfile                         PASS
pnpm --filter @ideamap/connectors... build              PASS
pnpm --filter @ideamap/connectors test                  PASS: 101 tests / 5 files, 3.75 s
targeted ordinary-large-workbook Vitest test            PASS: 1 test, 687 ms file duration
pnpm audit --prod                                      No known vulnerabilities found
c1-normal-0ef9072.mjs in UTC/Auckland/Los_Angeles         PASS in all three zones
retained original bounded archive harness, 2 families   normal exit 0 / refusal
repository c1cx1-bounded.mjs in bounded container        all response/time assertions PASS, exit 0
```

The targeted ordinary-large command was `/usr/bin/time -f 'ordinary_large maxRSS_KiB=%M elapsed=%e exit=%x' pnpm --filter @ideamap/connectors exec vitest run src/security.test.ts -t '2,000 ideas, 6,000 links and 2,000 assessment rows'`. Actual maximum process RSS **134,716 KiB (~131.6 MiB)**, elapsed command **1.35 s**, exit 0. This is maximum process RSS, not a sum of concurrent process-tree peaks. Test asserts importer time <3 s and heap growth <256 MiB; peak process RSS independently remains below 256 MiB.

## Independent ordinary-input evidence

Retained external harness `/home/kevin/codex-qa-2026-10-22/evidence/c1-normal-0ef9072.mjs` imports built public exports and uses its own small ZIP/inline-XLSX writer, not repository fixture-generation helpers. It checks JSON/CSV/real fixture XLSX equality; uppercase CSV ZIP names; explicit renamed-column mappings and missing-mapping error; forgiving headers/BOM/CRLF; reordered Course keys with blank row; unknown Course key warning; optional tab fallbacks; skipped blank relation and default importance; invalid unit cell location/value; ignored extra column; wrong-file guidance. Its independently generated styled workbook gives **0.7 → pass_mark 70** and **46325 → 2026-10-30** in all three timezones.

20-run sample median milliseconds, including all three complete format imports:

| TZ | CSV | XLSX | JSON |
|---|---:|---:|---:|
| UTC | 3.826 | 3.005 | 1.214 |
| Pacific/Auckland | 2.107 | 2.871 | 1.427 |
| America/Los_Angeles | 2.459 | 2.841 | 1.221 |

Example independently checked diagnostic: `Ideas.csv · Ideas, row 2, unit: unit must be a whole number of 1 or more, like 1 (got 'two').`

Coordinator separately supplied `/home/kevin/codex-qa-2026-10-22/evidence/c1-csv-roundtrip-0ef9072.mjs` and `.txt`, read by this reviewer: **392 small valid CSV round trips PASS**, covering quoted empty values, commas, escaped quotes, LF/CRLF multiline cells, Unicode and both record endings. Those are parent observations, not this reviewer's own rerun. Existing 101-test suite additionally covers ambiguous headers, all five problems across three tabs, formulas/macros/XXE/path inputs, genuine and forged declared ZIP sizes, limits, defaults and mapping suggestions.

## Canonical C1-E1 bounded reproduction

The previously published `/home/kevin/codex-qa-2026-10-22/evidence/c1-s2-bounded.mjs` was read before use. New copy `evidence/c1-s2-bounded-0ef9072.mjs` changes **only its connector module path** to the corrected worktree. Archive construction, arguments and observations are unchanged. The original harness prints results; process exit/refusal was inspected. The repository's separate bounded script additionally asserts response kind and <2 s parser time.

Every malicious archive execution used:

```text
docker run --rm --network none --read-only
  --memory 768m --memory-swap 768m --cpus 1 --pids-limit 64 --ulimit core=0
  -v /home/kevin/codex-qa-2026-10-22:/qa:ro
  node:22.22.0-bookworm timeout 45s node
  /qa/evidence/c1-s2-bounded-0ef9072.mjs <size> <count> [duplicate]
```

Docker image ID `sha256:d07e49b39003f79e067c4434a20b1505ff061d2002e6e5e938c2354d8f8bd807`. No host Node parser was invoked on these archive families. No network, writable mount, container reuse or unbounded malicious parser run. Containers auto-removed. The 768 MiB ceiling is test safety isolation, not an invented product requirement. `execArgv=[]`, V8 heap limit **4,345,298,944 bytes**; the safety cap is Docker memory, not an artificially lowered Node heap flag.

| Exact old harness arguments | Same archive family | Current result |
|---|---|---|
| `10485760 8` | 82,438-byte ZIP, 80 MiB total, eight distinct tab names with 10 MiB single-field rows | **30.12 ms**, ok:false, one clear header-limit FileRefused naming hostile.zip › Course.csv and **1,024** chars; process exit **0**, maxRSS **216,848 KiB**. Previously OOM-killed under same safety cap. |
| `1048576 100 duplicate` | 114,202-byte ZIP, 100 MiB total, partN/Ideas.csv duplicates | **5.22 ms**, ok:false, duplicate-tab results naming both source entries; process exit **0**, maxRSS **205,360 KiB**. Previously OOM-killed. |

The first original input is actually a huge first/header field, so header refusal is the correct observed path. Data-cell coverage was separately run using the repository's existing `packages/connectors/scripts/c1cx1-bounded.mjs` in the same constraints, mounted read-only at `/repo`:

| Existing repository case | Current asserted outcome |
|---|---|
| Eight 10 MiB data cells after header | **34.22 ms**, one cell-limit refusal **256,000** chars, maxRSS **216,800 KiB** |
| Eight 1 MiB data cells after header | **6.53 ms**, same explicit cell-limit refusal, maxRSS **226,144 KiB** |
| 100 duplicate 1 MiB fields | **4.23 ms**, **99 tab_duplicate**, **no file_refused**, maxRSS **274,812 KiB** across the whole sequential script |

Repository bounded script exits **0** after asserting all three response/time paths. These RSS readings include fixture construction and prior runs in that process, not an isolated parse-only memory estimate. The malicious-case RSS is not C1-P2's ordinary-workbook memory metric.

Source review explains the correction: `csv.ts` bounds decoded header/data-cell lengths while scanning and builds fields with slices rather than unbounded per-character string chains. `readCsvZip` checks canonical duplicate tab names **before** reading payloads. `zip.ts` preserves all directory entries, preflights aggregate declared output and retains actual inflate-byte/checksum checks. Existing quoted/unquoted length-threshold tests, aggregate declared-size test, honest/forged 1 GiB deflate tests and duplicate-before-payload-validation test pass. That last regression uses zero-filled invalid CSV payloads, not deliberately corrupted checksums; the before-zip.read guarantee is also verified from source. No claim that these finite probes prove every possible file representation safe. Selected command/result evidence is retained in `evidence/c1-bounded-results-0ef9072.md` alongside the unchanged-oracle external harness.

## C1 criteria

| Criterion | Weight | Result | Evidence |
|---|---|---|---|
| C1-F1 | must | PASS | Independent three-format deep equality and fixture counts: 18 ideas,31 links,3 units,3 categories,18 assessments,3 personas,5 library; Course matches. |
| C1-F2 | must | PASS | Renamed id/ngss/prereqs with mapping gives identical pack; absent mapping reports Ideas/idea_id. |
| C1-F3 | must | PASS | Independent Idea ID / TITLE / Standard Codes matching and BOM; suite rejects ambiguous duplicate canonical headers. |
| C1-F4 | must | PASS | Independent reordered Course/blank row equality; unknown key warns; suite CSV/XLSX key-value cases pass. |
| C1-F5 | must | PASS | Independent BOM/CRLF and styled workbook; suite number/unit/grade/importance/date/text normalization passes. |
| C1-F12 | must | PASS | Independent actual percentage/date styled cells, pass70/date2026-10-30 in UTC/Auckland/Los_Angeles. |
| C1-F6 | must | PASS | Missing required header blocks; blank Links relation skips row2 with warning; blank importance becomes3; inspected suite regression. |
| C1-F7 | must | PASS for C1 current baseline | Missing optional tabs succeeds with category Idea/empty library/built-in persona info; pending C9/D13 storage changes are a separate task. |
| C1-F8 | must | PASS | Independent uppercase zipped CSV vs separate files equals reference. |
| C1-F9 | must | PASS | Independent teacher_scribbles column absent from pack and one ignored-column issue. |
| C1-F10 | must | PASS | CSV/XLSX/JSON ImportConnector kind/parse interface inspected; aggregate importer validates through F3 contracts. |
| C1-F11 | must | PASS on integrated tree; remote sync gate remains | Target connector build/tests pass; platform root lint/format/types/build/DB-backed tests/plan all pass first attempt. Candidate CI green; refreshed synchronized-head CI still required before remote merge. |
| C1-S1 | must | PASS | Existing formula/cached-value/plain-text and formula_text export-escaping flags tests pass; source evaluates no formulas. |
| C1-S2 | must | PASS | Corrected canonical archive families return clear results/no process death under explicit bounds. Existing 60MB/file,1GB genuine/forged bomb,million-row,macro/content-PNG cases pass. |
| C1-S3 | must | PASS | Existing XXE/DOCTYPE/entity-expansion tests pass; XML tokenizer explicitly refuses declarations, imports no network/file access. No new external-fetch probe. |
| C1-S4 | must | PASS | Existing traversal/absolute path entries skipped with normal import; source uses names as lookup keys and performs no disk writes. |
| C1-S5 | should | PARTIAL: audit PASS, maintenance unverified | pnpm audit --prod: no known vulnerabilities. No third-party parser added; package depends only on contracts. No independent maintainer-activity survey. |
| C1-P1 | must | PASS | Independent 20-import medians all <4ms across formats/timezones, bar200ms. |
| C1-P2 | must | PASS | Existing 2000/6000/2000 workbook target passes; full command1.35s, maxprocessRSS131.6MiB; import assertion<3s and heapgrowth<256MiB. |
| C1-P3 | should | PASS on executed cases | Both old canonical archives and repository data-cell/duplicate regressions <35ms; suite original limit/bomb tests assert<2s. |
| C1-U1 | must | PASS | Independently asserted source/Ideas,row2,unit,value'two'; bad relation warning row2; suite missing-column/cell diagnostics pass. |
| C1-U2 | must | PASS | Independent unmatched Sheet1.csv returns one message naming all eight tabs/template. |
| C1-U3 | must | PASS | Existing five-problem/three-tab test returns all five, grouped Ideas2/Links2/Personas1, blocking first. |
| C1-U4 | should | PASS | Existing requirement/standard suggestions test requires confirmation and verifies unconfirmed mappings not applied. |

## C1cx1 criteria

| Criterion | Weight | Result | Evidence |
|---|---|---|---|
| C1cx1-F1 | must | PASS | Independent normal-form/percentage/date probes, parent392roundtrips and 101 existing tests preserve quoted/doubledquote/BOM/CRLF/multiline behavior. |
| C1cx1-F2 | must | PASS | Exact old distinct/duplicate archive families return results, exit0, no timeout/OOM; repository duplicate assertion confirms payloads not parsed. |
| C1cx1-F3 | must | PASS on integrated tree; remote sync gate remains | Exact originalhead CI green, scratchmerge conflict-free; platform full root/DB baseline passes first attempt on identical integrated tree. Actual PR synchronization/new-head CI is still a coordinator merge gate. |
| C1cx1-S1 | must | PASS within finite tested families | Header/quoted/unquoted-cell length threshold tests, actual large-field bounded regressions, directory-count/declared-total/forged-inflate-byte/checksum tests pass. |
| C1cx1-S2 | must | PASS | Crash-family tests separate from main Vitest runner, executed with768MiB/1CPU/45s/read-only/no-network; response and time assertions in repository script, exits inspected. |
| C1cx1-P1 | must | PASS | Old original families30.12/5.22ms; repositorydatafamilies34.22/6.53/4.23ms, excluding container startup and fixture construction. |
| C1cx1-P2 | must | PASS | Normal sample medians<4ms; ordinarylarge within3s/256MiB as above. |
| C1cx1-U1 | must | PASS | Messages name source/tab and 1024header/256000cell limits; duplicate message names both sources; README documents new limits and safe crash-test invocation. |

## Errors

**No in-scope must-fix error found. C1 and C1cx1 all-must PASS on the tested integrated tree.** Canonical C1-E1's two historical families now return clear results within limits, and the full integrated baseline passes. No rejected action was retried, no PR13 review was touched and no database security probes were run.

Canonical **C2-E5 / C2cx5** remains separate integration work. This importer review does not close that task or create a duplicate C1 finding. D12/D13/C9 pending changes to missing objectives/questions/persona representation remain known scope boundaries.

## Suggestions

- Preserve both exact historical archive families and data-cell-after-header variants in bounded regression runs. The old first-field probe exercises the header bound; testing only that path would not demonstrate the larger data-cell limit. Keep process exit and structured response assertions as well as timing.
- Source-only consistency observation, nonblocking: `csv.ts:63` selects the 1024-character header bound by physical record1, while `mapping.ts:190` selects the first nonblank record as the logical header. With leading blank records the logical header is still bounded by256000 but does not receive the documented1024 cap. Consider aligning the rule or documenting physical-first-record semantics and adding a small regression. This is **not** a proven resource failure or a reopening of C1-E1. Headerless Course values should not be incorrectly treated as invalid solely because they occupy the first record.
- Keep original URL-credential normalization suggestion routed to the existing shared-validator/C9 scope. No new credential test, new importer error or duplicate task is proposed here.

## Limits and final gate

Finite bounded inputs do not prove universal parser safety; peakRSS includes allocations needed to construct fixtures. No unrestricted host OOM test, newly invented huge archive, external network fetch or database probe was performed. Existing repository security tests were executed within their coded finite budgets; canonical crash regressions were isolated separately.

All evidence above concerns originalhead0ef9072 plus **pinnedbase9269dd2**, integratedtreef6aed92. Coordinator subsequently reported documentation-only live-base advance to `4208e935dbc5275b94160ad1fd577889a0b3976c`; this review did not chase or silently test a different merge. Before remote merge, synchronize the live base, compare relevant task paths with this tested tree and require exact refreshed-head CI green. This report makes no remote changes and is not a merge instruction.
