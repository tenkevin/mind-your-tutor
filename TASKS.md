# Tasks

Status: live. **The only work list.** Nothing is built.
Authority: `CANON.md`

---

## The six layers

A layer has its own failure mode. Ordered by dependency, not by appeal.

| | Layer | What it is | How it fails |
|---|---|---|---|
| **M1** | Ground truth | Everything true without a model: symbolic checking, schemas, validation, deterministic gates | By being bypassed — a path reaching a student without passing through it |
| **M2** | Evidence | `D_val`, the frozen benchmark, outcome measurement | By not existing, which makes every quality claim an assertion |
| **M3** | Curriculum production | Source → objectives → KC graph → items → materials, per curriculum, human-approved | By generating faster than anyone can review, so approval becomes a rubber stamp |
| **M4** | Agent tier | Procedural agent with its per-workflow graph, evaluator, lesson instructor | By closing a loop on itself — the measuring stick moving with what it measures |
| **M5** | Learner model | Evidence capture and the tracer | Silently and late. A wrong model looks like a right one until retention data arrives |
| **M6** | Delivery platform | App surfaces, tenancy, RLS, retention, consent, identity | Legally. Minors' data, multi-tenant, agents that see everything |

**M2 has moved up, and this is the main change from any earlier plan.** Under per-curriculum agent generation, producing a KC graph costs roughly an hour and a few dollars. The scarce resource is no longer generation — it is a qualified person's attention and a standard to judge against. Build the ruler before the thing being measured.

---

## Phase 0 — Decide. No code.

| #   | Task                              | Output                                                                   | Status |
| --- | --------------------------------- | ------------------------------------------------------------------------ | ------ |
| 0.1 | **Q1** — which curriculum         | Named, with annotation framework and version                             | **Done — D37.** IM 6–8 Math Grade 7 (accessim.org, current edition); CCSS-M; Unit 2 is the slice |
| 0.2 | **Q2** — who reviews and approves | A named person with allocated time                                       | **Done — D38.** Project lead reviews, 15 h/week; Prof. Corinne E. Hyde advises |
| 0.3 | **Q4** — tracer theory, 2–3 pages | One sentence stating a prediction the tracer should make that BKT cannot | **Open.** I3 kept (D39). Research a deterministic tracer; write the sentence |
| 0.4 | **Q3** — model and budget         | Model class, cost and latency ceiling per unit                           | **Partial — D40.** Cloud generation (DeepSeek R1, Qwen 3.5 RAG), self-hosted minors' data. Missing: R1 size, cost and latency ceiling per unit |
| 0.5 | **Q5** — age floor                | 12 with institutional and guardian mediation, or 13                      | **Done — D41.** 12, via school or signed parent consent |
| 0.6 | **Q6** — pilot approach           | A site conversation opened; consent and retention drafted                | **Partial — D42.** Own classroom, parent-signed agreement. Missing: consent and retention drafts, school/district sign-off |

### Remaining Phase 0 work

- **0.3** Candidate predictions to choose between: **(a) forgetting** — two students with identical first-session success on a KC diverge in unassisted success at a 9+ day delay according to their spacing history; BKT, with no forgetting term, predicts no difference (ties to D6, 4.5). **(b) graph attribution** — failure on a KC predicts failure on its structural dependents but not the reverse; BKT treats KCs as independent (ties to D4).
- **0.4** Fix the R1 variant and a cost/latency ceiling per unit. Rough scale: ~15 lessons × ~5 stages ≈ 75 reasoning calls per unit before retries.
- **0.6** Draft the parent agreement to carry the I9 disclosure sentence and a retention period; confirm the school or district permits the tool and whether its data-privacy agreement applies; if results will be published (e.g. with USC), IRB approval comes before collection.
- **Propagation (D35):** D40 revised the P3 hosting line and D31's rationale in `CANON.md`. Check `PROJECT_BRIEF.md` when it is added, and any deployment docs, for "self-hosted" claims about the generation tier.

0.2 is now the most consequential question in the project. When generation is cheap, the reviewer is the quality ceiling — and a review surface designed before the reviewer is named is a guess at someone's workflow.

0.3 must precede any harness. A harness built before the theory will quietly define the research question as next-response prediction, which is the easy metric rather than the useful one.

---

## Phase 1 — Ground truth and the benchmark

No models anywhere in this phase.

| # | Task | Done when |
|---|---|---|
| 1.1 | `math-check` | Equivalence across forms; `unparseable` never returned as `incorrect`; typo shapes rejected before parsing; ≥50 adversarial valid forms |
| 1.2 | Schemas | Round-trip tested. **Every non-nullable column justified against a second use case**, not only the first |
| 1.3 | Append-only store, change log, `rebuild()` | Triggers make UPDATE and DELETE fail; the graph reconstructs identically from an empty database and a log |
| 1.4 | Graph validation engine | Every structural rule enforced with a failing fixture and an author-readable message; errors block export, not editing |
| 1.5 | Structural view | Associative edges unreachable through it, not merely filtered — asserted by test |
| 1.6 | Item templates and key validation | Constraints satisfied; `math-check` verifies the key across sampled instantiations; unvalidated templates cannot export |
| 1.7 | **Seed benchmark** | 20–30 hand-made curriculum artifacts with recorded human judgments, **including deliberately bad ones**: a mis-keyed item, an ordering edge wearing a prerequisite label, a lesson opening with independent practice, a KC with one load level |
| 1.8 | Decision-id citations | Every invariant-bearing test names the decision it enforces |
| 1.9 | Conformance suite | Written from `CANON.md` with the implementation closed |

1.7 is the phase's real output and the least obvious one. It needs no generator, no curriculum ingestion and no model — only someone who knows algebra teaching writing twenty artifacts and deliberately spoiling three.

---

## Phase 2 — The gate

| # | Task | Done when |
|---|---|---|
| 2.1 | Deterministic evaluator | Schema conformance, graph validation, key verification, objective coverage, prerequisite reachability. No model |
| 2.2 | Pedagogical principles as gate rules | Worked example precedes independent practice; three incidental-load levels per KC; retrieval scheduled at a delay rather than at lesson end |
| 2.3 | Gate scored against the benchmark | **Catches every planted defect in 1.7 and passes every sound artifact.** A gate that misses the planted defects is not a gate |
| 2.4 | Graph reachability check | From each taught KC, descent reaches a real prerequisite within the bound or terminates where it should |

2.3 is the phase gate. Until the evaluator catches known-bad artifacts, nothing it approves means anything.

---

## Phase 3 — Curriculum production

Blocked on Q1 and Q2.

| # | Task |
|---|---|
| 3.1 | Source assets — content-addressed, immutable, never serveable |
| 3.2 | Workspace — expiring; the one store where deletion is correct |
| 3.3 | Promotion — graph objects via the change log, items via authored template plus key validation. Neither is a copy |
| 3.4 | Provenance — document and span recoverable from any materialised node |
| 3.5 | Agent registry — per-stage folders, append-only, content-hashed, stamped per run |
| 3.6 | Extract and segment |
| 3.7 | Objective extraction and review |
| 3.8 | KC candidate proposal and review |
| 3.9 | Edge proposal with claim types and span containment check |
| 3.10 | Item generation — parameterised, key-validated |
| 3.11 | Review surface |
| 3.12 | Human approval gate before any student exposure |
| 3.13 | **Vertical slice: one unit, end to end** — generate, evaluate, approve, export |

3.13 is the point of the phase. Prove the pipe on one unit before widening it; a flat number across many units cannot say which stage is broken.

---

## Phase 4 — Learner model

| # | Task |
|---|---|
| 4.1 | Evidence capture, complete |
| 4.2 | Tracer interface and naive baseline — pure, deterministic, replayable |
| 4.3 | Synthetic learner generator |
| 4.4 | Replay harness — next-response accuracy, calibration, **delayed-retention prediction**, reorder stability |
| 4.5 | The tracer, beating the baseline on delayed retention specifically |
| 4.6 | Regression reporting — an aggregate gain that degrades delayed retention is a regression |

---

## Phase 5 — Delivery

| # | Task |
|---|---|
| 5.1 | Tenancy and row-level security |
| 5.2 | Identity store, separate, per-student keys |
| 5.3 | Retention and erasure by crypto-shredding |
| 5.4 | Agent data scoping — what the instructor retains, for how long, readable by whom |
| 5.5 | Consent artifacts and the one-sentence disclosure |
| 5.6 | Lesson instructor — parameterised templates, never personas |
| 5.7 | Student surface |
| 5.8 | Adult digest — push, no login, no monitoring |

5.4 is the access question that matters. RLS protects tenants from each other and says nothing about what the instructor holds about a child.

---

## Phase 6 — Evolution

Nothing here starts until Phase 2 holds and a real `D_val` exists.

| # | Task |
|---|---|
| 6.1 | Procedural graph, seeded per workflow |
| 6.2 | Validation-gated commit — commits only on a measured score against a held-out suite |
| 6.3 | Critique channel — advisory, never blocking, feeds a human queue |
| 6.4 | Outcome measurement from pilot data |
| 6.5 | Efficacy study design |

Ungated self-evolution measured worse than no evolution at all. No suite, no gate, no evolution.

---

## What can start this week

**Phase 0 in full** — six decisions, no code.

**From Phase 1: 1.1, 1.2, 1.3 and 1.7.** None needs a curriculum, a model, or a named reviewer. `math-check` is pure symbolic work. The schemas need care rather than inputs. And 1.7 is the one worth starting first, because writing twenty artifacts and spoiling three is also the cheapest way to find out whether Q2's answer is already in the room.

---

## Two rules for the whole build

**Design schemas for the second use case.** A `NOT NULL` fitted to the first scenario makes the second unstorable. For `evidence_event` the second cases are a declined choice offer, an abandoned session, a descent that terminates with no item attempted, and an ignored review ping — none of which has an item id or a response.

**A claim's authority must sit where the check can see it.** Not in memory, not in the code being tested, not in the first scenario anyone imagined. That is what 1.8 and 1.9 exist for.
