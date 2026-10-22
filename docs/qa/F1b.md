# QA criteria: F1b · Fix F1 QA failures (tracker determinism lint, CI permissions)

Done when: every must failure in `docs/qa/reports/F1.md` passes on re-test, and the should items listed here are resolved.
Sources: `docs/qa/reports/F1.md` (including "Found during testing"), `docs/qa/F1.md`, `docs/ARCHITECTURE.md` §8.1 and D6.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1b-F1 | must | All ten F1-F4 cases are errors in tracker code | Lint a scratch file in `packages/tracker/src` with each of: `Date.now()`, `new Date()`, `Math.random()`, `fetch('/x')`, `globalThis.fetch('/x')`, `performance.now()`, `crypto.randomUUID()`, `crypto.getRandomValues(new Uint8Array(4))`, `setTimeout(() => {}, 0)`, `import('node:http')` | 10 errors; `new Date('2026-01-01T00:00:00Z')` is still allowed |
| F1b-F2 | must | The rule covers the whole tracker package | Put `export const z = Date.now();` in `packages/tracker/src/q.mts`, `src/q.js`, `src/q.tsx` and `packages/tracker/qa-root.ts`, then lint each | Every file errors (config and test-only files may be excluded only if their names say so, e.g. `*.config.*`, and the exclusion is commented) |
| F1b-F3 | must | Imports of non-deterministic or I/O modules are banned | Lint `import { randomUUID } from 'node:crypto'`, `import 'node:http'`, `import 'node:https'`, `import 'node:net'`, `import 'node:fs'`, `import 'node:timers'`, `import 'node:child_process'`, and the same names without `node:` | All are errors in tracker code |
| F1b-F4 | must | Common aliases are caught | Lint `const D = Date; D.now();`, `new globalThis.Date()`, `Reflect.construct(Date, [])`, `globalThis.performance.now()` | All are errors. If one can't be caught by lint, document why in the PR and add a runtime guard test in the tracker (for example a test that freezes `Date`, `Math.random` and `performance` and runs the tracker's exports) |
| F1b-F5 | must | Domain and other packages are unaffected | Lint `Date.now()` in `packages/domain/src/x.ts` | No determinism error |
| F1b-F6 | must | The guard test covers every case | Read `packages/tracker/src/determinism.test.ts` | Every case from F1b-F1 to F1b-F4 is asserted, both banned and allowed |
| F1b-F7 | must | Everything still passes | `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `node scripts/plan.mjs check` | All exit 0; CI green |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1b-S1 | must | Workflows run with least privilege | Read `.github/workflows/ci.yml` and `plan.yml` | Each declares `permissions: contents: read` at workflow level, and no job widens it |
| F1b-S2 | should | Actions are current | Read the workflows and a CI log | The actions are on majors that run on the current Node runtime, with no "Node.js 20 is deprecated" warning in the log. SHA pins are preferred |
| F1b-S3 | should | Not-found responses don't echo input | `curl localhost:3000/<random>` against the built API | A fixed 404 body (e.g. `{"error":"Not found"}`) that doesn't include the request path |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1b-P1 | must | Lint stays fast | Time `pnpm lint` from the root | Under 15 seconds |
| F1b-P2 | must | CI stays fast | Duration of the PR's `build` job | Under 5 minutes |

## Usability (developers)

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1b-U1 | must | Every determinism error explains the fix | Trigger each case from F1b-F1 to F1b-F4 and read the message | Each says what is banned, where the value should come from instead (event data: event time, ids and seeds carried in events), and cites "ARCHITECTURE.md §8" |
| F1b-U2 | should | No console errors in the web apps | Load both dev servers in Chromium | No 404 for `/favicon.ico` and no console errors |
| F1b-U3 | should | New developers land on the right branch | Read README → Development | It says to check out `idea-map` (the default branch is `main`, which is a different project) |
