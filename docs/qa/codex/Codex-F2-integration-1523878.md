Reviews: F2

# Codex F2: integrated UI revalidation

Reviewed commit: `1523878d9071df4e0a26507b43cb1fe6809d5899`.
Date: 2026-10-22 America/Los_Angeles. Independent Sol-medium browser review; coordinator read the full report and reviewed the evidence. Node 22.22.0 / pnpm 10.28.0 / Chrome 155. No implementation changes.

**Verdict: existing F2-E1 remains unresolved; no new F2 error. Publication priority: task completion.** This is a revalidation of an already-published error plus a nonblocking favicon update. The newly urgent merged validation failure was separately published as [F4-E3](Codex-F4-integration-1523878.md).

## Validation and limits

UI tests **73/73**, separate UI build/typecheck pass. Production teacher main page returns 200, favicon.svg returns 200, and the page has no console/page errors or external requests. Reference page renders correctly at 1280px and 400px; all eight keyboard controls show visible focus, disabled behavior works, and mobile scroll/client widths both equal 400px. Reference-page favicon behavior remains a suggestion below.

Integrated root lint, format, build and plan pass, but root typecheck and DB-backed tests fail for F4-E3. Those failures are not cleared by passing UI tests. F1c is not merged here; tracker 56 tests do not establish its runtime guard.

### Revalidation of existing F2-E1

In the integrated production reference page, inspect enabled input and textarea placeholders on both bg/surface parents using `getComputedStyle(element, '::placeholder')` and the control's computed background.

All four combinations still compute placeholder **rgb(117,117,117)**, opacity **1**, over **rgb(35,37,50)**, at **14px**. Contrast is **3.2975931544709467:1**, below 4.5:1. `packages/ui/styles.css:192–200` still has no explicit placeholder style, and D10 has no exception for this pair. Relevant UI files are unchanged from the original F2 review.

Suggested correction remains an explicit measured placeholder colour and opacity, plus computed-style browser regression tests for input/textarea on both grounds. Keep D10's accepted deviations distinct from full AA compliance.

## Errors

**No new error ID.** The [canonical F2-E1](Codex-F2-ui.md) remains open, freshly browser-reproduced on the merged snapshot. Reuse its existing must-fix routing; do not create a duplicate task. Route F4-E3 only from its separate report.

## Suggestions

- The prior favicon suggestion is **partially resolved**: teacher main loads the SVG successfully, but `apps/teacher/reference.html` lacks an icon link. Fresh Chrome automatically requests favicon.ico, receives 404, and logs one error. Reuse the SVG link in the reference entrypoint when touching it; this is developer-page polish, not a new student-facing failure.
- Preserve the existing cross-browser/zoom/assistive-technology suggestion. This rerun covers Chrome, focus, disabled/mobile behavior and network requests; it does not certify Firefox, Safari or screen readers.
- Keep build, typecheck and DB-backed tests as separate integrated gates. A passing production build excludes some test-source failures.

## Artifacts

Retained outside the repository under `/home/kevin/codex-qa-2026-10-22/`: `integration-1523878-browser.mjs` and `reports/integration-1523878-{reference-1280,reference-400,placeholder-contrast}.png`. The independent report contains full command results. The QA-owned browser server and database were stopped; unrelated services were untouched. Source worktree clean; previous Codex reports unchanged.
