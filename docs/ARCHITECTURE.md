# Idea Map — Architecture

Status: decisions D1–D47 settled (latest D47, 2026-10-29). Work is planned in versions v0.1–v0.4 (D45, `docs/ROADMAP.md`)
Scope: the whole platform, with the Teacher Settings page (`project/Teacher Settings.dc.html`) as the first surface to build.
Branch: `idea-map` (separate from MindyourTutor on `main`/`init`).
Companions: `docs/README.md` (map of the docs), `docs/ROADMAP.md` (versions), `docs/PLAN.md` (live to-do list and dependency map, generated from `docs/tasks.json`), `AGENTS.md` (how work is claimed).

## 1. Decisions so far

| # | Decision | Consequence |
|---|---|---|
| D1 | TypeScript end to end | One monorepo; domain logic and contracts shared by browser, API and workers |
| D2 | Publish is separate from sync | An import produces a **draft** version. Students only ever see a **published** version |
| D3 | A curriculum can be shared across classes | Curriculum (shared) and Class (per teacher) are separate entities with layered config |
| D4 | No live database connections; import and export only | Connectors are file parsers. Google Drive and Cloudinary come later behind the same interfaces. Since D41, a district may allow teachers to edit curriculum data in the app, always through a draft that is published like an import |
| D5 | K-12 audience | COPPA, FERPA and state student-privacy law shape auth, AI logging, retention and vendors |
| D6 | Determinism lives in the tracker | The interaction tracker is fully deterministic and replayable. Map generation and AI may vary, but everything they show students is stored and recorded as an event |
| D7 | Independent QA before anything moves on | Every task has written criteria (functional, security, performance, usability) before it's claimed, and a separate agent tests against them before merge (`docs/qa/`) |
| D8 | The Curriculum Pack is the import format | Nine tabs (Course, Units, Ideas, Links, Categories, Assessment, Personas, Library, and Practice since D40), defined field by field in `docs/spec/`. Each field is `sheet`, `app` or `both` (the sheet seeds it, and Teacher Settings can override it per class) |
| D9 | Idea explanations: sheet first, AI fallback | `Ideas.explanation` is optional. If it's empty, Ms. Ivy drafts one from the idea's objective and links. A draft reaches students only after a teacher approves it (and can edit it) in Teacher Settings. Approved text is stored per curriculum, shared by all its classes, and reused on re-import until the sheet supplies its own |
| D10 | Keep the Nocturne design's colours as they are | The design system ships unchanged, and these pairs below WCAG AA are accepted: `.input` border on bg and surface (1.55–1.58:1, needs 3:1); `.card-meta` on surface (4.25:1); `.btn-primary` hover on surface (3.96:1) and active on bg and surface (3.92 and 3.38:1); `.btn-ghost` hover on surface (4.08:1) and active on bg and surface (4.20 and 3.60:1). Text pairs need 4.5:1. No other exceptions: new colours and components must meet AA, and `packages/ui` tests check every button state on both grounds, failing if the set of failing pairs changes |
| D11 | Each class shapes its own library | The curriculum's Library tab sets the shared documents and their default `use_for`. In Teacher Settings, a teacher can, for their class only: change how the AI uses each shared document (`agent`, `tutor`, `both`, or `off` to hide it), and upload their own documents (lab sheets, notes) with their own `use_for`. Atlas and Ms. Ivy search the shared library plus the class's uploads, after the class's settings are applied. Changes never affect other classes on the same curriculum |
| D12 | Missing objectives and questions don't block an import | `Units.objective` and `Assessment.question` may be empty, as the pack spec's "missing" behaviour says. The data checks flag them (warnings), and Atlas can draft a replacement that reaches students only after a teacher approves it, the same flow as D9 explanations. An empty question is never asked by Milo |
| D13 | One built-in persona list | Ms. Ivy, Milo and Atlas are defined once, in `packages/ai`'s persona registry. A pack with no Personas tab stores no personas, which means "use the built-ins", so improvements to the built-ins reach every curriculum. A Personas tab overrides by `persona_id`, and class overrides in Teacher Settings sit on top |
| D14 | Publish preview counts the audience | "Students receiving this update" = unique students enrolled in the selected classes, whether or not their progress changes (user, 2026-10-22, via Codex QA) |
| D15 | AI feedback explains itself, and teachers close the loop | Formative feedback (practice, quizzes, Milo) reaches the student immediately, with its reason and the rubric or key point it rests on, plus a **Challenge this** button that sends the student's objection and the AI's reasoning to the teacher. Summative feedback is approved or edited by the teacher before release. Teacher approvals, edits and challenge rulings are stored as labelled examples per curriculum and question, and are retrieved to ground future feedback. The model is never trained on them: §10's zero-retention, no-training rule stands (user, 2026-10-23) |
| D16 | Fairness audits without per-student demographics | Idea Map stores no per-student race, ethnicity or similar demographics. Routine monitoring compares schools and districts, never student home zip codes, with small groups suppressed (user, 2026-10-23). A periodic racial-disparity audit runs on a random sample of students with the district; open details are in §12 question 11. The metrics are demographic parity difference, disparate impact ratio (flagged below 0.8, used as a monitoring threshold, not a legal test), and teacher-agreement and challenge-upheld rates per group. Before any feedback reaches a student, safeguards act as an independent QA step: rubric grounding, a separate verifier, a tone and reading-level check, routing to the teacher on low confidence or verifier disagreement, and automatic teacher review for a question whose audit drifts past threshold (user, 2026-10-23). **Extended:** the D38 engagement indices (Active Choice, Persistence, Mental Effort) and the baseline-breakdown signal are audited for disparate impact too, for example so English learners or students with IEPs aren't misflagged as low-persistence because of interface friction. Idea Map still holds no such status: subgroup comparisons go through the district-run sampled audit (D23) (user, 2026-10-29, §12 q16–q23) |
| D17 | Universal Design for Learning | CAST UDL Guidelines 3.0 are acceptance criteria for every student-facing feature, alongside WCAG 2.1 AA (with D10's exceptions). That means multiple means of engagement, representation (text, read-aloud, visual) and action and expression (typed or spoken answers and challenges), including for AI feedback (user, 2026-10-23) |
| D18 | No Moodle; borrow its tracing design | No Moodle or UBUMonitor integration, and no LTI (D4 unchanged). Moodle's open-source design informs our own tracer (§8): its log-store event shape, its classification of educational level, its privacy-provider pattern (each component declares, exports and deletes its own data) and its analytics indicator and target model. We take ideas and data models only, never code: Moodle is GPLv3 and PHP. We also don't copy its practice of logging IP addresses (COPPA). Any encryption at rest uses AES-256-GCM, never Blowfish (user, 2026-10-23) |
| D19 | What is traced | Learning events only, each with a Moodle-style educational level (D18): idea opened; quiz answered (answer, correct, attempt number); hint requested; feedback shown or challenged; teach-back done; mission completed; teacher feedback approved or edited. Time on task too: idea active time rounded to 30 s per session, and quiz time-to-answer rounded to 5 s. Never recorded: clicks, scrolls, hovers, mouse movement, keystrokes, device, IP address or location (user, 2026-10-23). **Revised:** time-to-answer is recorded to the whole second (not rounded to 5 s) so D38's Mental Effort can compare response latency with reading time (user, 2026-10-29, §12 q16–q23) |
| D20 | What may be inferred | Per-idea mastery (knowledge tracing, 0–100%) and an explainable "may need help" signal shown only to the teacher, always with its reason (for example three wrong attempts after a hint, or stalled on a prerequisite). Both are deterministic tracker rules (D6). Never: risk, dropout or grade prediction; engagement, behaviour or personality scores; clustering; ranking students against each other (user, 2026-10-23). **Revised by D38 and D41 (user, 2026-10-29):** the two-layer trace-back and the three D38 diagnostics (including the engagement indices Active Choice, Persistence and Mental Effort) are allowed as teacher-only signals with a disclaimer; ranking, clustering, predictions and psychological labels stay forbidden |
| D21 | Who sees traces | Students see their own progress. Teachers see their own classes in full: per-student timeline, mastery, "may need help", challenges, class heatmap. Admins see school and district aggregates plus D16 audit results, and per-student detail only when handling a flag. There is no parent view in the app; parents are informed through the school (user, 2026-10-23) |
| D22 | How long traces are kept | Raw events are kept while the student is enrolled in the district, then deleted when they leave, and on any FERPA delete request. Anonymous class aggregates, with small groups suppressed, may be kept for improving the curriculum. AI transcripts keep §10's 90-day default. Because this is the largest data holding, the D16 audits and §10's data inventory must cover it (user, 2026-10-23). **Revised by D37 (user, 2026-10-29)** for session transcripts, study plans and reflections |
| D23 | The sampled race audit is run by the district | For D16's periodic racial-disparity audit, Idea Map sends the district pseudonymous outcomes for a random sample of students (scores, teacher-agreement and challenge-upheld rates). The district joins them with its own records and returns only group aggregates, with small groups suppressed. Idea Map never receives or stores race. The sample size and how often the audit runs are set per district, sized so each group can show a real gap (user, 2026-10-23) |
| D24 | Tracing is on by default, with opt-out | D19's learning-event tracing is on by default under the school's authorisation (§10). A family or the district can opt a student out. An opted-out student keeps using the app and still has mastery, which the app needs to work, but their events are excluded from D16 audits, aggregates and any research (user, 2026-10-23) |
| D25 | Traces may be used for research, with guardrails | Research use is allowed. Coordinator-recorded guardrails, which law requires: de-identified data only, under a written district research agreement (FERPA's studies exception), with small-group suppression and no re-identification. Under COPPA, a school's consent covers only educational use, so any research on identifiable data, or anything beyond the educational purpose for under-13s, needs separate opt-in parental consent. D24 opt-outs are always excluded (user, 2026-10-23) |
| D26 | A local anonymous layer comes before the cloud | The app's anonymous layer runs on the student's device. It extracts identifying entities and replaces them with neutral labels (Person A, Place B, …) before any text leaves the device, so neither our servers nor the model provider receive real names or places. The label-to-name mapping stays on the device, which fills replies back in for the student. The server runs a backstop check (identifier and roster detection), because a modified client could skip the local layer: anything that slips through is blurred before the model call and counted as a privacy miss, and raw text is never stored. This follows the SoulSpeak paper's anonymous layer, which the user will provide (user, 2026-10-23) |
| D27 | Interests stay specific; identifiers don't | Within a conversation, interests are sent specifically (for example "Real Madrid", "a cat called Luna"), so the model can make examples that connect to the student. Names of people and places, contact details and school identifiers are always replaced (D26). Long-term memory (D28) generalises interests to an approved category list (user, 2026-10-23) |
| D28 | Dual memory: short-term conversation, long-term learning summary | Short-term memory is the current conversation, already anonymised. Long-term entity summaries may hold misconceptions, what helped, preferred pace, and up to five interests from the approved category list. They never hold feelings or mood history, family, health, friendships, personality traits, or anything from an A2-flagged conversation. Memory is never used for D20 inferences, D16 audits or D25 research, and never shared across classes (user, 2026-10-23). **Extended by D36 (user, 2026-10-29)** for the student profile. **Amended for v0.2 (user, 2026-10-29):** the tutor's context may include the long-term summaries, and only after the anonymous layer (D26, A7): never names, never raw transcripts (task A17) |
| D29 | Memory lasts while enrolled, and can be seen and deleted | Long-term memory lasts while the student is enrolled, matching D22, and is deleted when they leave or on a FERPA request. The student can see "what Ms. Ivy remembers about me", delete any item and turn memory off. Their teacher can view and delete memory for their class (user, 2026-10-23) |
| D30 | Feedback teaching events name the teacher, pseudonymously | `feedback.ruled`, `teacher.feedback.approved` and `teacher.feedback.edited` carry the acting teacher's pseudonymous id (never a name or email). It is extra information, not a core field: it lets D15's labelled examples weigh each teacher's contributions equally, so a teacher who rules or edits often does not outweigh one who gives a single strong example. Teacher ids are never shown to students (user, 2026-10-24) |
| D31 | Library assets are tiered: a kept vault and disposable class uploads | **Official** materials (the curriculum's shared library documents, uploaded to the organization by its author or an admin, open-access, no student PII) go to a persistent, versioned **vault**: the original file and its passages are kept, a document is updated by a new version or taken out of use (`off`, archived), never deleted, and a change of embedding vendor (§12 q6) re-embeds from the stored files. **Unofficial** materials (a teacher's class uploads, D11) are disposable: the teacher may archive or delete one, and they are deleted with their class, passages and embeddings included. Neither tier is in the FERPA student-delete path (user, 2026-10-28; revises the same day's "never deleted" for class uploads) **Amended (user, 2026-10-29):** everything in the vault is an official company asset, curated and approved in-house, and the only ground for the tutor's facts (D35). Each vault item still keeps its provenance: `source`, `license_type` and `attribution_string`, with the attribution shown wherever its licence requires credit (including the tutor's citations). Calling an item a company asset does not change its licence terms, so an item under a non-commercial (NC) or share-alike (SA) licence enters the vault only after an admin approves it. Task C15 |
| D32 | Safety flags are alerts, not the school's record | Idea Map is an alerting pipeline, not the school's compliance system of record. A flag is deleted with its transcript at the district's AI retention period (default 90 days). Once resolved, it is deleted after the district's early-deletion window if that comes first: a per-district setting, default 30 whole days (deleted on day 31), so districts can match their DPA. Like every retention period (§10, F6), the setting lives on the organization and the daily retention job reads it at run time, so a change applies to every resolved flag at once and is audited (user, 2026-10-28) |
| D33 | On-device names come from an ML NER model | The device layer (D26) finds people's names and places with an on-device ML NER model reading sentence context, not word lists, so no class roster is ever sent to or stored on a student device. Pattern rules still catch contact details and school identifiers; the server backstop (D27) still matches the roster server-side If no ML model can be loaded (the chosen one, or a configured alternative), the device layer fails closed: student chat is blocked until a model is available, and the device never falls back to word lists. The model's licence (no licence stated on its card; MIT base model; CoNLL-2003 training data) is accepted for now and revisited before release. A measured accuracy bar on children's writing is deferred (user, 2026-10-28) |
| D34 | Persona eval baselines are teacher-approved | Persona eval ground truth (§9) comes from replies a teacher approves, which feed a living set of evidence, instead of hand-written or one-off recorded baselines. How approvals are tagged to persona template versions, so old approvals don't conflict with updated templates, is still open (§12 q14) (user, 2026-10-28) |
| D35 | No verified source, no facts: the tutor becomes a sparring partner | Student-facing AI has no internet access. When a student asks about something the verified assets don't cover (the published curriculum, the vault, and this class's own uploads, each with `use_for` tutor or both; settled as §12 q15 by the user, 2026-10-28), Ms. Ivy does not state facts from the model's own knowledge. She says so plainly and switches to a cognitive sparring partner: questions that guide inquiry, scaffold the student's reasoning and point back to what the class's materials do cover. Grounded answers cite the passage they rest on (user, 2026-10-28) |
| D36 | Student profile: age-bifurcated, no mood data | The student profile (onboarding: interests, goals, example-style preference, sharing with Ms. Ivy and Milo) is stored on the server, visible and deletable like memory (D29). Students in K–10 choose goals and learning preferences from predefined dropdowns only. Grade 11–12 and adult learners may type free-text goals, which pass the A2 safety pipeline on submission and the A7 anonymous layer before any model sees them. No self-reported mood, focus or confidence ratings for anyone. The student's name never reaches a model (D26) (user, 2026-10-29; spec `docs/decisions/2026-10-29-prototype-spec.md`). **Settled:** at most 5 active interests per profile. K–10 reflections use curated tags or sentence stems from a list, never free text; grade 11+ reflections may be typed and pass A2 and A7 (user, 2026-10-29, §12 q16–q23) |
| D37 | Retention for sessions, plans and reflections | Conversational session transcripts: 90-day rolling purge. Study plans and reflections: a first-in, first-out cap of 30 instances per student; the 31st deletes the oldest. FERPA deletes and unenrolment still delete everything (D22) (user, 2026-10-29; spec `docs/decisions/2026-10-29-prototype-spec.md`). **Settled:** two separate 30-instance FIFO queues per student, one for study plans and one for reflections. The transcript window is a district setting that defaults to 90 days (§10), not fixed (user, 2026-10-29, §12 q16–q23) |
| D38 | Diagnostic events, not clickstreams | Besides D19's learning events, the tracker derives three diagnostics, each shown to the teacher with a disclaimer (patterns are behavioural hypotheses and may reflect access or circumstances) and an actionable instructional suggestion: (1) **Knowledge gap**: a failed target concept followed by a stall or failure on its underlying prerequisite (the D41 trace-back); (2) **Baseline breakdown** (cognitive overload): prerequisites passed and normal response latency, but a trivial single-step prompt failed after the AI supplied the missing context, deviating abnormally from the student's own rolling baseline; (3) **Engagement indices**, longitudinal and behavioural only: *Active Choice* (streaks, voluntary self-paced starts, starting before deadlines), *Persistence* (finishing multi-turn sparring loops vs abandoning mid-session), *Mental Effort* (latency relative to reading time, elaboration depth, single-step accuracy vs rapid guessing). All are deterministic tracker rules (D6); still no raw clicks and no psychological labels (user, 2026-10-29; spec `docs/decisions/2026-10-29-prototype-spec.md`). **Settled:** indices are teacher-only, longitudinal trends with the mandatory disclaimer; never ranked, clustered, used for prediction or labels, or shown to students or admins as per-student scores; covered by D16 audits (user, 2026-10-29, §12 q16–q23) |
| D39 | Dual-track study plans; notification hierarchy | Every student has a **teacher-assigned track** (teacher due dates and assignments) and, where the teacher turns it on, a **self-paced track** that paces the student when no teacher deadline competes. Teacher-assigned work always overrides and takes UI priority. External notifications (push, email) follow District > Teacher > Student: the district can disable them or enforce quiet hours tenant-wide; the teacher decides whether assigned work sends external reminders (default in-app only); students or families customise reminders for their self-paced plan unless the district has disabled them. S3 "missions" become the teacher-assigned track (user, 2026-10-29; spec `docs/decisions/2026-10-29-prototype-spec.md`). **Settled:** students' self-paced reminders use web push only (no SMS, no automated email). Teacher-led due-date reminders go through the district's existing LMS or portal, not from Idea Map. Idea Map collects no family contact details; any guardian communication flows through the district's SIS (OneRoster or administrative sync), which owns those records (user, 2026-10-29, §12 q16–q23). **Settled (user, 2026-10-29, §12 q24):** teacher due dates reach the district LMS or portal through a per-class export (CSV and iCalendar) and a per-class calendar feed URL, never a live connection or LTI (D4, D18); web push keeps only the subscription endpoint and keys, deleted on opt-out or sign-out, and never used for tracing (D19) |
| D40 | Practice is the ninth tab, from vetted item banks only | The Practice tab (exercises, worked-example video and steps, mastery practice) is populated only from externally sourced, psychometrically vetted item banks (for example OpenStax, PhET, NASA/NOAA). Neither the platform nor a model authors independent-practice questions. Independent practice is locked to the verified master sheet (user, 2026-10-29; spec `docs/decisions/2026-10-29-prototype-spec.md`). **Settled:** every Practice row carries `source_bank_id` (e.g. OpenStax, PhET, NASA), `license_type` (e.g. Public Domain, CC-BY-4.0) and `attribution_string`, which the UI renders visibly. C3's generated map quizzes and A6's teacher-approved teach-back drafts stay: they are formative scaffolds, not independent practice (user, 2026-10-29, §12 q16–q23). **Settled (user, 2026-10-29, §12 q25):** Practice items are always shown verbatim with their attribution; student interests (D41 `interest_tags`) shape only Ms. Ivy's and Milo's examples and hints and the formative generated content (C3, A6), never a vetted item. **Settled (user, 2026-10-29): D40 stays strict.** A teacher's own worksheets and uploads never enter the Practice tab, whoever authored them and whatever licence they carry, and Atlas never inserts them there. They stay class uploads (D31, unofficial tier) and appear as formative practice labelled as the teacher's, separate from vetted items and outside the vetted mastery levels |
| D41 | Standards-aligned Vault graph and two-layer trace-back | "Traced to weakest prerequisite" is an explained teacher signal (D20). Procedural domains (e.g. kinematics) are a strict DAG of mathematical and operational steps. Conceptual or cyclical domains (e.g. the water cycle) are two layers: the surface process loop (evaporation → condensation → precipitation) over underlying causal mechanisms (thermal energy, phase change, gravity, droplet mass, topography) aligned to NGSS/CCSS standards pre-loaded in the Vault; trace-back goes down to the mechanism layer, not around the loop. In teacher-led mode, editing curriculum or attaching custom worksheets follows district permissions: Locked, Direct edit, or Admin review queue, always draft → publish. For an uploaded worksheet the AI proposes prerequisite links into the Vault graph and the teacher adjusts edges or adds nodes before publishing (user, 2026-10-29; spec `docs/decisions/2026-10-29-prototype-spec.md`). **Settled:** per-curriculum interest hooks are `interest_tags: string[]` on curriculum module metadata in the Vault, matched against the student's profile tags when a prompt is assembled (user, 2026-10-29, §12 q16–q23) |
| D42 | Pilot scope; self-hosted video | Videos are self-hosted through the media provider (X2), never third-party embedded players, so playback works behind school firewalls; ~~X2 moves before the pilot~~ **Amended (user, 2026-10-29): X2 moves after the pilot, into v0.4 (D45).** Video hosting and the player come once the pilot has validated the node graph and tutor mechanics; until then `media_url` and `demo_video_url` show placeholder cards, and no third-party player is used in the meantime. The two-layer graph (C12) and trace-back (M8) stay in pilot scope. The pilot launches with the Water Cycle (conceptual, two-layer) as the primary unit and Kinematics (procedural) as a sub-pilot (user, 2026-10-29; spec `docs/decisions/2026-10-29-prototype-spec.md`). **Settled:** X2 is our own S3-compatible object storage served from our own domain or CDN distribution, not YouTube or Cloudinary widgets; every video needs a WebVTT caption file (ADA) (user, 2026-10-29, §12 q16–q23) |
| D43 | Idea scope and key terms | Ideas gain two optional `sheet` columns. `scope` ∈ prerequisite, core, extension (missing means core) says where an idea sits: **core** ideas form the grade's main map; **prerequisite** ideas (earlier units or lower grades) appear when a student zooms in for remediation; **extension** ideas form the sandbox of outward connections. `scope` is independent of D41's `layer` (process or mechanism). `unit` stays required: for a prerequisite or extension idea it names the unit the idea supports. `key_terms` is a list of the vocabulary taught inside an idea (instruments, units, examples such as barometer, lux, hailstone); key terms are never map nodes, and are used for the glossary, search, retrieval and Milo's teach-back check. Only a full process with its own objective, practice and teach-back becomes an idea. The layout algorithm is unchanged, but it runs per scope, so the main map is laid out from core ideas only (user, 2026-10-29). Tasks C14, C16; zoom and sandbox views S9 (later version) |
| D44 | Water Cycle pilot graph | The pilot Water Cycle (D42) is authored in-house, with OpenSciEd Unit 6.3 (CC BY 4.0) as the conceptual reference and vocabulary inventory, never imported wholesale. It has 10 ideas: 2 prerequisite, 6 core (including Runoff, Collection & Gravity, which closes the cycle and covers gravity, as MS-ESS2-4 requires) and 2 extension, plus 12 links. The graph is in `docs/decisions/2026-10-29-water-cycle-pilot-graph.md`. Clicking an idea opens its teaching and practice page (S6), not a nested sub-graph (user, 2026-10-29). Task C17 |
| D45 | Versions | Work ships in four versions; each task in `docs/tasks.json` carries one, and a task may depend only on its own or an earlier version. **v0.1 Pilot (MVP):** what the app can't live without; the pilot (L1) is its milestone. It includes explained, challengeable feedback with teacher review (A9, A10), fairness audits (M6), UDL (D17), the anonymous layer and dual memory (A7, A8), the Practice tab, Vault standards graph and two-layer trace-back (C10–C17, M8), and the student map with remediation zoom (S10, S1, S2, S9, S6). Track 1 content in v0.1 is vetted practice and worked-example steps, without video. **v0.2 AI design principles:** context from anonymised summaries (D28), metacognition, interests, the study planner, model sandboxes and research. **v0.3 Visuals and motivation:** Milo's avatar, cards, rewards, levels, sandbox exploration (S11). **v0.4 Curriculum building:** Atlas as the editing interface, Track 2 drafting from uploads, prerequisite editing (T9), the persona editor, self-hosted video (X2, which D42 had moved after the pilot) and Drive import. Scope per version is in `docs/ROADMAP.md` (user, 2026-10-29) |
| D46 | Themeable design tokens | Colours and themes are templates: every colour (and any font, radius or shadow a theme may change) reaches the apps only through named tokens defined by a theme file, including map, category and state colours. Nocturne is the default theme and keeps its values and D10's 9 accepted contrast exceptions; any other theme must meet WCAG 2.1 AA outright. Themes swap at runtime without code changes, so v0.3's cosmetic themes (S14) and future school or accessibility themes slot in (user, 2026-10-29). Task F8 |
| D47 | Far ideas are hidden until nearby | On the student map, locked ideas split into **next up** (every prerequisite still needed is open) and **far** (needs a still-locked prerequisite), computed on the server (S10b, then M4's stored MapView, §8.4). A next-up idea shows its title and what unlocks it. A far idea shows only as **"Hidden idea" · "Explore nearby to reveal"**, as in the prototype: the API sends no title, category, unit or human-readable id for it (an opaque per-response id instead), so nothing leaks through the page source. It is revealed when it becomes next up. Teachers' Preview as student still shows everything. Chosen for motivation and a game-like sense of discovery (user, 2026-10-29) |
| D48 | Milo is a character package where the tracker meets the AI | Milo is built as a character: a **Soul file** (identity, voice, values and boundaries, like OpenClaw's SOUL.md), **skills** (the structured tools Milo may use, first the teach-back answer checker) and **guardrails** (A2's fixed guardrails plus Milo's own, such as never giving answers away). Milo is where the deterministic tracker connects to the AI. He reads only the student's own tracker outputs (Milo stage, units and mastered ideas; never teacher-only signals or names), and his judgements become recorded events (`teachback.judged`) that the tracker replays (§8.4); generation never keeps its own progress. The built-in Milo lives in `packages/ai`'s registry (D13). The Personas tab and class overrides may change his name and personality wording (variables), never his guardrails or skills. Ms. Ivy and Atlas can move to the same format later (user, 2026-10-31) |

## 2. The core split

The prototype already draws the line that drives everything else:

| | Curriculum data | Class settings |
|---|---|---|
| Owner | Curriculum author (teacher, department, district) | Teacher of one class |
| Edited in | The spreadsheet or database export, then re-imported | The app |
| Contents | Ideas, links, units, categories, prerequisites (`requires`), standards codes, media URLs, assessment questions, library list; plus starting values for course details, due dates, rarity and personas | Overrides of the course details, pass mark, persona prompts, due dates and card rarity; column mapping |
| Versioned as | Immutable `CurriculumVersion` snapshots | Mutable config rows with an audit trail |

The app never writes curriculum data back to the source. Atlas drafts rows; the teacher pastes or exports them and re-imports.

## 3. System overview

```
             ┌──────────────── Browser ────────────────┐
             │  Teacher console        Student explorer │
             │  (settings, publish)    (map, quiz, Milo)│
             └───────────────┬─────────────────────────┘
                             │ typed HTTP (zod contracts)
┌────────────────────────────▼────────────────────────────┐
│ API (Fastify)                                            │
│  auth & roles · curricula · versions · classes · config  │
│  event ingest · progress · library · exports · AI gateway│
└───────┬───────────────┬───────────────┬─────────────────┘
        │               │               │
   ┌────▼────┐    ┌─────▼─────┐   ┌─────▼──────┐
   │Postgres │    │ Job queue │   │ Object     │
   │+pgvector│◄───┤ (pg-boss) │   │ storage    │
   └─────────┘    └─────┬─────┘   │ (uploads,  │
                        │         │  exports)  │
                  ┌─────▼─────┐   └────────────┘
                  │ Workers   │
                  │ import · derive · index · export
                  └─────┬─────┘
                        │
                  ┌─────▼──────┐
                  │ LLM provider│  (server-side only)
                  └────────────┘
```

One database (Postgres) carries relational data, the job queue (pg-boss) and vectors (pgvector). That keeps the first deployment to three moving parts: API, workers, Postgres, plus S3-compatible storage.

## 4. Repository layout

```
apps/
  teacher/        React + Vite. Teacher console, starting with Settings
  student/        React + Vite. Idea Map Explorer (later phase)
  api/            Fastify HTTP API, AI gateway
  worker/         pg-boss job handlers
packages/
  domain/         Types, data checks, link ranking, layout, quiz generation, prompt filling,
                  generateMap. May use heuristics or models; outputs are stored
  tracker/        Event schemas and the deterministic rules (apply, metrics, signals).
                  No I/O, no clock, no randomness. Heavily unit and property tested
  contracts/      zod schemas for every API request/response and every import tab
  connectors/     Import/export adapters (CSV, XLSX, Sheets export, SQL/CSV dump)
  ai/             Persona registry, prompt assembly, tool definitions, eval harness
  ui/             Nocturne tokens and component classes ported from _ds/
  db/             Migrations and typed queries
```

The prototype's `curriculum.js` splits cleanly: `issues`, `codes`, `band`, `vars`, `fill` move into `packages/domain`; `SHEET` becomes a parsed import; `DEFAULT` becomes curriculum and class defaults; `localStorage` goes away.

## 5. Data model

```
Organization ─┬─< User (role: admin | author | teacher | student)
              ├─< Curriculum ─┬─< CurriculumVersion (draft | published | archived)
              │               │      ├─ ideas, links, units, categories, assessment  (jsonb, immutable)
              │               │      ├─ derived: ranked links, layout, quizzes, issues
              │               │      └─ source: file ref, column mapping, checksum
              │               ├─ CurriculumDefaults (personas, framework, grade, objective)
              │               └─< LibraryDoc ─< Chunk (embedding)   (shared library)
              └─< Class ──────┬─ curriculum_id, pinned_version_id
                              ├─ ClassConfig (overrides; see §6)
                              ├─< ClassLibraryDoc ─< Chunk   (class uploads, D11)
                              ├─< ClassLibrarySetting (per shared doc: use_for or off, D11)
                              ├─< Enrollment (student)
                              ├─< InteractionEvent (append-only, per-student seq; source of truth for progress, §8)
                              ├─< GeneratedMapView, AiOutput (stored outputs, referenced by events)
                              │      └─ InteractionText (typed input; redacted, retention-bound)
                              └─< ProgressSnapshot (derived cache: state + last seq; rebuildable)
ImportJob, ExportJob, AuditEvent, AiInteraction (redacted, retention-bound)
```

Keys:
- `idea_id` from the spreadsheet is the stable identity across versions. Events record the version they happened on; replay keys state by `(class, student, idea_id)`.
- Version bodies are stored as validated jsonb. Ideas per curriculum are expected in the tens to low hundreds, so this stays fast and keeps snapshots truly immutable.

## 6. Layered configuration

Effective config for a class = curriculum defaults, then class overrides.

| Field | Curriculum default | Class override |
|---|---|---|
| Subject, topic, whole-map objective | yes | yes |
| Grade level, standards framework | yes | yes (grade drives reading level) |
| Persona templates (Ms. Ivy, Milo, Atlas, custom) | yes | yes, per field, with "reset to curriculum" |
| Due dates per unit | no | yes |
| Card rarity overrides | yes | yes |
| Column mapping | yes (belongs to the source) | no |

The settings page shows where each value comes from ("from curriculum" or "this class") so a teacher sharing a curriculum knows what they are changing. Prompt filling (`fill(cfg, persona)`) runs on the server, so students cannot alter the prompts sent on their behalf.

## 7. Curriculum pipeline: import, draft, publish

```
upload / pick file
      │
  ImportJob ── parse (connector) ── map columns ── validate (zod)
      │
  derive (packages/domain)
      ├─ data checks: unknown requires ids, prerequisite loops, missing codes, missing media
      ├─ rank links: keep top 3 in / 3 out by importance
      ├─ lay out: most connected in centre, next 6 inner ring, rest outer
      └─ generate quizzes: 8 per idea from links
      │
  CurriculumVersion (status: draft)
      │
  teacher reviews: data checks + diff against the published version
      │
  Publish ──► pick classes ──► Class.pinned_version_id moves
```

- **Errors block publishing** (unknown prerequisite ids, loops). Warnings and info do not.
- **The diff** lists ideas added, removed or renamed, prerequisite changes, unit membership changes and assessment question changes. The preview also shows **Students receiving this update**: the number of unique students enrolled in the selected classes, counted once even if they're in several of them (D14). It is the audience for the new content, not a count of students whose progress changes; a progress-impact figure, if ever added, is a separate, separately labelled metric.
- **Progress migration on publish**: progress is replayed from tracker events (§8), so migration is a tracker rule, not a data rewrite. Mastery carries over by `idea_id`. A removed idea's progress is archived, not deleted. A newly added prerequisite never takes away an idea a student has already unlocked. A unit whose ideas changed reopens its teach-back only if the teacher chooses.
- **Rollback** is re-pinning an earlier published version.
- **Library indexing** (chunk, embed) runs as its own job when documents change, independent of curriculum versions.

### Connectors (import and export only)

```ts
interface ImportConnector { kind: string; parse(file: Blob): Promise<RawTabs> }
interface ExportTarget    { kind: string; write(report: ExportPayload): Promise<FileRef> }
interface MediaProvider   { kind: string; resolve(url: string): Promise<MediaRef> }
```

| Now | Later |
|---|---|
| CSV (one file per tab, or zipped) | Google Drive file picker (pull a Sheet as XLSX, still a one-off import) |
| XLSX / Google Sheets downloaded as XLSX | Cloudinary `MediaProvider` for `media_url` |
| PostgreSQL via a CSV or SQL dump the school exports | Scheduled re-import from Drive (still lands as a draft) |

Exports: blank template workbook, data-check report, standards alignment report (ideas and units per code), Atlas-drafted rows as CSV, class progress summary.

## 8. Interaction tracker and map generation

> **Spec v1 (2026-10-23), from decisions D15–D30.** Gate `MD` was cleared by the user on 2026-10-23. Any change to *what* is traced (D19), inferred (D20), shown (D21) or kept (D22) is a user decision and must not be made by an agent.

Two parts with opposite rules:

| | Interaction tracker | Map generation and AI |
|---|---|---|
| Job | Record learning events (D19) and work out progress and mastery from them | Decide what the map shows, and create explanations, feedback and questions |
| Deterministic? | **Yes, always.** The same events always give the same numbers | **No need.** It may use heuristics, randomness or a model |
| How it stays trustworthy | Rules are pure and replayable | Whatever it shows a student is saved and recorded as a tracker event |

### 8.1 The tracker: deterministic by design

Learning events go into an append-only log. Progress is **never edited directly**. It is calculated by replaying events through fixed rules in `packages/tracker`:

```
state = events.reduce(apply, initialState(classConfig, rulesVersion))
```

- **Deterministic:** no `Date.now()`, no randomness, no network and no model calls inside `apply`. Time comes from the events.
- **Traceable:** for any number a teacher sees, the app lists the events that produced it.
- **Repairable:** a fixed rule is applied by replaying events, never by patching numbers. Rules carry a `rulesVersion`, so old results stay reproducible.
- **Fast reads:** `ProgressSnapshot` caches the state plus its last `seq`; only newer events are applied, and snapshots can be dropped and rebuilt.
- **Event shape (D18, borrowed from Moodle's log store):** each event has a `type`, an **educational level** (`participating` for student learning actions, `teaching` for teacher actions, `other` for provenance records) and a target (`idea`, `quiz`, `unit`, `feedback` or `mission`) with its id. No IP address, device or location is ever recorded (D19).

### 8.2 Event catalogue (D19)

```ts
type InteractionEvent = {
  id: string;            // client ULID; a resent event is recorded once
  studentId: string;     // pseudonymous
  classId: string;
  versionId: string;     // curriculum version the student was on
  seq: number;           // per-student, set by the server; replay order
  at: string;            // client time; used for durations, seq decides order
  type: EventType;
  level: 'participating' | 'teaching' | 'other';
  payload: unknown;      // validated per type with zod (M1)
};
```

| Type | Level | Payload (all ids, never free text) |
|---|---|---|
| `idea.opened` | participating | ideaId |
| `idea.active_time` | participating | ideaId, seconds (rounded to 30 s, per session; sent when the student leaves the idea or the page) |
| `quiz.started` | participating | ideaId, attemptId, questionIds (from the published version) |
| `quiz.answered` | participating | attemptId, questionId, choice, correct, attempt number, secondsToAnswer (rounded to 5 s) |
| `quiz.finished` | participating | attemptId, score, of |
| `hint.requested` | participating | ideaId or questionId |
| `review.link_rebuilt` | participating | ideaId, linkId |
| `teachback.done` | participating | unitId, textRef (typed answer, kept in `InteractionText`) |
| `teachback.judged` | other | unitId, verdict (pass, retry), keyPointsHit, aiOutputId |
| `feedback.shown` | participating | feedbackId, source (ai, teacher), reasonRef (D15) |
| `feedback.challenged` | participating | feedbackId, textRef |
| `feedback.ruled` | teaching | feedbackId, ruling (upheld, overturned, edited), teacherPseudonymId (D30) |
| `teacher.feedback.approved` / `teacher.feedback.edited` | teaching | feedbackId, teacherPseudonymId (D30) (D15 summative review) |
| `mission.completed` | participating | missionId (unit with a due date, T4) |
| `map.shown` | other | mapViewId (§8.4) |
| `ai.output_shown` | other | aiOutputId (§8.4) |

**Practice (interim, §12 q27):** vetted Practice items reuse the quiz events with question ids `practice/<exercise_id>`; worked-example viewing sends nothing.

`other`-level events are provenance: they record what the student was shown, so the tracker never re-runs a generator or model. They are not behaviour. **Never recorded:** clicks, scrolls, hovers, zoom, mouse movement, keystrokes, idle or focus timing beyond `idea.active_time`, device, IP or location. Typed text (chat, teach-back answers, challenges) lives in `InteractionText` and is anonymised first (D26).

### 8.3 What the tracker works out (D20)

All outputs come from the rules alone, and changing one means a new `rulesVersion`. Defaults come from the prototype (`project/Idea Map Explorer v2.dc.html`).

| Output | Rule (rulesVersion 1) |
|---|---|
| Quiz length | The class setting, 3–12, default 8 |
| Mastery % per idea | Best `quiz.finished` score for that idea, as a percentage (0–100) |
| Idea mastered | Some finished attempt scores **above** the class pass mark (default 70) |
| Idea unlocked | Every idea in its `requires` is mastered. An idea, once unlocked, stays unlocked after a publish adds a prerequisite (§7) |
| Unit complete | Every idea in the unit is mastered and the latest `teachback.judged` is `pass`. A teacher may reopen a teach-back after a publish (§7) |
| XP | A correct answer gives 10 × multiplier, where the combo multiplier is ×4 at 6 or more in a row, ×3 at 4+, ×2 at 2+, otherwise ×1; a wrong answer resets the combo. Quiz pass +50, perfect score +50 more, link rebuilt +5, unit complete +200 |
| Day streak | +1 on the first quiz pass of a day, in the class time zone; one day with no pass resets it |
| Cards | One per mastered idea, with that idea's effective rarity (T5) |
| **Milo stage** (rulesVersion 2, M10) | Milo's knowledge = mastered ideas + 3 × units whose latest `teachback.judged` is `pass`. Stages from the prototype: 1 Curious newbie (0), 2 Getting it (3), 3 Thinker (7), 4 Scholar (12). Shown to the student (D48) |
| **May need help** (teacher only, D21) | Raised with its reason when either (a) 3 wrong answers on an idea's questions after a `hint.requested` on that idea, or (b) an unlocked idea that is a prerequisite of the student's next mission has no pass for 5 school days. Cleared by a later pass |

**Never computed (D20):** risk, dropout or grade predictions; engagement, behaviour or personality scores; clustering; rankings between students. `idea.active_time` and `secondsToAnswer` are shown to the teacher as plain durations, never scored.

**Opt-out (D24):** an opted-out student still gets every output above, because the app needs them, but their events are excluded from D16 audits, aggregates and D25 research.

### 8.4 Map generation and AI: free to vary, always recorded

`generateMap` decides what a student sees: positions, which neighbours to show, blur and lock states, and highlighted next steps. It may use heuristics, randomness or a model. The same goes for AI explanations, quiz wording, feedback and Milo's lines.

1. **Inputs come from the tracker.** Generation reads tracker state and never keeps progress of its own.
2. **Outputs are saved, not recomputed.** Each generated map view and AI output is stored with an id, and `map.shown` or `ai.output_shown` points to it.
3. **Judgements become events.** A model's teach-back verdict is recorded as `teachback.judged`, and the rules use the recorded verdict.
4. **Safety checks still apply.** A generated view that shows a locked idea as open is rejected.
5. **One source of unlocks (M3 QA S-1, coordinator 2026-10-30, from §7 and rule 1).** The tracker's `unlocked` set is the only authority on whether an idea is open for a student. `packages/domain` `lockStates`/`mapStates` take that set as an input: an idea is `open` when the tracker has unlocked it, or when every one of its `requires` is mastered (which also covers zero progress, where the tracker lists no ideas yet). They never recompute a lock that the tracker has lifted, so an idea unlocked before a publish added a prerequisite stays open on the map (§7). The `next` and `far` states (D47) are derived from that `open` set. A `requires` naming an idea that isn't in the version can't be published (C2 error), so no published map contains one. When the tracker's unlocked set is passed, both sides treat it as unmet; the domain's zero-progress path keeps S10b's behaviour for such unpublishable data (accepted after M3's fix, 2026-10-30). Rule 4's check uses this same function.

### 8.5 Ingest and storage

- `POST /events` takes batches. The server validates each event against its schema, sets `seq` and `level`, drops ids it already has, and rejects events from a version the class isn't pinned to (with a grace period after a publish, 24 hours by default) and any event type outside §8.2. Each event is judged on its own, with a reason for each rejection. Students post only their own events, in classes they're enrolled in; `teaching` events and `teachback.judged` are recorded by the server, never by a student's client (M2).
- Typed text travels in the same batch as the event that refers to it. The server backstop (D26) blurs real roster names and contact details before storing it, and counts each such text in `privacy_miss`.
- Events go in `interaction_event` (monthly partitions, F4). Hot-path reads bound `recorded_at` from the latest snapshot.
- The client batches events every few seconds and on page hide, with an offline queue (as for F5 autosave).
- **Retention (D22):** raw events are kept while the student is enrolled in the district, and deleted on unenrolment and on a FERPA delete (F6). Anonymous class aggregates (small groups suppressed) may be kept. `InteractionText` and AI transcripts keep the 90-day default (§10). Generated map views and AI outputs referenced by events are kept as long as those events are. M2 implements this: a district admin's FERPA delete or unenrolment calls `app.purge_student_events`, the one path past the tracker tables' append-only trigger, which deletes that student's events, event keys, map views and AI outputs. `docs/privacy/data-inventory.md` lists every field.
- **Opt-out (D24):** a district admin records an opt-out in `tracing_opt_out`; events stored while it holds carry `tracing_opted_out`, which D16 audits, aggregates and D25 research exclude.
- **Privacy provider (D18):** every table holding tracker or memory data registers with F6's inventory, export and delete, the way each Moodle component declares, exports and deletes its own data.
- xAPI or Caliper export may come later, designed in but not built now.

### 8.6 Teacher views and audits

- **Teacher views (M5, D21):** for each student, a timeline of §8.2 events with durations, mastery per idea, "may need help" with its reason, and challenges; for the class, a heatmap of where students are unlocked but not yet passing. Teachers see only their own classes.
- **Admins (D21):** school and district aggregates and D16 audit results only. Per-student detail only while handling an A2 flag.
- **Fairness audits (D16, D23):** routine monitoring compares schools and districts. Metrics per question: demographic parity difference, disparate impact ratio (flagged below 0.8), and teacher-agreement and challenge-upheld rates. The sampled racial-disparity audit exports pseudonymous outcomes to the district, which returns aggregates only. Small groups (under 10) are suppressed everywhere.
- **Research (D25):** de-identified exports only, under a district research agreement, excluding D24 opt-outs. Identifiable data, or use beyond education for under-13s, needs opt-in parental consent.

## 9. AI layer

All model calls go through the API's AI gateway. The browser never holds a key.

| Persona | Audience | Context it gets | Tools |
|---|---|---|---|
| Ms. Ivy (tutor) | Students | Filled template, current idea or link, its objective, library passages | none at first |
| Milo (peer) | Students | Filled template, unit assessment questions and key points, student's answers | answer checker (structured output) |
| Atlas (logistics) | Teachers | Filled template, app guide, effective config | `searchIdeas`, `getDataChecks`, `getDiff`, `searchLibrary`, `draftRows(tab)` |

- The prototype pastes the whole setup into Atlas's prompt. That breaks past a few dozen ideas, so Atlas uses tools instead.
- Atlas can only draft. Writing to curriculum data stays a teacher action (export, edit, re-import), matching D4.
- Templates use the existing variables (`{name} {tone} {subject} {topic} {grade} {age} {peerAge} {style} {length}`). The variable list lives in `packages/ai` so the settings page and the gateway agree. More work on prompts was flagged as coming, so templates are stored as versioned records, not code.
- An eval harness runs each persona against fixed prompts per grade band (K–2, 3–5, 6–8, 9–12) before template changes ship.

### Privacy layer, memory and feedback (D15, D16, D26–D29)

- **Anonymous layer (D26, D27, task A7):** student text is blurred on the device before it leaves. People's names, places, contact details and school identifiers become neutral labels (Person A, Place B); the device keeps the mapping and fills replies back in. Interests stay specific in conversation. A server backstop blurs anything that slipped through before the model call, and counts it as a privacy miss.
- **Dual memory (D28, D29, task A8):** short-term memory is the anonymised conversation. Long-term summaries hold misconceptions, what helped, preferred pace and up to five interests from an approved category list, and nothing else. A student can view, delete or turn memory off; it lasts while they are enrolled.
- **Feedback (D15, tasks A9 and A10):** formative feedback comes with its reason and **Challenge this**; summative feedback waits for the teacher. Teacher rulings become labelled examples (never training data). Pre-send safeguards (D16) run first: grounding, a verifier, a tone and reading-level check, and routing to the teacher.

### Safety for student-facing personas

- AI feedback follows D15 (reasons, Challenge this, teacher approval for summative) and passes D16's pre-send safeguards before a student sees it.
- Input and output moderation on every student turn.
- Fixed guardrails appended after the teacher's template, so editing a prompt cannot remove them (stay on topic, no personal data requests, age-appropriate language).
- Concerning messages (self-harm, abuse) raise a flag to the teacher and admin, per district policy.
- Rate limits per student and per class.
- As built (A2): the gateway moderates the student's message before the model and the reply before the student, through a moderation provider (the gateway's own model by default). A moderator that fails or times out fails closed. A reply that asks for personal data is withheld like an unsafe one. A concerning message raises a `safety_flag` (with its transcript, in one transaction) that the class teacher and/or the org's admins see, as the district's `flag_notify` policy says; the student reads the district's help text. Raising and resolving a flag are audit events. A flag is deleted with its transcript at the district's AI retention period, or once it has been resolved for the district's early-deletion window (default 30 days, a per-district setting), whichever comes first (D32).

## 10. K-12 privacy and compliance

| Requirement | Design response |
|---|---|
| COPPA (students under 13) | School-authorised consent model; collect only name, school email and roster ids; no ads, no profiling |
| FERPA | District is the data owner; signed data processing agreement; export and delete on request |
| State laws (e.g. SOPIPA) | No sale or secondary use; vendor list published |
| AI vendors | Use a zero-retention, no-training agreement with the model provider; send no student names to the model (pseudonymous ids). Student text is anonymised on the device first (D26), with a server backstop; teacher corrections are labelled examples, never training data (D15) |
| Fairness and research | D16 audits by school and district, with the race audit run by the district (D23); research on de-identified data only, under a district agreement, with opt-in parental consent for identifiable or beyond-education use of under-13s (D25); tracing opt-out (D24) |
| Learning traces | Learning events only (D19); raw events kept while the student is enrolled in the district, deleted on unenrolment and FERPA request; anonymous aggregates with small groups suppressed (D22). No IP address, device or location |
| AI memory | Long-term memory holds only learning facts and up to five approved-category interests (D28); kept while enrolled; the student can view, delete or turn it off and the teacher can view and delete it for the class (D29); covered by F6 export and delete |
| AI transcripts | Stored redacted, retention configurable per district (default 90 days), visible to the class teacher |
| Access | Roles: admin, author, teacher, student. Teachers see only their classes. Every config change and publish is an `AuditEvent` |
| Sign-in | Google Workspace for Education, Clever, ClassLink SSO; rostering by OneRoster CSV import (import-only, matching D4) |
| Security | TLS everywhere, encryption at rest with AES-256-GCM (never Blowfish, D18), per-org row-level security in Postgres |
| Accessibility | WCAG 2.1 AA for both apps, except the design-system colour pairs accepted in D10; CAST UDL 3.0 for student-facing features, including read-aloud and spoken input in the browser (D17, task S5) |

## 11. Teacher Settings page: how each section maps

| Section in the design | Reads | Writes |
|---|---|---|
| Header: subject · topic, save state, Preview as student | effective config | — |
| Curriculum data: source, Re-sync, pipeline steps, data checks | latest `ImportJob`; the draft version's import and data-check issues (C2, grouped by cause) | starts an `ImportJob` |
| Draft and publish (new, required by D2) | draft vs published diff | publish to selected classes |
| Course details | effective config, with origin per field | class override, or curriculum default for authors |
| AI personas & prompts | built-in personas from the `packages/ai` registry (D13), then pack overrides, then class overrides; variable list | class template overrides; **Test** calls the gateway |
| Schedule | units from published version | due dates (class) |
| Card classification | ideas, auto rarity from layout | rarity overrides |
| From the spreadsheet (read-only tabs, column mapping) | version body | column mapping (applies on next import) |
| Atlas panel and knowledge sources | shared library docs, with this class's `use_for` per doc, plus this class's uploads (D11); app guide | per-class `use_for` (agent, tutor, both, off); class uploads; chat goes through the gateway |
| Drafts to approve (new, D9 and D12) | AI-drafted idea explanations, unit objectives and assessment questions waiting for approval | approve, edit or reject; approved text is stored per curriculum |

The "Re-sync" button in the prototype becomes **Import new version**, and a new **Publish** step sits beside it.

## 12. Open questions

1. Who may edit curriculum defaults on a shared curriculum: only its author, or any teacher using it (forking a copy)?
2. When a published version changes a unit's assessment questions, does a student who already taught Milo keep the trophy?
3. Which SSO and rostering providers does the first school use?
4. Default AI transcript retention period for the first district.
5. Hosting region and provider (affects the data processing agreement).
6. **Embedding model and width (F4):** `chunk.embedding` is `vector(1024)` (Voyage-sized) so it can carry an HNSW index, which needs a fixed width. Changing models means a migration that re-creates the column and re-indexes the library. Which embedding model do we use? (Re-embedding needs no re-upload: originals are kept, D31.)
7. ~~Deleting a student on request vs append-only events (F4)~~ **Settled by D22** (user, 2026-10-23): raw events are deleted on unenrolment and on a FERPA delete. M2 added the owner-only procedure described below (`app.purge_student_events`, admin-only, audited by the delete or unenrolment that calls it). Original question: FERPA's "delete on request" (§10) conflicts with an append-only `interaction_event` that refuses `DELETE` for every role, and with the foreign keys from events to `app_user`. Typed text already lives apart and can be deleted (§8.2). Proposal for M1 or F6: an owner-only procedure that removes one student's events, generated views and AI outputs (the only path that bypasses the append-only trigger), recorded as an `AuditEvent`. **F6 took the other path:** a delete removes the student's name, email, roster ids, typed text and AI transcripts, and keeps events, map views and AI outputs under the pseudonymous id, which then leads to no one. Append-only stays absolute. If a district's DPA requires removing events too, the owner-only procedure above is still the way to add it.
8. ~~Publish preview affected-student count (C5)~~ **Settled as D14** (user, 2026-10-22): all unique students enrolled in the selected classes.
9. **Sign-in state across API instances (F5):** the sign-in flow's state is single-use per API process (an in-memory set), backed by a 10-minute encrypted cookie and the provider's single-use code. With several API instances, a captured callback could be replayed once on another instance inside that window. Move the used-state set to Postgres (or a shared cache) before running more than one instance? The same goes for the failed-sign-in limit per IP.
10. **Provider tenant claims (F5):** sign-in maps a provider's tenant claim to an org via `sso_tenant`: Google `hd`, Clever `district`, ClassLink `tenant_id`. The Clever and ClassLink claim names are unverified until open question 3 picks the providers; each is a setting (`IDEAMAP_SSO_<ID>_TENANT_CLAIM`).
11. ~~Education data mining and tracing (gate MD)~~ **Settled as D15–D29; gate cleared by the user on 2026-10-23.** §8 is spec v1.
12. **Privacy module and dual memory.** Settled as D26–D29; the device uses an ML NER model and never receives a roster (D33, user 2026-10-28). Still open: check the design against the SoulSpeak paper once the user shares it; which NER model, and its accuracy on children's writing (nicknames, misspellings), within A7-P1's budget.
14. **Version tags for teacher-approved eval replies (D34).** A teacher-approved reply is ground truth for one persona template. How is each approval tagged (for example by persona, grade band, template version and guardrail version, as A5's prompt hash already records), and what happens to approvals when a template changes: kept for unchanged cases, flagged for re-approval, or dropped? Until settled, A5's CI baselines are a hand-written seed.
15. ~~What counts as verified for D35~~ **Settled** (user, 2026-10-28): the curriculum, the vault and the class's uploads all ground retrieval answers (D35).
16. ~~Engagement indices vs D20~~ **Settled** (user, 2026-10-29): see D16, D19 and D36–D42.
17. ~~D37's 30-instance cap~~ **Settled** (user, 2026-10-29): see D16, D19 and D36–D42.
18. ~~Timing for D38 Mental Effort~~ **Settled** (user, 2026-10-29): see D16, D19 and D36–D42.
19. ~~External notification channel (D39)~~ **Settled** (user, 2026-10-29): see D16, D19 and D36–D42.
20. ~~X2 and "self-hosted" (D42)~~ **Settled** (user, 2026-10-29): see D16, D19 and D36–D42.
21. ~~D40 and existing generated quizzes~~ **Settled** (user, 2026-10-29): see D16, D19 and D36–D42.
22. ~~Interests in the profile (D36, D27, D28)~~ **Settled** (user, 2026-10-29): see D16, D19 and D36–D42.
23. ~~Transcript retention (D37 vs D32)~~ **Settled** (user, 2026-10-29): see D16, D19 and D36–D42.
24. ~~How teacher due dates reach the district LMS~~ **Settled** (user, 2026-10-29): see D39.
25. ~~Interest context in word problems vs vetted items~~ **Settled** (user, 2026-10-29): see D40.
26. **Training data for v0.2 model research (X3, X4):** may any model be trained or fine-tuned on student data? The coordinator's recommendation, agreed in principle by the user on 2026-10-29 and still to be discussed: only de-identified or synthetic data, never raw student data. Training on real student data would change what is traced (D19) and kept (D22) and carries FERPA and COPPA obligations. Until settled, X3 and X4 stay placeholders. **On hold (user, 2026-10-29):** the user can't decide this yet, and contrastive-learning research (X4) is on hold. Options to weigh when it reopens: (A) no training, prompting plus A5 evals only; (B) synthetic data from the curriculum; (C) de-identified data under D24/D25 with district agreements; (D) raw student data, not recommended. Contrastive representations of students rather than content would be the clustering D20 forbids.
27. **Practice exercise events (S6, M8):** which events does vetted Practice (D40) send? **Interim answer (user, 2026-10-30), to be revisited once the user knows more about what may and may not be tracked:** Practice reuses the existing quiz events, so D19 traces nothing new. A Mastery practice run sends `quiz.started`, `quiz.answered` and `quiz.finished` with question ids `practice/<exercise_id>` from the published version's Practice tab. Stepping through a Worked example is viewing, not answering, and sends no event. M8's exercise levels are computed from those answers. The alternative, still open, is dedicated `exercise.*` events (possibly including worked-example step views), which would widen D19 and needs the user's decision. Build S6 and M8 so the event mapping sits in one place (contracts plus one tracker adapter) and can change without reshaping tracker state.
28. **Teach-back verdict (S4t, S4m):** the prototype's grader returns got, partial or miss for each key point; §8.2 records `teachback.judged` as pass or retry for the unit. Which per-question results make a unit pass (for example every key point got, or no miss)? Settle it in S4t's criteria with the user.
