# QA criteria: F2cx1 · Fix Codex error F2-E1 (placeholder contrast)

Done when: enabled input and textarea placeholders meet WCAG AA 4.5:1 on both grounds, set explicitly rather than left to browser defaults.
Source: `docs/qa/codex/Codex-F2-ui.md`, error F2-E1 and suggestions. D10 is unchanged: no new exception.

> F2-E1 — Medium: browser-default placeholder `rgb(117,117,117)` on `--color-surface` measures 3.30:1 (needs 4.5:1), outside D10. Teacher Settings uses placeholders.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F2cx1-F1 | must | Placeholder colour is set explicitly | Inspect `packages/ui/styles.css` | `.input::placeholder` sets `color` from an existing token and `opacity: 1`, documented as a design-system addition in the package README |
| F2cx1-F2 | must | Contrast passes | In Chromium, read the computed `::placeholder` colour for enabled `input.input` and `textarea.input` on `--color-bg` and `--color-surface` | All four at least 4.5:1 |
| F2cx1-F3 | must | Regression test | Read `styles.test.ts` and any browser test | Placeholder pairs are measured on both grounds; the accepted-exceptions guard still equals D10 exactly |
| F2cx1-F4 | must | Nothing else changes | Diff tokens | No token value changes |
| F2cx1-F5 | must | Everything passes | Root lint, format:check, typecheck, test, build, plan check | All exit 0; CI green on a head that includes current idea-map |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F2cx1-S1 | must | No external requests | Reload the reference page with network logging | Still no external hosts (F2-S1) |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F2cx1-P1 | must | CSS stays small | Gzip size of `styles.css` | Still under 10 KB |

## Usability

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F2cx1-U1 | must | Placeholder still reads as a hint | Screenshot an empty and a filled input side by side | The placeholder is visibly lighter than typed text but passes 4.5:1 |
| F2cx1-U2 | should | Docs describe D10 accurately (Codex suggestion) | Read the README | Says "accepted contrast deviations (D10)", not "AA compliant" |
