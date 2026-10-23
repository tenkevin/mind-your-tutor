# QA criteria: C2cx5 · Fix Codex error C2-E5 (data-check issues can't be stored in a version)

Done when: a CurriculumVersion stores both import (parse) issues and data-check issues without loss, and "can publish" is gated on error-level data checks as well as import blockers.
Source: `docs/qa/codex/Codex-C2-checks.md` C2-E5, confirmed again in `Codex-C8-quality-1e6a55c.md`. Needed before C4, which stores checks on drafts.

> C2-E5 — Medium: `CurriculumVersionSchema.issues` accepts only `PackIssueSchema`; `checkPack()` returns `DataCheckIssue` (level/kind/items/fix). A draft with `issues: checkPack(sample)` fails with 21 validation errors. The publish refinement checks only import blockers.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C2cx5-F1 | must | Both kinds of issue are stored | Build a draft with the parsed sample, its parse issues and `checkPack(sample)` | Parses; a JSON round trip keeps every field of both collections (or a typed discriminated union) |
| C2cx5-F2 | must | Publishing respects data checks | Evaluate the publish rule on: the sample (1 data-check error); a pack with only warnings and info; a pack with an import blocker | Not publishable, publishable, not publishable |
| C2cx5-F3 | must | One shared type | Inspect `packages/contracts` and `packages/domain` | The data-check issue type lives in `@ideamap/contracts`, and `checkPack` returns it. No duplicate shape |
| C2cx5-F4 | must | Consumers updated | Root typecheck and tests, including DB round trips | Pass; the DB `issues` column fixtures use the new shape |
| C2cx5-F5 | must | Everything passes | Root lint, format:check, typecheck, test (with DATABASE_URL), build, plan check | All exit 0; CI green on a head that includes current idea-map |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C2cx5-S1 | must | Bounded size | A pack producing 10,000 issues | Stored issues are bounded or grouped (C8 grouping) so a version body stays under the 1 MB jsonb budget; the test asserts the size |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C2cx5-P1 | must | Validation stays fast | Parse a version holding the C8 large-pack issues | Under 50 ms |

## Usability

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C2cx5-U1 | must | The UI can tell them apart | Inspect the stored shape | Each issue says whether it came from import or data checks, with level, message, and fix location (tab, row where known, column) |
