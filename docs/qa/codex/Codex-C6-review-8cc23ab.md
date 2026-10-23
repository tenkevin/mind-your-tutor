Reviews: C6

## Publication-time base change

The mandatory pre-push pull advanced `idea-map` from the tested base `dfc44cf7fafc88ee51272a402d6aed080783e09f` to `be6697d6fa97aa681d65a68abf7280928ed49b4c`, including F4cx1 application merge `45d89c54c840610e02670ff04efcfe1678bbbc1e`. This is **not documentation-only drift**: database migration registration and a new migration/test changed. The results above remain exact evidence for the pinned scratch tree; they are not an all-must PASS on the latest base and do not authorize merging a stale PR. The coordinator must synchronize and obtain appropriate current-tree integration evidence, including the documented F5/F6 migration-number collision where relevant. The separate coordinator F4cx1 report is attributed evidence, not a claim that this Codex session reran or independently certified previously blocked probes. No such rerun was attempted.

# Independent QA: C6 / PR21

Verdict **FAIL**: blank-template acceptance criterion F1 fails, two additional data-fidelity defects are confirmed, and actual Excel/Google Sheets format compatibility remains unverified. Independent export performance and full integrated baseline pass. Green existing tests do not invalidate the independently demonstrated defects.

Head `8cc23abe87f8fc89b05dfd8cd63169c2d2df0e88`; pinned base `dfc44cf7fafc88ee51272a402d6aed080783e09f`. Plain HEAD tree `744e5c11dbe7a03e6415f056b9c6eed468c4ffeb`; **actual tested integrated index tree `0c7c1845952aa63bfbc43e748fe16be5d3f6303a`**. Detached worktree `/home/kevin/codex-qa-2026-10-22/c6-review-8cc23ab`. Independent reviewer Codex; date2026-10-22PDT/23UTC. No implementation involvement.

Read AGENTS/HANDOFF/QA STATUS/README/C6criteria, relevant architecture D4/D8/D9 and§7, field spec, water-cycle README, original prototype `project/curriculum-pack.js` and relevant Curriculum Pack screen wording. Never read pnpm-lock.yaml or project/support.js. Parent assigned F5→C4→C6 heavy-work order; initial work is source review and short ordinary file probes only.

## Errors

### C6-E1 — Medium: blank template contradicts F1 acceptance bar

`packages/connectors/src/reports.ts:187–195` builds a blank Course with every value empty via `tabSheet` at142–149. Exporting `xlsxExport.write(templateReport({date:'2026-10-22'}))` and reimporting with C1 returns **ok:false**, three blocking missing-field errors: Course.subject/topic/grade. Criterion F1 permits no errors except "no ideas". Empty Ideas produces informational tab_default, while the three unrelated errors block import. Exactly eight curriculum tabs plus permitted Read me sheet, spec column order and Course key/value structure are correct.

The repository regression at `export.test.ts:76–86` explicitly expects these three errors; its green result does not meet the written criterion. Suggested correction: supply valid neutral Course defaults for the blank template, or have the coordinator explicitly reconcile the contradictory blank/required-field acceptance bar before a revised verdict. Do not weaken C1 required Course validation or silently rewrite QA expectations to match implementation.

### C6-E2 — Medium: XLSX writer silently loses accepted text and report content

Two manifestations of the same destructive serialization policy: `packages/connectors/src/export.ts:137` silently slices every text cell at32767characters, and `export.ts:105–107` silently removes XML-invalid characters. Both return a successful FileRef without a diagnostic.

Ordinary accepted pack:500ideas, each title124characters, all sharing CODE-1. `alignmentReport` (`reports.ts:313–319`) joins their titles into one62998-character C2cell. XLSX stores **32767characters**, still claims500ideas in the count, and omits the final title. The exported file is retained as `c6-files-8cc23ab/wide-water-cycle-alignment-2026-10-22.xlsx`. The input is accepted and unchanged by parsePack; this is not an over-limit or malformed input. Individual Pack text field limits are≤8000, so no single over32767-character pack field was claimed—the ordinary report aggregation crosses Excel's limit.

Second accepted-pack example: `ideas[0].notes='bell\u0007tail'`. parsePack accepts/preserves it, but pack XLSX reimport succeeds with `belltail`. This confirms real pack text loss, independent of report aggregation. Source's existing test explicitly approves character dropping; a passing test does not make that loss reversible.

Suggested correction: split long report lists across rows/cells while keeping every title/ID, and encode accepted characters reversibly using appropriate spreadsheet string escaping plus matching import handling. Where a value cannot be represented, return a clear refusal/diagnostic rather than silently deleting content. Keep the existing formula-as-text guarantees. One serialization-loss finding covers these manifestations; no separate duplicate task is proposed.

### C6-E3 — Medium: list serialization changes a valid list's meaning

`packages/connectors/src/reports.ts:134–136` joins arrays using comma+space without an element-escaping convention. Set valid `assessment[0].key_points=['liquid, gas','heat']`; parsePack accepts/preserves it. Export pack XLSX and C1 reimport succeeds with **['liquid','gas','heat']**, changing two points to three. CSV uses the same packCell representation and shares the ambiguity. Ordinary CSV quoting protects the cell boundary but not the list-item boundaries inside the cell.

Suggested correction: define and implement a reversible list-cell encoding shared by exporter/importer, or explicitly refuse unsupported comma-bearing list entries with a located message. Do not silently transform a valid parsed pack. This is distinct from XLSX truncation/character stripping because it affects the shared logical list representation in both formats.

## Criteria

| Criterion | Weight | Result | Evidence |
|---|---|---|---|
|F1 blank workbook|must|FAIL|Spec headers/eight tabs/key-value pass, but default blank Course produces3blocking errors; E1.|
|F2 prototype sample rows|must|PASS|Independent vm executes original prototype in isolated window object; every tab's sample rows compared by prototype columns, including full persona prompt. New explanation uses spec example.|
|F3 teacher help|must|PASS|Read me rows independently match raw field spec type/required/missing for every column; nine sheets including help. Workbook actually loads in representative LibreOffice.|
|F4 sample roundtrip|must|PASS for required fixture|Both CSV zip and XLSX independently reimport deep-equal to original parsed water-cycle pack. Other accepted input fidelity fails E2/E3.|
|F5 data-check report|must|PASS|Exactly error/warning/info; shuffled input sorts serious first; full messages, affected titles, IDs and fix tab/column match three known sample issues.|
|F6 alignment report|must|PASS for sample|Independent per-code ideas/count/IDs and union of idea/unit code memberships; framework NGSS label; uncoded rain separately. Long ordinary report data loses content: E2.|
|F7 formats in Excel/Sheets|must|UNVERIFIED|CSV BOM/UTF8 and independent ZIP/XML validation pass; actual Excel and Google Sheets not executed. LibreOffice is available but cannot establish this exact compatibility requirement.|
|F8 ExportTarget interface|must|PASS|csvExport/xlsxExport each implement kind/write(ExportPayload):Promise<FileRef>; exported registry and report builders follow architecture§7.|
|F9 Atlas draft rows|should|PASS|Assessment draft CSV generated with exact raw-spec columns and original sample rows, BOM and safe file name.|
|S1 formula neutralization|must|PASS for executed representative checks|All6formula-like values CSV-prefixed or XLSXinlineStr style2; no<f>nodes; original first4titles survive XLSXroundtrip; independent Python confirms text/style tags. LibreOffice opens all formula workbooks and detects0formula cell types. Exact Excel/Sheets remain F7unverified.|
|S2 export scoping|must,whenAPIexposed|NOT APPLICABLE at current layer|No curriculum export HTTP routes/DB report requests exist; only pure library builders/writers. Thus no other-org403request path to exercise. Future API integration must enforce scope; this is not a demonstrated authorization bypass.|
|S3 student-data exclusion|must|PASS structural|Report builders project curriculum spec fields only; injected top-level student/progress/transcript and row student_email sentinels omitted. No student DB reads or exports.|
|P1 sample<300ms|must|PASS|240individual exports:20runs each of6builders×2formats; maximum5.371494ms, every run<300ms, first/raw samples retained.|
|P2 large XLSX<5s/<256MiB|must|PASS|Independent2000ideas/6000links/2000assessment workbook104.624410ms, OSprocesspeak106432KiB(~103.94MiB), file259443bytes. InputSHA256 and exact script retained.|
|U1 names|must|PASS|Safe topic/date names for pack/check/alignment/drafts; generic template date name. No spaces/unsafe characters in downloaded outer filename.|
|U2 readable reports|must|PASS for sample|Plain labels, affected titles, serious-first issues and frozen header pane on every worksheet independently verified;11workbooks actually opened via LibreOffice. E2 limits larger reports.|
|U3 terminology|should|PASS|Eight tab names/Teacher Settings/Curriculum Pack terminology matches reference; Read me uses spec labels and missing behavior.|

## Independent probes and artifacts

`c6-functional-8cc23ab.mjs` imports built public exports and raw field spec, evaluates original prototype in a minimal vm, uses its own CSV scanner/ZIP central-directory reader, validates expected report content and genuine importer roundtrips, writes ordinary output files to `evidence/c6-files-8cc23ab/`. No production test-generation helper or source mutation. All counterexamples independently assert parsePack ok and unchanged. Raw initial output is `c6-functional-first-8cc23ab.txt`; expanded output plus independent XML checks is `c6-functional-expanded-8cc23ab.txt`.

`c6-xml-8cc23ab.py` uses standard-library zipfile CRC validation and ElementTree, independent of production parser. Eleven generated XLSX files have valid ZIP/all XML parts, expected sheet counts, frozen panes and zero formula cells. It also checks all six formula-like pack titles are inlineStr with quote-prefix style2. CSVs/inner zipped CSVs all begin with UTF8 BOM; own CSV parsing verifies formula-like strings do not begin with unsafe characters after escaping. This proves serialization properties, not actual Excel/Sheets interaction.

Literal apostrophe "'=not-a-formula" survives both formats; embedded loneCR/tab survive. Canonical '=text' survives XLSX but CSV safety prefix becomes a literal apostrophe on C1 reimport. This CSV representation limitation is disclosed rather than misreported as formula execution; required F4 sample and XLSX formula roundtrips pass. LeadingCR/tab beforeformula are trimmed by existing contract normalization on XLSX reimport, not newly stripped by export XML handling.

## Suggestions

- Document that formula-safe CSVs retain a leading apostrophe when reimported by C1, or define a reversible representation that distinguishes an original literal apostrophe from a safety prefix. Do not simply strip all leading apostrophes: the valid literal "'=not-a-formula" currently survives correctly. XLSX already preserves the canonical formula-like text in executed roundtrips. This is a representation/usability limitation, not a demonstrated formula-execution vulnerability.
- When a future API exposes these pure exports, enforce organization/class authorization before choosing the pack, and exercise the conditional403criterion then. No report route exists in this candidate, so no current authorization bypass was asserted.

## Integration and environment

Detached worktree at exact head, explicit `git merge --no-commit --no-ff dfc44cf7fafc88ee51272a402d6aed080783e09f` succeeds without conflicts, non-noop. Twelve intentional base-only docs/coordination paths staged: AGENTS, architecture,handoff,plan,C5criteria,CXB,ledger,C5decision,F6earlyfinding,F6review,F6run1,tasks. Application C6 code is unchanged. No QA-authored source edit, commit or published Codex edit.

PATH prefix `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin`, Node22.22.0/pnpm10.28.0. Commands completed exit0 so far:

```sh
pnpm install --frozen-lockfile
pnpm --filter @ideamap/connectors... build
pnpm --filter @ideamap/domain build
node /home/kevin/codex-qa-2026-10-22/evidence/c6-functional-8cc23ab.mjs
python3 /home/kevin/codex-qa-2026-10-22/evidence/c6-xml-8cc23ab.py
```

Read-only REST confirms exact-head [build39896799848](https://github.com/tenkevin/mind-your-tutor/actions/runs/39896799848) and [plan39896799821](https://github.com/tenkevin/mind-your-tutor/actions/runs/39896799821) success on8cc23ab. Those validate plain tree744e5c11, while this report's local checks target combined0c7c184. Synchronization/expected-head merge/actual integration CI are coordinator duties outside this QA.

No custom/adversarial database probe, blocked F4 shadow-table/PR13-specific action, remote comment/write/claim/merge or application fix. New external QA artifacts only.

## Completed third-window performance and representative application execution

F5 released to C4; C4 explicitly released the heavy/performance window to C6 before these runs. No peer root/build/performance workload intentionally overlapped. Timed measurements executed sequentially before LibreOffice/root tests. Script `c6-perf-8cc23ab.mjs` uses public exports, canonical sample and its own reproducible larger pack. P1 includes report construction plus target writing; checkPack and fixture import occur before timing. P2 includes packReport+XLSX writing, excludes fixture construction/hash/import. No reduced workload, source override or relaxed threshold.

```sh
/usr/bin/time -f 'C6_sample maxRSS_KiB=%M elapsed=%e exit=%x' node /home/kevin/codex-qa-2026-10-22/evidence/c6-perf-8cc23ab.mjs sample
/usr/bin/time -f 'C6_large maxRSS_KiB=%M elapsed=%e exit=%x' node /home/kevin/codex-qa-2026-10-22/evidence/c6-perf-8cc23ab.mjs large
```

Both exit0. Raw first/all20samples per builder/format saved in `c6-perf-sample-8cc23ab.txt`; largest5.371494ms. Builders blanktemplate/sampletemplate/pack/data-checks/alignment/drafts each run CSV and XLSX20times. Measurements retain first observations; subsequent runs are warm and not called cold starts. Sample command0.37sec/92936KiB; these command metrics include Node setup and fixture import, separate from individual export timers.

Large input contains2000ideas,6000links,2000assessment rows. Serialized inputSHA256 `07afd8071a91db697eb6b7bec4657fc88dfadebddd0d559d133d1684d9b65349`. Timed export104.624410ms,259443-byte XLSX. resourceUsage maxRSS at exportcompletion106304KiB; independent `/usr/bin/time` final OS high-water **106432KiB**, command0.31sec, exit0. This is one Node process with no child workers; peak includes fixture/construction allocations, not just export heap. Both measures under256MiB. Full output `c6-perf-large-8cc23ab.txt`.

LibreOffice24.2.7.2 actually opened11generated XLSX workbooks, including blank/sample templates, ordinary pack/check/alignment/drafts, all formula report variants, and the wide alignment example. UNO inspected each used cell's application type and found **0formula cells**. This establishes representative application loading/formula handling, not Excel or Google Sheets compatibility. No real school/cloud file uploaded.

Dedicated headless instance launched with a new task-owned profile `/tmp/c6-lo-profile-uBFWEE` and localhostport20261:

```sh
libreoffice -env:UserInstallation=file:///tmp/c6-lo-profile-uBFWEE --headless '--accept=socket,host=localhost,port=20261;urp;StarOffice.ServiceManager' --norestore --nodefault --nofirststartwizard
/usr/bin/python3 /home/kevin/codex-qa-2026-10-22/evidence/c6-lo-8cc23ab.py
```

First reader attempt was too early: UNO Connection refused, exit1. No workbook was opened on that attempt. After server initialization the **unchanged** reader script succeeds, all11files; retained first readiness error and subsequent complete output in `c6-libreoffice-8cc23ab.txt`. This is an infrastructure readiness error, not hidden export-test failure. Script closes each document and calls terminate on that dedicated instance; launch process exits0. Profile retained as task-owned temporary evidence. No existing user LibreOffice instance was touched.

## Full integrated baseline and cleanup

Completed root `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `node scripts/plan.mjs check`: all exit0 on combinedtree0c7c184, firstattempt. Formatting reports all matched files formatted; plan:ok. Frozen install258packages. Build includes connectors exports and all workspaces. No source change or assertion edit.

Dedicated container created with `docker run -d --name codex-qa-c6-8cc23ab -e POSTGRES_PASSWORD=qa_disposable -p 127.0.0.1::5432 pgvector/pgvector:pg16`; ID34dd0ee36a594bb3eb23353dd7cc5c39692a02ddb35bdb3f5d6b0848b2e5e060. Inspected mapping localhost32789→5432 and `docker exec codex-qa-c6-8cc23ab pg_isready -U postgres` ready before tests. Password is synthetic QA-only. No other database/container used.

```sh
/usr/bin/time -f 'C6_ROOT elapsed=%e exit=%x' env DATABASE_URL=postgres://postgres:qa_disposable@127.0.0.1:32789/postgres pnpm test --disableConsoleIntercept
```

**Firstattempt exit0,53.98sec.** Raw complete stdout `c6-root-8cc23ab.txt`. No benchmark-reduction env vars inherited (`printenv IDEAMAP_PERF_EVENTS IDEAMAP_PERF_CHUNKS IDEAMAP_PERF_TEXT_ROWS` empty). Existing DB1million-event/10000chunk workload unchanged; ordinary accepted baseline tests only, no blocked function_binding/shadow-table additions. UI suite is accepted-base baseline only, not a fresh PR13-specific review or closure of its historical blocked review.

| Workspace | Result |
|---|---|
|Connectors|125/125,6files; includes21new C6 tests,5.85sec|
|DB|161/161,8files49.87sec; existing ingestion15358rows/sec>5000|
|Contracts|217/217,9files|
|Domain|96/96,3files; existing derive budget passes|
|Tracker|172/172,3files|
|UI|78/78,1file|
|AI|6/6|
|API / teacher|2/2 each|
|Student / worker|1/1 each|

Existing nonfatal AJV ignored-date-format warnings remain. No full-baseline assertion failed; first ordinary/performance results retained. The sole infrastructure failure was initial LibreOffice readiness above. Functional counterexamples returned successful files/imports with wrong content rather than process failures; their original observations remain in initial/expanded logs.

After root completion, third heavy/perf window explicitly released back to C4 for its final independent memory measurement. `docker stop codex-qa-c6-8cc23ab` succeeded; dedicated DB retained stopped. Existing test databases dropped by supplied harness; no production/other QA database touched. LibreOffice dedicated instance exited after document close/terminate; task-owned profile retained. Generated CSV/ZIP/XLSX artifacts remain under evidence/c6-files-8cc23ab for review.

Final HEAD8cc23ab, MERGE_HEADdfc44cf7, indextree0c7c184 unchanged. Exactly12intentional base-document merge paths remain staged, no unstaged changes, conflicts or QA test artifacts inside repository. This staged scratch merge is intentional evidence, not a clean-HEAD claim. No implementation edit, task claim/state change, commit, published Codex edit, remote write/comment or merge. Stop after this report; parent owns publication and correction routing.

## Parent review and routing

Parent read the complete report, independent harness, original/expanded observations and relevant export/report code. The three errors above are distinct and supported; their proposed corrections are endorsed. Route them to the existing open C6 work before acceptance. Priorities are Medium/P2; batch publication after the completed audit is appropriate. Excel/Google Sheets is a required unverified check, not an invented compatibility defect or a PASS inferred from LibreOffice.

Regression expectations: E1 must import the untouched template under the agreed Course requirements; E2 must preserve all 500 alignment titles and accepted control-character text (or return an explicit actionable refusal); E3 must preserve the two original comma-bearing list items without silently changing their meaning. Add tests at the public export/import boundary, not only internal writer snapshots. No implementation edits or task merges were made.
