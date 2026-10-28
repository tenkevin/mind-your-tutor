Reviews: T2

# Independent T2 review — PR #27

Verdict: **UNVERIFIED overall; scoped checks PASS.** No confirmed implementation error found in the permitted checks. T2-F9 requires the unrestricted database suite including `function_binding.test.ts`; that remains unrun under the standing review restriction and cannot be certified by these results. The branch also needs current-base synchronization before the integration gate can clear.

Reviewed head: `1afe36672f1ffc246873f0c7b94865f0c3d6708f`.
Pinned base: `c3de500e8b7de251ff25df0fdb7a460bdb5539b7`.
Actual integrated tree: `d092096ab9de71ee2df7f00ff6a5c2654d9547d9`.
Scratch checkout: `/home/kevin/codex-qa-2026-10-27/t2-1afe366`.
`git merge --no-commit --no-ff <base>` succeeded without conflicts; no source edits or conflict resolutions. The staged additions are the two immutable reports contributed by the base. Parent reported exact-head CI success (build run `40085788829`, plan run `40085788644`) and one commit behind this pinned base; later parent reported base `2ded9d5`, with documentation/task metadata and plan-script drift. This report certifies only the tree above, not that later base.

## Errors

None confirmed in permitted implementation checks.

**Outstanding gate, not an implementation finding:** T2-F9/full-suite remains UNVERIFIED. Correction: the coordinator must retain the restriction and obtain the authorized disposition of the unavailable coverage, then verify current-base synchronization and exact-head CI. Do not reinterpret scoped PASS as all-must PASS.

## Suggestions

None newly proposed. The four run-1 fixes were checked: physical row locations, `Show 297 more`, failed-import wording/hidden chips, and stale-check suppression. The source-card's previous version tab chips can still briefly exist while a succeeded job's new checks load, but the checks themselves are correctly hidden; no blocking defect established.

## Criteria and fresh evidence

| Check | Result | Independent evidence |
|---|---|---|
| F1 | PASS | Real API `startServer`, real pg-boss worker and real browser file picker: XLSX upload creates queued job and draft; action reads Import new version. |
| F2 | PASS | MutationObserver captures all six API-backed steps moving queued → running/done without navigation. Large import captures Make quizzes running. Located failed Read sheet produces Not run for following steps. |
| F3 | PASS | Fresh XLSX: exactly error/prereq, warning/codes, info/media in that order; ground row 19, rain row 14, media 11 affected ids, fix tab/column shown. |
| F4 | PASS | `can_publish=false`, Can't publish yet, blocking prerequisite described; section contains no Publish control. |
| F5 | PASS | Empty first unit objective with unknown prerequisite removed yields draftable warning, Atlas approval wording and `can_publish=true`. |
| F6 | PASS with contract clarification | CSV archive missing Ideas.title ends failed, located Ideas row 1/title, no new version (5 → 5), no draft data/checks displayed, source says import failed and old chips hidden. PDF is synchronously refused with located format guidance and no new job/version, consistent with existing C4 upload contract. |
| F7 | PASS | Source name/kind/time visible. Reimporting identical XLSX changes unchanged false → true and shows Unchanged since last import. |
| F8 | PASS | Harness imports and executes real built `startServer` from apps/api/dist/index.js, opens actual HTTP listener, shares UPLOAD_DIR with real worker. Signed-out /api import route returns 401, authenticated requests complete full pipeline. Scoped bootstrap regression also passes. |
| F9 | UNVERIFIED | Build/lint/format/typecheck/plan and selected tests pass. Unrestricted suite deliberately unrun, forbidden binding test unrun. Parent owns CI evidence and current-base gate. |
| S1 | PASS scoped | Existing every-route F5 sweep passes in policy.test.ts. Additional real HTTP matrix: signed out GET latest 401; student GET/POST 403; teacher of another class sharing curriculum GET 200 and POST 202; teacher of other org GET/POST 403. No custom DB security probes performed. |
| S2 | PASS | Imported literal img/script strings in idea title appear in issues; section has zero img/script elements, execution sentinel remains null. |
| S3 | N/A | No report download linked by section. |
| P1 | PASS rendering | Fresh actual import: 2,000 ideas, 1,999 links, 2,000 assessments, exactly 300 issues; succeeded. Browser sees 300 issue nodes, a collapsed 297-more group and no horizontal overflow. See measurements below. |
| U1 | PASS source/browser comparison | Read prototype Curriculum data source and corresponding CSS; inspected actual sample screenshot. Source card, tab chips, six-card grid and issue rows follow design/token layout. Browser checks at 1440, 768 and 390 px show no horizontal overflow. Prototype was not executed and support.js was not read. No new raw color values in section CSS; comprehensive independent contrast measurements were not repeated. |
| U2 | PASS DOM/browser semantics | Scoped `.cdata [role=status][aria-live]` captures uploading, import started, changed step sentences, completion, refusal and failure text; status words/icons supplement color. This verifies live-region behavior, not a human screen-reader audio session. |
| U3 | PASS | Fresh XLSX imported rows roundtrip to physical row labels, including ground (row 19), rain (row 14), 11 media rows. |

## Commands, environment and artifacts

Node 22.22.0 / pnpm 10.28.0 using `/home/kevin/codex-qa-2026-10-22/toolchain/node_modules/.bin` first in PATH. Own PostgreSQL 16 pgvector Docker container `codex-qa-t2-1afe366`, host port 55432, disposable `ideamap` database. Browser: installed `/usr/bin/google-chrome`, Playwright core from existing npx installation. Real API port 3102, own Vite port 5273; real worker uses 0.5 s queue polling with a 90 ms after-step observation delay. No third-party model calls.

All logs and scripts are retained in `/home/kevin/codex-qa-2026-10-27/evidence/t2-1afe366/`:

```
pnpm install --frozen-lockfile                     # exit 0, install.log
pnpm build                                         # exit 0, build.log
pnpm lint                                          # exit 0, lint.log
pnpm format:check                                  # exit 0, format.log
pnpm typecheck                                     # exit 0, typecheck.log
node scripts/plan.mjs check                         # plan: ok, plan.log
DATABASE_URL=postgres://postgres:postgres@localhost:55432/ideamap \
  pnpm --filter @ideamap/api exec vitest run \
  src/imports.test.ts src/policy.test.ts src/index.test.ts
# api.log: 3 files, 37 tests PASS, 3.91 s
pnpm --filter @ideamap/teacher test
# teacher.log: 6 files, 60 tests PASS
pnpm --filter @ideamap/contracts exec vitest run src/curriculum-data.test.ts
# contracts.log: 1 file, 7 tests PASS
DATABASE_URL=postgres://postgres:postgres@localhost:55432/ideamap \
  node ../evidence/t2-1afe366/probe-final.mjs
# probe-final.log: exit 0, assertions + raw HTTP/browser observations
```

Inspected test import graphs before executing the explicit list; none imports the forbidden binding suite. Did not run unrestricted root tests or new custom adversarial DB probes. Did not read pnpm-lock.yaml or project/support.js. Prior report's custom shadow section was not reproduced.

Performance input `big.json` SHA-256: `cfbbc132eb921ee65723c5b0d46af6747884f88918f1f9957f219a557593f3aa` (retained). Final import click-to-ready 2510.17 ms includes queued worker polling, intentional observation delays, derivation, UI polling and response. The criterion's rendering measurement is response JSON parse → full issue DOM after reload, same imported pack each time: **83.8, 90.3, 64.1, 59.3, 62.7 ms**, median **64.1 ms**. First listed sample is first measured reload after import; remaining samples are warmed reloads, not cold browser-start benchmarks. All five below 1,000 ms. Earlier harness run had an extra harmless unit-objective warning (301 total); final run corrects input to exactly 300 and is the acceptance measurement. Full raw samples are in probe-final.log. Screenshots: sample.png, big.png, failure.png, width-768.png, width-390.png.

First failures retained: default Vite port 5173 was occupied; no foreign service was stopped. probe-first.log records Chrome rejecting cookie fields; corrected harness cookie uses localhost domain/path. probe-second.log records reseeding an already seeded disposable DB (duplicate sso_tenant); own database was recreated before subsequent runs. probe-third.log completed successfully with 301 issues; final harness improves dataset to exact 300 and fixes its live-region selector (earlier selector captured shell Saved). `progress undefined` at the end of logs merely reflects instrumentation reset on reload; full pre-reload progress array is already logged above it. These are harness/environment corrections, not product fixes.

All own API/Vite/browser/worker processes closed normally. Own Docker container stopped. Heavy window released directly to T3 and parent. No remote comments, pushes, task-state changes or actual merge performed.

## Parent publication note

The parent reviewed this completed report and its retained evidence before publication. At publication, PR #27 has advanced to `5caed4d31dac1d2e4c1473d7fa1fe8e2c2614a91` and the publication base is `63855ef1146ed1245f0d294cfb6493ae7ca52dc0`. This historical scoped result does not certify that newer head or integration tree. Current-head review and the unavailable full-suite gate remain outstanding. This publication changes no application code or task state.
