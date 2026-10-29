# Roadmap

Idea Map ships in four versions (decision D45, user, 2026-10-29). Each task in `docs/tasks.json` carries a `version`, and a task may depend only on its own or an earlier version; `scripts/plan.mjs check` enforces both. Live progress per version is at the top of [PLAN.md](PLAN.md). This page holds the goals, the scope and what is deliberately left out of each version.

| Version | Focus | Milestone |
|---|---|---|
| **v0.1** | Pilot (MVP): what the app can't live without | L1: two classes share the Water Cycle; a Kinematics sub-pilot runs Practice and trace-back |
| **v0.2** | Underlying design principles of the AI | — |
| **v0.3** | Visuals and motivation | — |
| **v0.4** | Curriculum building | — |

## v0.1 · Pilot (MVP)

**Goal.** Run the pilot (D42, D44) with every safeguard in place: a student explores the Water Cycle map, learns from grounded tutoring, practises with vetted items, teaches Milo, and receives feedback that is explained, challengeable and checked for fairness.

| Area | What ships | Tasks |
|---|---|---|
| Feedback loop | The reason is shown with every piece of feedback, with **Challenge this** to flag it for teacher review. Summative feedback waits for the teacher. Before sending, a separate verifier and tone and reading-level checks run, and low confidence goes to the teacher | A9, A10 (D15, D16) |
| Fairness | Demographic parity difference and disparate impact ratio (flagged under 0.8), compared across schools and districts, with a district-run sampled audit | M6 (D16, D23) |
| UDL | CAST UDL 3.0 is acceptance criteria for every student screen (the S5 checklist) | S5 (done), every S task (D17) |
| Privacy | The anonymous layer blurs names on the device with ML NER plus pattern rules before text leaves it. Dual memory: the anonymised conversation plus long-term learning summaries | A7, A8 (D26–D29, D33) |
| Grounded AI | Facts come only from verified sources (curriculum, vault, class uploads), with citations. Otherwise the tutor becomes a Socratic sparring partner. Safety and moderation | A2, A3, A11 (D35) |
| Curriculum data | The Practice tab from vetted item banks only. `scope`, `key_terms` and `oer_reference`. Vault provenance (source, licence, attribution). The two-layer graph. The Vault standards graph. Per-scope layout. The pilot packs | C10–C17 (D40, D41, D43, D31) |
| Trace-back | Exercise levels, the two-layer trace-back and the teacher's diagnostic views with disclaimers | M8, M9, M5 (D38, D41, D20) |
| Student map | Draw and click the published map **first** (S10), then progress, events and live state (S1, M4, S2), idea pages and practice (S6), remediation zoom (S9), and the tutor and peer chat (S4) | S10, S1, M4, S2, S6, S9, S4 |
| Teacher | Course details, data tabs, publish and rollback (earlier versions only), drafts with approval, schedule, missions, and Atlas answering with tools | T3, T4, T6, T8, A6, S3, A4 |
| Content | **Track 1:** vetted practice and worked-example steps. Video waits for X2 in v0.4; until then the idea page shows a placeholder card | C10, C11, C17 |

**Not in v0.1:** video (v0.4), card classification overrides (v0.3), the persona editor (v0.4), the study planner and reminders (v0.2), student onboarding and interests (v0.2), sandbox exploration (v0.3), and Atlas editing or ingesting files (v0.4). During the pilot, teachers edit the spreadsheet and import a new version.

## v0.2 · Underlying design principles of the AI

| Item | Plan | Tasks |
|---|---|---|
| Bounded context with student data | The tutor's context may add the long-term memory summaries, only after the anonymous layer: never names, never raw transcripts (D28 as amended). Retrieval stays within verified sources, and off-topic requests are redirected to the problem (D35) | A17 |
| Metacognition | Students critique AI output with reasoning traces, counterexamples and uncertainty notes. Graded hints with enforced delays, and reflection loops, build self-regulation rather than dependency | A14, A15 |
| Interests and customised answers | Onboarding and interests (K–10 dropdowns, D36), and examples shaped by interests (never in vetted items) | S7, A16 |
| Study planner | A dual-track planner, the tutor's plan tools, and reminders (D39) | A12, A13, S8 |
| Isolated models | Each model or agent gets its own sandbox and storage branch, with no internet access | F7 |
| Model research | A specialised math model and an evaluation model; multi-view contrastive learning. Training data is open question §12 q26: de-identified or synthetic only, unless the user decides otherwise | X3, X4 |
| Persona baselines | Teacher-approved eval baselines (D34) | A5b |

## v0.3 · Visuals and motivation

| Item | Tasks |
|---|---|
| Milo's avatar, with a peer's reaction and thanks after a teach-back | S12 |
| Student experience polish: cards and combo effects, practice, teach-back, the chat panel, and the teacher's Preview as student | S13, T5 |
| The map lights up on mastery; mystery unlocks; cosmetic themes | S14 |
| Levels and perks: personal only, never leaderboards or rankings (D20) | S15 |
| Sandbox exploration of extension ideas and the process and mechanism layers | S11 |
| Relational custom examples; productive struggle | A18, A19 |

## v0.4 · Curriculum building

| Item | Tasks |
|---|---|
| Atlas as the editing interface. "Add file X to idea Y" asks for the source and licence and shows what was parsed for review. Vetted-bank items may fill Practice; a teacher's own material goes only to class uploads (D40 strict) | A20 |
| Track 2: draft explanations from a teacher's own uploads, with the same approve-before-students-see-it rule | A21 |
| Prerequisite editing with district permissions and AI-proposed links | T9 |
| Persona editor | T7 |
| Self-hosted video with captions (Track 1 video) | X2 (D42) |
| Google Drive import; de-identified research export | X1, M7 |

## Open questions that shape the roadmap

- §12 q26: may any model be trained on student data (v0.2 research)?
- Licence check for Khan Academy content (CC BY-NC-SA) before any Track 1 video uses it (v0.4).
