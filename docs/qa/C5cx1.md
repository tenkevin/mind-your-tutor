# QA criteria: C5cx1 · Fix Codex error C5-E1 (assessment diff)

Done when: the draft-vs-published diff compares every accepted assessment question for an idea, independent of row order, and shows each change.
Source: `docs/qa/codex/Codex-C5-review-6f43575.md`, error C5-E1. C5 is merged (`956c515`); fix on current `idea-map`.

> C5-E1 — Medium: `packages/domain/src/diff.ts:31` reduces Assessment rows to the first nonempty question for each idea. Multiple nonempty Assessment rows for the same idea/unit are accepted by `parsePack` and produce no `checkPack` error. Editing a later question gives `empty: true`; reversing unchanged rows reports a change.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C5cx1-F1 | must | A later question's edit is visible | Codex fixture A plus a second valid `sun` Assessment row; change only the second question's text | The diff is not empty and shows the old and new text of that question |
| C5cx1-F2 | must | Row order doesn't matter | Same packs, with unchanged Assessment rows reversed | The diff is empty; the result is identical for every permutation of the rows (property test) |
| C5cx1-F3 | must | Add and remove | Add a third question to one idea; remove the second question | Each shows as an added or removed question for that idea |
| C5cx1-F4 | must | Same rules as the checker | Include a row the checker skips with a warning | It is treated exactly as the checker treats it, never chosen over an accepted row; no new uniqueness rule is added to the input contract |
| C5cx1-F5 | must | Existing behaviour kept | Run the C5 diff and publish tests | All six change kinds and the one-question fixture still pass; any change to the diff payload shape is reflected in contracts and the C5 tests |
| C5cx1-F6 | must | Everything passes | Root lint, format:check, typecheck, test with DATABASE_URL (including `function_binding.test.ts`), build, plan check, on the head merged with current `idea-map` | All exit 0; CI green on the exact head |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C5cx1-S1 | must | No new data in the diff | Inspect the diff output | It contains only curriculum fields; no student data |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C5cx1-P1 | must | Large pack | Diff two 2000-idea packs with 3 questions per idea | Within C5's existing diff budget |

## Usability

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C5cx1-U1 | must | Readable | Read the changed-question entries | Each names the idea title and unit and quotes the old and new question text |
