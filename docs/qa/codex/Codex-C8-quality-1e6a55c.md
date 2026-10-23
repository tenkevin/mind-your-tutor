Reviews: C8

# Codex C8: data-check and quiz quality rerun

Reviewed commit: `1e6a55c61a3f6e083f9c35e1740f674caa968dc2` (PR #11). Date: 2026-10-22. Independent Sol-medium QA, followed by coordinator review; isolated worktree `/home/kevin/codex-qa-2026-10-22/quality-1e6a55c`; Linux, Node 22.22.0, pnpm 10.28.0.

**Publication priority: immediate, before the C8 merge decision.** Confirmed failures of C8-F2/F6 must criteria mean the iteration is not ready despite green CI. Existing finding IDs are retained to avoid duplicate tasks. The coordinator read this report completely, inspected the affected source, and independently reran the retained harness: the counterexamples and four resolved errors reproduced.

**Verdict: FAIL.** Most targeted fixes work. Existing canonical **C2-E4** (repair advice) and **C3-E2** (grammar) are only partially resolved; current counterexamples appear under Errors. Existing **C2-E5** remains an integration issue outside C8's stated fixes. These are updates to existing findings, not requests to create duplicate tasks. Only Errors are must-fix; Suggestions are nonblocking.

Read this HEAD's AGENTS, QA README, C8/C2/C3 criteria, architecture/spec, fixture README, PR #11 body and original published Codex C2/C3 reports. The independent reviewer made no production edits, published Codex-file edits, task-status changes, commits, pushes, PR comments or merges. The coordinator publishes only this new report; no implementation fixes are included. No database connections or database security probes. Scratch files remain outside the repository.

## Validation and evidence

From the isolated worktree with toolchain PATH `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin:$PATH`:

```text
pnpm install --frozen-lockfile   PASS
pnpm lint                      PASS
pnpm format:check              PASS
pnpm typecheck                 PASS
pnpm test                      PASS (domain 89, contracts 208, tracker 56, UI 73; all workspaces green)
pnpm build                     PASS
node scripts/plan.mjs check     plan: ok
node /home/kevin/codex-qa-2026-10-22/reports/c8-quality-probe.mjs  exit 0
```

All named local commands completed; final `git status --short` was empty. Exact-head GitHub check-runs queried read-only: [build success](https://github.com/tenkevin/mind-your-tutor/actions/runs/39875369755/job/120159569306), [check success](https://github.com/tenkevin/mind-your-tutor/actions/runs/39875369782/job/120159568117). Existing tests passing does not establish the counterexamples are fixed.

Retained independent harness: `/home/kevin/codex-qa-2026-10-22/reports/c8-quality-probe.mjs`. It imports built public domain/contracts exports; creates its own complete fixtures instead of using implementation test helpers; asserts coverage, grouping, normalized visible-answer correctness, seed boundaries and contract shape; prints counterexamples without treating their persistence as harness failure. It does not mutate source files. Its fixtures are built from the parsed sample; the Children grammar fixture separately passes `parsePack`.

| Criterion | Result | Evidence |
|---|---|---|
| C8-F1 must | PASS | Three ideas with questions i0/i1/i0 reports i2 missing; valid-unit mismatch warns and does not cover either unit; unit 9 row warns/skips. Correct missing-ID arrays retained. |
| C8-F2 must | **FAIL in general advice** | Both exact listed shapes a→{b,c},b→a,c→a and a→{a,b},b→a now name every member and give appropriate multiple-removal advice. A different valid multicycle shape gets false minimum-removal advice; existing C2-E4 below. |
| C8-F3 must | PASS | Own 2000-idea pack with two unknown roots/two loops gives four blocked issues with 333/333/664/664 affected IDs, eight total issues. 10000 broken-root chain gives one prereq + one blocked with all 9999 downstream IDs. |
| C8-F4 must | PASS for missing-value reporting; spec caveat | Null, empty and whitespace idea objectives generate one grouped objective warning with correct Ideas/objective target. Current field spec instead says optional / “Tutor writes one from links”; C8 permits flagging or fallback. Warning is present and nonblocking. See nonblocking stale-spec-comment suggestion. |
| C8-F5 must | PASS | 120 independent pack/seed combinations: original duplicate/case-equivalent titles, both link directions, with/without deliberately hidden conflicting links. 600 complete-link questions: **zero** alternative options form any normalized pack statement; **zero** case-equivalent options. 60 hidden-link instances examined. |
| C8-F6 must | **FAIL** | Category wording fixed. A valid grammatical source “Children play Games” still produces **“The Sun play Games.”**, seed 5; existing C3-E2 below. This failure does not depend on malformed source relation text. |
| C8-F7 must | PASS | Inputs 1, 2**32+1, 2**31, -1, -(2**32)-1, MAX_SAFE_INTEGER, MIN_SAFE_INTEGER: stored seed equals `seed | 0`; entire output equals derivation with stored seed. |
| C8-F8 should | PASS on reduction, residual suggestion | Distance/adjacency filters remove original named bad examples; existing 20-seed regression passes. Generic True/False still treats graph absence as world falsity; C3-S1 remains nonblocking. |
| C8-F9 should | PASS | Empty Categories produces no_categories warning; doubly unknown link exposes fix.columns ['from_id','to_id']. |
| C8-F10 must | PASS | All local checks above and both exact-head CI checks green. Sample remains exactly prereq error ground/aquifer, codes warning rain, media info 11 ideas; sample derive remains 27 kept/4 hidden, centre evap, 18 banks, minimum 8 questions. |
| C8-S1 must | PASS | Type-only checks imports, pure derive siblings; no I/O introduced. Independent 10000 broken-root chain completes without stack overflow (55–60 ms). Existing deep/fanout tests pass. |
| C8-P1 must | PASS | Own 2000 ideas/6000 links/2000 assessments with 20 planted invalid-unit ideas: finds all 20; checks **4.40 ms**, repeat **6.54 ms** (<200). Full derive **307.20 ms**, repeat **364.81 ms** (<1000). Timers exclude schema validation performed afterward. |
| C8-U1 must | PASS | Summaries **8 to review** for four causes, **2 to review** for 10000-idea broken-root chain. Complete affected IDs retained in items. |
| C8-U2 must | **FAIL literal bar** | Read all questions for sun/glacier/ocean/rain/rivers (46 questions, seed 1). Category grammar is fixed; original sample relations still produce “Oceans supplies …”, “Oceans moderates Climate.” and incoming option combinations “Plants feeds Rivers.” PR documents source-text limitation, but that is not a criteria waiver. Separate valid-source F6 counterexample above establishes generator-owned residual grammar. |

Performance is measured on this local environment, not claimed as CI hardware throughput. No browser rendering or teacher flagging UI was exercised; C8 is a pure package task. No claim every grammatical English noun can be inferred from its spelling.

## Errors

### Existing C2-E4 — Medium, partially resolved: multicycle advice now overstates removals needed

Current source: `packages/domain/src/checks.ts:117`–127. The code assumes any strongly connected component with more than one in-component outgoing requirement at any node needs more than one edge removed. That implication is false.

Self-contained graph: three otherwise valid ideas **A**, **B**, **C** in one valid unit/category, with valid objectives/media/codes/assessment and any valid connecting Links rows. Set their requires arrays to:

```text
A: [b, c]
B: [c]
C: [a]
```

Run `checkPack(pack)` and inspect the cycle issue. Actual message names all three correctly, but says:

```text
A requires B and C; B requires C; C requires A.
Removing one requirement won't break it: remove requirements in Ideas → requires
until no idea here depends on itself.
```

Remove **only C→A** by setting C.requires=[] and rerun. Independent harness verifies **no cycle issue remains**. Both cycles shared that one edge. Expected: repair advice remains correct for the component, without asserting a lower bound on removals that was not calculated.

The original two requested complex shapes now work; detection/membership is not broken. This is continuation of canonical C2-E4, owned by C8-F2, not a separate duplicate task. Suggested correction: neutral advice such as “Remove requirements until no prerequisite loops remain; this component can contain several loops.” Computing a verified sufficient repair is optional. Regression: this shared-bottleneck graph alongside the existing two-independent-cycle and self-loop cases; remove the common edge and assert all cycles disappear and advice makes no false claim.

### Existing C3-E2 — Medium, partially resolved: valid irregular plurals still generate agreement errors

Current source: `packages/domain/src/derive/quiz.ts:34`–38 (`readsPlural` suffix heuristic), `:173` and `:228` (uses the heuristic to permit swaps).

Self-contained fixture accepted by `parsePack`: 12 ideas i0…i11 with titles, in order:

```text
Children, Games, The Sun, Temperature, Evaporation, Cloud,
Freezing, Water, Ice, Condensation, Climate, Soil
```

Use one valid unit, two categories Thing/Process, valid objectives and other required fields. Exactly one link: **i0→i1, relation “play”, importance 3**. The harness supplies fake valid media/codes and one Assessment row per idea; those fields do not drive quiz generation. Call `derive(pack,{seed:5})`.

Actual bank **i1** contains:

```json
{
  "id": "i1/false/i0>i1/i2",
  "prompt": "True or false?",
  "text": "The Sun play Games.",
  "answer": "False",
  "explanation": "The map says: Children play Games."
}
```

Expected: generated question reads naturally. The source sentence **Children play Games.** is grammatical. `readsPlural('Children')` and `readsPlural('The Sun')` both return false, so the generator itself introduces the error. Contrary to the helper comment, a wrong guess can permit a bad swap, not merely narrow the choice.

Category explanations are resolved: “The map says: the category for Glaciers is Thing.” is agreement-neutral, and original “The Sun perform Transpiration.” swaps are filtered. Nonetheless the existing canonical C3-E2 remains open under C8-F6. Sample seed 1 additionally contains **Clouds soaks in as Groundwater.**; its source relation already has singular agreement (“Rain & snow soaks…”), so this is inherited-data context, not the main proof.

Suggested correction: quote relation labels in map-scoped questions so the template does not need to guess subject agreement, or use explicit reliable grammatical metadata/curated inflections. A suffix heuristic is not a general English number guarantee. Regression: Children/play plus singular replacement, plural-to-singular and singular-to-plural cases, incoming completion distractors and False-statement swaps. Do not silently rewrite arbitrary teacher phrases to guessed English.

### Existing C2-E5 — Medium, persists outside C8's stated fix scope: version issue contract mismatch

Current source: `packages/contracts/src/curriculum-version.ts:52` still accepts only `z.array(PackIssueSchema)`; `checkPack` returns `DataCheckIssue` with level/kind/items/fix.

Harness builds an otherwise valid fixture draft; `CurriculumVersionSchema.safeParse(draftWithIssuesEmpty)` succeeds. Replacing only issues with `checkPack(parsedSample)` yields **success:false, 21 validation errors**. These new C8 kinds do not resolve the boundary.

This is the same canonical C2-E5 previously reported; **do not create a second C8 task for it**. Coordinate its existing contract/import/publish owner. Suggested correction remains separate typed parse/check collections or a typed union, preserving data-check fields and respecting error-level publishing gates. Regression: sample draft round-trip retains checks, error-level checks prevent publication, warning/info-only checks do not.

## Suggestions

- **Existing C3-S1, nonblocking:** heuristics reduce the old world-true False examples but do not make absent edges false. Sample seed 1 still marks **Plants affect Climate.** and **The Sun powers Precipitation.** False under generic “True or false?” wording. Ask whether an edge appears in the map, or curate factual false claims; test scope-specific wording. This remains the original nonblocking suggestion / C8-F8, not a new error or a claim that C8 promised proof of world falsity. PR #11 acknowledges heuristics and later teacher flagging; that future UI was not tested.
- **Spec/comment alignment, nonblocking:** this pinned `docs/spec/curriculum-pack.fields.json` marks **Ideas.objective optional**, missing behavior **“Tutor writes one from links”**. `checks.ts` comment and PR body still describe it as required / “Flagged in data checks”, which is the Units.objective rule. The new warning addresses original C2-E3's missing-feedback problem without blocking publication, but wording/docs should distinguish optional idea fallback from unit-objective requirements. No assertion that tutor generation itself belongs in this pure check function.
- Keep the independent visible-text oracle in regression tests: duplicate and case-equivalent labels, incoming/outgoing direction and hidden links all passed this rerun. Broadly preserve those properties when changing quiz templates to address grammar/map scope.

## Canonical finding status

| Original ID | Status at this exact SHA | Routing |
|---|---|---|
| C2-E1 coverage | Resolved | C8-F1 independently passes distinct-idea repro. |
| C2-E2 assessment unit validation | Resolved | C8-F1 warns/skips wrong/unknown units. |
| C2-E3 missing idea objective feedback | Resolved for warning requirement; current optional/fallback spec caveat above | C8-F4; do not conflate Units.objective. |
| C2-E4 inaccurate loop repair advice | Partially resolved, remains Error | C8-F2; current shared-edge counterexample above, same canonical ownership. |
| C2-E5 version/check issue integration | Persists, out of C8 stated fixes | Existing contract/import/publish follow-up; no duplicate C8 task. |
| C3-E1 visible answer ambiguity | Resolved on original and extended direction/hidden-link repros | C8-F5: 600 questions, zero ambiguous distractors/case duplicates. |
| C3-E2 natural-English agreement | Partially resolved, remains Error | C8-F6; valid Children/play proves generator residual. U2's unchanged bad source phrases are separately identified. |
| C2-S1 grouped knock-ons | Resolved | C8-F3/U1 summaries are small and full affected lists preserved. |
| C2-S2/S3 empty categories/multiple fix columns | Resolved | C8-F9 independent repros pass. |
| C3-S1 world truth vs absent graph edge | Improved but persists as Suggestion | C8-F8 is should, generic wording remains. |
| C3-S2 seed storage | Resolved | C8-F7 canonical stored seed and full-output replay pass boundary checks. |

The original C3 natural-English error used a stricter reading of the old must criterion than prior QA's should classification. C8 now explicitly makes grammar a must, so the valid-source irregular-plural counterexample is direct C8-F6 noncompliance; it is not a newly imposed requirement to implement linguistic inflection.
