Reviews: F3

# Codex F3: contract QA

Reviewed commit: `d1ac39a6fb985be32963ba24f2491442c0092105`.
Review date: 2026-10-22. Independent Sol-medium QA, followed by coordinator review. Node 22.22.0 / pnpm 10.28.0. This is the initial pinned-commit review, not a rerun against later commits. Publication context was inspected at `92963ed9bee24c3451c8d081885bb723320906ba`. No implementation changes or task-status changes were made.

Routing: only entries under **Errors** are proposed must-fix defects. **Suggestions** are nonblocking follow-ups. IDs below identify findings, not newly claimed plan tasks. Check overlapping C8/C9 work before scheduling duplicate fixes.

## Validation and limits

**Verdict: core contract tests pass; low-severity specification ambiguity and follow-ups below.** Build/test/typecheck pass; 205 tests. Independent prototype-key probes across every tab leave Object.prototype unchanged. Sample parse median 0.51 ms; large 2,000/6,000/2,000 pack 49 ms. Dangerous URL schemes and length limits reject as specified.

fields.ts, pack.ts and class-config.ts are unchanged at publication base 92963ed. No fresh runtime run is claimed. D12/D13 and C9 were introduced after this test and alter some expected empty-field/persona behavior.

## Errors

No additional unambiguous must-fix error is routed from this file. The DataCheckIssue/CurriculumVersion incompatibility has one canonical error, **C2-E5**, in [Codex-C2-checks.md](Codex-C2-checks.md); do not duplicate it here.

The original agent interpreted F3-F13 “Text is kept as is” literally as failing when boundary whitespace is trimmed. Coordinator classifies that as a clarification suggestion because prior QA explicitly accepted trimming and there is no demonstrated substantive text loss.

## Suggestions

### F3-S1 — Clarify explanation preservation (prior F3-1)

fields.ts normalization trims `'  exact text\n '` to `'exact text'`. Either preserve nonblank explanations verbatim or state that boundary trimming is intended. Regression: multiline/boundary whitespace plus blank-only→null.

### F3-S2 — Friendly errors for class/version editing (prior F3-2)

ClassConfig units:{unit:'x'} returns a generic expected-number Zod error; missing version fields likewise use generic messages. Reuse friendly field validators/error mapping with locations. Test actionable unit/version messages. Existing import-message criteria pass.

### F3-S3 — Document raw percentage/date input conventions (prior F3-3)

Raw pass_mark 0.7 is accepted as 0.7%; a local Date(2026,9,30) in Pacific/Auckland normalizes to 2026-10-29. These are ambiguous contract-boundary inputs. **C1 handles real percentage cell styles and spreadsheet dates correctly**, including UTC/Auckland/Los Angeles tests. Document percent units/date semantics or warn consistently. Never multiply every fraction blindly. Retain real-workbook regressions.

### F3-S4 — Reject over-cap arrays before validating all rows (prior F3-4)

pack.ts applies array max after item parsing. Independent 200k empty Links rows produced 600,001 issues in 635 ms. Preflight counts and bound diagnostics for direct parsePack callers. Regression should assert bounded output/early refusal. **C1 upload/row limits already mitigate its import path.**

### F3-S5 — Reject credentials embedded in HTTPS references (prior F3-5)

`https://user:pw@evil.example/` passes both contracts and C1. This is a privacy/hygiene follow-up, not failure of the scheme-only criterion. Prefer an explicit rejection for URL username/password; test media_url and library file_url while retaining allowed normal references.

## Coordinator assessment

Validation is fast and well tested. Preserve the distinction between raw-contract conventions and the actual importer, which already fixes several historical concerns. Apply D12/C9's newer empty-field rules before reusing old acceptance expectations.
