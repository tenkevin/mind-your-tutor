Reviews: C5

# Confirmed product decision: publish-preview student count

Decision confirmed by the user on 2026-10-22 PDT during independent QA of PR #20. This is a decision handoff, not a C5 implementation review or QA PASS.

## Decision

The publish preview's affected-student count means **all unique students enrolled in the selected classes**, regardless of whether their recorded progress actually changes. A student enrolled in more than one selected class is counted once in the overall total. The user explicitly selected: "Yes—count all enrolled students" in response to the question specifying unique students and unchanged progress.

This is the audience receiving the content update, not a tracker-derived progress-impact calculation. It does not change mastery carryover, archived progress, prerequisite unlocks or teach-back migration rules. C5 still follows C4; this decision alone does not authorize claiming, implementing or merging it.

Source reviewed: docs/ARCHITECTURE.md sections 7 and 12 question 8 on pinned base 02d7dd7b40982df0d56f2e629acf9a132f857fa0. The open question was genuinely unresolved there; this new user confirmation settles that question only.

## Errors

None: no C5 implementation was tested. Do not create a fix task from this decision record.

## Suggestions

Coordinator next action: incorporate the confirmed definition into architecture section 7, resolve only the matching section 12 question, and finalize C5 criteria before dependent implementation. Preserve all unrelated open questions and existing task/merge gates.

Recommended UI label: "Students receiving this update", with selected-class context. Keep any future "students whose progress changes" metric separate and clearly labeled.

Recommended QA criteria: count students with no progress history; count students whose progress stays unchanged; deduplicate students enrolled in multiple selected classes; exclude unselected classes and other organizations; return zero for an empty selection; update the count when the class selection changes. The overall total counts people, not enrollment rows.

Independent QA publishes only this new Codex handoff file; architecture, criteria and task-state ownership remain with the coordinator.
