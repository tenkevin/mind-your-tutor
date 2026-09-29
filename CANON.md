Corinne E. Hyde# Canon — MindyourTutor

Status: authoritative. Where anything disagrees with this, this wins.
Companions: `TASKS.md` (the work list), `PROJECT_BRIEF.md` and `STUDENT_EXPERIENCE.md` (the why)
Supersedes: everything in `archive/`

---

## 1. What we are building

A mastery-tracking mathematics tutor for secondary algebra, ages 12–16. It holds a persistent model of what a student knows, decides what they work on next, teaches it, and schedules retrieval so the knowledge survives.

Three platforms:

- **P1 — the app.** Student and adult surfaces.
- **P2 — the system.** Storage, tenancy, row-level security, identity, retention.
- **P3 — the agents.** Three, on self-hosted servers: a **procedural agent** that generates curriculum artifacts, an **evaluator** with fixed standards, and a **lesson instructor** that is the only per-student agent.

P1 works with P3's procedural and evaluator agents to produce KC graphs, objectives, assessments, lesson plans and media. Those artifacts are produced **per curriculum**, not per student, and a human approves them before any student sees them.

---

## 2. Invariants

Violating one of these breaks something that will not be obvious for months.

**I1 — The checker is the authority on correctness.** No pedagogical decision follows an unadjudicated response. `unparseable` and `incorrect` are different outcomes and never collapse.

**I2 — The evidence log is the source of truth.** Learner state is derived and recomputable. Append-only, enforced at the database, never pruned.

**I3 — No model in a deterministic path.** Selection, tracing, scheduling, adjudication, validation. Models propose and explain; code decides.

**I4 — Ground truth enters from outside the loop.** An agent never authors the scoring that judges it. Keys come from `math-check`, humans, and student outcomes — none of which any agent can edit.

**I5 — Never serialize a knowledge graph into a model's context.** The KC graph is read by code. An agent receives at most one node's rationale string. A full graph in context measured 54.48 against a 72.58 no-graph baseline: more context is far worse than none.

**I6 — On uncertainty, inject nothing.** A localization miss adds no guidance. The checker returns `unparseable` rather than inferring. `diagnose` stays thin rather than fabricating a class. Saying nothing is always available.

**I7 — Generated content never carries mastery evidence.** Items bearing evidence have a verified key, calibrated difficulty, and attested KC alignment. Extracted textbook content can never become an item — no ground truth, and it is copyrighted.

**I8 — Capture the unrecoverable, derive the rest.** A moment not recorded is gone. Anything recomputable from the log is not stored.

**I9 — Collection is disclosed and consequence-free.** One plain sentence at entry, never repeated. No score, grade, ranking or comparison shown to a student. Concealment is not the lever; consequence is.

**I10 — Safeguarding overrides product.** No manufactured intimacy, no dependency mechanics, no secret-keeping, a defined escalation path, and a model legible to the responsible adult.

---

## 3. Decisions

### The product

**D1** Mastery-tracking, not reactive homework help. Progress means demonstrated performance on a knowledge component.
**D2** Two channels with asymmetric jobs: a rich tutoring surface the student starts, and a brief retrieval surface the system starts. The second is also the low-bandwidth, low-end-device path.
**D3** Answer-withholding by default with contingent scaffolding — prompt, hint, partial step, worked step, parallel item. Escalation follows evidence of unproductive struggle, not a request.
**D4** No placement test. Placement by descent: start where the student came for, descend on failure, name the reason.
**D5** Descent is bounded. At the stop: name the gap, compensate at reduced load, escalate to an adult.
**D6** Acquisition and retrievability are separate quantities. One scalar cannot explain why a mastered KC fails three weeks later.
**D7** Fluency gaps and conceptual gaps are handled oppositely. Fluency needs retrieval practice, not instruction.
**D8** Target difficulty and incidental arithmetic load are separate item dimensions, so a KC can be taught at reduced load while the fluency gap is repaired in parallel. Load is never a gate on entry.
**D9** Sessions end early, on an unassisted success.
**D10** No gamification, no streaks, no progress map, no numeric mastery shown to the student.

### Structure

**D11** The KC graph is the spine; curriculum standards are namespaced annotations with relation type, completeness and provenance, read only at assignment resolution and reporting.
**D12** Edges are typed, directional, weighted, and partitioned into **structural** (may route, forms a DAG) and **associative** (may not route, may cycle). Enforced in code, not convention.
**D13** The graph extends structurally below where we teach, so a gap can be named precisely even when v1 cannot fix it.
**D14** Modules are authoring and annotation units. The student never sees a boundary — only the numbers get smaller.
**D15** One curriculum, hand-authored graph, reversible via the module and annotation layer.

### Generation

**D16** Procedural generation is **per curriculum**, human-approved before student exposure.
**D17** The fixed/flexible boundary is decided by two tests. *Does it carry evidence* — anything entering the learner model or compared across students must be fixed. *Can it be wrong invisibly* — a mis-keyed item corrupts silently; a clumsy analogy is self-correcting.
  - **Fixed:** KC graph, objectives, mastery-bearing items, any diagram where the mathematics is in the diagram.
  - **Flexible:** worked examples, explanations, framing, modality, verbosity, pacing, representation order.
  - **The seam is parameterisation:** a template fixes KC, difficulty, load and key; the surface — context, names, framing — varies per student. Same measurement, different skin.
**D18** Flexible does not mean untracked. What the student was shown is logged, or the comparison can never be made.
**D19** Any generated content containing a mathematical assertion passes `math-check`, whichever tier it sits in.
**D20** Proposed edges are claim-typed. A `dependency-claim` requires a verbatim source span that passes a containment check, or it is written as `document-order` and rejected by default.

### The agent tier

**D21** The procedural graph is **agent memory**, not student knowledge structure. Position-addressed, per agent and per workflow, each with its own `D_val`. It governs the procedural agent only.
**D22** Guidance and validation are separate machinery. The graph carries *procedure* — what applies at this step and what bites. Standards live in output schemas and deterministic checks, which hold with no graph at all.
**D23** The evaluator has two roles with different authority. The **gate** is conservative, mostly deterministic, and blocks release: schema conformance, graph validation, key verification, coverage, reachability. The **critique** is fuzzy, advisory, never blocking, and feeds a queue a human reads.
**D24** The evaluator applies standards; it never sets the score that gates its own improvement. `D_val` scores artifacts the graph did not produce and the evaluator cannot rewrite.
**D25** Evolution commits only on a measured score against a held-out suite. Model opinion never commits. Ungated self-evolution measured 53.57 against an 87.50 no-evolution baseline — worse than not evolving.
**D26** **Evolution stays off until `D_val` exists.** No suite, no gate, no evolution.
**D27** Prove generate → evaluate → approve end to end on one unit before adding any self-improvement loop. A flat number cannot say which loop is broken.
**D28** Pedagogical principles become gate rules where they are mechanical — worked example before independent practice, three load levels per KC, retrieval at a delay rather than at lesson end — and critique where they are not.
**D29** The lesson instructor is the only per-student agent. Personality templates are **parameters** — verbosity, directness, pacing, worked-example frequency — not personas. A named character with a backstory is designing for attachment and destroys attribution in evaluation.
**D30** Student modelling for relevance uses in-task signal only. Not an interest profile collected from a fourteen-year-old. Test: describable to a parent in one sentence they would agree to.
**D31** Pre-generate per curriculum and cache. Self-hosted inference at ~4 tok/s cannot serve per-session generation, and a timeout that injects nothing is inert rather than degraded.

### Practice

**D32** Tests enforcing an invariant cite the decision id they enforce. Right now zero decision references exist in `src/`, which is how a spec claim ends up living only in someone's head.
**D33** Conformance suites are written from the spec with the implementation closed. A suite written against the code can only confirm the code agrees with itself — a green test pinned a real defect in the procedural-graph build.
**D34** Schema columns are designed for the second use case, not the first. A `NOT NULL` that fits the first scenario made a real event unstorable; `evidence_event` has the same exposure today while it is still empty.
**D35** A recorded revision gets a propagation ticket in the same session. An unpropagated revision is an intention, not a decision.
**D36** Metrics refuse to report on runs that did not complete a real pass. 92 of 97 runs being stubs once made a baseline look like signal.

---

## 4. Open questions

| #      | Question                                                       | Blocks                                                                  |
| ------ | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Q1** | Which curriculum                                               | All ingestion                                                           |
| **Q2** | Who reviews and approves — the SME                             | The review surface, the benchmark, the premise of curriculum production |
| **Q3** | Which model, and the cost/latency budget                       | All proposal stages                                                     |
| **Q4** | Tracer theory — one prediction BKT cannot make                 | The whole learner model                                                 |
| **Q5** | Age floor: 12 with institutional and guardian mediation, or 13 | Consent design, pilot scoping                                           |
| **Q6** | Pilot site                                                     | Outcome measurement, efficacy                                           |

---

## 5. Not decided here

`SOUL.md` and `AGENTS.md` — the instructor's voice and rules — are joint work with the project lead, not delegated to code generation. The safeguarding commitments and the voice are one document seen from two angles.

The misconception taxonomy remains deferred. It attaches as `commonly-confused-with` edges when it happens, so nothing structural waits on it.
