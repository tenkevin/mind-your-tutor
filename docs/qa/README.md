# Independent QA

Every task has a QA criteria file, `docs/qa/<ID>.md`, written **before the task is claimed**. A task can't move on without one: `scripts/plan.mjs claim` refuses it, and `check` fails if a claimed task is missing one.

## Who does what

| Step | Who | When |
|---|---|---|
| Write the criteria | Coordinator (or a person), from the task's `done_when`, `docs/ARCHITECTURE.md`, `docs/spec/` and the design in `project/`, **without looking at any implementation** | Before the task is claimed |
| Build to the criteria | The task's agent. It reads the criteria as the bar but does not mark them | During the task |
| Run the criteria | A **separate QA agent** that did not write the code, in a fresh session, against the PR branch | After the PR is opened and CI is green |
| Decide | Coordinator merges only on a QA **PASS**. A FAIL goes back to the task's agent with the report | After QA |
| Keep the record | Coordinator saves the report as `docs/qa/reports/<ID>.md` when merging | On merge |

The QA agent may read the code to find weaknesses, but it judges against the criteria and the spec, never against what the code happens to do.

## Criteria file format

Four sections, always in this order: **Functional**, **Security**, **Performance**, **Usability**. Usability means the people who use the result: teachers and students for screens, developers for packages and tooling. A section can be marked not applicable only with a reason.

Each check has:
- an id (`<task>-F1`, `<task>-S2`, `<task>-P1`, `<task>-U3`)
- a weight: **must** blocks a PASS; **should** is reported but doesn't block, and the coordinator decides whether to file a follow-up task
- the check itself, the **steps** to verify it (commands, inputs, what to look at) and the **pass bar** (an exact number or observable result)

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
