# Idea Map — Architecture

Status: draft v0.1 · 2026-10-22; decisions D1–D30 settled (latest D30, 2026-10-24)
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
| D30 | Feedback teaching events name the teacher, pseudonymously | `feedback.ruled`, `teacher.feedback.approved` and `teacher.feedback.edited` carry the acting teacher's pseudonymous id (never a name or email). It is extra information, not a core field: it lets D15's labelled examples weigh each teacher's contributions equally, so a teacher who rules or edits often does not outweigh one who gives a single strong example. Teacher ids are never shown to students (user, 2026-10-24) |

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
| **May need help** (teacher only, D21) | Raised with its reason when either (a) 3 wrong answers on an idea's questions after a `hint.requested` on that idea, or (b) an unlocked idea that is a prerequisite of the student's next mission has no pass for 5 school days. Cleared by a later pass |

**Never computed (D20):** risk, dropout or grade predictions; engagement, behaviour or personality scores; clustering; rankings between students. `idea.active_time` and `secondsToAnswer` are shown to the teacher as plain durations, never scored.

**Opt-out (D24):** an opted-out student still gets every output above, because the app needs them, but their events are excluded from D16 audits, aggregates and D25 research.

### 8.4 Map generation and AI: free to vary, always recorded

`generateMap` decides what a student sees: positions, which neighbours to show, blur and lock states, and highlighted next steps. It may use heuristics, randomness or a model. The same goes for AI explanations, quiz wording, feedback and Milo's lines.

1. **Inputs come from the tracker.** Generation reads tracker state and never keeps progress of its own.
2. **Outputs are saved, not recomputed.** Each generated map view and AI output is stored with an id, and `map.shown` or `ai.output_shown` points to it.
3. **Judgements become events.** A model's teach-back verdict is recorded as `teachback.judged`, and the rules use the recorded verdict.
4. **Safety checks still apply.** A generated view that shows a locked idea as open is rejected.

### 8.5 Ingest and storage

- `POST /events` takes batches. The server validates each event against its schema, sets `seq` and `level`, drops ids it already has, and rejects events from a version the class isn't pinned to (with a grace period after a publish) and any event type outside §8.2.
- Events go in `interaction_event` (monthly partitions, F4). Hot-path reads bound `recorded_at` from the latest snapshot.
- The client batches events every few seconds and on page hide, with an offline queue (as for F5 autosave).
- **Retention (D22):** raw events are kept while the student is enrolled in the district, and deleted on unenrolment and on a FERPA delete (F6). Anonymous class aggregates (small groups suppressed) may be kept. `InteractionText` and AI transcripts keep the 90-day default (§10). Generated map views and AI outputs referenced by events are kept as long as those events are. F6 set the baseline in `docs/privacy/data-inventory.md`: typed text and AI transcripts 90 days by default, configurable per district; events, generated maps and AI outputs kept while the student's account exists and pseudonymised by a FERPA delete. M1 may revise these.
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
6. **Embedding model and width (F4):** `chunk.embedding` is `vector(1024)` (Voyage-sized) so it can carry an HNSW index, which needs a fixed width. Changing models means a migration that re-creates the column and re-indexes the library. Which embedding model do we use?
7. **Deleting a student on request vs append-only events (F4):** FERPA's "delete on request" (§10) conflicts with an append-only `interaction_event` that refuses `DELETE` for every role, and with the foreign keys from events to `app_user`. Typed text already lives apart and can be deleted (§8.2). Proposal for M1 or F6: an owner-only procedure that removes one student's events, generated views and AI outputs (the only path that bypasses the append-only trigger), recorded as an `AuditEvent`. **F6 took the other path:** a delete removes the student's name, email, roster ids, typed text and AI transcripts, and keeps events, map views and AI outputs under the pseudonymous id, which then leads to no one. Append-only stays absolute. If a district's DPA requires removing events too, the owner-only procedure above is still the way to add it.
8. ~~Publish preview affected-student count (C5)~~ **Settled as D14** (user, 2026-10-22): all unique students enrolled in the selected classes.
9. **Sign-in state across API instances (F5):** the sign-in flow's state is single-use per API process (an in-memory set), backed by a 10-minute encrypted cookie and the provider's single-use code. With several API instances, a captured callback could be replayed once on another instance inside that window. Move the used-state set to Postgres (or a shared cache) before running more than one instance? The same goes for the failed-sign-in limit per IP.
10. **Provider tenant claims (F5):** sign-in maps a provider's tenant claim to an org via `sso_tenant`: Google `hd`, Clever `district`, ClassLink `tenant_id`. The Clever and ClassLink claim names are unverified until open question 3 picks the providers; each is a setting (`IDEAMAP_SSO_<ID>_TENANT_CLAIM`).
11. ~~Education data mining and tracing (gate MD)~~ **Settled as D15–D29; gate cleared by the user on 2026-10-23.** §8 is spec v1.
12. **Privacy module and dual memory.** Settled as D26–D29. Still open: check the design against the SoulSpeak paper once the user shares it; on-device NER model choice and its accuracy on children's writing (nicknames, misspellings); whether the device may receive a class roster for name matching, which would expose classmates' names to every student device. **A7 built behind `EntityRecognizer` (`packages/ai/src/entities.ts`) and assumed, not settled:** (a) the device layer is rules plus small word lists (pattern rules for contacts, addresses and schools; a given-name and place list; title, relation and "live in" cues), with no model to download, so on-device accuracy on nicknames and misspellings is limited to one-edit slips of listed names; a real NER model plugs into the same interface; (b) the device never receives the roster (A7-S2), so it cannot know a classmate by name; the server backstop is what catches roster names, which it knows, plus the same rules for everyone else. Both pieces stay open until the user chooses a model and decides about the roster.
