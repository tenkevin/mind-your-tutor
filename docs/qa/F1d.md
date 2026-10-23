# QA criteria: F1d · Close the ambient-global tracker guard gap

Done when: the mandatory follow-up in F1c's independent PR QA finding 1 is closed without weakening existing determinism checks. This is follow-up hardening beyond F1c's passing original criteria; it gates future tracker-rule work.

Source: [F1c independent QA at 098ee22, finding 1](https://github.com/tenkevin/mind-your-tutor/pull/10#issuecomment-6354124154), architecture D6 and §8.1.

> A local `declare const` hides any banned global from lint, and the guard doesn't cover `process`.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1d-F1 | must | Ambient declarations cannot hide prohibited globals | Add temporary production tracker samples using local ambient declarations of the existing banned globals and lint them; restore samples | Each is rejected with a determinism error; normal event-derived code passes |
| F1d-F2 | must | Runtime guard covers the reported process access path | Add controlled regression samples for the reported process environment/module access gap using only synthetic inputs and a harmless temporary fixture | The guard rejects forbidden access without reading host application data; clean exports still pass; samples are restored |
| F1d-F3 | must | Existing protections remain | Run all F1c regressions plus root lint, format, typecheck, DB-backed tests, build and plan check on integrated candidate | All pass, including test-file exclusion and prototype-constructor checks; exact-head CI green |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1d-S1 | must | Guard restores runtime state | Execute a deliberate guard failure, then a clean test in the same suite; inspect cleanup | Restores modified globals in all paths, no lingering process/global mutation and no new runtime dependencies |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1d-P1 | must | Existing F1c budgets hold | Time lint and tracker tests with the added regressions | Root lint under 15 seconds, tracker tests under 10 seconds |

## Usability

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1d-U1 | must | Diagnostics and documentation state the scope accurately | Inspect new errors and tracker README | Names the prohibited access, directs use of event data, cites architecture §8; does not claim exhaustive protection of arbitrary imported dependencies |
