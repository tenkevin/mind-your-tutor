# Planning

> **Draft for the user's confirmation (2026-10-30).** Nothing in sections 3–7 is implemented yet.

How Idea Map work is planned, made ready, built, reviewed and finished. For coordinators, QA and builders. This page is the whole process. `docs/tasks.json` holds the data, `docs/PLAN.md` is generated from it, and `docs/ARCHITECTURE.md` holds the settled decisions.

## 1. Milestone: v0.1 by 2026-11-13

v0.1 is the minimum lovable product (user, 2026-10-30). It is done when every slice below is done and L1 (two classes share the Water Cycle; Kinematics runs Practice and trace-back) passes.

| Slice | When it's done… | Tasks still open on 2026-10-31 |
|---|---|---|
| A · Teacher publishes | a teacher imports, checks, configures and publishes a curriculum to classes | T3 T6 T8 A6 C5cx2 C6cx2 |
| B · Student sees progress | a student takes quizzes and their map shows their own live progress from tracker events | S1 M4 S2 S2q M10 C7 |
| C · Learn an idea | a student opens an idea and practises vetted items, and a failure traces back to its cause | C10 C12 C13 C14 C15 C16 C17 C11 M8 M11 S6 S9 |
| D · Ms. Ivy and Milo | a student gets grounded, safe, anonymised help from Ms. Ivy, and teaches Milo at the end of a unit | A2 A3 A5 A7 A8 A11 S4 S4m S4t |
| E · Teacher steers and sees | a teacher sets due dates and missions, asks Atlas, and sees timelines and diagnostics | T4 S3 A4 M5 M9 |
| F · Feedback is fair | feedback is explained, challengeable, checked before sending and audited for fairness | A9 A10 M6 |
| Pilot | the pilot runs | L1 |

`PLAN.md` shows each slice's progress and whether the milestone date still holds (section 5).

## 2. Lifecycle

```
spec ─▶ ready ─▶ doing ─▶ review ─▶ merged ─▶ done
          ▲                  │          │
          └── fix (same PR) ◀┘          └─▶ Codex post-merge review
```

| State | Means | Who moves it | Gate |
|---|---|---|---|
| spec | The task entry exists | Coordinator | — |
| ready | It can be claimed | `plan.mjs` (computed) | Criteria file exists, every dependency is done, no open questions, everything it consumes has a provider (section 3) |
| doing | Claimed by one builder | Builder: `plan.mjs claim` | Claim pushed before any code |
| review | PR open, CI green on its exact head | Builder: `plan.mjs review` | — |
| merged | In `idea-map` | Coordinator | QA verdict on the head (or a sync that changes no task code), CI green on that exact head, 0 commits behind, `idea-map` green; one merge at a time |
| done | Merge CI green | Coordinator: `plan.mjs done` | Report saved to `docs/qa/reports/<ID>.md` |

QA modes: **full** (every must check; Codex, and fix tasks), and **structural** (Claude, with the user's go-ahead per PR; errors that would collapse later work, plus security, privacy and stored-data correctness, block). A task merged on a structural PASS owes a Codex post-merge review. Codex errors become `<ID>cx<n>` fix tasks.

## 3. Task entry (`docs/tasks.json`)

Existing fields stay. New fields are optional, and `plan.mjs check` enforces them for open v0.1 tasks:

```jsonc
{
  "id": "S6", "title": "…", "version": "0.1", "deps": ["S2", "C10", "M8"],
  "done_when": "…",
  "slice": "C",                                   // section 1
  "effort": "M",                                  // S ≤ ½ day, M ≤ 1 day, L ≤ 2 days of build; larger tasks are split
  "provides": ["practice-events", "idea-page-api"],
  "consumes": ["M8:exercise-levels", "C10:practice-tab", "S2:map-view"],
  "open_questions": [],                           // any entry blocks "ready"
  "qa": { "mode": "structural", "verdict": "PASS", "head": "e602dcc", "report": "#31 comment 6530666338", "codex": "owed" }
}
```

A task is **ready** only when every `consumes` entry `X:name` names one of its dependencies `X` whose `provides` lists `name`. This is how S6→M8, the missing D38 inputs and the M3/S10b disagreement get caught while planning, instead of in review.

**Contracts** are the interfaces several tasks share. They sit in one top-level list in `tasks.json`, with the task that owns each one:

```jsonc
"contracts": [
  { "id": "event-catalogue", "owner": "M1", "where": "packages/contracts/src/events.ts", "rule": "D19; adding to it is a user decision" },
  { "id": "unlocked-set", "owner": "M3", "where": "packages/tracker progress()", "rule": "§8.4 rule 5: the only authority on unlocks" }
]
```

Changing a contract means editing its entry in the same PR, and the reviewer checks every task that consumes it.

## 4. Commands

| Command | Does |
|---|---|
| `node scripts/plan.mjs` | Regenerates `PLAN.md` |
| `node scripts/plan-map.mjs` | Renders `PLAN.md`'s dependency map to `docs/plan-map.png` with headless Chromium and a pinned local `mermaid` dev dependency (no network needed). Run it after every plan change and commit both files |
| `node scripts/plan.mjs check` | Validates everything above, including that `plan-map.png` matches the current map (runs in CI) |
| `node scripts/plan.mjs ready` / `show <ID>` | Lists what can start / shows one task with what it provides, consumes and unblocks |
| `node scripts/plan.mjs claim <ID> <agent>` · `review <ID>` · `done <ID>` · `release <ID>` | State changes (only through these) |
| `node scripts/plan.mjs qa <ID> <mode> <verdict> <head> <report>` | Records a QA verdict (new) |
| `node scripts/plan.mjs codex <ID> done` | Records that Codex's post-merge review is done (new) |
| `node scripts/plan.mjs log "<text>"` | Adds a dated line to the log shown in `PLAN.md` (new; replaces growing notes in `STATUS.md`) |
| `node scripts/qa-queue.mjs` | Live PR table: behind, conflicts, CI, verdict, task code changed since QA |
| `node scripts/qa-prep.mjs <PR>` | QA setup: scratch merge, Postgres with pgvector, CI steps, report skeleton |

## 5. What `PLAN.md` shows, in this order

1. **Milestone:** the date, each slice's done count, and a projection: open effort ÷ build capacity (4 builders), plus tasks awaiting review ÷ review capacity (Codex about 10 tasks a day, plus Claude QA about 10 a day on PRs the user approves). Marked *on track* or *at risk*.
2. **Review queue:** every task in review or owing a Codex review, with mode, verdict, head and report.
3. **Ready**, **in progress**, **blocked** (with what's missing: a dependency, a provider or an open question).
4. **Log:** the last 15 dated lines.
5. **Done**, and the dependency map.

## 5a. The plan map (`docs/plan-map.png`)

Agents plan best from the picture, so the map is part of the process, not decoration. **Read it before choosing, claiming or assigning work.**

- One lane per slice (A–F, then the pilot); each box is a task with its state colour (green ready, purple doing, amber review, grey waiting, red border critical path) and effort.
- Arrows are dependencies, labelled with the contract when one is consumed (`M3 → S1 · unlocked-set`). A box with an open question or a missing provider shows a ⚠ mark.
- Done work collapses into one box per slice, so the picture shows only what's left.
- `plan.mjs` stores a hash of the map source; `check` fails if `plan-map.png` wasn't re-rendered after a change, so the picture can't go stale.

## 6. Boundaries

- **Always:** change state only through `plan.mjs`; write criteria from the spec before a task is ready; record every verdict with `plan.mjs qa`; keep `plan.mjs check` green.
- **Ask the user first:** moving the milestone date; moving a task out of v0.1 or between slices on the critical path; changing a contract whose rule names a user decision (D19 to D22, D28); merging on Claude QA.
- **Never:** edit `PLAN.md` by hand; mark a task done before merge CI is green; mark a task ready with open questions; edit `Codex-*` files.

## 7. Migration (one coordinator pass, no builds)

1. Extend `plan.mjs` (fields, ready rule, `qa`, `codex`, `log`, milestone projection, slice lanes and contract labels in the map, map hash), add `scripts/plan-map.mjs`, with `node --test` tests in CI's plan job.
2. Fill `slice`, `effort`, `provides`, `consumes` and `open_questions` for the 38 open v0.1 tasks, plus the initial contracts. Record the qa state for tasks in review and for merged tasks that owe Codex. Gaps found become open questions for the user.
3. Freeze `docs/qa/STATUS.md` as history and move live notes into `plan.mjs log`. `HANDOFF.md` keeps only sessions and gotchas, and points here for process.
