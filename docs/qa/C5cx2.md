# QA criteria: C5cx2 · Fix Codex error C5-E2 (concurrent publishes)

Done when: concurrent publishes of one draft to different classes all succeed, with every class pinned and the right audit rows.
Source: `docs/qa/codex/Codex-C5-review-6f43575.md`, error C5-E2. C5 is merged (`956c515`); fix on current `idea-map`.

> C5-E2 — Medium: `apps/api/src/publishing.ts:339` reads the version before taking the curriculum lock. Both requests can read `status='draft'`; the second's conditional `UPDATE ... WHERE status='draft'` returns no rows, `executeTakeFirstOrThrow()` throws, and the route returns HTTP 500. Actual responses: 201 and 500; one class stays unpinned.

## Functional

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C5cx2-F1 | must | Codex reproduction passes | Two requests publish the same draft to two classes with different idempotency keys, with both version reads forced to complete before either takes the lock (as in the Codex harness) | Both return success; both classes are pinned to the published version |
| C5cx2-F2 | must | No key, and a shared key | Repeat with no idempotency key, and with the same key for both requests | No key: both succeed. Shared key: one publish happens and the other returns the same result through the idempotency lookup, never a 500 |
| C5cx2-F3 | must | State is read under the lock | Read the code | The version's status is re-read, or the version row is locked, after the curriculum lock is taken and before the draft-to-published decision |
| C5cx2-F4 | must | Audit rows | Count audit rows after each case | Exactly one version publish record, and one pin record per class |
| C5cx2-F5 | must | Existing behaviour kept | Run the C5 and T2 publish tests, including the injected-failure atomicity test | All pass; permission checks and the idempotency lookup are unchanged |
| C5cx2-F6 | must | Everything passes | Root lint, format:check, typecheck, test with DATABASE_URL (including `function_binding.test.ts`), build, plan check, on the head merged with current `idea-map` | All exit 0; CI green on the exact head. The new concurrency tests are deterministic (no sleeps), 10/10 runs |

## Security

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C5cx2-S1 | must | Scope unchanged | Concurrent publish where one class belongs to another org, or the teacher doesn't teach it | That request is refused (403) and pins nothing; the allowed one succeeds |
| C5cx2-S2 | must | Safe errors | Force a real failure | The response is the generic error, with no SQL or stack trace |

## Performance

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C5cx2-P1 | must | No slowdown | C5's publish performance check | Within its existing budget |

## Usability

| Id | Weight | Check | Steps | Pass bar |
|---|---|---|---|---|
| C5cx2-U1 | must | Teacher sees success | Both teachers' publish responses | Each gets the normal success result for their class |
