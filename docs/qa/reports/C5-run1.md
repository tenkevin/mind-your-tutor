# QA report: C5 · PR #23 · commit 6f43575628cd945670ed7246bfce08406bcd3db4
Verdict: FAIL
Tester: qa-c5 · Date: 2026-10-23

**Why FAIL:** one must check fails, C5-F10. The PR head doesn't merge cleanly with current `origin/idea-map` (`f02a223`, 31 commits ahead of the PR base `7a0af6d`, now with F5 sign-in). Once merged, C5's routes can't be registered under F5's route-policy registry. Every other must check passes on the PR head with real evidence. As instructed, I evaluated the PR head alone for those checks and say so in each row.

**Environment:** Node 22.22.0, pnpm 10.28.0. Local throwaway PostgreSQL 16.15 with `postgresql-16-pgvector` installed through apt. `DATABASE_URL=postgres://postgres:postgres@localhost:55432/ideamap`. Scratch worktree at the PR head, no changes to application code. QA's own probe suite was copied in temporarily as `apps/api/src/qa-c5.test.ts`, 16 tests, all passing. My fixtures are built independently of the PR's helper, from `fixtures/water-cycle/pack.json`:
- **A** = sample with `aquifer` removed from `ground.requires`.
- **B** = A plus:
  - one idea added (`hail`) and one removed (`rivers`);
  - `clouds` renamed to "Cloud formation";
  - `ice.requires` changed from `[temp]` to `[temp, cond]`;
  - `plants` moved from unit 1 to unit 2;
  - `evap` question edited.
- **E** = sample unmodified.

Every draft was created through the real C4 path (`startImport` then `runImport`, JSON upload), not by inserting rows directly. The only exceptions are the P1 2,000-idea versions.

**Combined tree:** `git merge origin/idea-map` into `6f43575` → `CONFLICT (content)` in **`apps/api/package.json`** (dependency lists) and **`apps/api/src/index.ts`** (`ServerOptions`/`buildServer` rewritten by F5).

| Check | Weight | Result | Evidence |
|---|---|---|---|
| C5-F1 | must | PASS (PR head) | B imported through C4 and diffed against published A, giving exactly 6 entries. `ideas_added:[hail (unit 2 "Water in the sky")]`, `ideas_removed:[rivers (unit 3 "Water comes back")]` and `ideas_renamed:[{clouds, "Clouds"→"Cloud formation"}]`. `prerequisites_changed:[{ice, before:[temp], after:[cond,temp], added:[cond "Condensation"]}]` and `units_changed:[{plants, from 1 "Water goes up" → 2 "Water in the sky"}]`. `assessment_changed:[{evap, before "What is evaporation?…", after "Where does the energy…"}]`. No other entries. |
| C5-F2 | must | PASS (PR head) | `?against=` itself → 200, `empty:true`, all lists `[]`. Diffing against latest when A is latest → `empty:true`. Identical re-import of A as a new draft → 200 `empty:true`. First publish on an empty curriculum → `first_publish:true`, `from_version:null`, 18 added and 0 other entries. |
| C5-F3 | must | PASS (PR head) | Three requests for B's diff gave byte-identical bodies (957 B, 1 distinct). B re-imported with rows rotated and reversed in every tab, and `requires` reversed, gave a `diff` JSON byte-identical to the first. |
| C5-F4 | must | PASS (PR head) | c1 and c2 both pinned to A. Publishing B to c1 → 201. c1 moved A→B and c2 stayed on A. B is `published` with `published_at` 2026-10-23T20:11:46.473Z. A is still `published`, its `md5(pack)` is unchanged (`20b0e70e…`) and its diff is still readable (200). |
| C5-F5 | must | PASS (PR head) | Publishing E → 422 with `blocking:[{tab:"Ideas", column:"requires", items:["ground"], message:"Groundwater requires \"aquifer\"…"}]`. Pins were byte-identical and the status stayed `draft`. Preview shows `can_publish:false` with the same issue. A pack with only warnings and info gets 201: issue levels were `warning×3, info×2`, including an empty unit objective and an empty question (D12). |
| C5-F6 | must | PASS (PR head) | Classes 1+2 → `count 4`; class 2 only → 2; `[]` → 0; order reversed → 4. s1 has no history and s2 has a snapshot; both are counted. s3 is counted once. Adding an org-B class to the selection → 404 with no count. An org-B student can't be enrolled in an org-A class (FK `enrollment_org_id_student_id_fkey`). Label: "Students receiving this update". |
| C5-F7 | must | PASS (PR head) | Re-pinning c1 to A → 200, from B to A, and B stays `published`. Re-pin to a draft → 422 ("Version 5 is a draft…"). Re-pin to an archived version → 422. Publishing an archived version → 422. Re-pin to another curriculum's published version → 422. |
| C5-F8 | must | PASS (PR head) | Atomicity, tested by injecting failures with test triggers. (a) The class UPDATE fails on class 2 → 500, pins unchanged, version stays `draft`, 0 audit rows. (b) The audit INSERT fails after the pins were updated → 500, pins unchanged, `draft`, 0 audit rows. (c) A deleted class → 404, nothing moved. Idempotency: repeating with the same key and classes in a different order → 200 with an identical body, pins unchanged and 1 audit row. Four concurrent first-time requests with one key → `[201,200,200,200]`, identical bodies, 1 audit row. Same key with other classes → 409. |
| C5-F9 | must | PASS (PR head) | `interaction_event` count+md5, `progress_snapshot` count+md5 and `interaction_event_key` count were taken before and after publishing to c1+c2 plus a rollback. Both snapshots are identical: `2:79549018…`, `1:9aca0f46…`, `2`. |
| C5-F10 | must | **FAIL** | **Combined tree:** merge conflicts in `apps/api/package.json` and `apps/api/src/index.ts`. In a QA scratch-only resolution, I took both dependency lists and F5's `buildServer`, and registered `publishRoutes` with the session as `authenticate` the same way C4 does. The server then refuses to start: `Route GET /versions/:versionId/diff declares no policy.` (F5-F4 registry). The PR's `publish.test.ts` also no longer typechecks (`studentsReceiving` not exported; `authenticate` not in options), so its suite fails. Every other package passes on that merge: db 169, connectors 118, worker 18, api 71 others, etc. **PR head alone:** `pnpm install --frozen-lockfile`, `lint`, `format:check`, `typecheck` and `build` all exit 0. `node scripts/plan.mjs check` exits 0. `pnpm test` with `DATABASE_URL` exits 0 (db 165, api 22, domain 103, contracts 217, tracker 172, connectors 111, worker 18, ui 78, others). That includes `packages/db/src/function_binding.test.ts` (4/4 ✓) and `apps/api/src/publish.test.ts` (15/15 ✓). CI on `6f43575`: `build` success, `check` success. |
| C5-S1 | must | PASS (PR head seam) | Matrix of diff/preview/publish/re-pin results. Class teacher t1: 200/200, then publish 201. Teacher of another class: 200/403/403/403. Student: 403×4. Author: 200/403/403/403. Admin and teacher of another org: 404×4. No session: 401×4. t1 publishing to [c1, c2], where t2 teaches c2 → 403. Another org's real id and a random uuid return byte-identical 404 bodies. No pin moved. *Caveat:* this ran through the PR's `authenticate` seam. After F5, the policy layer answers wrong-org with 403, not 404 (see below). |
| C5-S2 | must | PASS (PR head) | API: org-B version to org-A class → 404, org-A version to org-B class → 404, org-B re-pin to org-A version → 404, curriculum X version to class on Y → 422. DB: cross-org pin and cross-curriculum pin are refused by FK `class_curriculum_id_pinned_version_id_fkey`, as superuser and as the app role. A draft pin is refused by `guard_class_pin` ("only a published or archived version can be pinned"). |
| C5-S3 | must | PASS (PR head) | 12 audit rows (`curriculum_version.publish` and `class.repin`). Every row has `actor_id`, and `detail` has the classes with `from_version_id` and `to_version_id`. The rows contain no student ids, no student names and no raw idempotency key (only `idempotency_key_sha256`). |
| C5-S4 | should | PASS | B's diff response contains no student ids, and the string "student" doesn't appear in it. The count appears only in the preview and publish results. |
| C5-P1 | must | PASS (PR head) | Two 2,000-idea versions with exactly 200 rows (10%) differing: 20 added, 20 removed, 40 renamed, 40 `requires`, 40 unit, 40 question. Server-side `getDiff` (DB read plus diff): cold 62.3 ms; warmed runs 56.0, 55.6, 41.8, 48.5, 51.2 ms, median **51.2 ms**. HTTP inject, 5 runs: 43–90 ms. |
| C5-P2 | must | PASS (PR head) | 30 classes, 3,000 enrollments, 1,753 unique students (overlapping windows). Count = 1,753, which matches `count(DISTINCT)`. Cold 9.6 ms, warmed 9.05–9.8 ms. A Kysely plugin counted **1 query** per count. EXPLAIN ANALYZE execution time 8.7 ms. |
| C5-U1 | must | PASS | Every entry carries `idea_id` plus `title`. Units appear as `{unit, name}`. Renames show `before → after` names. Prerequisite changes name the added and removed ideas. |
| C5-U2 | must | PASS | "Version 1 can't be published until this error is fixed in the sheet, starting with Ideas → requires. Fix the sheet, import it again, then publish. Nothing was published." It also includes the `blocking[]` entry with tab/column/items. `row` is null, because the stored C2 issues have no row. |
| C5-U3 | should | PASS | The field is `students_receiving_this_update` with `label: "Students receiving this update"` and `class_ids`. The contract doc comment says that a progress-change count would be a separate, separately named figure. |

## Found during testing

1. **C5's routes have no F5 route policies, so the merged server won't start** (suggest **must**; this is what makes F10 fail). F5's `registerPolicies` throws for any route without `config.policy`. All four C5 routes (`GET /versions/:versionId/diff`, `POST /versions/:versionId/preview`, `POST /versions/:versionId/publish`, `POST /classes/:classId/pin`) need policies. They also need wiring in F5's `buildServer` like C4's imports (session as caller), and `publish.test.ts` must be ported to F5's server and harness.
   Repro: merge `origin/idea-map`, resolve as described, then call `buildServer({db, config, publish:{deps}})` and `app.ready()`. Result: `Route GET /versions/:versionId/diff declares no policy.`
   Note: F5's `policy.test.ts` "lists every route" set will need the new URLs too.
2. **Wrong-org status after F5** (suggest **should**, for the coordinator to settle). C5-S1 asks for cross-org ids to return 404 without leaking existence. F5's policy layer (`policy.ts` header) answers "wrong org or wrong class" with 403 before the handler runs. Re-run S1 on the integrated head. Either the policy scope (e.g. `kind:'visible'` for versions) keeps 404, or the coordinator accepts 403 as non-leaking, since the same 403 is returned for missing ids.
3. **Idempotent repeat returns the stored result even if state has moved on** (suggest **should**/info). After a successful keyed publish, a later re-pin or archive doesn't change what a repeat with the same key returns. The repeat stays a no-op, which matches the criteria; just noting that the 200 body describes the original publish, not current pins.
4. **The DB guard still allows pinning an `archived` version** (info; the PR description already notes this, and it is unchanged since F4cx1). Only the API refuses it, which satisfies C5-F7.
5. **Test-environment note** (not a product defect): my first test run lost the Postgres cluster because the scratch directory's permissions were reset during the run. I reran it on a cluster under `/var/lib/postgresql`. All results above come from the clean rerun.

Raw evidence: logs and `evidence-run2.json` are kept in the QA session's scratch space.


---
_Generated by [Claude Code](https://claude.ai/code)_
