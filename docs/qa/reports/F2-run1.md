# QA report: F2 · PR #3 · commit d5ded4a
Verdict: FAIL
Tester: qa-f2 · Date: 2026-10-22

> Run 1. The QA agent's PR comment was posted as the literal text "@report.md" because of a `-f`/`-F` bug in its instructions. The coordinator recovered this text from the agent's final reply. Screenshots stayed in the QA sandbox.

One must check fails: **F2-U1**. Four state pairs are below WCAG AA and D10 does not accept them, and the package's contrast test doesn't detect them. Every other check passes. CI on d5ded4a: `build` success, `check` success.

| Check | Weight | Result | Evidence |
|---|---|---|---|
| F2-F1 | must | PASS | Parsed every custom property in `:root` (comments stripped, whitespace normalised) from `project/_ds/nocturne-*/styles.css` and `packages/ui/styles.css`. Both have 51 tokens: `missing [] extra [] value diffs []`. The built CSS also has 51 tokens. The only additions are the `@font-face` rules and `.input:disabled`, both documented |
| F2-F2 | must | PASS | Every required class and its hover, active, disabled and focus-visible rules is present with the prototype's declarations. The prototype rule text is contained verbatim after whitespace squashing. Computed hover and active states in Chromium match the CSS |
| F2-F3 | must | PASS | `apps/teacher/src/reference.tsx` imports `@ideamap/ui/styles.css` once. `/reference.html` renders every required element. The teacher build prints no warnings, and its tests pass (2/2) |
| F2-F4 | must | PASS | Computed `color`, `background`, `border`, `border-radius`, `padding`, `font` and `letter-spacing` are identical between the reference page and `Teacher Settings.dc.html` at 1280 px, for every compared element. Screenshots are in the QA sandbox |
| F2-F5 | should | PASS | Exports `tokens` (all 51), `type Token`, `cssVar(token)`, `classes` and `type ClassName`. Typecheck exits 0 |
| F2-F6 | must | PASS | `build`, `test` and `typecheck` each exit 0 (56/56 tests); lint, format:check and plan check pass. The literal combined command in the criteria is malformed (finding 2) |
| F2-S1 | must | PASS | 7 requests, all to localhost (html, 2 JS, 1 CSS, Inter 400/500/700 woff2). External requests: none. The Google Fonts `@import` has been removed |
| F2-S2 | must | PASS | `packages/ui/fonts/OFL.txt` holds the SIL Open Font License 1.1 and is listed in the package `files` |
| F2-S3 | should | PASS | No remote `url()` or `@import` (one match is the word inside a comment) |
| F2-P1 | must | PASS | 4,228 B gzip, against a 10 KB limit |
| F2-P2 | must | PASS | 4 woff2 files, Latin subset, totalling 96,744 B (under 150 KB), all with `font-display: swap` |
| F2-P3 | should | PASS | `dist/index.js` 953 B, `dist/tokens.js` 2,294 B; constants only |
| F2-U1 | must | **FAIL** | Listed pairs pass (text 14.54/12.55; neutral-500 6.08/5.25; `.btn-primary` 5.45 on bg and 4.71 on surface; tags 9.2–9.4; tag-outline 5.45/4.71). The D10 pairs reproduce (`.input` border 1.58/1.55, `.btn-primary:active` 3.92 on bg, `.card-meta` 4.25 on surface). **Pairs below AA that D10 doesn't cover** (14 px weight-500 button text, so the bar is 4.5:1): `.btn-ghost:active` on bg 4.20 and on surface 3.60; `.btn-ghost:hover` on surface 4.08; `.btn-primary:hover` on surface 3.96; `.btn-primary:active` on surface 3.38. These grounds are real: in Teacher Settings, both primary buttons and 7 of the 12 ghost buttons sit on `--color-surface`. `styles.test.ts` only checks primary hover and active on bg, and never checks ghost states |
| F2-U2 | must | PASS | All 8 focusable elements show a 2px accent focus ring |
| F2-U3 | must | PASS | Disabled `.btn` and `.input` have opacity 0.45 and cursor not-allowed |
| F2-U4 | should | PASS | At 400 px there is no horizontal scroll, and the fields fill their containers |
| F2-U5 | should | PASS | The README covers the token groups and class families; its claim about the contrast test is wrong (see F2-U1) |

## Found during testing

1. **The contrast test misses classes and grounds** (must, part of the F2-U1 fix). Add every button variant's hover and active state on both `--color-bg` and `--color-surface`. Accepting or retuning these colours is a design decision.
2. **The F2-F6 command in `docs/qa/F2.md` is malformed** (should). `pnpm --filter @ideamap/ui build test typecheck` passes `test typecheck` to tsc. Run each script separately.
3. **The shared CSS chunk is named `jsx-runtime-*.css`** (should). Name it `ui-*.css` via `assetFileNames` or `manualChunks`.
4. **Inter 600 is shipped but unused** (info). No package rule uses it, and the browser doesn't download it.
