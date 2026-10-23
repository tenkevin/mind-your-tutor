Reviews: C1

# Codex C1: newer importer regression review

Reviewed commit: `9ce1018f853dab10157b614e92821eb8ffb9cc9d`.
Compared with original reviewed C1 commit `600c5a3813b5ecd9ecce05974dd1cba0bc0f8c12`. Date: 2026-10-22 America/Los_Angeles. Independent Sol-medium QA; coordinator read the complete report and assessed routing. Node 22.22.0 / pnpm 10.28.0. No implementation changes.

**Verdict: PASS for scoped C1 criteria and executable regression checks; no new importer error. Publication priority: task completion.** This is a routine pass/status update, not a newly urgent finding. The unchanged contract integration error below retains its existing priority and ownership.

## Validation and limits

Importer production files are unchanged from the original reviewed head. Relevant changes concern package source-condition resolution, matching test/type configuration, and a faster valid-deflate bomb fixture. The fixture's added inflate-validity test passes; the full tests still exercise real one-GiB expansion with honest and forged declared sizes.

- Frozen install; root lint, format, typecheck, test, build and plan check: pass. Connector tests **98/98**, contracts **208/208**; exact-head GitHub build/check both successful.
- Production dependency audit: no known vulnerabilities found at review time. Maintainer activity was not independently verified.
- Independent importer harness passes under **UTC, Pacific/Auckland and America/Los_Angeles**: three-format JSON/CSV/XLSX equality, styled percentage 0.7 → 70, and serial date 46325 → 2026-10-30.
- Harness also checks uppercase CSV filenames in ZIP, explicit mappings, blank-relation row skip with warning, invalid idea unit with cell-level blocking issue, empty library acceptance and XXE refusal. Existing suites cover formula/macro rejection, traversal, oversized files and unpack caps.
- Targeted large-workbook run: test-file duration **1.08 s**, full command wall time **2.58 s**, maximum process RSS **132,784 KiB** (~130 MiB), within the 3 s / 256 MiB bars. RSS is maximum process RSS, not the sum of concurrent process peaks.

Re-run the baseline from this commit with Node 22 / pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test && pnpm build && node scripts/plan.mjs check
pnpm --filter @ideamap/connectors exec vitest run src/security.test.ts -t 'large workbook scales'
```

D12/D13 behavior is explicitly pending C9 at this pinned head. Blank unit objectives/questions and the new persona registry are not misclassified as newly introduced C1 regressions. This branch's passing root checks do not clear the different merged snapshot's F4-E3 failure.

## Errors

**No new C1 error. Do not create duplicate tasks from these status observations.**

- **Existing C2-E5 persists:** an otherwise valid draft with empty issues parses; replacing only issues with `checkPack(parsedFixture)` yields **21 contract validation errors**. The version accepts PackIssue fields while checks produce level/kind/items/fix. This is the [canonical integration finding](Codex-C2-checks.md), not a new importer defect or proof of an implemented publish-endpoint vulnerability. Suggested correction remains typed separate collections or a typed union, preserving check fields and applying error-level publish gates. Regression: draft persistence retains checks, errors block publication, warnings/info do not.
- Missing idea-objective feedback remains a downstream C2 concern at this head. The newer C8 branch independently supplies the warning; see [C8 follow-up](Codex-C8-quality-1e6a55c.md). Branch-specific results must not be conflated.

## Suggestions

- Preserve the independent spreadsheet percentage/date and three-format equivalence cases as maintained regression tests. They confirm earlier raw-contract concerns remain mitigated by the importer.
- The earlier shared URL-validator suggestion persists: `https://user:pw@evil.example/` imports without warning. Consider credential rejection/normalization in the existing validator follow-up, not a duplicate C1 error task.
- After C9 implements D12/D13, rerun three-format equivalence with blank unit objectives/questions and omitted Personas using the new expected behavior.

## Artifacts

Complete independent report and reproducible harness/logs are retained under `/home/kevin/codex-qa-2026-10-22/`: `evidence/c1-probes.test.ts`, `evidence/c1-9ce1018-probes-output.txt`, and `evidence/c1-9ce1018-integration.mjs` with its output. Temporary test files were removed; the isolated source worktree is clean. No previous Codex report was changed.
