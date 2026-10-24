# @ideamap/tracker

Pure rules that replay interaction events into progress and behaviour metrics (ARCHITECTURE.md §8.1):

```
state = events.reduce(apply, initialState(classConfig, rulesVersion))
```

The same events must always give the same numbers. Tracker code therefore has no clock, no randomness and no I/O. Time, ids and seeds come from the events. Two layers enforce this.

## Using it

```ts
import { progress, replay, xpLedger, type TrackerConfig } from '@ideamap/tracker';

const config: TrackerConfig = {
  rulesVersion: 1,
  passMark: 70, // Course.pass_mark after class overrides; default 70
  quizLength: 8, // class setting, 3–12; default 8
  timeZone: 'EST5EDT,M3.2.0,M11.1.0', // the class time zone, as a POSIX TZ rule
  nonSchoolDates: ['2026-11-26'], // holidays; school days default to Monday–Friday
  optedOut: false, // D24
  versions: {
    [versionId]: { ideas: [{ id, unit, requires, rarity }], units: [{ unit, dueDate }] },
  },
};

const state = replay(config, events); // one student's events, in seq order
const snapshot = JSON.stringify(state); // ProgressSnapshot: the state plus its lastSeq
const later = replay(config, newerEvents, JSON.parse(snapshot)); // only seq > lastSeq is applied
const view = progress(config, later, asOf); // asOf: ISO time to evaluate time-based rules at
const xp = xpLedger(config, events); // every XP award and the event that earned it
```

- **Config.** The server builds it: every published version the student's events name (`versionId` → its ideas and units), with T5's effective rarity and the class's effective due dates (a unit with a due date is a mission, T4). Treat a config as immutable: it is compiled once per object.
- **Time zone.** `Intl` is banned in tracker code, so the class zone arrives as a POSIX TZ rule, the footer line of the IANA tzdata file (`tail -n1 /usr/share/zoneinfo/America/New_York`). Examples: `EST5EDT,M3.2.0,M11.1.0` (New York), `GMT0BST,M3.5.0/1,M10.5.0` (London), `AEST-10AEDT,M10.1.0,M4.1.0/3` (Sydney), `<+0530>-5:30` (Kolkata), `UTC0`. `src/calendar.test.ts` checks these against `Intl` hour by hour.
- **State** is plain JSON. A snapshot is `JSON.stringify(state)`, and replaying from it is byte-identical to replaying from scratch (property-tested). `apply` and `replay` never change the state they are given.
- **`asOf`.** Rules that depend on time passing without events (a streak broken by a missed day, a prerequisite stalled for 5 school days) are evaluated at the `asOf` the caller passes, which defaults to the last event's time. The tracker never reads a clock.
- **Errors.** An event for another student or for a version missing from the config, an unknown `rulesVersion` and an invalid config throw `TrackerConfigError`.

## Rules: rulesVersion 1 (ARCHITECTURE.md §8.3)

Every output carries the ids of the events that produced it (§8.1, traceable). Nothing else is computed: no risk, dropout or grade prediction; no engagement, behaviour or personality score; no clustering; no ranking between students (D20). `idea.active_time` and `secondsToAnswer` are never read by a rule; the teacher sees them as plain durations from the events (property-tested: changing them leaves the state byte-identical).

| Output            | Rule                                                                                                                                                                                                                                                                                                                                                                                   | Events named                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Quiz length       | The class setting, 3–12, default 8                                                                                                                                                                                                                                                                                                                                                     | —                                                                         |
| Mastery %         | Best finished score for the idea, `round(score × 100 / of)` as the prototype rounds it; `null` before any finished quiz                                                                                                                                                                                                                                                                | the best `quiz.finished`                                                  |
| Mastered          | Some finished score **above** the pass mark (default 70). Once mastered, always mastered                                                                                                                                                                                                                                                                                               | the first passing `quiz.finished`                                         |
| Unlocked          | Every idea in its `requires` is mastered, checked under the version of each event. Once unlocked it stays unlocked, even when a publish adds a prerequisite (§7). A removed idea's progress is kept and marked `archived`                                                                                                                                                              | its prerequisites' mastery events, or the first event seen if it has none |
| Unit complete     | Every idea in the unit mastered and the latest `teachback.judged` is `pass`. Once complete it stays complete                                                                                                                                                                                                                                                                           | each idea's mastery, then the verdict                                     |
| XP                | Correct answer: 10 × combo multiplier (×4 at 6+ in a row, ×3 at 4+, ×2 at 2+, else ×1); a wrong answer and a new quiz reset the combo. Passing quiz +50, perfect score +50 more, link rebuilt +5, unit complete +200 (once per unit)                                                                                                                                                   | `xpLedger`: one entry per award                                           |
| Day streak        | +1 on the first pass of a day in the class time zone; same-day passes add nothing; a day with no pass resets it to 0                                                                                                                                                                                                                                                                   | the passes in the current run                                             |
| Cards             | One per mastered idea, with its effective rarity in the current version                                                                                                                                                                                                                                                                                                                | the mastery event                                                         |
| May need help (a) | 3 wrong answers on an idea's questions after a `hint.requested` on that idea (by `ideaId`, or by `questionId`, whose idea is its prefix). Cleared by a later pass of that idea                                                                                                                                                                                                         | the hint and the 3 wrong answers                                          |
| May need help (b) | The next mission is the uncompleted mission (no `mission.completed`) with the earliest due date. An idea it depends on (in its unit, or required by one in its unit) that is unlocked, not passed, and unlocked 5 or more school days before `asOf`. School days are the class's weekdays minus `nonSchoolDates`, counted after the unlock day up to the `asOf` day. Cleared by a pass | the events that unlocked it                                               |
| Opt-out (D24)     | Same outputs; `excludedFromAuditsAndResearch: true`                                                                                                                                                                                                                                                                                                                                    | —                                                                         |

Signals are teacher-only (D21) and always carry a readable `reason`, e.g. `3 wrong answers on "evap" questions after asking for a hint.` or `"sun" is needed for mission 1, unlocked on 2026-10-19, and has no pass after 5 school days.`

Events with no rule in v1 (`idea.opened`, `idea.active_time`, `teachback.done`, `feedback.*`, `teacher.feedback.*`, `map.shown`, `ai.output_shown`) still advance `lastSeq`. A `quiz.finished` with no `quiz.started` for its attempt is ignored, because its idea is unknown.

### Worked examples (the water-cycle fixture, pass mark 70)

1. **Mastery.** Quizzes scoring 6/10, 7/10, 8/10 on `evap`: mastery 60 %, then 70 % (not mastered: 70 is not above 70), then 80 % (mastered). `cond` (requires `evap`) unlocks on the 8/10 event.
2. **XP.** 7 right answers in a row earn 10, 20, 20, 30, 30, 40, 40 (190); a wrong answer resets the combo, so the next right one earns 10. A perfect 8/8 quiz earns 10+20+20+30+30+40+40+40 = 230 for its answers, +50 pass, +50 perfect. A rebuilt link +5; finishing unit 1 +200.
3. **Streak in New York.** Passes on Fri 6, Sat 7 (23:30 EST), Sun 8 (the DST change) and Mon 9 March at 00:30 EDT (04:30 UTC, which EST arithmetic would still call Sunday): streak 4. No pass on a day: the next event, or `progress` at a later `asOf`, reads 0; the next pass starts again at 1.
4. **Unit complete.** All seven unit 1 ideas mastered, teach-back `retry`: not complete. A later `pass`: complete, +200, naming the seven mastery events and the verdict.
5. **May need help.** A hint on `evap`, then three wrong `evap` answers: raised with the hint and the three answers. Passing `evap` clears it. Separately, `sun` unlocked on Mon 19 Oct with mission 1 next and no pass: raised at `asOf` Mon 26 Oct (the 5th school day after), not on Fri 23 or over the weekend; a holiday on Wed 21 Oct moves it a day later.

### Adding a rulesVersion

A rule never changes in place: old results must stay reproducible (§8.1).

1. Copy `src/rules-v1.ts` to `src/rules-v2.ts` and change it there. Keep `rules-v1.ts` exactly as it is.
2. Add `2` to `RULES_VERSIONS` in `src/config.ts`, widen `TrackerState['rulesVersion']`, and dispatch on `config.rulesVersion` in `src/index.ts` (`initialState`, `run`, `progress`).
3. A snapshot made under another version is rejected; rebuild it by replaying events. Never patch numbers.
4. Add tests for v2 beside v1's, and keep every v1 test passing. Document the new version here, with what changed and why.
5. What may be traced, inferred, shown or kept is a user decision (D19–D22): a new version may not add an output D20 forbids.

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

**When you add an export,** add it to `SAMPLES` in `src/runtime-guard.test.ts`, with argument lists built from `SAMPLE_EVENTS` and `SAMPLE_CONFIG`. Typecheck fails until you do. Until then the guard calls a new function with no arguments and with `SAMPLE_EVENTS`.

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
