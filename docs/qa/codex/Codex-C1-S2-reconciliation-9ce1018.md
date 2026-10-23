Reviews: C1

# Codex C1-S2 reconciliation

Exact reviewed SHA: `9ce1018f853dab10157b614e92821eb8ffb9cc9d` (PR #8). Reconciliation date: 2026-10-22 America/Los_Angeles. Live REST query confirmed that head remains unchanged and PR is open. This is a new report; published original reports are unchanged. Independent Sol-medium QA; coordinator read the complete report, reproduction script and logs, inspected source, and verified the limits of the evidence.

**Publication priority: immediate, before any C1 merge.** A confirmed resource-exhaustion failure invalidates the previous overall PASS for this pinned head.

**Verdict: FAIL. C1-E1 below supersedes the broad scoped PASS in Codex-C1-followup-9ce1018.md for merge approval on this head.** Earlier single-entry bomb tests and normal large-workbook tests did not cover long individual CSV fields retained across many ZIP entries. They do not clear this mandatory C1-S2 failure. Prior functional/spreadsheet results remain useful, but cannot establish overall PASS while this resource failure persists.

Read and reconciled the [independent QA report](https://github.com/tenkevin/mind-your-tutor/pull/8#issuecomment-6354070896), C1-S2/P3 criteria, and `/home/kevin/coordinator-takeover-2026-10-22/pr-audit.md`. The posted reviewer reports default-host V8 heap crashes on both archive shapes and a 4GiB-heap run using 2957MB RSS/25.8s. Those unrestricted timings and default-host crashes are their evidence, not measurements repeated by this audit.

## Errors

### C1-E1 — High: small ZIP uploads exhaust process memory before limits or duplicate-tab errors are returned

This is the existing PR QA crash, newly recognized as a canonical error in the Codex reports. One error covers both the multiple-tab and duplicate-tab variants; do not create independent duplicate tasks for those shapes.

Sources at the exact SHA:

- `packages/connectors/src/csv.ts:79` and `:89`: `parseCsv` grows field strings one character at a time with `field += ch`, without a cell-length limit.
- `csv.ts:145–152`: `readCsvZip` inflates, decodes and parses every matching CSV entry, retaining each RawSheet in out.sheets.
- `packages/connectors/src/import.ts:125–143`: duplicate-tab detection runs only after `connector.parse` has returned all raw sheets, after the costly work and retained allocations.
- `packages/connectors/src/zip.ts:140` and `:173`: the unpack budget bounds bytes as entries are read. It does not bound CSV string/parse memory, and the archive's aggregate declared output is not rejected before parsing starts.

Expected: an oversized aggregate archive returns a clear refusal without invoking-process death; within-limit long cells receive resource-safe bounded handling or a clear rejection, rather than uncontrolled parse-memory amplification. Duplicate tabs should be detected before parsing their content. Actual: memory exhaustion terminates the invoking process/container without any ImportResult. **C1-S2 (must) FAIL; C1-P3 (should) FAIL.** The768MiB test limit is a safety control and diagnostic budget, not a newly invented product requirement. This does not mean C1-P2's separate ordinary large-workbook case failed.

Independent bounded reproductions used existing Docker image `node:22.22.0-bookworm`. Every run had `--network none --read-only --memory 768m --memory-swap 768m --cpus 1 --pids-limit 64 --ulimit core=0`, a read-only mount of the isolated QA directory, and image entrypoint `timeout 45s node /qa/evidence/c1-s2-bounded.mjs <bytes-per-cell> <entries> [duplicate]`. No host Node parser was run on hostile data. Containers auto-removed. Production/worktree mounts were never written. The script logs Node execArgv and V8 heap limit before import: **execArgv=[]**, heap limit **4345298944** bytes. No artificially lowered V8 heap flag was used. Docker's 768MiB cap was deliberately stricter than that V8 limit to prevent host OOM; resulting failures below are **container OOM kills**, not independently demonstrated V8 default-host heap exceptions.

| Shape / script arguments | Archive and unpacked size | Result |
|---|---|---|
| Small control: `262144 1` | 390-byte ZIP, 256KiB output | Returns normal invalid-header/missing-tab issues in33.6ms; maxRSS79180KiB. |
| Scaled control: `1048576 8` | 9078-byte ZIP, 8MiB output across eight distinct tab names | Returns issues in1998.9ms; maxRSS409596KiB (~400MiB), heapUsed320936320 bytes. This input already consumes roughly50× its raw bytes in process RSS. |
| Reported inside-limit shape: `10485760 8` | **82438-byte ZIP**, 80MiB output, eight distinct tab CSVs each a10MiB single field | Docker exit137; no ImportResult. Docker daemon records an `oom` event. This is inside the100MiB unpack cap and only one row per file. |
| Duplicate variant: `1048576 100 duplicate` | **114202-byte ZIP**,100MiB output,100 entries `partN/Ideas.csv` each1MiB field | Docker exit137; no ImportResult or duplicate-tab error. Docker daemon records another `oom` event. This smaller-than-reviewer duplicate shape independently reproduces the failure mechanism. |

Docker OOM events were observed at epochs1792716337 and1792716343. Both processes exited137 before the45s timeout rather than timing out. The hard per-container cap protects the host, so this audit does not claim it reproduced the reviewer's specific unrestricted default-heap crash timing. It does independently prove severe memory amplification and failure to reject the same malicious input family under explicit bounded resources. The source data flow and the prior reviewer's larger unrestricted runs agree on the underlying defect.

Impact: an importer invocation can take down its process instead of returning a refusal. If later called in a shared server process, that can affect other requests. No currently implemented Fastify import endpoint or deployed service outage was established by this audit.

Suggested fix: add an explicit per-cell/header length bound before allocating an enormous CSV field (including quoted and unquoted cells); construct normal fields by slicing/index spans or bounded chunks instead of per-character string chains; preflight aggregate archive sizes and detect duplicate canonical tab names before unpacking/parsing duplicate content. Keep honest and forged ZIP-size checks. A byte budget alone does not control parser allocations; enforce a parse/cell budget as well.

Regression: retain single-entry genuine/forged bombs, and add (1) many distinct entries containing long fields under the100MiB byte cap, (2) many duplicate `partN/Ideas.csv` entries, and (3) a smaller long-cell control with measured bounded resource usage. Each malicious case must return a clear FileRefused/ImportResult within the stated fail-fast bound without process termination. Run crash regressions in a bounded child/container and assert both exit status and response; do not run potentially crashing inputs in the main Vitest worker. Ensure quoted/doubled-quote/CRLF and normal large workbook equivalence still pass after parser changes.

## Suggestions

- Tighten future QA evidence language: a passing single-entry ZIP bomb test proves its narrow path, not the safety of every compressed upload shape. Distinguish normal-workbook memory, inflated-byte limits and long-cell parser allocations.
- Preserve the independent review's other suggestions for separate scoped triage; this reconciliation did not verify macro content-type variants, near-miss warning severity, or skipped-only unsafe-entry messages, and makes no new claim about them.
- Keep unchanged integration finding C2-E5 and URL credential suggestion F3-S5 under their original IDs; neither is a separate cause of C1-E1.

## Artifacts and scope

Retained outside idea-map: `evidence/c1-s2-bounded.mjs`, `c1-s2-control.txt`, `c1-s2-eight-1m.txt`, `c1-s2-eight-10m.txt`, `c1-s2-duplicates.txt`, and `c1-s2-docker-oom-events.txt`, all under `/home/kevin/codex-qa-2026-10-22/`. Large-case logs stop after archive size because the container is OOM-killed; exit137 is recorded in the tool execution evidence and summarized above.

The independent tester made no implementation fixes, task claims/status edits, commits, pushes, merges or remote comments. The coordinator publishes only this new report from an isolated publication worktree. Final isolated worktree remains clean. Current branch CI success cannot override this confirmed mandatory safety failure.
