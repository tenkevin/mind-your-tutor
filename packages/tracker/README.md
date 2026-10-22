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

`src/determinism.test.ts` checks each rule and its message.

## 2. Runtime guard (`src/runtime-guard.test.ts`)

Lint can't see everything: a name built at runtime, a prototype chain, or code inside an allowed package. The runtime guard is the backstop and runs with the rest of the tests in CI (`pnpm test`).

While the guard is on, these throw a `NondeterminismError`:

- `Date.now()`, `new Date()`, `Date()` and the local-time `Date` methods, however `Date` is reached (`new Date(0).constructor` and `Function('return Date')()` give the guarded one)
- `Math.random()`
- the `performance`, `Intl`, `crypto`, `fetch`, `navigator`, `Temporal`, `WeakRef`, `MessageChannel` and similar globals (any use)
- `process.hrtime` and the other `process` clocks
- `node:crypto`'s random functions
- timers, through the globals and through `node:timers`, plus `AbortSignal.timeout` and `Atomics.wait`
- locale-dependent methods (`localeCompare`, `toLocaleString`…)

With the guard on, the test imports the tracker (so module-level code is covered) and calls every export. A function is called twice with each argument list in `SAMPLES`, and both results must be equal. Every use of a guarded API is recorded, so an export that catches the error still fails the test.

**When you add an export,** add it to `SAMPLES` in `src/runtime-guard.test.ts`, with argument lists built from `SAMPLE_EVENTS`. Typecheck fails until you do. Until then the guard calls a new function with no arguments and with `SAMPLE_EVENTS`.

The test runner (vitest) times its own module loading while the guard is on, so a call made directly from vitest or vite code goes through to the real API. Calls from anywhere else get the error.
