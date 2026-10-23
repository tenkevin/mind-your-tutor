Reviews: C3

# Codex C3: ranking, layout and quiz QA

Reviewed commit: `26ded0468368e12509196d45086ef2b662a0563b`.
Review date: 2026-10-22. Independent Sol-medium QA, followed by coordinator review. Node 22.22.0 / pnpm 10.28.0. This is the initial pinned-commit review, not a rerun against later commits. Publication context was inspected at `92963ed9bee24c3451c8d081885bb723320906ba`. No implementation changes or task-status changes were made.

Routing: only entries under **Errors** are proposed must-fix defects. **Suggestions** are nonblocking follow-ups. IDs below identify findings, not newly claimed plan tasks. Check overlapping C8/C9 work before scheduling duplicate fixes.

## Validation and limits

**Verdict: changes required for answer correctness and literal C3-U1 natural-English compliance.** Existing 43 domain tests pass. An independent harness completed 62 ranking/layout/serialization invariant runs, 30 duplicate-title seeds, sparse/category/frozen-input checks. Sample: 27 kept/4 hidden links, centre evap, 18 banks/167 questions. Large pack: 2,000 ideas/6,000 links, 22,000 questions, 246.886 ms; sample median 0.712 ms.

Coordinator reran the harness and reproduced the same ambiguities. Production derive code is unchanged between reviewed head and 92963ed; merge edits moved file reading between test helpers. No final-tree test run is claimed. Several findings already have C8 criteria.

## Errors

### C3-E1 — High: duplicate titles produce multiple defensible visible answers

Source: [quiz.ts lines 132–158](https://github.com/tenkevin/mind-your-tutor/blob/26ded0468368e12509196d45086ef2b662a0563b/packages/domain/src/derive/quiz.ts#L132). Different idea IDs may have identical titles; contracts accept them.

Reproduction pack: IDs i0…i11; i0…i3 titled Water, i4/i5 water, remaining titles Target 6…Target 11. Links i1→i6 and i2→i9, relation “leads to”, importance 3. With seed 3, i2 asks **Water leads to …**, offers **Target 6 / Target 8 / Target 11 / Target 9**, marks Target 9 correct. Target 6 also completes an explicit pack statement with the same visible premise. Seed 1 also offers Water and water as different options.

Across 30 seeds: **65** questions had another option completing a known normalized statement; **40** had case-equivalent option labels. Expected: one defensible visible answer, not merely one exact string equal to answer.

Suggested correction: exclude distractors completing any normalized known statement, deduplicate visible labels consistently, and skip/disambiguate a premise that remains ambiguous. Regression covers seeds 1/3, incoming/outgoing and hidden links.

Overlap: **C8-F5** already targets this historical finding. Coordinate the fix instead of duplicating implementation.

### C3-E2 — Medium: generated sentences fail the natural-English criterion

Source: quiz.ts category template around line 123 and endpoint substitution around 200–202.

Sample outputs: “Glaciers is a thing.”, “The Sun perform Transpiration.”, “Freezing release Precipitation.” and “Rivers soaks in as Groundwater.” The category error is generator-owned; swapping subjects also breaks the relation's inflection.

Suggested correction: agreement-neutral category wording (“Category: Thing”) and map-edge prompts that quote relation labels, or curated inflections. Regression covers plural titles and both singular/plural subject substitutions.

This is a stricter reading of mandatory C3-U1 than earlier QA's should-level classification. Overlap: **C8-F6 / C8-U2**.

## Suggestions

- **C3-S1 / prior C3-2:** absence from the graph does not prove real-world falsity. Sample generic True/False questions include plausible water-cycle claims marked False. Ask whether the claim is a displayed map link or use curated false claims. Graph-distance filters cannot prove falsity. Regression should assert map-scoped wording; overlaps **C8-F8**.
- **C3-S2 / prior C3-4:** seed 1 and 4294967297 generate identical banks while storing different seeds because the generator truncates to 32 bits. Replay remains reproducible. Bound/document/canonicalize seeds and test wraparound; do not require every distinct seed to produce distinct output. Already **C8-F7**.
- Keep independent invariant/property tests. Existing helpers checked exact answers/IDs but missed visible-text ambiguity.
- Earlier merge conflicts with C2 were historical integration observations; C3 is now merged. Do not create a fix task for those resolved merge conflicts.

## Coordinator assessment

Mechanical graph and performance work is solid. Quiz grading needs semantic checks on what the student actually sees. These findings reproduce earlier reports rather than claiming newly introduced regressions.
