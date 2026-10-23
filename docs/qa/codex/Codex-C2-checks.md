Reviews: C2

# Codex C2: cross-row data-check QA

Reviewed commit: `01f1eab6dc3a13c2a8c65fc81e50a2edf6d77eb6`.
Review date: 2026-10-22. Independent Sol-medium QA, followed by coordinator review. Node 22.22.0 / pnpm 10.28.0. This is the initial pinned-commit review, not a rerun against later commits. Publication context was inspected at `92963ed9bee24c3451c8d081885bb723320906ba`. No implementation changes or task-status changes were made.

Routing: only entries under **Errors** are proposed must-fix defects. **Suggestions** are nonblocking follow-ups. IDs below identify findings, not newly claimed plan tasks. Check overlapping C8/C9 work before scheduling duplicate fixes.

## Validation and limits

**Verdict: listed narrow checks pass; confirmed correctness/integration errors below require follow-up.** Domain 32 tests, contracts 208 tests, build/types/lint and plan check pass. Independent graph reachability oracle agreed on cycle membership across 200 random graphs. Sample check median 0.067 ms; 2,000/6,000/2,000 input with 20 planted unknown units detected all 20 in 7.1 ms. Coordinator independently reran the harness.

At publication context 92963ed, checks.ts/data-checks.ts remain identical; CurriculumVersion still restricts issues to PackIssueSchema. This is source inspection, not a fresh integrated test run. C8 already covers several errors.

## Errors

### C2-E1 — Medium: question row counts conceal missing idea coverage

Source: [checks.ts around lines 219 and 282–285](https://github.com/tenkevin/mind-your-tutor/blob/01f1eab6dc3a13c2a8c65fc81e50a2edf6d77eb6/packages/domain/src/checks.ts#L219).

Reproduce with three otherwise clean ideas i0/i1/i2 and three Assessment rows for i0/i1/i0. Actual: no issues, although i2 has no question. Expected: coverage identifies i2.

Suggested correction/regression: count distinct valid in-unit ideas with usable questions; duplicate rows must not inflate coverage. Already **C8-F1**.

### C2-E2 — Medium: assessment unit references are not validated

Source: checks.ts lines 206–223. A row's idea_id is validated but its unit's existence/agreement is not.

Reproduce: move i2 to valid unit 2 but leave its question in unit 1; actual only unit-2 coverage notice, no mismatch warning, and unit 1 counts the misplaced question. Setting assessment unit 9 (absent from Units) likewise produces no invalid-unit warning.

Suggested correction: validate unit existence and agreement with the idea before counting; warn/skip unusable rows. Regression combines unknown/wrong units and duplicate questions. Already **C8-F1**.

### C2-E3 — Medium: missing Ideas.objective is silently accepted by checks

A clean pack with objective:null yields no issues and canPublish true. The spec explicitly delegates this missing value to data checks; row parsing intentionally permits null. Source: contracts pack.ts around line 76, no corresponding kind/check in data-checks.ts/checks.ts.

Suggested correction: add a stable missing-objective warning with Ideas/objective correction target. The warning's absence is the defect; the spec does not require this to block publishing. Regression: import→check omitted/empty/null values while preserving the sample's intended three issues.

Overlap: **C8-F4**; new D12/C9 also governs missing unit objectives and assessment questions. Do not conflate those fields.

### C2-E4 — Medium: multi-cycle repair advice falsely implies one edge is enough

Source: checks.ts lines 103–109. For a→{b,c}, b→a, c→a, actual message shows a↔b and says remove one of those requirements to break the loop. All three members appear in items, but removing the displayed edge leaves a↔c.

Suggested correction: name the component's members and explain all remaining loops must be broken, or give a verified sufficient repair. Regression removes the first suggested edge and checks the remaining loop/guidance. Detection itself is correct. Already **C8-F2**.

### C2-E5 — Medium: data-check output cannot be stored in the version contract

Sources: [curriculum-version.ts issues field](https://github.com/tenkevin/mind-your-tutor/blob/01f1eab6dc3a13c2a8c65fc81e50a2edf6d77eb6/packages/contracts/src/curriculum-version.ts#L51) and data-checks.ts.

Reproduction: build an otherwise valid draft with parsed fixture pack and `issues: checkPack(pack)`. Actual: safeParse false with **21** errors for severity/effect/tab/row/column/value/fallback. DataCheckIssue uses level/kind/items/fix; CurriculumVersion accepts only PackIssue. Expected architecture pipeline can preserve its data checks in the version. The publish refinement also checks only import blockers.

Suggested correction: separate typed parse/check collections or use a discriminated union; preserve data-check fields and gate publication on error-level checks. Regression: draft round-trip retains all issues, prerequisite errors prevent publication, warning/info-only checks permit it.

This is a contract integration defect before C4/C5, not evidence that an unimplemented publish endpoint is already bypassable. Coordinate ownership with F3/F4 contract consumers.

## Suggestions

- **C2-S1 / prior C2-5:** a 10k broken-root chain emits 9,999 downstream warnings plus the root. Group by cause or summarize/paginate without losing affected IDs. Already **C8-F3 / C8-U1**.
- **C2-S2 / prior C2-6:** direct packs with empty categories skip category checking; C1 installs a fallback. Define normalization responsibility or return fallback info; test direct and imported packs. Already **C8-F9**.
- **C2-S3 / prior C2-7:** a link with both ends unknown exposes only from_id in fix.column while text names both. Support multiple correction locations or separate issues; test both cells. Already **C8-F9**.

## Coordinator assessment

Graph detection and performance were strong. Coverage accounting, repair guidance, and the boundary between parsing and cross-row issue contracts need stronger end-to-end assertions.
