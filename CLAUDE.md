# CLAUDE.md

## Before starting any work

1. Read `TASK_GRAPH.md`. It is the reference for what can be worked on.
2. Only work on a node marked 🟢 whose owner includes Claude. If the request is for a 🔴 node, name the blocking nodes and ask before going ahead.
3. When a node is finished, update `TASK_GRAPH.md` in the same commit:
   - Mark the node ✅.
   - Promote any dependents whose `Needs` are now all ✅.
   - Update both diagrams to match the table.
4. A newly discovered blocker becomes its own node with edges, not a note.

## Document authority

`CANON.md` wins every disagreement. After it come `TASKS.md` (what each task is), `TASK_GRAPH.md` (status and dependencies), `PROJECT_BRIEF.md` and `ARCHITECTURE.md` (MVP scope and design), and `STUDENT_EXPERIENCE.md` (the why).

## Rules that bite in code

- Tests that enforce an invariant cite the decision id (D32), for example `# D34` or `test_d20_...`.
- Conformance tests are written from the Canon, not from the implementation (D33).
- No model call anywhere in a deterministic path: selection, tracing, scheduling, adjudication, validation (I3).
- The student-tier package never imports the authoring package (`ARCHITECTURE.md` §6).
- Python ≥ 3.11; tests with `pytest`, run from the repo root.
