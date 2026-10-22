# QA criteria: F1c · Close remaining tracker determinism gaps

Done when: the bypasses in "Found during testing" items 1 to 4 of `docs/qa/reports/F1b.md` are closed by lint or by a runtime guard test.
Sources: `docs/qa/reports/F1b.md`, `docs/ARCHITECTURE.md` §8.1 and D6, `docs/qa/F1b.md`.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1c-F1 | must | Test files can't be used as production code | Repeat F1b finding 1: put `Date.now()` in `packages/tracker/src/clock.test.ts`, re-export it from `src/index.ts`, then lint and build | Lint fails on the import of a `*.test*` file from non-test code; and a check (test or build step) fails if `dist/` contains any `*.test.*` file |
| F1c-F2 | must | Tracker imports are an allow list | Lint tracker files importing `node:readline`, `node:zlib`, `node:v8`, `undici`, `axios`, `@ideamap/contracts`, `./x.js` | Only relative paths, `@ideamap/contracts` and `@ideamap/domain` are allowed; everything else is an error |
| F1c-F3 | must | Runtime guard catches what lint can't | Run the tracker test suite with the guard: it replaces `Date`, `Math.random`, `performance`, `Intl`, `crypto`, timers and `fetch` with functions that throw, then imports and calls every tracker export with sample events | The guard test exists and runs in CI. Adding `new Date(0).constructor.now()` to a tracker export makes it fail |
| F1c-F4 | should | Prototype-constructor and computed access are linted | Lint each pattern from F1b findings 2 and 3 | Each is an error, or the PR explains why F1c-F3 covers it |
| F1c-F5 | should | Extra clock and timer globals are banned | Lint `Intl.DateTimeFormat()`, `AbortSignal.timeout(1)`, `new MessageChannel()`, `new WeakRef({})`, `Atomics.waitAsync`, `navigator.hardwareConcurrency`, `Temporal.Now.instant()` | Each is an error |
| F1c-F6 | should | Messages are accurate | Trigger `Date()` and `Reflect.construct(Date, [])` | The message names the call, not "aliasing" |
| F1c-F7 | must | Everything still passes | `pnpm lint`, `format:check`, `typecheck`, `test`, `build`, `node scripts/plan.mjs check` | All exit 0; CI green |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1c-S1 | must | No new dependencies with network or install scripts | `git diff` of package.json files and the lockfile | No runtime dependency added to `packages/tracker`; any dev dependency has no install script |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1c-P1 | must | Lint and tests stay fast | Time `pnpm lint` and `pnpm --filter @ideamap/tracker test` | Lint under 15 s; tracker tests under 10 s |

## Usability (developers)

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| F1c-U1 | must | Errors explain the fix | Read the new messages | Each says what is banned, to use event data instead, and cites ARCHITECTURE.md §8 |
| F1c-U2 | should | The rule set is documented | Read `packages/tracker/README.md` | Lists what's banned, the import allow list and how the runtime guard works |
