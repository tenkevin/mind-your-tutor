# Project brief — MindyourTutor MVP

Status: draft for review
Authority: `CANON.md` (where this disagrees, the Canon wins)
Companions: `ARCHITECTURE.md` (how), `TASKS.md` (the work list), `STUDENT_EXPERIENCE.md` (the why), `MindyourTutor_Visual_Project_Brief.pdf` (the long-term promise)

---

## 1. The promise, and the slice of it the MVP proves

The long-term product is an algebra tutor for ages 12–16 that remembers what a student knows and what they are about to forget: **see the gap, teach the next step, bring it back later.**

The MVP proves that loop **end to end on one unit, in one classroom**, and nothing wider (D27). A flat result across many units cannot say which stage is broken. A working loop on one unit can.

> **MVP in one sentence:** Grade 7 students in the project lead's own class work through IM Grade 7 Unit 2 (*Introducing Proportional Relationships*). Every item they see was generated in the cloud, passed a deterministic gate and was approved by a human. Their evidence is captured completely on a self-hosted server. A deterministic tracer decides what comes next and when to bring it back.

---

## 2. Who it is for

| Role | In the MVP |
|---|---|
| **Student** | A Grade 7 student (ages 12–13, D41) in the pilot class. They get in with a code and no account (STUDENT_EXPERIENCE §1). |
| **Reviewer** | The project lead, a classroom teacher, with 15 h/week (D38). They approve every artifact before any student sees it. |
| **Responsible adult** | The project lead as class teacher. They see a legible model of each student and receive escalations (I10, D5). |
| **Parent / guardian** | Signs the consent agreement (D41, D42). They get no login and no monitoring view in the MVP. |
| **Advisor** | Prof. Corinne E. Hyde, USC. She advises and does not approve (D38). |

---

## 3. What is in the MVP

### Curriculum: one unit, plus one level of prerequisites underneath it

- **Taught:** IM 6–8 Math Grade 7 Unit 2 (current accessim.org edition), annotated to CCSS-M 7.RP.A.2a–d (D37). The unit has about 15 lessons, which should become roughly 20–30 KCs.
- **Prerequisites, itemised:** the KCs that descent (D4) will actually land on, one level down. These are ratios, rates and unit rate (Grade 6), equivalent ratios, and fraction and decimal multiplication and division. Estimate: 8–12 KCs, each with items.
- **Prerequisites, named only:** the graph goes further down with no items (D13). A student who descends that far gets the gap named, compensation at reduced load, and an escalation to the teacher (D5).
- **Per KC:** item templates at three incidental-load levels (D8, D28), worked examples, and the five-step scaffolding ladder (prompt → hint → partial step → worked step → parallel item, D3). All of it is pre-generated and approved (D16, D31).
- **Input forms** follow the unit: numbers, fractions, `y = kx` equations, table cells, and yes/no/why on "is it proportional". **Graph drawing as input is out of scope.** Graphs appear as fixed, approved diagrams, and the student answers about them in text (D17).

### Production pipeline (cloud, no student data)

Source → segments → objectives → KC candidates → claim-typed edges → item templates → materials. Every stage passes the **deterministic gate** and then the **review surface**, and ends in **human approval**. The output is a content-hashed curriculum bundle that the student tier imports read-only.

### Student tier (self-hosted, all minors' data)

- **Tutoring session** (student starts it): one problem on screen, placement by descent, the escalation ladder, and an early end on an unassisted success (D3, D4, D9).
- **Retrieval moment** (the system starts it): 2–3 items, no scaffolding, dismissable at no cost (D2). The channel is an open decision; see §7.
- **Adult view:** the teacher sees, per student, what is acquired, what is due, which gaps were named, and any escalations. It uses sentences where possible, and the student never sees any of it (D10).
- **Evidence capture, complete** (I2, I8, D34). This includes the signals in `QA_Testing_Criteria.md`: response latency, pauses, revisions, scaffold level reached, declined offers, abandons and ignored pings. Events have a typed core with an extensible attribute registry, so new signals can be added without a migration.
- **Baseline deterministic tracer and scheduler** (task 4.2). They sit behind a stable interface so the researched tracer (Q4) can replace them later without touching anything else.

### Evidence and quality

- `math-check` with adversarial tests (task 1.1).
- The **seed benchmark**: 20–30 hand-made Unit 2 artifacts, three of them deliberately spoiled (task 1.7). The gate must catch every planted defect before it approves anything real (task 2.3).
- Offline replay of pilot evidence for tracer research. This work stays on the self-hosted side.

---

## 4. What is explicitly not in the MVP

| Out | Why |
|---|---|
| **Live LLM generation in the student path** | D31: self-hosted inference cannot serve it, and I3/I6 make it a liability. The lesson instructor selects and fills approved templates. See `ARCHITECTURE.md` §4. |
| **Open free-text chat with the student** | Student input is maths answers plus fixed controls (*stuck*, *stop*). This removes the largest safeguarding surface while the escalation path is still new (I10). |
| **An LLM tracer deciding anything** | I3 stands (D39). Thinking-KT-style methods may be evaluated offline as a comparison. |
| **Evolution / procedural graph self-improvement** | D26: no `D_val`, no evolution. Phase 6 does not start. |
| **Other units or grades** | D27: one unit end to end first. |
| **Parent digest or parent login** | Task 5.8 is deferred. In the pilot the teacher is the responsible adult. |
| **Multi-school tenancy** | One tenant. Tenant-scoped columns and row-level security are still built from day one so they never have to be retrofitted. |
| **Gamification, progress maps, numeric mastery for students** | D10, permanently. |
| **Misconception taxonomy, voice, photos, graph drawing, classroom management** | Deferred (Canon §5, visual brief V1 boundary). |

---

## 5. How we know it worked

The visual brief says success is what the student can still do later, and time in the product is a guardrail, not the goal. The MVP measures three things in that spirit, plus the build's own gates.

| Measure | MVP form |
|---|---|
| **Retention** | Unassisted success on retrieval items at a delay of 7 days or more. |
| **Transfer** | Success on an approved item *form* not used during that student's instruction. |
| **Prerequisite repair** | After a descent, the student returns and succeeds unassisted on the item they originally failed (STUDENT_EXPERIENCE §2). |
| **Gate** | Catches 100% of planted benchmark defects and passes every sound artifact (task 2.3). |
| **Pipe** | Unit 2 goes source → approved bundle → student with no hand-patching. Every served item traces back to an approval and a source span (task 3.4). |
| **Review load** | The unit's artifacts are approved within the reviewer's 15 h/week without approval becoming a rubber stamp. Time per artifact is tracked. |
| **Guardrail** | Sessions stay short: median ≤ 15 min. Consent and data scope are honoured, with zero student data reaching the cloud tier. |

The MVP is a feasibility pilot, not an efficacy study (task 6.5). Numbers from one class describe the loop working. They are not evidence that it teaches better.

---

## 6. Build order

This follows `TASKS.md`. Each milestone ends on a check, not a date.

| Milestone | Contents | Done when |
|---|---|---|
| **A. Ground truth** | Tasks 1.1–1.6, 1.8 | `math-check` adversarial suite green; append-only store rebuilds identically from the log |
| **B. The ruler** | Task 1.7, Phase 2 | Gate catches every planted defect in the benchmark |
| **C. The slice** | Phase 3 on Unit 2 | Approved, content-hashed Unit 2 bundle exported |
| **D. The student tier** | Tasks 4.1–4.2, 5.1–5.7 | A test student completes a descent and a retrieval end to end on the self-hosted server, with evidence replayable |
| **E. Pilot** | Consent returned; approvals in place (§7) | First real session |
| **In parallel** | Q4 tracer research, task 4.3 synthetic learners, task 4.4 replay harness | A candidate tracer beats the baseline on delayed retention in replay (task 4.5) |

A and B need no curriculum and no model, so they can start now.

---

## 7. Open before the pilot

| # | Decision | Recommendation |
|---|---|---|
| Q3 | R1 variant; cost and latency ceiling per unit | Set a ceiling before milestone C. Rough scale: about 75 reasoning calls per unit before retries. |
| Q4 | The deterministic tracer; the one-sentence prediction BKT can't make | The forgetting prediction ("same start, different spacing, different retention at 9+ days") |
| — | Retrieval channel for 12-year-olds | For the MVP, retrieval items due today open the next session ("two quick ones first"), plus an optional link the teacher shares. Phone messaging waits until consent covers it. |
| Q6 | School/district permission and data-privacy agreement; IRB if results will be published; retention period in the parent agreement | Settle all three before milestone E |
| — | Tech stack | Python + PostgreSQL + SymPy (`ARCHITECTURE.md` §6) |
