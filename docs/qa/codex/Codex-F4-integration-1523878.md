Reviews: F4 (C3/F3 integration)

# Codex F4: merged contract integration failure

Reviewed commit: `1523878d9071df4e0a26507b43cb1fe6809d5899`.
Review date: 2026-10-22 America/Los_Angeles. Independent Sol-medium review, followed by coordinator source review and independent reproduction of both type errors. Node 22.22.0 / pnpm 10.28.0. No implementation changes.

**Publication priority: immediate.** This confirmed failure breaks the merged branch's validation pipeline. Publication base `0ee99fab9a344ba5033e7ee25addba63b90419bd` changes only plan files after the reviewed snapshot; the affected code is unchanged.

## Validation and limits

Root lint, format, build and plan checks pass. Root typecheck fails (exit 2). Database-backed root tests fail (exit 1): DB 141 pass / 1 fail; contracts 208, domain 74, UI 73, tracker 56 and other package suites pass. The existing DB suite used its default million-event / 10,000-chunk workload against an isolated synthetic database; no new adversarial database probes were performed. The QA database was stopped afterward. F1c is not merged in this snapshot; tracker results do not certify its runtime guard.

Exact-snapshot [CI build job](https://github.com/tenkevin/mind-your-tutor/actions/runs/39875939546/job/120161435985) fails on the same two type errors. A passing production build does not cover them because the DB build excludes test sources.

## Errors

### F4-E3 — High: DB fixtures violate the integrated derived-data contract

One new finding, routed to F4 with C3/F3 integration context. Do not split its two type-error sites and runtime failure into duplicate tasks. Distinct from earlier F4-E1/F4-E2 security findings.

Sources at the reviewed commit:

- [columns.test.ts:95](https://github.com/tenkevin/mind-your-tutor/blob/1523878d9071df4e0a26507b43cb1fe6809d5899/packages/db/src/columns.test.ts#L95) inserts `derived: json({ layout: { centre: 'rain' } })`.
- [integrity.test.ts:283](https://github.com/tenkevin/mind-your-tutor/blob/1523878d9071df4e0a26507b43cb1fe6809d5899/packages/db/src/integrity.test.ts#L283) updates with `derived: json({ layout: {} })`.
- `packages/db/src/schema.ts:84` requires `NullableJson<VersionDerived>`. The integrated contract requires ranked links, complete layout and quizzes.

Reproduce on the pinned tree with Node 22 and pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
# Use a disposable test database; the existing harness creates/drops test databases.
DATABASE_URL='<disposable-test-postgres-url>' pnpm test
```

Actual: TS2322 at both fixture sites. The DB test `typed access (F4-F9) > round-trips a CurriculumVersion through the contract` also fails in `toContract()` at columns.test.ts:20, called at line 113. Zod reports missing `derived.ranked_links`, `derived.layout.rank`, `derived.layout.positions`, and `derived.quizzes`. SQL JSONB accepts the partial object, but the application contract correctly rejects it.

Expected: positive DB fixtures conform to the strict contract and integrated typecheck/tests pass together.

Suggested correction: update both sites to a shared, fully typed, schema-valid `VersionDerived` fixture containing `ranked_links: { max_links, kept, hidden }`, `layout: { centre, rank, positions }`, and `quizzes: { seed, quiz_length, banks }`. Use actual `derive(pack, options)` output if permitted by the test dependency boundary, otherwise construct a complete fixture appropriate to the synthetic pack. Preserve draft replacement/status-transition coverage. Do not weaken the production schema or suppress the type errors.

Regression: root typecheck and database-backed root tests must both pass; keep the typed version roundtrip and draft re-derivation tests enabled. Assert the shared fixture parses through `VersionDerivedSchema`.

## Suggestions

- Centralize valid derived fixtures so future schema changes update consumer tests together. Keep deliberately invalid fixtures separate from positive cases.
- Treat root build, typecheck and database-backed tests as separate gates; green package/unit builds alone missed this merge-boundary failure.

## Artifacts

Full independent report and execution evidence are retained under `/home/kevin/codex-qa-2026-10-22/`; the source links, commands, observed errors and CI link above make this finding actionable without those local artifacts. Prior security findings were not retested or cleared by this baseline run.
