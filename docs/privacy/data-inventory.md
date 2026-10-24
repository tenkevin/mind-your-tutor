# Idea Map data inventory

Status: v1 · 2026-10-23 · task F6
Covers: every table and column in the Idea Map database (migrations 0001 to 0015), plus export files.
Sources: `docs/ARCHITECTURE.md` §8.2, §8.6, §10, D9, D11.
Kept honest by a test: `packages/db/src/inventory.test.ts` fails if the database has a column this document doesn't list, or this document lists one the database doesn't have.

## Summary for a district privacy officer

This summary is written so it can be checked against a data processing agreement (DPA).

**Who owns the data.** The district (an "organization" in Idea Map) owns every record about its staff and students (FERPA, §10). Each district's records are kept apart in the database by row-level security: a request acting for one district cannot read or change another district's rows.

**What we collect about students.**

| We collect | We do not collect |
|---|---|
| Name, school email (optional), and roster ids from the district's sign-in or roster (Google, Clever, ClassLink, OneRoster) | Date of birth, address, phone, photos, parent details, free-form profile fields |
| Which classes the student is in | Location, device fingerprints, advertising ids |
| What the student does in the app: ideas opened, quiz answers, time on task (tracker events) | Anything for advertising or profiling (COPPA, SOPIPA) |
| What the student types: chat with the AI tutor, teach-back answers | Student names or emails in AI prompts (the AI sees a random id only) |
| The AI conversations the student had, stored redacted |  |

**Pseudonymous ids.** Everywhere except the account record itself, a student is a random id (a UUID). Names and emails live in one table (`app_user`) only.

**How long we keep it.** Each district can change these periods. A record is kept for the stated number of whole days and deleted once it is older: with 90 days, text written 90 days ago is still there, and it is gone once it is 91 days old. The retention job runs daily.

| Data | Default | District setting | Deleted by |
|---|---|---|---|
| Typed student text (chat, teach-back answers, challenges, transcripts) | 90 days | `organization.text_retention_days` (1 to 3650) | Retention job, daily |
| AI transcripts (model requests and responses) | 90 days | `organization.ai_retention_days` (1 to 3650) | Retention job, daily |
| Export files (student records, reports) | 7 days | `organization.export_retention_days` (1 to 365) | Retention job, daily |
| Sign-in sessions (when and through which provider a user signed in) | 30 days after the session expires or is revoked | `organization.session_retention_days` (1 to 365) | Retention job, daily; a FERPA delete removes a student's at once |
| Tracker events, generated map views, AI output shown to students | While the student is enrolled in the district (D22) | — | Deleted when the student leaves the district and on a FERPA delete; removed with the district at contract end |
| Accounts (name, email, roster ids) | While the district keeps the user | — | FERPA delete, or the district removing the user |
| Audit log | For the length of the agreement | — | Never edited or deleted by the app; removed with the district at contract end |
| Curriculum and class settings (no student data) | For the length of the agreement | — | Teachers and authors in the app; with the district at contract end |

**FERPA requests.** An admin of the district can, for one student:

- **Export**: one JSON file with every record held about the student (account, classes, events, typed text, map views, AI output, AI transcripts, progress, sign-in sessions without their token hashes). The file expires after the export period (7 days by default).
- **Delete**: removes the student's name, email and roster ids, everything they typed, their AI transcripts, their tracker events with the map views and AI output those point to (D22), their progress cache, class memberships and tracing opt-out, their sign-in sessions (signing them out everywhere), and any export file that could hold their name. Anonymous class aggregates, with small groups suppressed, are not about any one student and stay. The account keeps only its random id, so nothing left leads to a person. The deletion is recorded in the audit log with the random id only.
- **Left the district** (D22): when a student leaves, the admin records it and everything the delete above removes goes the same way, audited as an unenrolment.

**Tracing opt-out (D24).** A district admin can opt a student out of tracing, for the district or for a family, and back in; each change is audited. The student keeps using the app and keeps their progress, which it needs. Events recorded while they are opted out carry a mark, and fairness audits, aggregates and research leave out every event with it.

**Privacy misses (D26).** Typed text is anonymised on the student's device before it is sent. The server checks again for real roster names and contact details; anything found is removed before the text is stored, and counted (a number per text, never the text or the name).

Teachers, students, and admins of other districts can't make these requests.

**AI providers.** Model calls go through Idea Map's server only. Prompts carry pseudonymous ids, never names or emails (§10). The provider agreement must be zero-retention and no-training. Transcripts we keep are redacted and follow the AI transcript period above.

**Audit.** Every change to class settings (course details, due dates, persona prompts, card rarity), curriculum defaults, approved AI explanations, class library choices and uploads, district retention settings, and every publish, is written to an append-only audit log: who, which district, what, before and after values, and when. Values that look like secrets (passwords, API keys, tokens, credentials) are logged as changed, with the value replaced by `[redacted]`. Exports and deletions of student records are audited too.

**Backups.** Deleted data can remain in database backups until those backups expire. Backups and point-in-time recovery are kept for **35 days**, so anything deleted (by the retention job or a FERPA delete) is gone from every backup within 35 days. If a backup is ever restored, the retention job runs before the restored database serves requests, and every `student.deleted` audit entry since the backup was taken is applied again (deletion is safe to repeat), so restored data never brings a deleted student back. The hosting provider and region are still open (ARCHITECTURE.md §12, question 5); the 35-day backup window is a requirement on that choice and a term to confirm in the DPA.

**End of contract.** When a district's agreement ends, all of its rows and files are deleted on the district's written request, and age out of backups within 35 days. This is an operator procedure today, not an in-app button.

## How to read the tables

One table per data area. Each row is one column of the database (or a group of columns with the same answers), named `table.column`.

- **Student personal data?** _Identifying_: names or contact details. _Student record_: about one student, linked to them by their pseudonymous id. _Staff_: identifies a staff member. _No_: not about a person.
- **Comes from**: _Roster_ (the district's sign-in or roster file), _Student_ (what the student does or types), _Staff_ (a teacher, author or admin in the app), _Sheet_ (the curriculum file a teacher imports), _AI_ (generated by a model), _System_ (made by Idea Map).
- **Who can see it**: who the app shows it to. The database itself enforces the district boundary (row-level security) and, for class uploads, the class boundary (D11). Roles within a district are enforced by the API (§10: teachers see only their classes).
- **Kept for** and **How it is deleted**: as in the summary. "With the district" means removed at contract end.

Every table also has keys and timestamps (`id`, `org_id`, `created_at`, `updated_at` and the like), grouped in one row per table.

## Districts and people

| Field | What it is for | Student personal data? | Comes from | Who can see it | Kept for | How it is deleted |
|---|---|---|---|---|---|---|
| `organization.id`, `organization.created_at`, `organization.updated_at` | The district's record key and timestamps | No | System | Everyone in the district | Length of the agreement | With the district |
| `organization.name` | The district or school name | No | Staff | Everyone in the district | Length of the agreement | With the district |
| `organization.text_retention_days`, `organization.ai_retention_days`, `organization.export_retention_days`, `organization.session_retention_days` | The district's retention periods for typed text, AI transcripts, export files and ended sign-in sessions | No | Staff (admin) | Admins | Length of the agreement | With the district |
| `app_user.id` | The user's random id. For students this is the pseudonymous id used everywhere else | Student record | System | Staff in the district | While the user exists, then kept with no personal data after a FERPA delete so events stay consistent | With the district |
| `app_user.org_id`, `app_user.role`, `app_user.created_at`, `app_user.updated_at` | Which district the user belongs to, their role (admin, author, teacher, student), and timestamps | No | Roster | Staff in the district | While the user exists | With the district |
| `app_user.name` | The user's name, shown to their teachers and admins | Identifying | Roster | The user; their teachers; admins | While the user exists | FERPA delete replaces it with "Removed student"; the district removing the user |
| `app_user.email` | School email for sign-in and contact; optional for young students | Identifying | Roster | The user; their teachers; admins | While the user exists | FERPA delete clears it |
| `app_user.sso_provider`, `app_user.sso_subject` | Which sign-in provider (Google, Clever, ClassLink) and the user's id there | Identifying | Roster | Admins | While the user exists | FERPA delete clears them |
| `app_user.roster_source_id` | The id from the district's OneRoster file, to match re-imports | Identifying | Roster | Admins | While the user exists | FERPA delete clears it |
| `enrollment.class_id`, `enrollment.student_id`, `enrollment.org_id`, `enrollment.created_at` | Which students are in which class, and since when | Student record | Roster or Staff | The class's teacher; admins; the student | While the student is in the class | FERPA delete; removing the student from the class |

## Sign-in

Sessions are how a signed-in browser stays signed in (task F5). The browser holds a random token; the database keeps only its SHA-256 hash.

| Field | What it is for | Student personal data? | Comes from | Who can see it | Kept for | How it is deleted |
|---|---|---|---|---|---|---|
| `auth_session.id`, `auth_session.org_id`, `auth_session.user_id` | The session's key, district, and the user it signs in | Student record | System | Admins | While active, then `session_retention_days` (default 30) after it expires or is revoked | Retention job; FERPA delete removes a student's sessions at once (signing them out) |
| `auth_session.token_hash` | The hash of the sign-in cookie's token, to recognize the browser. A credential, so it is left out of student exports | No | System | Nobody (compared, never shown) | As the session | As the session |
| `auth_session.provider`, `auth_session.created_at`, `auth_session.last_seen_at`, `auth_session.expires_at`, `auth_session.revoked_at` | Which sign-in provider was used, when the session started, was last used, expires, and was ended | Student record | System | Admins | As the session | As the session |
| `sso_tenant.provider`, `sso_tenant.tenant`, `sso_tenant.org_id`, `sso_tenant.created_at` | Which district a sign-in provider's tenant (a Google Workspace domain, a Clever district) belongs to | No | Staff (operator) | Operators; admins see their own district's | Length of the agreement | With the district |

## Curriculum (no student data)

| Field | What it is for | Student personal data? | Comes from | Who can see it | Kept for | How it is deleted |
|---|---|---|---|---|---|---|
| `curriculum.id`, `curriculum.org_id`, `curriculum.created_at`, `curriculum.updated_at` | Record key and timestamps | No | System | Staff in the district | Length of the agreement | With the district |
| `curriculum.title` | The curriculum's name | No | Staff | Staff; students in its classes | Length of the agreement | With the district |
| `curriculum.created_by` | The staff member who created it | Staff | System | Staff in the district | Length of the agreement | With the district |
| `curriculum_version.id`, `curriculum_version.org_id`, `curriculum_version.curriculum_id`, `curriculum_version.number`, `curriculum_version.created_at` | Record keys, version number and timestamp | No | System | Staff in the district | Length of the agreement | With the district (published versions can't be deleted, D2) |
| `curriculum_version.status`, `curriculum_version.published_at` | Draft, published or archived, and when it was published | No | Staff | Staff in the district | Length of the agreement | With the district |
| `curriculum_version.pack` | The imported curriculum: ideas, links, units, categories, assessment, personas, library list | No | Sheet | Staff; students see the published parts | Length of the agreement | With the district |
| `curriculum_version.derived` | Map layout, link ranking and quiz bank worked out from the pack | No | System | Staff; students see what the map shows | Length of the agreement | With the district |
| `curriculum_version.issues` | Data-check findings from the import | No | System | Staff | Length of the agreement | With the district |
| `curriculum_version.source` | Which file was imported, its checksum and column mapping | No | Staff | Staff | Length of the agreement | With the district |
| `curriculum_version.created_by` | The staff member who imported it | Staff | System | Staff in the district | Length of the agreement | With the district |
| `curriculum_defaults.curriculum_id`, `curriculum_defaults.org_id`, `curriculum_defaults.updated_at` | Record keys and timestamp | No | System | Staff in the district | Length of the agreement | With the district |
| `curriculum_defaults.config` | Curriculum-wide settings: course details, persona prompts, rarity | No | Staff | Staff; students see the result | Length of the agreement | Changed by staff (audited); with the district |
| `curriculum_defaults.column_mapping` | How spreadsheet columns map to fields for the next import | No | Staff | Staff | Length of the agreement | Changed by staff (audited); with the district |
| `curriculum_defaults.updated_by` | Who last changed the defaults | Staff | System | Staff in the district | Length of the agreement | With the district |
| `approved_explanation.curriculum_id`, `approved_explanation.idea_id`, `approved_explanation.org_id` | Which idea of which curriculum the explanation is for | No | System | Staff | Length of the agreement | With the district |
| `approved_explanation.text`, `approved_explanation.source` | A teacher-approved explanation of an idea (D9), and whether it came from the sheet or an AI draft | No | Staff or AI | Staff; students | Length of the agreement | Withdrawn by staff (audited); with the district |
| `approved_explanation.approved_by`, `approved_explanation.approved_at` | Who approved it, and when | Staff | Staff | Staff in the district | Length of the agreement | With the district |
| `library_doc.id`, `library_doc.org_id`, `library_doc.curriculum_id`, `library_doc.created_at`, `library_doc.updated_at` | Record keys and timestamps | No | System | Staff | Length of the agreement | With the district |
| `library_doc.title`, `library_doc.file_url`, `library_doc.use_for` | A shared reference document from the Library tab, and which AI persona may use it | No | Sheet | Staff | Length of the agreement | Removed on re-import; with the district |
| `library_doc.checksum`, `library_doc.index_status`, `library_doc.indexed_at` | Indexing state of the document | No | System | Staff | Length of the agreement | With the document |
| `chunk.id`, `chunk.org_id`, `chunk.curriculum_id`, `chunk.library_doc_id`, `chunk.ordinal`, `chunk.created_at` | Record keys and position of a passage in its document | No | System | Nobody directly (used by AI search) | As its document | With its document |
| `chunk.content`, `chunk.embedding` | A passage of a shared document and its search vector, for AI answers | No | Sheet | Nobody directly; quoted by the AI | As its document | With its document |

## Classes and class settings

| Field | What it is for | Student personal data? | Comes from | Who can see it | Kept for | How it is deleted |
|---|---|---|---|---|---|---|
| `class.id`, `class.org_id`, `class.curriculum_id`, `class.created_at`, `class.updated_at` | Record keys and timestamps | No | System | The class's teacher and students; admins | Length of the agreement | With the district |
| `class.name`, `class.time_zone` | The class's name, and its time zone for day streaks | No | Staff | The class's teacher and students; admins | Length of the agreement | Changed by staff (audited); with the district |
| `class.pinned_version_id` | The published curriculum version the class's students see | No | Staff | The class's teacher; admins | Length of the agreement | Changed on publish or rollback (audited) |
| `class.roster_source_id` | The class's id in the district's OneRoster file, to match re-imports | No | Roster | Admins | Length of the agreement | With the district |
| `class.teacher_id` | The class's teacher | Staff | Staff | The class's teacher and students; admins | Length of the agreement | With the district |
| `class_config.class_id`, `class_config.org_id`, `class_config.updated_at` | Record keys and timestamp | No | System | The class's teacher; admins | Length of the agreement | With the class |
| `class_config.config` | The class's own settings: course details, pass mark, due dates, persona prompts, card rarity | No | Staff | The class's teacher; admins; students see the result | Length of the agreement | Changed by the teacher (audited); with the class |
| `class_config.updated_by` | Who last changed the settings | Staff | System | The class's teacher; admins | Length of the agreement | With the class |
| `class_library_setting.class_id`, `class_library_setting.library_doc_id`, `class_library_setting.org_id`, `class_library_setting.curriculum_id`, `class_library_setting.updated_at` | Which shared document of which class the setting is for | No | System | The class's teacher; admins | Length of the agreement | With the class |
| `class_library_setting.use_for` | How this class's AI may use a shared document, or `off` to hide it (D11) | No | Staff | The class's teacher; admins | Length of the agreement | Changed by the teacher (audited); with the class |
| `class_library_setting.updated_by` | Who changed it | Staff | System | The class's teacher; admins | Length of the agreement | With the class |
| `class_library_doc.id`, `class_library_doc.org_id`, `class_library_doc.class_id`, `class_library_doc.created_at`, `class_library_doc.updated_at` | Record keys and timestamps | No | System | The class's teacher (only inside that class, D11) | Length of the agreement | With the class |
| `class_library_doc.title`, `class_library_doc.file_url`, `class_library_doc.use_for` | A document the teacher uploaded for their class only, and how the AI may use it | No | Staff | The class's teacher (only inside that class) | Until the teacher removes it | Removed by the teacher (audited); with the class |
| `class_library_doc.checksum`, `class_library_doc.index_status`, `class_library_doc.indexed_at` | Indexing state | No | System | The class's teacher | As the document | With the document |
| `class_library_doc.uploaded_by` | Who uploaded it | Staff | System | The class's teacher | As the document | With the document |
| `class_chunk.id`, `class_chunk.org_id`, `class_chunk.class_id`, `class_chunk.class_library_doc_id`, `class_chunk.ordinal`, `class_chunk.created_at` | Record keys and position of a passage | No | System | Nobody directly (used by AI search for that class) | As its document | With its document |
| `class_chunk.content`, `class_chunk.embedding` | A passage of a class upload and its search vector | No | Staff | Nobody directly; quoted by that class's AI | As its document | With its document |

Teachers should not upload documents that contain student information; uploads are reference material such as lab sheets.

## Student activity (the tracker)

These rows are the source of truth for progress (§8). They are append-only: nothing in the app can edit them, and the only deletion is a district admin's FERPA delete or unenrolment of one student (D22), through one database function. They hold the pseudonymous id, never a name or anything the student typed.

| Field | What it is for | Student personal data? | Comes from | Who can see it | Kept for | How it is deleted |
|---|---|---|---|---|---|---|
| `interaction_event.id`, `interaction_event.org_id`, `interaction_event.seq`, `interaction_event.recorded_at` | Event id (to drop resends), district, the student's sequence number and when it was stored | Student record | System | The class's teacher; admins; the student (as progress) | While the student is enrolled in the district (D22) | Unenrolment from the district; FERPA delete; with the district |
| `interaction_event.student_id`, `interaction_event.class_id`, `interaction_event.version_id` | Which student (random id), class and curriculum version | Student record | System | As above | As above | As above |
| `interaction_event.at`, `interaction_event.type` | When and what the student did, for example opened an idea or answered a quiz question | Student record | Student | As above | As above | As above |
| `interaction_event.payload` | Details of the action (which idea, which answer). Typed text is never here, only a reference to it | Student record | Student | As above | As above | As above; referenced text is deleted separately and shows as "removed" |
| `interaction_event.level` | The event's educational level (participating, teaching or other), fixed by its type (§8.1) | Student record | System | As above | As above | As above |
| `interaction_event.tracing_opted_out` | The student was opted out of tracing (D24) when the event was stored; audits, aggregates and research leave these events out | Student record | System | The class's teacher; admins | As above | As above |
| `tracing_opt_out.student_id`, `tracing_opt_out.org_id`, `tracing_opt_out.opted_out_at`, `tracing_opt_out.set_by` | A student the district opted out of tracing (D24), when, and which admin recorded it | Student record | Staff | Admins | While opted out | Opting back in; unenrolment; FERPA delete; with the district |
| `interaction_event_key.id`, `interaction_event_key.org_id`, `interaction_event_key.student_id`, `interaction_event_key.seq`, `interaction_event_key.recorded_at` | A copy of each event's keys, to keep ids and sequence numbers unique | Student record | System | Nobody directly | As the event | As the event |
| `generated_map_view.id`, `generated_map_view.org_id`, `generated_map_view.class_id`, `generated_map_view.student_id`, `generated_map_view.version_id`, `generated_map_view.created_at` | Record keys of a map the student was shown | Student record | System | The class's teacher; admins | As the student's events | As the student's events |
| `generated_map_view.generator`, `generated_map_view.view` | Which generator made the map, and the map itself (positions, locks), stored so replays never regenerate it (§8.4) | Student record | System | As above | As above | As above |
| `ai_output.id`, `ai_output.org_id`, `ai_output.class_id`, `ai_output.student_id`, `ai_output.version_id`, `ai_output.created_at` | Record keys of something the AI showed a student | Student record | System | The class's teacher; admins; the student | As the student's events | As the student's events |
| `ai_output.persona`, `ai_output.kind`, `ai_output.content`, `ai_output.model` | Which persona and model, what kind (explanation, feedback, question) and what it said | Student record | AI | As above | As above | As above |
| `progress_snapshot.class_id`, `progress_snapshot.student_id`, `progress_snapshot.org_id`, `progress_snapshot.rules_version`, `progress_snapshot.updated_at` | Keys of a cached progress summary | Student record | System | The class's teacher; admins; the student | Until rebuilt | FERPA delete; can be dropped and rebuilt from events at any time |
| `progress_snapshot.state`, `progress_snapshot.last_seq` | The cached progress (mastered ideas, XP) and the last event it includes | Student record | System | As above | As above | As above |

## Student text and AI transcripts

The only places that hold what a student wrote, and what the AI said in a conversation. Both follow the district's retention periods.

| Field | What it is for | Student personal data? | Comes from | Who can see it | Kept for | How it is deleted |
|---|---|---|---|---|---|---|
| `interaction_text.id`, `interaction_text.org_id`, `interaction_text.class_id`, `interaction_text.student_id`, `interaction_text.created_at` | Keys of a piece of typed text, and when it was written | Student record | System | The class's teacher; admins; the student | `text_retention_days` (default 90) | Retention job; FERPA delete |
| `interaction_text.kind`, `interaction_text.body` | What the student typed: a chat turn, a teach-back answer, a challenge to feedback or a transcript, anonymised on the device and checked again by the server before storage (D26) | Student record | Student | The class's teacher; admins; the student | `text_retention_days` (default 90) | Retention job; FERPA delete |
| `interaction_text.redacted_at` | When personal details were redacted from the text | No | System | The class's teacher; admins | As the text | As the text |
| `privacy_miss.id`, `privacy_miss.org_id`, `privacy_miss.class_id`, `privacy_miss.source`, `privacy_miss.names`, `privacy_miss.emails`, `privacy_miss.phones`, `privacy_miss.created_at` | How many real names, emails and phone numbers the server's check removed from one typed text that the device should already have anonymised (D26). Counts only: no text, name or student | No | System | Admins | Length of the agreement | With the class or the district |
| `ai_interaction.id`, `ai_interaction.org_id`, `ai_interaction.class_id`, `ai_interaction.user_id`, `ai_interaction.created_at` | Keys of one AI call: which class and user (random id), and when | Student record | System | The class's teacher; admins | `ai_retention_days` (default 90) | Retention job; FERPA delete |
| `ai_interaction.persona`, `ai_interaction.model` | Which persona and model answered | No | System | The class's teacher; admins | As the transcript | As the transcript |
| `ai_interaction.request`, `ai_interaction.response` | The redacted conversation sent to and received from the model; pseudonymous ids only, no names | Student record | Student and AI | The class's teacher; admins | `ai_retention_days` (default 90) | Retention job; FERPA delete |
| `ai_interaction.flagged` | Whether moderation flagged the turn for the teacher | Student record | System | The class's teacher; admins | As the transcript | As the transcript |
| `ai_interaction.input_tokens`, `ai_interaction.output_tokens`, `ai_interaction.redacted_at` | Usage counts for rate limits and cost, and when the transcript was redacted | No | System | Admins | As the transcript | As the transcript |

## Imports and exports

| Field | What it is for | Student personal data? | Comes from | Who can see it | Kept for | How it is deleted |
|---|---|---|---|---|---|---|
| `import_job.id`, `import_job.org_id`, `import_job.curriculum_id`, `import_job.version_id`, `import_job.created_at`, `import_job.started_at`, `import_job.finished_at`, `import_job.updated_at` | Keys and timing of a curriculum import | No | System | Staff | Length of the agreement | With the district |
| `import_job.status`, `import_job.source`, `import_job.error` | The imported file's reference and mapping, and how the import went | No | Staff | Staff | Length of the agreement | With the district |
| `import_job.created_by` | Who started it | Staff | System | Staff | Length of the agreement | With the district |
| `import_job.steps` | Progress through the import pipeline shown in Teacher Settings (parse, map, check, derive) | No | System | Staff | Length of the agreement | With the district |
| `import_job.idempotency_key` | The upload's idempotency key, so the same upload sent twice makes one job | No | System | Staff | Length of the agreement | With the district |
| `export_job.id`, `export_job.org_id`, `export_job.kind`, `export_job.curriculum_id`, `export_job.class_id`, `export_job.status`, `export_job.created_at`, `export_job.finished_at`, `export_job.updated_at` | Keys, kind and timing of an export (curriculum reports, class progress, FERPA student records) | No | System | The staff member who asked; admins | Length of the agreement | With the district |
| `export_job.params` | What was exported; for a student record, the student's random id | Student record | Staff | As above | Length of the agreement | With the district |
| `export_job.result_ref`, `export_job.error` | Where the export file is stored, and any error | No | System | As above | Cleared when the file is deleted | Retention job after `export_retention_days` (default 7); FERPA delete for that student's files |
| `export_job.created_by` | Who asked for it | Staff | System | As above | Length of the agreement | With the district |
| `export_subject.export_job_id`, `export_subject.student_id`, `export_subject.org_id` | Which students an export file holds, recorded when the export is made, so deleting a student finds every file that names them even after they leave the class. Ids only | Student record | System | Admins | Length of the agreement | With the district |
| Export files (outside the database, at `result_ref`) | Student record exports hold the student's name, email and everything above; class progress exports list students by name | Identifying | System | The admin or teacher who asked | `export_retention_days` (default 7) | Retention job; a FERPA delete removes at once every file recorded in `export_subject` as holding the student, and any student-naming file whose contents were never recorded |

## Audit log

Append-only: the database refuses every update, delete and truncate, for every role. It records staff actions on settings, not student activity.

| Field | What it is for | Student personal data? | Comes from | Who can see it | Kept for | How it is deleted |
|---|---|---|---|---|---|---|
| `audit_event.id`, `audit_event.org_id`, `audit_event.at` | Entry key, district and time | No | System | Admins; a class's teacher sees their class's history | Length of the agreement | With the district |
| `audit_event.actor_id` | Who made the change | Staff | System | As above | Length of the agreement | With the district |
| `audit_event.action`, `audit_event.target_type`, `audit_event.target_id`, `audit_event.class_id`, `audit_event.curriculum_id` | What happened, to which record, and the class and curriculum it belongs to. For `student.exported` and `student.deleted`, the target is the student's random id | Student record | System | As above | Length of the agreement | With the district |
| `audit_event.before`, `audit_event.after`, `audit_event.detail` | The changed fields' old and new values, and which fields changed. Secrets are replaced by `[redacted]`. Never names or emails | No | Staff | As above | Length of the agreement | With the district |

## System tables

These hold no student data. They support database migrations and the background job queue.

| Field | What it is for | Student personal data? | Comes from | Who can see it | Kept for | How it is deleted |
|---|---|---|---|---|---|---|
| `kysely_migration.name`, `kysely_migration.timestamp`, `kysely_migration_lock.id`, `kysely_migration_lock.is_locked` | Which database migrations have run | No | System | Operators only | Permanently | Not needed |
| `pgboss.job.id`, `pgboss.job.name`, `pgboss.job.priority`, `pgboss.job.data`, `pgboss.job.state`, `pgboss.job.retry_limit`, `pgboss.job.retry_count`, `pgboss.job.retry_delay`, `pgboss.job.retry_backoff`, `pgboss.job.retry_delay_max`, `pgboss.job.expire_seconds`, `pgboss.job.deletion_seconds`, `pgboss.job.singleton_key`, `pgboss.job.singleton_on`, `pgboss.job.group_id`, `pgboss.job.group_tier`, `pgboss.job.start_after`, `pgboss.job.created_on`, `pgboss.job.started_on`, `pgboss.job.completed_on`, `pgboss.job.keep_until`, `pgboss.job.output`, `pgboss.job.dead_letter`, `pgboss.job.policy`, `pgboss.job.heartbeat_on`, `pgboss.job.heartbeat_seconds`, `pgboss.job.blocked`, `pgboss.job.blocking`, `pgboss.job.pending_dependencies`, `pgboss.job.source_name`, `pgboss.job.source_id`, `pgboss.job.source_created_on`, `pgboss.job.source_retry_count`, `pgboss.job.source_output`, `pgboss.job.source_root_id`, `pgboss.job.trace_context`, `pgboss.job.upsert_by_key` | Background jobs (imports, indexing, exports, retention). Job data carries record ids only, never names or text | No | System | Operators only | Until done, then pg-boss's cleanup (7 days by default) | pg-boss maintenance |
| `pgboss.job_dependency.child_name`, `pgboss.job_dependency.child_id`, `pgboss.job_dependency.parent_name`, `pgboss.job_dependency.parent_id` | Order between jobs | No | System | Operators only | As the jobs | pg-boss maintenance |
| `pgboss.queue.name`, `pgboss.queue.policy`, `pgboss.queue.retry_limit`, `pgboss.queue.retry_delay`, `pgboss.queue.retry_backoff`, `pgboss.queue.retry_delay_max`, `pgboss.queue.expire_seconds`, `pgboss.queue.retention_seconds`, `pgboss.queue.deletion_seconds`, `pgboss.queue.dead_letter`, `pgboss.queue.partition`, `pgboss.queue.table_name`, `pgboss.queue.deferred_count`, `pgboss.queue.blocked_count`, `pgboss.queue.queued_count`, `pgboss.queue.ready_count`, `pgboss.queue.warning_queued`, `pgboss.queue.active_count`, `pgboss.queue.failed_count`, `pgboss.queue.total_count`, `pgboss.queue.retained_count`, `pgboss.queue.retained_on`, `pgboss.queue.created_delta`, `pgboss.queue.completed_delta`, `pgboss.queue.failed_delta`, `pgboss.queue.delta_on`, `pgboss.queue.delta_seconds`, `pgboss.queue.wait_bins`, `pgboss.queue.run_bins`, `pgboss.queue.ready_oldest_seconds`, `pgboss.queue.ready_history`, `pgboss.queue.heartbeat_seconds`, `pgboss.queue.notify`, `pgboss.queue.singletons_active`, `pgboss.queue.monitor_claim_on`, `pgboss.queue.monitor_on`, `pgboss.queue.maintain_on`, `pgboss.queue.created_on`, `pgboss.queue.updated_on` | Queue settings and counts | No | System | Operators only | Permanently | Not needed |
| `pgboss.queue_stats.id`, `pgboss.queue_stats.name`, `pgboss.queue_stats.deferred_count`, `pgboss.queue_stats.queued_count`, `pgboss.queue_stats.ready_count`, `pgboss.queue_stats.active_count`, `pgboss.queue_stats.failed_count`, `pgboss.queue_stats.total_count`, `pgboss.queue_stats.created_delta`, `pgboss.queue_stats.completed_delta`, `pgboss.queue_stats.failed_delta`, `pgboss.queue_stats.delta_seconds`, `pgboss.queue_stats.delta_on`, `pgboss.queue_stats.wait_bins`, `pgboss.queue_stats.run_bins`, `pgboss.queue_stats.ready_oldest_seconds`, `pgboss.queue_stats.captured_on` | Queue statistics over time | No | System | Operators only | pg-boss's cleanup | pg-boss maintenance |
| `pgboss.schedule.name`, `pgboss.schedule.key`, `pgboss.schedule.kind`, `pgboss.schedule.cron`, `pgboss.schedule.timezone`, `pgboss.schedule.data`, `pgboss.schedule.options`, `pgboss.schedule.created_on`, `pgboss.schedule.updated_on`, `pgboss.schedule.last_job_id` | Scheduled jobs, such as the daily retention run | No | System | Operators only | While scheduled | Unscheduling |
| `pgboss.subscription.event`, `pgboss.subscription.name`, `pgboss.subscription.created_on`, `pgboss.subscription.updated_on` | Queue subscriptions | No | System | Operators only | While subscribed | Unsubscribing |
| `pgboss.instance.id`, `pgboss.instance.name`, `pgboss.instance.host`, `pgboss.instance.pid`, `pgboss.instance.version`, `pgboss.instance.node_version`, `pgboss.instance.application_name`, `pgboss.instance.heartbeat_seconds`, `pgboss.instance.supervise`, `pgboss.instance.schedule`, `pgboss.instance.migrate`, `pgboss.instance.persist_queue_stats`, `pgboss.instance.persist_warnings`, `pgboss.instance.pool_max`, `pgboss.instance.pool_total`, `pgboss.instance.pool_idle`, `pgboss.instance.pool_waiting`, `pgboss.instance.workers`, `pgboss.instance.metrics`, `pgboss.instance.config`, `pgboss.instance.crash_restarts`, `pgboss.instance.crash_restarts_since`, `pgboss.instance.started_on`, `pgboss.instance.heartbeat_on`, `pgboss.instance.stopped_on` | Which worker processes are running (server names, not people) | No | System | Operators only | While running | pg-boss maintenance |
| `pgboss.bam.id`, `pgboss.bam.name`, `pgboss.bam.version`, `pgboss.bam.status`, `pgboss.bam.queue`, `pgboss.bam.table_name`, `pgboss.bam.command`, `pgboss.bam.error`, `pgboss.bam.created_on`, `pgboss.bam.started_on`, `pgboss.bam.completed_on` | pg-boss's own maintenance tasks | No | System | Operators only | pg-boss's cleanup | pg-boss maintenance |
| `pgboss.version.version`, `pgboss.version.cron_on`, `pgboss.version.bam_on`, `pgboss.version.flow_on`, `pgboss.version.reindex_on`, `pgboss.version.monitor_backoff_on` | pg-boss's schema version and maintenance times | No | System | Operators only | Permanently | Not needed |
| `pgboss.warning.id`, `pgboss.warning.type`, `pgboss.warning.message`, `pgboss.warning.data`, `pgboss.warning.created_on` | pg-boss warnings (slow queues and the like) | No | System | Operators only | pg-boss's cleanup | pg-boss maintenance |

## How deletion works

- **Retention job** (`apps/worker`, daily): runs as a separate database role, `ideamap_retention`, which can see and delete only rows already past their district's period, and can't read their text. It works in batches of 5,000 rows, each its own transaction, so it never holds long locks, an interrupted run loses nothing, and a rerun carries on. It never touches tracker events; an event that refers to deleted text shows that text as "removed" (§8.2), and progress replays unchanged.
- **FERPA delete and unenrolment** (district admin only): as in the summary. Tracker rows are append-only for every role; the one exception is `app.purge_student_events`, which these call. It runs only for an admin of the student's own district and deletes only that student's rows. Both are safe to repeat, which is what lets deletions be re-applied after a backup restore.
- **District removal at contract end**: an operator procedure that deletes the district's rows and files.
- **Backups**: deleted data ages out within 35 days, as in the summary.

## Keeping this document current

Any migration that adds a table or column must add it here, with every column of the table filled in. `packages/db/src/inventory.test.ts` migrates a database from empty and compares its columns, in every schema, with the fields named in this document.
