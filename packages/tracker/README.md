# @ideamap/tracker

Pure rules that replay interaction events into progress and behaviour metrics (ARCHITECTURE.md §8.1):

```
state = events.reduce(apply, initialState(classConfig, rulesVersion))
```

The same events must always give the same numbers. Tracker code therefore has no clock, no randomness and no I/O. Time, ids and seeds come from the events. Two layers enforce this.

## 1. Lint (`eslint.config.js`)

Applies to every source file under `packages/tracker/`, except `*.test.*` files.

**Imports: an allow list.** Tracker code may import only:

- relative paths (`./x.js`, `../x.js`)
- `@ideamap/contracts`
- `@ideamap/domain`

Everything else is an error: Node built-ins (`node:fs`, `node:zlib`, `node:v8`…), third-party packages (`undici`, `axios`, even `zod`), other workspace packages and subpaths. Dynamic `import()` and `require` are banned too. Need something new? Add it to `ALLOWED_IMPORTS` in `eslint.config.js` and explain why in the PR.

**No test files in production code.** Test files are exempt from these rules (so they can stub globals), so non-test code may not import a `*.test.*` file. The build also fails if `dist/` contains a `*.test.*` file (`scripts/check-dist-tests.mjs`).

**Banned globals and calls:**

| Area                       | Banned                                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clock                      | `Date.now()`, `new Date()` with no argument, `new Date(...args)`, `Date()`, `performance`, `process`, `Intl`, `Temporal`                                             |
| Local time zone and locale | `.getHours()` and the other local-time getters, `.getTimezoneOffset()`, `.toLocaleString()` and friends, `.localeCompare()` (use the `getUTC*` methods)              |
| Randomness                 | `Math.random()`, `crypto`                                                                                                                                            |
| Timers                     | `setTimeout`, `setInterval`, `setImmediate`, `queueMicrotask`, `requestAnimationFrame` and their `clear*`, `AbortSignal`, `Atomics`, `MessageChannel`, `MessagePort` |
| I/O and host               | `fetch`, `XMLHttpRequest`, `WebSocket`, `BroadcastChannel`, `navigator`, `SharedArrayBuffer`, `globalThis`, `global`, `window`, `self`                               |
| Garbage collection         | `WeakRef`, `FinalizationRegistry`                                                                                                                                    |
| Indirection                | `eval`, `Function`, `Reflect`, `.constructor`, aliasing `Date` or `Math` (`const D = Date`), computed access on them (`Date[k]`)                                     |

Still allowed: `new Date(event.at)`, `Date.parse(...)`, `Date.UTC(...)`, the `getUTC*` and `toISOString` methods, `Math.max` and the other `Math` functions, `Date` as a type and `instanceof Date`.

The lint also rejects local ambient declarations that shadow a prohibited global
(for example, `declare const process`), so declarations cannot hide a use from
these checks. `src/determinism.test.ts` checks each rule and its message.

## 2. Runtime guard (`src/runtime-guard.test.ts`)

Lint can't see everything: a name built at runtime, a prototype chain, or code inside an allowed package. The runtime guard is the backstop and runs with the rest of the tests in CI (`pnpm test`).

While the guard is on, these throw a `NondeterminismError`:

- `Date.now()`, `new Date()`, `Date()` and the local-time `Date` methods, however `Date` is reached (`new Date(0).constructor` and `Function('return Date')()` give the guarded one)
- `Math.random()`
- the `performance`, `Intl`, `crypto`, `fetch`, `navigator`, `Temporal`, `WeakRef`, `MessageChannel` and similar globals (any use)
- any access to the global `process` object, including environment variables
  and built-in module helpers; `process.hrtime` and the other process clocks
- `node:crypto`'s random functions
- timers, through the globals and through `node:timers`, plus `AbortSignal.timeout` and `Atomics.wait`
- locale-dependent methods (`localeCompare`, `toLocaleString`…)

With the guard on, the test imports the tracker (so module-level code is covered) and calls every export. A function is called twice with each argument list in `SAMPLES`, and both results must be equal. Every use of a guarded API is recorded, so an export that catches the error still fails the test.

**When you add an export,** add it to `SAMPLES` in `src/runtime-guard.test.ts`, with argument lists built from `SAMPLE_EVENTS`. Typecheck fails until you do. Until then the guard calls a new function with no arguments and with `SAMPLE_EVENTS`.

The test runner (vitest) times its own module loading while the guard is on, so a call made directly from vitest or vite code goes through to the real API. Calls from anywhere else get the error. This guard covers the tracker code exercised by these tests; it is not an exhaustive sandbox for arbitrary imported dependencies.

## Event catalogue (§8.2, D19)

The schemas live in `@ideamap/contracts` (`packages/contracts/src/events.ts`), because tracker code may not import zod. The source of truth is [ARCHITECTURE.md §8.2](../../docs/ARCHITECTURE.md#82-event-catalogue-d19); changing what is traced is a user decision (D19), so never add a type or a field without one.

**Envelope.** `ClientEventSchema` is what the client sends: `id` (ULID), `classId` and `versionId` (uuids), `at` (ISO 8601 with an offset), `type` and `payload`. A client event that sets `studentId`, `seq` or `level` is rejected: the server knows the student from the session and sets `seq` and `level` (§8.5). `InteractionEventSchema` is the stored event: the same fields plus `studentId` (uuid), `seq` (integer from 1) and `level`, which must equal the type's level. These match F4's `interaction_event` columns; `level` is not a column because the type fixes it (`eventLevel(type)`).

**Strict everywhere.** Every object rejects unknown keys, so an IP address, user agent, device, location, coordinates, keystrokes or free text can't get in. Payload strings are all ids, refs or enums; typed text is only ever a `textRef` to `InteractionText`. An unknown type (`link.hovered`, `zoom.changed`, `session.idle`…) is rejected.

**Rounding.** Durations are normalised on parse, not rejected: `idea.active_time.seconds` to the nearest 30 s (47 → 60) and `quiz.answered.secondsToAnswer` to the nearest 5 s (7 → 5), so a stored value is always on its grid.

**Id formats.** `ideaId` is a pack `idea_id` slug; `questionId` a quiz bank question id (C3); `linkId` names a pack link by its ideas, `<from_id>><to_id>`; `unitId` and `missionId` are pack unit numbers (a mission is a unit with a due date, T4); every other id or ref is a uuid.

| Type                        | Level         | Payload                                                                                                                            |
| --------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `idea.opened`               | participating | `ideaId`                                                                                                                           |
| `idea.active_time`          | participating | `ideaId`, `seconds` (per session, rounded to 30 s)                                                                                 |
| `quiz.started`              | participating | `ideaId`, `attemptId`, `questionIds` (1–12, distinct)                                                                              |
| `quiz.answered`             | participating | `attemptId`, `questionId`, `choice` (option index from 0), `correct`, `attemptNumber` (from 1), `secondsToAnswer` (rounded to 5 s) |
| `quiz.finished`             | participating | `attemptId`, `score`, `of` (score ≤ of ≤ 12)                                                                                       |
| `hint.requested`            | participating | `ideaId` or `questionId` (exactly one)                                                                                             |
| `review.link_rebuilt`       | participating | `ideaId`, `linkId`                                                                                                                 |
| `teachback.done`            | participating | `unitId`, `textRef`                                                                                                                |
| `teachback.judged`          | other         | `unitId`, `verdict` (`pass`, `retry`), `keyPointsHit` (key point indexes from 0), `aiOutputId`                                     |
| `feedback.shown`            | participating | `feedbackId`, `source` (`ai`, `teacher`), `reasonRef`                                                                              |
| `feedback.challenged`       | participating | `feedbackId`, `textRef`                                                                                                            |
| `feedback.ruled`            | teaching      | `feedbackId`, `ruling` (`upheld`, `overturned`, `edited`)                                                                          |
| `teacher.feedback.approved` | teaching      | `feedbackId`                                                                                                                       |
| `teacher.feedback.edited`   | teaching      | `feedbackId`                                                                                                                       |
| `mission.completed`         | participating | `missionId`                                                                                                                        |
| `map.shown`                 | other         | `mapViewId`                                                                                                                        |
| `ai.output_shown`           | other         | `aiOutputId`                                                                                                                       |

**Never recorded (D19):** clicks, scrolls, hovers, zoom, mouse movement, keystrokes, idle or focus timing beyond `idea.active_time`, device, IP address or location.
