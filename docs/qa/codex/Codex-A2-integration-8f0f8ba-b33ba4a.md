Reviews: A2

Verdict: **BLOCKED / UNVERIFIED**. PR #37 cannot yet receive an independent scoped feature PASS: its current head has an application merge conflict with the current fetched `idea-map`. No implementation defect was confirmed by this static review. Runtime checks stopped at the integration prerequisite.

Reviewed head: `8f0f8ba5153970bf704ba824cacda477ea9e3a19`. Pinned current fetched base: `b33ba4a779277464770b693b6e3363b2806e690c`. Fresh scratch: `/home/kevin/codex-qa-2026-10-27/a2-current-8f0f8ba`. HEAD and MERGE_HEAD retain those exact values. **Actual integrated tree: unavailable**, because the index contains unresolved stages for `apps/api/src/index.ts`; `git write-tree` exits 128. No conflict resolution was attempted.

The earlier preserved scratch merged pinned base `63855ef1146ed1245f0d294cfb6493ae7ca52dc0` into the same head cleanly, tree `ab750f145cc848cf41a47e5eab1657926fd6b950`. That earlier tree predates application changes now present on the base and was never runtime-certified. Its external harness and static evidence remain under `evidence/a2-8f0f8ba/`. This report supersedes the unpublished draft `a2-review-8f0f8ba.md` for current integration status.

## Errors

No confirmed implementation error. The integration prerequisite is blocked: `git merge --no-commit --no-ff b33ba4a779277464770b693b6e3363b2806e690c` exits 1 with a content conflict in `apps/api/src/index.ts`. A2's shared provider/moderator initialization meets T2's new `startServer(env, options)` initialization. The unresolved scratch shows the conflict at lines 178–185.

The builder should synchronize the PR with current `idea-map`, preserve T2's `loadAiConfig(env)` configuration injection and A2's shared `aiProvider` with `modelModeration`, and retain imported routes and server cleanup. The independent reviewer must then check the actual resolved head and combined tree, with fresh exact-head CI. This is a merge prerequisite, not a claim that either uncombined implementation fails a safety requirement.

## Suggestions

Low priority, static only: in the resolve handler in `apps/api/src/safety.ts`, write `safety_flag.resolved` only when the conditional `UPDATE ... WHERE status = 'open'` changes one row. It currently reads open state and then unconditionally audits after the update. Concurrent legitimate resolutions could both read open before one performs a no-op update, yielding duplicate transition audits. No concurrency fixture was run and no must failure is asserted.

## Criterion results

All criteria are must checks. Static evidence does not substitute for the required route/database executions.

| Check | Result | Evidence and remaining check |
|---|---|---|
| A2-F1 | UNVERIFIED | Static input check precedes provider; existing safe/unsafe synthetic route tests audited but unrun. |
| A2-F2 | UNVERIFIED | Static output verdict withholds unsafe content and logs categories; route tests unrun. |
| A2-F3 | UNVERIFIED | `withGuardrails` appends fixed text after filled template; existing tutor/peer and template tests unrun. |
| A2-F4 | UNVERIFIED | Transactional flag/transcript creation and district help response reviewed; teacher/admin route lifecycle unrun. |
| A2-F5 | UNVERIFIED | Notification snapshot follows organization policy; policy variation tests unrun. |
| A2-F6 | UNVERIFIED | Hard timeout and fail-closed error path reviewed; timeout fixtures unrun. |
| A2-F7 | UNVERIFIED | Static registry has student tutor/peer and staff agent routes; enumeration tests unrun. |
| A2-F8 | BLOCKED; full suite UNVERIFIED | Current integration conflicts before root checks. Full suite additionally unavailable under the standing prohibition on executing `function_binding.test.ts` or importers. No CI/coordinator result replaces independent full-suite certification. |
| A2-S1 | UNVERIFIED | Org/class/recipient filters and redacted persisted excerpt reviewed; permitted existing privacy tests unrun. |
| A2-S2 | UNVERIFIED | Explicit fixed no-personal-data guardrail plus deterministic request detector and moderation reviewed; synthetic output fixtures unrun. |
| A2-S3 | UNVERIFIED | Raise/resolve audit calls reviewed; independent lifecycle unrun. |
| A2-S4 | UNVERIFIED | Transcript cascade, per-org validated 1..3650-day setting, runtime retention cutoff and audit/inventory reviewed; existing day 29/31/89/91, 7/60-day and changed-window tests unrun. |
| A2-P1 | UNVERIFIED | Prepared 200 actual tutor/peer gateway turns with instant mock moderator/model, no warmup. No benchmark executed; no cold or warm latency claim. |
| A2-U1 | PASS (static wording review) | Read fixed redirect, fallback, support and unavailable text: calm, age-appropriate and no internal categories. District help text is admin-controlled. |
| A2-U2 | UNVERIFIED | API structure includes when/class/redacted excerpt/next step; opening a flag via API remains unrun. |

## Commands, first failure and raw evidence

Executed read-only REST PR metadata, authenticated git fetch of `idea-map`, detached `git worktree add` at the exact head, then the no-commit merge above. REST returned the correct head but stale `base.sha` `7c32f63…`; the reviewer pinned the actual fetched `origin/idea-map` `b33ba4a…`. Criteria `docs/qa/A2.md` are unchanged between the prior pinned base and the current base.

The first attempted current integration merge failed before runtime checks. Full original failure text is retained in `/home/kevin/codex-qa-2026-10-27/evidence/a2-current-8f0f8ba/merge-first-failure.log`. Other raw files there: `identity.log`, `status.log`, `conflict.log`, `unmerged-stages.log`, `tree-unavailable.log`. Prepared harness/config/runner copies adapt only scratch/evidence paths and remain unrun.

No install, lint, format, typecheck, build, plan, test, benchmark, Docker service or provider call was run in this resumed review. Runtime was held for serialized scheduling, then integration failed before its window. Intended toolchain remains Node 22.22.0 / pnpm 10.28.0; versions are not asserted as independently executed here. Planned test files and setup were inspected before use; no prohibited function-binding execution, shadow/temp-table probe, custom database security probe, real data or real provider key was used.

## Cleanup and scope

No reviewer-owned services or container were started, so none require stopping. The fresh unresolved worktree is retained for inspection; earlier tree/harness evidence is preserved. No application source fixes, task-state changes, published Codex edits, remote writes or actual merge commits were made. Review stopped under the explicit reviewer-guide rule to stop at application merge conflicts.
