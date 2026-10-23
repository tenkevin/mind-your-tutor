# Idea Map — Architecture

Status: draft v0.1 · 2026-10-22
Scope: the whole platform, with the Teacher Settings page (`project/Teacher Settings.dc.html`) as the first surface to build.
Branch: `idea-map` (separate from MindyourTutor on `main`/`init`).
Companions: `docs/PLAN.md` (live to-do list and dependency map, generated from `docs/tasks.json`), `AGENTS.md` (how work is claimed).

## 1. Decisions so far

| # | Decision | Consequence |
|---|---|---|
| D1 | TypeScript end to end | One monorepo; domain logic and contracts shared by browser, API and workers |
| D2 | Publish is separate from sync | An import produces a **draft** version. Students only ever see a **published** version |
| D3 | A curriculum can be shared across classes | Curriculum (shared) and Class (per teacher) are separate entities with layered config |
| D4 | No live database connections; import and export only | Connectors are file parsers. Google Drive and Cloudinary come later behind the same interfaces |
| D5 | K-12 audience | COPPA, FERPA and state student-privacy law shape auth, AI logging, retention and vendors |
| D6 | Determinism lives in the tracker | The interaction tracker is fully deterministic and replayable. Map generation and AI may vary, but everything they show students is stored and recorded as an event |
| D7 | Independent QA before anything moves on | Every task has written criteria (functional, security, performance, usability) before it's claimed, and a separate agent tests against them before merge (`docs/qa/`) |
| D8 | The Curriculum Pack is the import format | Eight tabs (Course, Units, Ideas, Links, Categories, Assessment, Personas, Library), defined field by field in `docs/spec/`. Each field is `sheet`, `app` or `both` (the sheet seeds it, and Teacher Settings can override it per class) |
| D9 | Idea explanations: sheet first, AI fallback | `Ideas.explanation` is optional. If it's empty, Ms. Ivy drafts one from the idea's objective and links. A draft reaches students only after a teacher approves it (and can edit it) in Teacher Settings. Approved text is stored per curriculum, shared by all its classes, and reused on re-import until the sheet supplies its own |
| D10 | Keep the Nocturne design's colours as they are | The design system ships unchanged, and these pairs below WCAG AA are accepted: `.input` border on bg and surface (1.55–1.58:1, needs 3:1); `.card-meta` on surface (4.25:1); `.btn-primary` hover on surface (3.96:1) and active on bg and surface (3.92 and 3.38:1); `.btn-ghost` hover on surface (4.08:1) and active on bg and surface (4.20 and 3.60:1). Text pairs need 4.5:1. No other exceptions: new colours and components must meet AA, and `packages/ui` tests check every button state on both grounds, failing if the set of failing pairs changes |
| D11 | Each class shapes its own library | The curriculum's Library tab sets the shared documents and their default `use_for`. In Teacher Settings, a teacher can, for their class only: change how the AI uses each shared document (`agent`, `tutor`, `both`, or `off` to hide it), and upload their own documents (lab sheets, notes) with their own `use_for`. Atlas and Ms. Ivy search the shared library plus the class's uploads, after the class's settings are applied. Changes never affect other classes on the same curriculum |
| D12 | Missing objectives and questions don't block an import | `Units.objective` and `Assessment.question` may be empty, as the pack spec's "missing" behaviour says. The data checks flag them (warnings), and Atlas can draft a replacement that reaches students only after a teacher approves it, the same flow as D9 explanations. An empty question is never asked by Milo |
| D13 | One built-in persona list | Ms. Ivy, Milo and Atlas are defined once, in `packages/ai`'s persona registry. A pack with no Personas tab stores no personas, which means "use the built-ins", so improvements to the built-ins reach every curriculum. A Personas tab overrides by `persona_id`, and class overrides in Teacher Settings sit on top |
| D14 | Publish preview counts the audience | "Students receiving this update" = unique students enrolled in the selected classes, whether or not their progress changes (user, 2026-10-22, via Codex QA) |
| D15 | AI feedback explains itself, and teachers close the loop | Formative feedback (practice, quizzes, Milo) reaches the student immediately, with its reason and the rubric or key point it rests on, plus a **Challenge this** button that sends the student's objection and the AI's reasoning to the teacher. Summative feedback is approved or edited by the teacher before release. Teacher approvals, edits and challenge rulings are stored as labelled examples per curriculum and question, and are retrieved to ground future feedback. The model is never trained on them: §10's zero-retention, no-training rule stands (user, 2026-10-23) |
| D16 | Fairness audits without per-student demographics | Idea Map stores no per-student race, ethnicity or similar demographics. Routine monitoring compares schools and districts, never student home zip codes, with small groups suppressed (user, 2026-10-23). A periodic racial-disparity audit runs on a random sample of students with the district; open details are in §12 question 11. The metrics are demographic parity difference, disparate impact ratio (flagged below 0.8, used as a monitoring threshold, not a legal test), and teacher-agreement and challenge-upheld rates per group. Before any feedback reaches a student, safeguards act as an independent QA step: rubric grounding, a separate verifier, a tone and reading-level check, routing to the teacher on low confidence or verifier disagreement, and automatic teacher review for a question whose audit drifts past threshold (user, 2026-10-23) |
| D17 | Universal Design for Learning | CAST UDL Guidelines 3.0 are acceptance criteria for every student-facing feature, alongside WCAG 2.1 AA (with D10's exceptions). That means multiple means of engagement, representation (text, read-aloud, visual) and action and expression (typed or spoken answers and challenges), including for AI feedback (user, 2026-10-23) |
| D18 | No Moodle; borrow its tracing design | No Moodle or UBUMonitor integration, and no LTI (D4 unchanged). Moodle's open-source design informs our own tracer (§8): its log-store event shape, its classification of educational level, its privacy-provider pattern (each component declares, exports and deletes its own data) and its analytics indicator and target model. We take ideas and data models only, never code: Moodle is GPLv3 and PHP. We also don't copy its practice of logging IP addresses (COPPA). Any encryption at rest uses AES-256-GCM, never Blowfish (user, 2026-10-23) |
| D19 | What is traced | Learning events only, each with a Moodle-style educational level (D18): idea opened; quiz answered (answer, correct, attempt number); hint requested; feedback shown or challenged; teach-back done; mission completed; teacher feedback approved or edited. Time on task too: idea active time rounded to 30 s per session, and quiz time-to-answer rounded to 5 s. Never recorded: clicks, scrolls, hovers, mouse movement, keystrokes, device, IP address or location (user, 2026-10-23) |
| D20 | What may be inferred | Per-idea mastery (knowledge tracing, 0–100%) and an explainable "may need help" signal shown only to the teacher, always with its reason (for example three wrong attempts after a hint, or stalled on a prerequisite). Both are deterministic tracker rules (D6). Never: risk, dropout or grade prediction; engagement, behaviour or personality scores; clustering; ranking students against each other (user, 2026-10-23) |
| D21 | Who sees traces | Students see their own progress. Teachers see their own classes in full: per-student timeline, mastery, "may need help", challenges, class heatmap. Admins see school and district aggregates plus D16 audit results, and per-student detail only when handling a flag. There is no parent view in the app; parents are informed through the school (user, 2026-10-23) |
| D22 | How long traces are kept | Raw events are kept while the student is enrolled in the district, then deleted when they leave, and on any FERPA delete request. Anonymous class aggregates, with small groups suppressed, may be kept for improving the curriculum. AI transcripts keep §10's 90-day default. Because this is the largest data holding, the D16 audits and §10's data inventory must cover it (user, 2026-10-23) |
| D23 | The sampled race audit is run by the district | For D16's periodic racial-disparity audit, Idea Map sends the district pseudonymous outcomes for a random sample of students (scores, teacher-agreement and challenge-upheld rates). The district joins them with its own records and returns only group aggregates, with small groups suppressed. Idea Map never receives or stores race. The sample size and how often the audit runs are set per district, sized so each group can show a real gap (user, 2026-10-23) |
| D24 | Tracing is on by default, with opt-out | D19's learning-event tracing is on by default under the school's authorisation (§10). A family or the district can opt a student out. An opted-out student keeps using the app and still has mastery, which the app needs to work, but their events are excluded from D16 audits, aggregates and any research (user, 2026-10-23) |
| D25 | Traces may be used for research, with guardrails | Research use is allowed. Coordinator-recorded guardrails, which law requires: de-identified data only, under a written district research agreement (FERPA's studies exception), with small-group suppression and no re-identification. Under COPPA, a school's consent covers only educational use, so any research on identifiable data, or anything beyond the educational purpose for under-13s, needs separate opt-in parental consent. D24 opt-outs are always excluded (user, 2026-10-23) |
| D26 | A local anonymous layer comes before the cloud | The app's anonymous layer runs on the student's device. It extracts identifying entities and replaces them with neutral labels (Person A, Place B, …) before any text leaves the device, so neither our servers nor the model provider receive real names or places. The label-to-name mapping stays on the device, which fills replies back in for the student. The server runs a backstop check (identifier and roster detection), because a modified client could skip the local layer: anything that slips through is blurred before the model call and counted as a privacy miss, and raw text is never stored. This follows the SoulSpeak paper's anonymous layer, which the user will provide (user, 2026-10-23) |
| D27 | Interests stay specific; identifiers don't | Within a conversation, interests are sent specifically (for example "Real Madrid", "a cat called Luna"), so the model can make examples that connect to the student. Names of people and places, contact details and school identifiers are always replaced (D26). Long-term memory (D28) generalises interests to an approved category list (user, 2026-10-23) |
| D28 | Dual memory: short-term conversation, long-term learning summary | Short-term memory is the current conversation, already anonymised. Long-term entity summaries may hold misconceptions, what helped, preferred pace, and up to five interests from the approved category list. They never hold feelings or mood history, family, health, friendships, personality traits, or anything from an A2-flagged conversation. Memory is never used for D20 inferences, D16 audits or D25 research, and never shared across classes (user, 2026-10-23) |
| D29 | Memory lasts while enrolled, and can be seen and deleted | Long-term memory lasts while the student is enrolled, matching D22, and is deleted when they leave or on a FERPA request. The student can see "what Ms. Ivy remembers about me", delete any item and turn memory off. Their teacher can view and delete memory for their class (user, 2026-10-23) |

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

## 8. Interaction tracker and map generation (placeholder)

> **Gate `MD` (2026-10-23): stop before development.** The user will settle further decisions on education data mining and interaction tracing with the coordinator before any of §8 is specified or built. Nothing in §8 is final until `MD` is cleared; see AGENTS.md "Hard stop".

> **Placeholder.** The direction below is agreed. The event catalogue, metric definitions and retention periods still need writing up, and tasks M1–M5 can't be claimed until they are (see §8.6).

Two parts with opposite rules:

| | Interaction tracker | Map generation and AI |
|---|---|---|
| Job | Continuously record what each student does and types, and work out progress and behaviour from it | Decide what the map shows, and create explanations, feedback and questions |
| Deterministic? | **Yes, always.** The same events always give the same numbers | **No need.** It may use heuristics, randomness or a model |
| How it stays trustworthy | Rules are pure and replayable | Whatever it shows a student is saved and recorded as a tracker event |

### 8.1 The tracker: deterministic by design

Every student action and input is recorded as an event in an append-only log. Progress and behaviour metrics are **never edited directly**. They are calculated by replaying events through fixed rules in `packages/tracker`:

```
state = events.reduce(apply, initialState(classConfig, rulesVersion))
```

- **Deterministic:** no `Date.now()`, no randomness, no network and no model calls inside `apply`. Time comes from the events themselves.
- **Continuous:** events stream in as the student works (batched every few seconds, plus on page hide), not only at quiz ends.
- **Traceable:** for any number a teacher sees, the app can list exactly which events produced it.
- **Repairable:** a fixed rule is applied by replaying the events, not by patching stored numbers. Rules carry a `rulesVersion`, so old results can always be reproduced.
- **Fast reads:** the API keeps cached snapshots of the state (`ProgressSnapshot`: state plus last event sequence number) and applies only newer events. Snapshots can be dropped and rebuilt at any time.

### 8.2 What the tracker records (draft)

```ts
type InteractionEvent = {
  id: string;            // client-generated id (ULID), so a resent event is not recorded twice
  studentId: string;     // pseudonymous
  classId: string;
  versionId: string;     // curriculum version the student was on
  seq: number;           // per-student sequence number assigned by the server; replay order
  at: string;            // client time; used for durations, seq decides order
  type: EventType;
  payload: unknown;      // validated per type with zod
};
```

| Area | Behaviour recorded |
|---|---|
| Navigation | `map.shown` (which generated map view, by id), `idea.focused`, `idea.opened`, `link.hovered`, `link.opened`, `zoom.changed`, `locked.clicked` |
| Attention | `session.started`, `session.idle`, `session.resumed`, `page.hidden` |
| Learning | `media.played`, `media.paused`, `media.completed`, `objective.viewed` |
| Quiz | `quiz.started`, `question.shown`, `quiz.answered` (choice, correct, time taken), `quiz.finished`, `review.link_rebuilt` |
| Teach-back | `teachback.started`, `teachback.answered` (mode, text ref), `teachback.judged` (verdict, key points hit) |
| AI | `chat.turn` (persona, text ref), `ai.output_shown` (what the model produced, by id), `chat.flagged` |
| Rewards | `card.revealed`, `mission.opened`, `buddy.reacted` |

Typed inputs (chat, teach-back answers, transcripts) live in a separate `InteractionText` table, referenced by id, with their own redaction and retention rules (§10). Deleting text never breaks a replay.

### 8.3 What the tracker works out (draft)

All of these come from the rules alone. Changing a definition means a new `rulesVersion`.

| Output | Examples |
|---|---|
| Progress | Mastered ideas, unlocked ideas, unit completion, teach-back status |
| Rewards | XP, combo, day streak (in the class time zone), cards earned |
| Behaviour | Time on each idea, attempts per quiz, answer speed, hint and tutor use, retries after review, links explored versus skipped, idle time |
| Signals for teachers | Stalls (repeated failed attempts or long idle time on one idea), guessing (very fast wrong answers), ideas skipped on the way to a unit test |

### 8.4 Map generation and AI: free to vary, always recorded

`generateMap` decides what a student sees: positions, which neighbours to show, blur and lock states, highlighted next steps. It may use the published layout, heuristics, randomness or a model, for example to personalise a path or suggest a next idea. The same goes for AI explanations, quiz wording and Milo's lines.

The rules that keep the tracker trustworthy:
1. **Inputs come from the tracker.** Generation reads the tracker's state (mastered, unlocked, stalls) and never keeps progress of its own.
2. **Outputs are saved, not recomputed.** Each generated map view is stored with an id, and a `map.shown` event points to it. AI output is stored and referenced by `ai.output_shown`. Replaying the tracker reads these records and never calls the generator or the model again.
3. **Judgements become events.** When a model judges a teach-back answer, the verdict is recorded as `teachback.judged`, and the tracker's rules use that recorded verdict.
4. **Safety checks still apply.** Generated maps must respect prerequisites and locks from the tracker state. A check rejects any view that shows a locked idea as open.

### 8.5 Ingest and storage

- `POST /events` takes batches. The server checks each event against its schema, sets `seq`, drops ids it has already recorded, and rejects events from a version the class isn't pinned to (with a grace period after a publish).
- Events go into a Postgres table (`interaction_event`) split into monthly partitions. Generated map views and AI outputs are stored in their own tables, referenced by id. The client keeps an offline queue and resends it.
- Replay and other hot-path reads should bound `recorded_at` (for example, from the time of the student's latest progress snapshot), so Postgres can skip old monthly partitions instead of probing every one.
- Exporting to the education data standards xAPI or Caliper is possible later. It will be designed in, not built now.
- Teacher views (M5) read the tracker: a timeline for each student, and a class heatmap of where students stall.

### 8.6 What must be written up before M tasks can be claimed

1. The final event catalogue and payload fields (M1).
2. Exact definitions of each metric and signal in §8.3: thresholds for "stall" and "guessing", streak day boundaries, combo and XP maths.
3. How teach-back verdicts and quiz retries count towards unit completion.
4. Retention periods for typed text, event metadata, generated maps and AI outputs (feeds F6).

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

### Safety for student-facing personas

- AI feedback follows D15 (reasons, Challenge this, teacher approval for summative) and passes D16's pre-send safeguards before a student sees it.
- Input and output moderation on every student turn.
- Fixed guardrails appended after the teacher's template, so editing a prompt cannot remove them (stay on topic, no personal data requests, age-appropriate language).
- Concerning messages (self-harm, abuse) raise a flag to the teacher and admin, per district policy.
- Rate limits per student and per class.

## 10. K-12 privacy and compliance

| Requirement | Design response |
|---|---|
| COPPA (students under 13) | School-authorised consent model; collect only name, school email and roster ids; no ads, no profiling |
| FERPA | District is the data owner; signed data processing agreement; export and delete on request |
| State laws (e.g. SOPIPA) | No sale or secondary use; vendor list published |
| AI vendors | Use a zero-retention, no-training agreement with the model provider; send no student names to the model (pseudonymous ids) |
| AI transcripts | Stored redacted, retention configurable per district (default 90 days), visible to the class teacher |
| Access | Roles: admin, author, teacher, student. Teachers see only their classes. Every config change and publish is an `AuditEvent` |
| Sign-in | Google Workspace for Education, Clever, ClassLink SSO; rostering by OneRoster CSV import (import-only, matching D4) |
| Security | TLS everywhere, encryption at rest, per-org row-level security in Postgres |
| Accessibility | WCAG 2.1 AA for both apps, except the design-system colour pairs accepted in D10; read-aloud for K–2 later; CAST UDL 3.0 for student-facing features (D17) |

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
6. **Embedding model and width (F4):** `chunk.embedding` is `vector(1024)` (Voyage-sized) so it can carry an HNSW index, which needs a fixed width. Changing models means a migration that re-creates the column and re-indexes the library. Which embedding model do we use?
7. **Deleting a student on request vs append-only events (F4):** FERPA's "delete on request" (§10) conflicts with an append-only `interaction_event` that refuses `DELETE` for every role, and with the foreign keys from events to `app_user`. Typed text already lives apart and can be deleted (§8.2). Proposal for M1 or F6: an owner-only procedure that removes one student's events, generated views and AI outputs (the only path that bypasses the append-only trigger), recorded as an `AuditEvent`.
8. ~~Publish preview affected-student count (C5)~~ **Settled as D14** (user, 2026-10-22): all unique students enrolled in the selected classes.
9. **Sign-in state across API instances (F5):** the sign-in flow's state is single-use per API process (an in-memory set), backed by a 10-minute encrypted cookie and the provider's single-use code. With several API instances, a captured callback could be replayed once on another instance inside that window. Move the used-state set to Postgres (or a shared cache) before running more than one instance? The same goes for the failed-sign-in limit per IP.
10. **Provider tenant claims (F5):** sign-in maps a provider's tenant claim to an org via `sso_tenant`: Google `hd`, Clever `district`, ClassLink `tenant_id`. The Clever and ClassLink claim names are unverified until open question 3 picks the providers; each is a setting (`IDEAMAP_SSO_<ID>_TENANT_CLAIM`).
11. **Education data mining and tracing (gate MD).** Settled: D15–D25. Next for the user: the privacy module (NER) and the dual-memory design (see question 12). The gate stays closed until the user clears it.
12. **Privacy module and dual memory.** Settled as D26–D29. Still open: check the design against the SoulSpeak paper once the user shares it; on-device NER model choice and its accuracy on children's writing (nicknames, misspellings); whether the device may receive a class roster for name matching, which would expose classmates' names to every student device. Gate MD stays closed until the user clears it.