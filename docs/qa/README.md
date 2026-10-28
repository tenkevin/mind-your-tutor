# Independent QA

Every task has a QA criteria file, `docs/qa/<ID>.md`, written **before the task is claimed**. A task can't move on without one: `scripts/plan.mjs claim` refuses it, and `check` fails if a claimed task is missing one.

## Authorization and handoff

Read `../HANDOFF.md` and `STATUS.md` before starting a review. **Coordination is active** under the user's resume of 2026-10-23 03:00 UTC ("continue to a new agent swarm"): claims, criteria-first, independent review and the integration gate. Since 2026-10-24 the independent reviewer is **Codex**; independent Claude QA is paused (user policy in `STATUS.md`). Routine state and reports belong in these living documents; direct messages are reserved for urgent findings, actionable blockers or authorized startup assignments. QA owns evidence and verdicts; the coordinator owns task states and merges. An unavailable required check remains unverified; do not retry or reroute previously blocked review actions through another tool, session or CI. The one standing exception is `packages/db/src/function_binding.test.ts`, which Codex may not run: the coordinator runs it, with the full root suite, locally before merging and records the result in the completion report.

## Who does what

| Step | Who | When |
|---|---|---|
| Write the criteria | Coordinator (or a person), from the task's `done_when`, `docs/ARCHITECTURE.md`, `docs/spec/` and the design in `project/`, **without looking at any implementation** | Before the task is claimed |
| Build to the criteria | The task's agent. It reads the criteria as the bar but does not mark them | During the task |
| Run the criteria | A **separate reviewer** that did not write the code (currently Codex), against the PR branch | After the PR is opened and CI is green |
| Decide | Coordinator merges only on a QA **PASS**. A FAIL goes back to the task's agent with the report | After QA |
| Keep the record | Coordinator saves the report as `docs/qa/reports/<ID>.md`, confirms actual merge CI, then marks done | After verified merge |

The QA agent may read the code to find weaknesses, but it judges against the criteria and the spec, never against what the code happens to do.

QA also tests the PR **as it would land**. In a scratch checkout, merge the current `origin/idea-map` into the PR head, then run the root `pnpm typecheck` and the full test suite with a database (`DATABASE_URL` set) as well as the task's own checks. A failure that only appears after that merge is a FAIL. Green tests on the task branch alone don't prove the combined branch works.

## Evidence and merge completion

Record exact PR head, pinned base, tested integrated tree, commands, environment, outputs and first failures. Preserve benchmark scripts or reproducible data hashes and raw samples; distinguish cold runs from warmed medians and use the same input for paired comparisons. An unavailable historical harness is a disclosed limitation. Any measurement-method clarification must be documented by the coordinator before the verdict, with its reason and unchanged acceptance budget; never silently substitute easier inputs or claim an unreproduced measurement passed.

Before merging, the coordinator verifies zero commits behind current `idea-map`, exact-head CI and independent all-must PASS. A later base synchronization carries that PASS only when the task code/spec is unchanged and exact-head CI passes. Record the diff check, merge SHA and actual merge CI in the completion report. Keep nonblocking suggestions in CXB or future criteria; they do not authorize work past a user stop boundary. Published `Codex-*` reports remain immutable; corrections use a new report or a clearly identified coordinator addendum outside the immutable original.

## Criteria file format

Four sections, always in this order: **Functional**, **Security**, **Performance**, **Usability**. Usability means the people who use the result: teachers and students for screens, developers for packages and tooling. A section can be marked not applicable only with a reason.

Each check has:
- an id (`<task>-F1`, `<task>-S2`, `<task>-P1`, `<task>-U3`)
- a weight: **must** blocks a PASS; **should** is reported but doesn't block, and the coordinator decides whether to file a follow-up task
- the check itself, the **steps** to verify it (commands, inputs, what to look at) and the **pass bar** (an exact number or observable result)

## UDL 3.0 checklist (student-facing tasks)

Decision D17 makes the CAST UDL Guidelines 3.0 acceptance criteria for every student-facing feature, alongside WCAG 2.1 AA with only D10's exceptions. The criteria for any task that changes what a student sees or does must include the checks below as **must** checks (ids `<ID>-U<n>`), adapted to the feature, or mark one not applicable with a reason. The shared components from S5 live in `apps/student/src/udl/` and `udl-reference.html` (run `pnpm --filter @ideamap/student dev`, open `/udl-reference.html`) shows each one. Using them is the expected way to pass.

**Engagement** (the why of learning)
- Choice: where the feature offers a task, the student can choose among what's open (missions, order of ideas), and locked items say in words what unlocks them (`MissionPicker`).
- Pacing: a multi-step task can be paused and resumed where it was left, and nothing times out on the student (`StepFlow`).
- Feedback that sustains effort: formative feedback says why, in plain words, and offers **Challenge this** (D15, `Feedback`).

**Representation** (the what of learning)
- Text is always present; read-aloud is available on explanations, questions and feedback, with pause, stop and the spoken word highlighted (`ReadAloud`, `IdeaText`).
- Every image or video has alt text or a caption, and nothing is shown only as a picture or only as a colour (state also in words or an icon).
- Text size to 200% (browser zoom and the in-app setting) keeps the layout usable, and animation stops under `prefers-reduced-motion` or the student's Calm screen setting (`DisplaySettings`).
- Wording suits the youngest grade the feature serves (K-2 when it reaches them).

**Action and expression** (the how of learning)
- Every typed answer, chat message and challenge can also be spoken (`SpeakOrType`): speech becomes text on the device, the student checks it before sending, and typing always works.
- Keyboard alone completes the task; controls are at least 44 px, and icons always have a text label.

**Privacy for all three** (D19, §8.2)
- Read-aloud and speech input run in the browser only: on-device voices and on-device recognition, no audio uploaded or stored, no request to a third-party speech service. The mic prompt appears only after the student presses Talk and has seen a plain explanation.
- The UDL controls themselves add no tracker events: choosing a mission, pausing, reading aloud, talking or changing display settings are not recorded. Only §8.2 events (for example `mission.completed`, `feedback.challenged`) are sent, by the feature that owns them.

## Report format

The QA agent posts this as a PR comment (`gh api repos/<owner>/<repo>/issues/<n>/comments -F body=@report.md`; capital `-F` reads the file), and the coordinator saves it to `docs/qa/reports/<ID>.md`:

```
# QA report: <ID> · PR #<n> · commit <sha>
Verdict: PASS | FAIL
Tester: <qa agent name> · Date: <YYYY-MM-DD>

| Check | Weight | Result | Evidence |
|---|---|---|---|
| <ID>-F1 | must | PASS | `pnpm build` exit 0 (log excerpt) |
| <ID>-S3 | must | FAIL | `pnpm audit` reports 1 high: … |

## Found during testing
Problems not covered by a check, each with steps to reproduce and a suggested weight.
```

Verdict is PASS only when every **must** check passes. Evidence is real output (a command and its result, measured numbers, a screenshot path), never "looks fine".

## External review (Codex)

Codex, an outside reviewer the user brings in, checks each merged checkpoint on `idea-map` and commits its findings as files whose names start with `Codex-` (any folder). Each file lists **errors** and **suggestions**.

| Step | Who | What |
|---|---|---|
| Find | Coordinator, on every pass | Lists `Codex-*` files on `idea-map` that are not yet in `docs/qa/codex-ledger.json` |
| Errors | Coordinator | Each error becomes a must-fix follow-up task, `<ID>cx<n>` (for example `C1cx1`), with QA criteria in `docs/qa/<ID>cx<n>.md` built from the Codex text. The original error is quoted, and every check is weighted **must**. These tasks start ahead of other ready work, and go through independent QA like any task |
| Suggestions | Coordinator | Added as **should** checks to the criteria of the next not-yet-started task that touches the same area, with the Codex file cited. Suggestions with no such task go into one backlog task, `CXB`, that collects them |
| Record | Coordinator | Adds the file, its commit, and the tasks or criteria it fed into `codex-ledger.json` |

Codex files are never edited, moved or deleted by agents. They are the reviewer's record.
