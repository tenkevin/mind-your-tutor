# Task graph — the build map

Status: live. **The reference for what can be worked on next.**
Authority: `CANON.md` → `TASKS.md` (what each task is) → this file (status, dependencies, blockers)
Scope: the MVP in `PROJECT_BRIEF.md`

This is the work graph for building the product. It is **not** the D21 procedural graph, which is the procedural agent's memory.

---

## How to use it

1. **Only start a node whose status is 🟢.** A node is ready when every node in its `Needs` column is ✅.
2. **The node table (§3) is authoritative.** The two diagrams are views of it. Any change to a status or dependency updates the table and both diagrams in the same commit.
3. **Finishing a node:** mark it ✅, then re-check every node that lists it in `Needs` and promote any that are now 🟢.
4. **A new blocker** gets a node of its own, not a note. If it can't be drawn, nobody will see it's in the way.

| Mark | Meaning |
|---|---|
| ✅ | Done |
| 🟢 | Ready: every dependency is done |
| 🟡 | A decision or action that only the project lead can take |
| 🔴 | Blocked: waiting on the nodes in `Needs` |
| ⚪ | Deferred: outside the MVP |

---

## 1. Mind map

```mermaid
mindmap
  root((MVP: IM 7.2 in one classroom))
    Phase 0 Decide
      ✅ 0.1 Curriculum IM 7 CCSS-M
      ✅ 0.2 Reviewer 15h per week
      🟡 0.3 Tracer theory
        🟡 0.3a Choose deterministic tracer
        🟡 0.3b One prediction BKT cannot make
      🟡 0.4 R1 variant and cost ceiling
      ✅ 0.5 Age floor 12
      🟡 0.6 Pilot approvals
        🟡 0.6a Parent agreement and retention period
        🟡 0.6b School or district permission
        🟡 0.6c IRB if publishing
      🟡 0.7 Sign off MVP architecture
      🟡 0.8 Source access to accessim.org
    Phase 1 Ground truth
      🟢 1.1 math-check
      🟢 1.2 Schemas
      🔴 1.3 Append-only store
      🔴 1.4 Graph validation
      🔴 1.5 Structural view
      🔴 1.6 Templates and key validation
      🟢 1.7 Seed benchmark
      🔴 1.8 Decision-id citations
      🟢 1.9 Conformance suite
    Phase 2 The gate
      🔴 2.1 Deterministic evaluator
      🔴 2.2 Pedagogy gate rules
      🔴 2.3 Gate vs benchmark PHASE GATE
      🔴 2.4 Reachability
    Phase 3 Unit 2 production
      🔴 3.1 Source assets
      🔴 3.2 Workspace
      🔴 3.3 Promotion
      🔴 3.4 Provenance
      🔴 3.5 Agent registry
      🔴 3.6 Extract and segment
      🔴 3.7 Objectives
      🔴 3.8 KC candidates
      🔴 3.9 Edges
      🔴 3.10 Item templates
      🔴 3.10b Materials and ladder
      🔴 3.11 Review surface
      🔴 3.12 Approval gate
      🔴 3.13 Unit 2 bundle
    Phase 4 Learner model
      🔴 4.1 Evidence capture
      🔴 4.2 Baseline tracer and scheduler
      🔴 4.3 Synthetic learners
      🔴 4.4 Replay harness
      🔴 4.5 Researched tracer
      🔴 4.6 Regression reporting
    Phase 5 Delivery
      🔴 5.1 Tenancy and RLS
      🔴 5.2 Identity store
      🔴 5.3 Crypto-shredding
      🔴 5.4 Agent data scoping
      🔴 5.5 Consent and disclosure
      🔴 5.6 Instructor templates
      🔴 5.6b Session engine
      🔴 5.7 Student surface
      🔴 5.7b Retrieval moment
      🔴 5.7c Teacher view
      ⚪ 5.8 Parent digest
    Pilot
      🔴 D Test student end to end
      🔴 E First real session
    Phase 6 Evolution
      ⚪ 6.1 to 6.3 Evolution loop
      🔴 6.4 Outcome measurement
      ⚪ 6.5 Efficacy study
```

---

## 2. Dependency graph

An arrow `A --> B` means B needs A. The thick path is the critical path to the first real session.

```mermaid
flowchart LR
  classDef done fill:#d1fae5,stroke:#059669,color:#064e3b
  classDef ready fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:3px
  classDef you fill:#fef3c7,stroke:#d97706,color:#78350f
  classDef blocked fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
  classDef deferred fill:#f3f4f6,stroke:#9ca3af,color:#6b7280,stroke-dasharray:4

  subgraph P0[Phase 0 — decide]
    Q1[0.1 Curriculum]:::done
    Q2[0.2 Reviewer]:::done
    Q3a[0.3a Tracer choice]:::you
    Q3b[0.3b BKT prediction]:::you
    Q4[0.4 R1 + cost ceiling]:::you
    Q5[0.5 Age floor]:::done
    Q6a[0.6a Parent agreement<br/>+ retention period]:::you
    Q6b[0.6b School/district OK]:::you
    Q6c[0.6c IRB if publishing]:::you
    Q7[0.7 Architecture sign-off]:::you
    Q8[0.8 Source access]:::you
  end

  subgraph P1[Phase 1 — ground truth]
    T11[1.1 math-check]:::ready
    T12[1.2 Schemas]:::ready
    T13[1.3 Append-only store]:::blocked
    T14[1.4 Graph validation]:::blocked
    T15[1.5 Structural view]:::blocked
    T16[1.6 Templates + keys]:::blocked
    T17[1.7 Seed benchmark]:::ready
    T18[1.8 Decision citations]:::blocked
    T19[1.9 Conformance suite]:::ready
  end

  subgraph P2[Phase 2 — the gate]
    T21[2.1 Evaluator]:::blocked
    T22[2.2 Pedagogy rules]:::blocked
    T23{{2.3 Gate vs benchmark}}:::blocked
    T24[2.4 Reachability]:::blocked
  end

  subgraph P3[Phase 3 — Unit 2]
    T31[3.1 Source assets]:::blocked
    T32[3.2 Workspace]:::blocked
    T33[3.3 Promotion]:::blocked
    T34[3.4 Provenance]:::blocked
    T35[3.5 Agent registry]:::blocked
    T36[3.6 Extract]:::blocked
    T37[3.7 Objectives]:::blocked
    T38[3.8 KCs]:::blocked
    T39[3.9 Edges]:::blocked
    T310[3.10 Item templates]:::blocked
    T310b[3.10b Materials]:::blocked
    T311[3.11 Review surface]:::blocked
    T312[3.12 Approval gate]:::blocked
    T313{{3.13 Unit 2 bundle}}:::blocked
  end

  subgraph P4[Phase 4 — learner model]
    T41[4.1 Evidence capture]:::blocked
    T42[4.2 Baseline tracer]:::blocked
    T43[4.3 Synthetic learners]:::blocked
    T44[4.4 Replay harness]:::blocked
    T45[4.5 Researched tracer]:::blocked
    T46[4.6 Regression report]:::blocked
  end

  subgraph P5[Phase 5 — delivery]
    T51[5.1 Tenancy + RLS]:::blocked
    T52[5.2 Identity store]:::blocked
    T53[5.3 Crypto-shredding]:::blocked
    T54[5.4 Data scoping]:::blocked
    T55[5.5 Consent + disclosure]:::blocked
    T56[5.6 Instructor templates]:::blocked
    T56b[5.6b Session engine]:::blocked
    T57[5.7 Student surface]:::blocked
    T57b[5.7b Retrieval moment]:::blocked
    T57c[5.7c Teacher view]:::blocked
    T58[5.8 Parent digest]:::deferred
  end

  subgraph PIL[Pilot]
    MD{{D Test student run}}:::blocked
    ME{{E First real session}}:::blocked
    T64[6.4 Outcome measurement]:::blocked
  end

  %% Phase 1
  Q1 --> T17
  Q2 --> T17
  T12 --> T13
  Q7 --> T13
  T12 --> T14 --> T15
  T11 ==> T16
  T12 ==> T16
  T11 --> T18
  T16 --> T18
  T13 --> T18

  %% Phase 2
  T16 ==> T21
  T14 --> T21
  T21 ==> T22 ==> T23
  T17 ==> T23
  T15 --> T24

  %% Phase 3
  Q8 --> T31
  T12 --> T31 --> T34
  T12 --> T32
  T13 --> T33
  T16 --> T33
  T12 --> T35
  Q4 --> T35
  T31 --> T36
  T35 --> T36 --> T37 --> T38
  T38 --> T39
  T34 --> T39
  T38 --> T310
  T16 --> T310 --> T310b
  T33 --> T311
  T15 --> T311
  T311 --> T312
  T23 ==> T312
  T39 --> T312
  T310b ==> T312
  T312 ==> T313
  T24 --> T313

  %% Phase 4
  T12 --> T41
  T13 --> T41
  T41 --> T42
  Q7 --> T42
  T42 --> T43 --> T44
  T42 --> T44
  T44 --> T45
  Q3a --> T45
  Q3b --> T45
  T44 --> T46

  %% Phase 5
  T12 --> T51
  Q7 --> T51
  T51 --> T52 --> T53
  Q6a --> T53
  Q7 --> T54
  Q6a --> T55
  T313 ==> T56
  Q7 --> T56
  T42 --> T56b
  T15 --> T56b
  T11 --> T56b
  T56 ==> T57
  T56b --> T57
  T52 --> T57
  T42 --> T57b
  Q7 --> T57b
  T42 --> T57c
  T52 --> T57c

  %% Pilot
  T57 ==> MD
  T57b --> MD
  T57c --> MD
  T41 --> MD
  T54 --> MD
  MD ==> ME
  T53 --> ME
  T55 --> ME
  Q6a --> ME
  Q6b --> ME
  Q6c --> ME
  ME --> T64
```

---

## 3. Node table (authoritative)

`Needs` lists the hard dependencies. **Owner** says who moves the node: *Lead* is the project lead, *Claude* is the coding agent, *External* is someone outside the project.

### Phase 0 — decide

| Node | Status | Needs | Owner | Unblocks | Notes |
|---|---|---|---|---|---|
| 0.1 Curriculum | ✅ | — | Lead | 3.1, 1.7 | D37 |
| 0.2 Reviewer | ✅ | — | Lead | 1.7, 3.11 | D38 |
| 0.3a Choose deterministic tracer | 🟡 | — | Lead | 4.5 | D39. Doesn't block the MVP: the baseline tracer (4.2) runs the pilot |
| 0.3b One prediction BKT can't make | 🟡 | — | Lead | 4.5 | Candidates are listed in `TASKS.md` §Phase 0 |
| 0.4 R1 variant + cost ceiling | 🟡 | — | Lead | 3.5 → all generation | D40 |
| 0.5 Age floor | ✅ | — | Lead | 0.6a, 5.5 | D41 |
| 0.6a Parent agreement + retention period | 🟡 | — | Lead | 5.3, 5.5, E | Must carry the I9 disclosure sentence |
| 0.6b School/district permission + data-privacy agreement | 🟡 | — | Lead, External | E | |
| 0.6c IRB approval, if results will be published | 🟡 | — | Lead, External (USC) | E | Not needed if nothing is published |
| 0.7 Sign off MVP architecture | 🟡 | — | Lead | 1.3, 4.2, 5.1, 5.4, 5.6, 5.7b | `PROJECT_BRIEF.md` §7 and `ARCHITECTURE.md`: no live LLM for students, no open chat, one-way bundle, retrieval channel, Postgres stack |
| 0.8 Source access to IM 7.2 | 🟡 | — | Lead | 3.1 | accessim.org is blocked by this environment's network policy. Either allow the domain or commit the source files |

### Phase 1 — ground truth (no models)

| Node | Status | Needs | Owner | Unblocks | Notes |
|---|---|---|---|---|---|
| 1.1 `math-check` | 🟢 | — | Claude | 1.6, 1.8, 5.6b | Unit 2 input forms: numbers, fractions, `y = kx`, table cells |
| 1.2 Schemas | 🟢 | — | Claude | 1.3, 1.4, 1.6, 3.1, 3.2, 3.5, 4.1, 5.1 | D34: design for the second use case |
| 1.3 Append-only store, change log, `rebuild()` | 🔴 | 1.2, 0.7 | Claude | 1.8, 3.3, 4.1 | Postgres triggers need the stack signed off |
| 1.4 Graph validation engine | 🔴 | 1.2 | Claude | 1.5, 2.1 | |
| 1.5 Structural view | 🔴 | 1.4 | Claude | 2.4, 3.11, 5.6b | |
| 1.6 Templates + key validation | 🔴 | 1.1, 1.2 | Claude | 2.1, 3.3, 3.10 | Critical path |
| 1.7 Seed benchmark, 20–30 artifacts, 3 spoiled | 🟢 | 0.1, 0.2 | Lead (Claude drafts formats) | 2.3 | Critical path. Unit 2 artifacts |
| 1.8 Decision-id citations | 🔴 | 1.1, 1.3, 1.6 | Claude | — | Ongoing, starting with the first test |
| 1.9 Conformance suite from the Canon | 🟢 | — | Claude | — | D33: write it before the implementation exists |

### Phase 2 — the gate

| Node | Status | Needs | Owner | Unblocks | Notes |
|---|---|---|---|---|---|
| 2.1 Deterministic evaluator | 🔴 | 1.4, 1.6 | Claude | 2.2 | |
| 2.2 Pedagogy principles as gate rules | 🔴 | 2.1 | Claude | 2.3 | D28 |
| **2.3 Gate scored against benchmark** | 🔴 | 2.2, 1.7 | Claude + Lead | 3.12 | **Phase gate.** Must catch every planted defect |
| 2.4 Reachability check | 🔴 | 1.5 | Claude | 3.13 | |

### Phase 3 — Unit 2 production (cloud)

| Node | Status | Needs | Owner | Unblocks | Notes |
|---|---|---|---|---|---|
| 3.1 Source assets | 🔴 | 1.2, 0.8 | Claude | 3.4, 3.6 | |
| 3.2 Workspace | 🔴 | 1.2 | Claude | — | |
| 3.3 Promotion | 🔴 | 1.3, 1.6 | Claude | 3.11 | |
| 3.4 Provenance | 🔴 | 3.1 | Claude | 3.9 | |
| 3.5 Agent registry | 🔴 | 1.2, 0.4 | Claude | 3.6 | |
| 3.6 Extract & segment | 🔴 | 3.1, 3.5 | Claude | 3.7 | Qwen 3.5 RAG |
| 3.7 Objectives | 🔴 | 3.6 | Claude → Lead reviews | 3.8 | |
| 3.8 KC candidates | 🔴 | 3.7 | Claude → Lead reviews | 3.9, 3.10 | Includes one level of Grade 6 prerequisites |
| 3.9 Edges (claim-typed) | 🔴 | 3.8, 3.4 | Claude → Lead reviews | 3.12 | D20 |
| 3.10 Item templates, 3 load levels | 🔴 | 3.8, 1.6 | Claude → Lead reviews | 3.10b | |
| 3.10b Materials + scaffolding ladder | 🔴 | 3.10 | Claude → Lead reviews | 3.12 | D3, D19 |
| 3.11 Review surface | 🔴 | 3.3, 1.5 | Claude | 3.12 | Shows the KC graph to the reviewer |
| 3.12 Human approval gate | 🔴 | 3.11, 2.3, 3.9, 3.10b | Lead | 3.13 | Critical path |
| **3.13 Unit 2 bundle exported** | 🔴 | 3.12, 2.4 | Claude + Lead | 5.6 | **Milestone C** |

### Phase 4 — learner model (self-hosted)

| Node | Status | Needs | Owner | Unblocks | Notes |
|---|---|---|---|---|---|
| 4.1 Evidence capture | 🔴 | 1.2, 1.3 | Claude | 4.2, D | Includes the `QA_Testing_Criteria.md` signals |
| 4.2 Tracer interface + baseline + scheduler | 🔴 | 4.1, 0.7 | Claude | 4.3, 4.4, 5.6b, 5.7b, 5.7c | Runs the pilot. Its thresholds are placeholders |
| 4.3 Synthetic learners | 🔴 | 4.2 | Claude | 4.4 | |
| 4.4 Replay harness | 🔴 | 4.2, 4.3 | Claude | 4.5, 4.6 | Headline metric: delayed retention |
| 4.5 Researched tracer | 🔴 | 4.4, 0.3a, 0.3b | Lead + Claude | — | Not on the pilot's critical path |
| 4.6 Regression reporting | 🔴 | 4.4 | Claude | — | |

### Phase 5 — delivery (self-hosted)

| Node | Status | Needs | Owner | Unblocks | Notes |
|---|---|---|---|---|---|
| 5.1 Tenancy + RLS | 🔴 | 1.2, 0.7 | Claude | 5.2 | One tenant, built properly |
| 5.2 Identity store | 🔴 | 5.1 | Claude | 5.3, 5.7, 5.7c | |
| 5.3 Crypto-shredding erasure | 🔴 | 5.2, 0.6a | Claude | E | The retention period comes from 0.6a |
| 5.4 Agent data scoping | 🔴 | 0.7 | Claude | D | Small scope if there's no model in the student path |
| 5.5 Consent artifacts + disclosure | 🔴 | 0.6a | Lead + Claude | E | |
| 5.6 Instructor: approved template renderer | 🔴 | 3.13, 0.7 | Claude | 5.7 | Critical path |
| 5.6b Session engine: selector, descent, ladder | 🔴 | 4.2, 1.5, 1.1 | Claude | 5.7 | |
| 5.7 Student surface | 🔴 | 5.6, 5.6b, 5.2 | Claude | D | |
| 5.7b Retrieval moment | 🔴 | 4.2, 0.7 | Claude | D | The channel choice is part of 0.7 |
| 5.7c Teacher view | 🔴 | 4.2, 5.2 | Claude | D | |
| 5.8 Parent digest | ⚪ | — | — | — | Outside the MVP |

### Pilot and after

| Node | Status | Needs | Owner | Unblocks | Notes |
|---|---|---|---|---|---|
| **D Test student end to end** | 🔴 | 5.7, 5.7b, 5.7c, 4.1, 5.4 | Claude + Lead | E | **Milestone D.** Descent and retrieval, replayable |
| **E First real session** | 🔴 | D, 5.3, 5.5, 0.6a, 0.6b, 0.6c | Lead | 6.4 | **Milestone E** |
| 6.1–6.3 Evolution loop | ⚪ | — | — | — | D26: off until `D_val` exists |
| 6.4 Outcome measurement | 🔴 | E | Lead + Claude | — | Retention, transfer, prerequisite repair |
| 6.5 Efficacy study | ⚪ | — | — | — | Not the MVP |

---

## 4. Right now

**Ready for Claude:** 1.1 `math-check`, 1.2 schemas, 1.9 conformance suite.

**Ready for the lead:** 1.7 seed benchmark, and the decisions 0.7 → 0.8 → 0.4 → 0.6a, in order of how much they unblock.

| Lead action | Blocks this many downstream nodes |
|---|---|
| 0.7 Architecture sign-off | 1.3, 4.2, 5.1, 5.4, 5.6, 5.7b, and through them nearly all of Phases 4–5 |
| 0.4 R1 + cost ceiling | 3.5 → the whole Phase 3 generation chain |
| 0.8 Source access | 3.1 → the whole Phase 3 generation chain |
| 0.6a Parent agreement | 5.3, 5.5, E |
| 0.6b / 0.6c Approvals | E only, but these can take the longest, so start early |

**Critical path to the first real session:**
1.1 + 1.2 → 1.6 → 2.1 → 2.2 → 2.3 (with 1.7) → 3.12 → 3.13 → 5.6 → 5.7 → D → E
