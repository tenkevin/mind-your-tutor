# QA criteria: F4cx3 · Fix Codex error F4-E3 (idea-map typecheck and DB test broken by partial derived fixtures)

Done when: `idea-map` is green again. Root typecheck and database-backed tests pass, with DB fixtures that conform to the strict `VersionDerived` contract.
Source: `docs/qa/codex/Codex-F4-integration-1523878.md`, error F4-E3, quoted below. Priority: **immediate**. CI on `idea-map` has been red since F4 merged (run 39875939546).

> F4-E3 — High: DB fixtures violate the integrated derived-data contract. `columns.test.ts:95` inserts `derived: json({ layout: { centre: 'rain' } })`; `integrity.test.ts:283` updates with `derived: json({ layout: {} })`. `schema.ts:84` requires `NullableJson<VersionDerived>`. Root typecheck fails with TS2322 at both sites; the DB test "round-trips a CurriculumVersion through the contract" fails in `toContract()`.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4cx3-F1 | must | Root typecheck passes | `pnpm typecheck` from the repo root | Exit 0 |
| F4cx3-F2 | must | Database-backed tests pass | `pnpm db:up && DATABASE_URL=... pnpm test` | Every suite passes, including DB "round-trips a CurriculumVersion through the contract" and the draft re-derivation test |
| F4cx3-F3 | must | One shared, valid derived fixture | Inspect the DB tests | Both sites use a shared fixture (built by `derive()` if the dependency boundary allows, otherwise complete by hand) with `ranked_links`, `layout` (`centre`, `rank`, `positions`) and `quizzes` (`seed`, `quiz_length`, `banks`). A test asserts it parses through `VersionDerivedSchema` |
| F4cx3-F4 | must | The contract isn't weakened | `git diff` on `packages/contracts` and `packages/db/src/schema.ts` | No production schema loosened, and no `@ts-expect-error`, `as any` or skipped tests added |
| F4cx3-F5 | must | CI is green on `idea-map` after merge | CI run on the merge commit | `ci` and `plan` both succeed |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4cx3-S1 | must | Tests only | `git diff --stat` | Changes only under `packages/db/src/**/*.test.ts` or a test-only fixture module that isn't shipped in `dist` |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4cx3-P1 | must | DB suite time unchanged | Time the DB test suite | Within 10% of before |

## Usability (developers)

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F4cx3-U1 | must | Future schema changes break loudly in one place | Read the fixture module | Documented as the single positive `VersionDerived` fixture for consumers; invalid fixtures are kept separate and named as invalid |
