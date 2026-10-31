# Prototype Architectural & Pedagogical Specification

**Document Purpose:** This specification outlines the finalized architectural, compliance, and pedagogical decisions for the pilot EdTech platform. Each section details the locked-in design choice alongside the strategic, legal, and instructional reasoning behind it for engineering and coordination alignment.

---

## 1. Student Profiles & Data Minimization (D28)

### The Choice
* **Zero Mood/Health Telemetry:** Completely eliminate self-reported mood, focus, and confidence ratings across all user tiers.
* **Age-Bifurcated Goal Inputs:** 
  * **K–10 Students:** Restricted to predefined dropdown menus for personal goals and learning preferences.
  * **11th–12th Grade & Adult Learners:** Enabled for free-text goal inputs, routed directly through the **A2 Safety & Alerting Pipeline** upon submission.

### The Reasoning
* **Regulatory & Liability Shielding:** Storing emotional, psychological, or focus metrics edges into health-adjacent data under FERPA, COPPA, and state privacy statutes (e.g., SOPIPA), creating severe compliance burdens and discoverable safety liabilities.
* **Developmental Appropriateness:** Younger students (K–10) struggle to articulate meta-cognitive goals via open text, and open text fields in K–10 profiles invite accidental PII disclosure. Conversely, upper-level high school and college learners require the autonomy to define nuanced personal academic targets. Routing older students' free text through the A2 pipeline mitigates self-harm or misuse risks at the point of entry.

---

## 2. Data Retention & Lifecycle Policy (D19 & D22)

### The Choice
* **Conversational Session Logs:** Retained on a strict **90-day rolling purge** cycle.
* **Study Plans & Student Reflections:** Retained using a **First-In, First-Out (FIFO) rolling cap of 30 instances** per student. When the 31st reflection or plan update is generated, the oldest instance (1st) is permanently purged.

### The Reasoning
* **Balancing Continuity with Data Minimization:** Wiping study plans and reflections on the same 90-day timer as raw chat transcripts would erase a returning student's longitudinal learning baseline. Conversely, retaining free-text reflections indefinitely creates a massive Data Subject Access Request (DSAR) inspection burden under FERPA, complicates CA-NDPA contract termination purges, and creates latent safety liability.
* **Mathematically Bounded Footprint:** A 30-instance FIFO cap guarantees the AI tutor and teacher always have a rich, recent window of pedagogical context while ensuring storage costs and legal exposure remain strictly bounded regardless of how many years a student uses the system.

---

## 3. Event Logging & Behavioral Telemetry (D19)

### The Choice
* **Actionable Pedagogical State Logging Only:** The system does not log raw UI clicks or psychological labels. It records three objective behavioral diagnostic events, accompanied by an automated **Teacher Disclaimer** (noting that patterns are behavioral hypotheses and may reflect external access or environmental constraints) and **Actionable Instructional Suggestions**:
  1. **Knowledge Gap (D20 Trigger):** Logged when a student fails a target concept and subsequently stalls or fails on its underlying prerequisite node.
  2. **Working Memory / Cognitive Overload (Baseline Breakdown):** Logged when a student passes isolated prerequisite checks and engages with normal response latency, but fails or overlooks a **trivial, single-step prompt** (after the AI has already supplied the missing context) in a way that deviates abnormally from their personal rolling baseline.
  3. **Motivation & Engagement Indices:** Evaluated longitudinally via three objective behavioral proxies rather than emotional self-reports:
     * *Active Choice:* Daily streaks, voluntary initiation of self-paced modules, and starting tasks prior to deadline overrides.
     * *Persistence:* Completion of multi-turn sparring-partner loops vs. mid-session abandonment.
     * *Mental Effort:* Response latency relative to reading time, elaboration depth, and single-step accuracy vs. rapid-fire guessing.

### The Reasoning
* **Signal Over Noise:** Educators suffer from dashboard fatigue when presented with granular clickstream telemetry. Logging only distinct diagnostic bottlenecks ensures every alert on the teacher dashboard corresponds to a clear pedagogical intervention.
* **Objective Diagnostic Differentiation:** Comparing performance on a "trivial next step" (after filling in knowledge gaps) against the student's personal trend line allows the system to mathematically distinguish between a missing prerequisite (Knowledge Gap), maxed-out working memory on multi-step synthesis (Cognitive Overload), and rapid-fire clicking (Disengagement) without ever violating the D28 ban on psychological profiling.

---

## 4. Dual-Track Study Plans & Notification Hierarchy

### The Choice
* **Dual-Track Study Plan Architecture:**
  1. **Teacher-Assigned Track:** Driven by teacher-set due dates and curriculum assignments. **Hard Rule:** Teacher-assigned tasks and deadlines always override and take UI priority over independent tasks.
  2. **Self-Paced / Independent Track:** Toggleable by the teacher. Automatically guides and paces the student through materials when no immediate teacher deadline is competing.
* **Strict RBAC Notification Hierarchy (District > Teacher > Student):**
  * **District / Admin (Master Override):** Can globally disable external push/email notifications or enforce mandatory quiet hours across the tenant.
  * **Teacher (Task-Level):** Controls whether teacher-assigned curriculum triggers external reminders (bounded by District rules). By default, teacher-assigned curricula remain in-app unless explicitly enabled by the teacher/district.
  * **Student / Family (Independent Level):** Full freedom to customize external push notifications for self-initiated study plans, provided the District has not globally disabled external pushes.

### The Reasoning
* **Eliminating Competing Sources of Truth:** If automated AI missions ("S3 Missions") and teacher deadlines occupy the same priority tier, the platform risks pulling students away from graded classroom requirements. Separating the tracks while enforcing a "Teacher Always Trumps" rule preserves classroom authority while supporting autonomous learning.
* **Institutional Compliance:** School districts require absolute administrative control over external communications sent to minors outside of school hours. A strict top-down inheritance matrix ensures zero unauthorized contact while giving older or independent learners full control when permitted.

---

## 5. Curriculum Pack, Practice Tab & Prerequisite Graph (D8 & D20)

### The Choice
* **"Practice" Confirmed as the 9th Tab:** Exclusively populated by **externally sourced, psychometrically vetted item banks** (e.g., OpenStax, PhET, NASA/NOAA). The platform and LLM will never author ad-hoc assessment questions for independent practice.
* **Standards-Aligned Vault & Two-Layer Trace-Back (D20):** 
  * "Traced to weakest prerequisite" is officially enabled as an explained teacher signal.
  * **Procedural Domains (e.g., Kinematics):** Structured as a strict Directed Acyclic Graph (DAG) of mathematical and operational steps.
  * **Conceptual/Cyclical Domains (e.g., The Water Cycle):** Structured as a **two-layer graph** separating the surface process loop (Evaporation $\rightarrow$ Condensation $\rightarrow$ Precipitation) from underlying causal mechanisms (Thermal Energy, Phase Changes, Gravity, Droplet Mass, Topography) aligned with NGSS/CCSS standards pre-loaded in the Vault.
* **District-Gated Editing & AI Node Mapping:**
  * Independent practice is strictly locked to the verified master sheet.
  * In Teacher-Led mode, editing curriculum or attaching custom worksheets is governed by District RBAC permissions (Locked, Direct Edit, or **Admin Review Queue** via draft-to-publish).
  * When a permissioned teacher uploads a custom worksheet, the **AI Evaluator automatically proposes prerequisite node mappings** to the existing Vault graph, while allowing the teacher to manually adjust edges or create new nodes before publishing.

### The Reasoning
* **Psychometric Integrity:** LLM-generated or unvetted practice questions introduce hallucinations, ambiguous distractors, and misaligned difficulty curves. Relying strictly on verified external item banks guarantees academic validity.
* **Solving the Cyclical Trace-Back Problem:** Tracing back horizontally inside a loop (e.g., failing Precipitation and tracing back to Condensation) fails to diagnose *why* a student misunderstood the mechanism. Anchoring stages to foundational physical laws (NGSS standards) makes the "weakest prerequisite" signal just as deterministic in Earth Science as it is in Algebra.
* **Zero-Friction Onboarding with Governance:** Pre-populating the Vault graph via national standards prevents teachers from having to build node maps from scratch, while AI-assisted tagging + Admin Review queues let districts safely accommodate custom teacher materials.

---

## 6. Pilot Scope & Video Hosting Infrastructure

### The Choice
* **Video Infrastructure:** All instructional videos will be **self-hosted via X2** rather than relying on third-party embedded players (e.g., YouTube).
* **Pilot Launch Scope:**
  * **Primary Launch Unit:** **The Water Cycle** (full production conceptual unit).
  * **Sub-Pilot Unit:** **Kinematics** (targeted demonstration unit with foundational dependencies to showcase how procedural/mathematical knowledge is represented, traced, and taught).

### The Reasoning
* **Bypassing K–12 Firewall Bottlenecks:** Unlike legacy giants (e.g., Khan Academy), a new pilot cannot force school IT departments to modify firewall rules or allowlist `youtube-nocookie.com` and `googlevideo.com` prior to testing. Self-hosting via X2 guarantees zero-friction playback on day one inside locked-down school networks.
* **Comprehensive Architectural Proof-of-Concept:** Launching the Water Cycle as the primary unit keeps initial content production manageable while testing the two-layer conceptual graph. Running Kinematics concurrently as a focused sub-pilot proves to stakeholders that the underlying engine and D20 trace-back architecture seamlessly handle multi-step procedural and mathematical dependencies without blocking the main launch on massive content creation.