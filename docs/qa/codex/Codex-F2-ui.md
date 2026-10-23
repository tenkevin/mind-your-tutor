Reviews: F2

# Codex F2: design-system QA

Reviewed commit: `feceb3a45d2549ccee805b0014d6014b10bcb8ae`.
Review date: 2026-10-22. Independent Sol-medium QA, followed by coordinator review. Node 22.22.0 / pnpm 10.28.0. This is the initial pinned-commit review, not a rerun against later commits. Publication context was inspected at `92963ed9bee24c3451c8d081885bb723320906ba`. No implementation changes or task-status changes were made.

Routing: only entries under **Errors** are proposed must-fix defects. **Suggestions** are nonblocking follow-ups. IDs below identify findings, not newly claimed plan tasks. Check overlapping C8/C9 work before scheduling duplicate fixes.

## Validation and limits

**Verdict: FAIL F2-U1.** Existing UI tests 73/73; build/types/lint pass; target CI green. Independent token comparison 51/51 identical. Browser tests: Chrome 155, 400px/1280px, no external app requests, eight keyboard-focusable controls with visible rings, correct disabled states, no phone-width overflow. CSS gzip 2,410 B; Latin fonts 96,744 B.

Publication source check: styles.css and styles.test.ts are unchanged from the reviewed head at 92963ed. This was a source comparison, not a fresh browser run. Browser coverage excludes Firefox/Safari and assistive-technology testing.

## Errors

### F2-E1 — Medium: enabled placeholder text is below AA and outside D10

Source: [styles.css lines 192–200](https://github.com/tenkevin/mind-your-tutor/blob/feceb3a45d2549ccee805b0014d6014b10bcb8ae/packages/ui/styles.css#L192); contrast test list in styles.test.ts omits placeholders. The real Teacher Settings prototype uses an input placeholder at line 143.

Reproduce in the built reference page: clear an enabled input.input, set its placeholder, inspect `getComputedStyle(element, '::placeholder')`; repeat for an enabled textarea.input on both bg/surface parents.

Actual Chrome values: placeholder rgb(117,117,117), opacity 1; control background rgb(35,37,50); 14px text. Independently calculated contrast: **3.2975931544709467:1**. All four combinations fail 4.5:1. Current D10 does not accept this pair. [W3C explicitly includes placeholder text](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html).

Suggested correction: explicitly set placeholder colour using a measured existing token, e.g. neutral-500, and opacity:1; document the design-system addition.

Regression: computed enabled placeholder contrast for input and textarea on both grounds, with a browser test sensitive to browser-default styling. Existing D10 exceptions must remain explicit.

## Suggestions

- Keep D10 described as accepted contrast deviations, not full AA compliance. Required button-state measurements reproduced the accepted exceptions.
- Verify favicon behavior on the integrated branch: the older F2 head's favicon 404 already has a base-branch fix.
- Shared JS chunk name jsx-runtime-* is cosmetic; rename only if useful to developers, with a build-artifact check.
- Add cross-browser/zoom/assistive-technology coverage in the next UI task. Automated axe output alone missed the placeholder issue.

## Coordinator assessment

The visual port and performance checks were strong. The additional placeholder measurement exposed a real coverage gap despite green tests. Coordinator inspected the source/prototype, reproduction script and screenshot and independently recalculated the ratio.
