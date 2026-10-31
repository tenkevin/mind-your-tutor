# @ideamap/api

The Fastify API (ARCHITECTURE.md §3). F5 adds sign-in, roles and org tenancy (§10).

## Local sign-in

Needs the local database (`pnpm db:up`, see `packages/db/README.md`). Then, from the repo root:

```
pnpm dev:auth                          # migrate, seed sample users, start the mock IdP and the API
pnpm --filter @ideamap/teacher dev     # http://localhost:5173
pnpm --filter @ideamap/student dev     # http://localhost:5174
```

`pnpm dev:auth` starts a mock OpenID Connect provider on `http://localhost:4010`
(`/google`, `/clever`, `/classlink`, one issuer each) and the API on port 3000, and
prints the sample users. Open an app, choose a provider, then click a user on the mock's
page. The seeded users (`src/dev/sample.ts`) cover every role in two orgs:

| User                                  | Org | Role    | Signs in with | Notes                                                                                |
| ------------------------------------- | --- | ------- | ------------- | ------------------------------------------------------------------------------------ |
| `admin-a`                             | A   | admin   | Google        |                                                                                      |
| `author-a`                            | A   | author  | Google        | Author of curriculum A                                                               |
| `teacher-a1`                          | A   | teacher | Google        | Teaches Science 6A                                                                   |
| `teacher-a2`                          | A   | teacher | Clever        | Teaches Science 6B (same curriculum, D3)                                             |
| `student-a1`                          | A   | student | Google        | In 6A. The mock also sends a photo, birthday, phone and address, which the API drops |
| `student-a2`                          | A   | student | ClassLink     | In 6B                                                                                |
| `unenrolled-a`                        | A   | student | Google        | In no class: refused with the "Ask your teacher" message                             |
| `rostered-a`                          | A   | student | Google        | Rostered with no SSO link yet: linked by school email on first sign-in               |
| `teacher-a1-on-clever`                | A   |         | Clever        | Terry's email from another provider: refused, never a duplicate                      |
| `stranger-a`, `other-school`          |     |         | Google        | No account / unknown school: refused                                                 |
| `admin-b`, `teacher-b1`, `student-b1` | B   |         | Google        | A second org                                                                         |

The app servers proxy `/auth` and `/api` (and the student app `/events`) to the API, so the session cookie is host-only on
the app's own origin. Secrets are random per run. Chrome and Firefox accept the `Secure`
session cookie on `http://localhost`.

## How sign-in works

- **One adapter interface** (`src/providers.ts`, `IdentityProvider`). Google Workspace for
  Education, Clever and ClassLink all speak OpenID Connect, so one OIDC adapter
  (openid-client) serves them. Providers are configuration: `IDEAMAP_SSO_PROVIDERS` lists
  them and `IDEAMAP_SSO_<ID>_*` sets each (`.env.example`). The presets for the three
  (issuer, tenant claim) are unverified until open question 3 picks real accounts.
- **Authorization code flow with PKCE (S256)**, `state` and `nonce`. The ID token's
  signature, issuer, audience, expiry and nonce are checked. The flow's state lives in an
  encrypted, 10-minute `__Host-` cookie and is accepted once.
- **Which org:** each provider's tenant claim (Google `hd`, Clever `district`, …) maps to
  one org through `sso_tenant`. Users are then matched by provider and subject, or a
  rostered user not yet linked by verified school email. Sign-in never creates users and
  never links one person to two providers. Students in no class are refused.
- **Kept from the token:** subject, name and verified email only (COPPA, §10).
- **Sessions:** a random token in an `HttpOnly; Secure; SameSite=Lax` host-only cookie
  (`__Host-ideamap_session`); only its SHA-256 is stored (`auth_session`). Idle limits are
  8 hours for staff and 2 for students, with a 12-hour cap (all configurable). Sign-out
  revokes the row.
- **CSRF:** POST, PUT and DELETE need an `Origin` (or `Referer`) from
  `IDEAMAP_APP_ORIGINS` and the `x-csrf-token` header from `/api/me`.
- **Brute force:** 20 failed callbacks per IP per minute (configurable), then 429.
- **Audit:** sign-in, sign-out, role changes, config changes and roster imports write
  `audit_event` rows.

## Route policies

Every route declares `config.policy` (`src/policy.ts`); registering one without it throws,
so the server won't start. A policy is public (only `/health` and the sign-in routes) or a
list of roles plus a scope: the caller's org, one class (its teacher or an admin;
optionally its enrolled students), one curriculum (editing needs its author or an admin,
D3), or one user in the org. The check runs before every handler: signed out is 401;
wrong role, class or org is 403. Handlers reach the database only through
`req.withOrg`, which sets the org (and class) for row-level security and switches to the
`ideamap_app` role. `src/policy.test.ts` calls every route as each kind of caller.

## Curriculum imports

`startServer` (the deployed entry point, `node dist/index.js`) wires C4's imports in: jobs
go to pg-boss in the same database, uploads to `UPLOAD_DIR`, which the worker
(`apps/worker`) reads too. The routes sit under `/api` with the other app routes, each
with a staff policy on a curriculum or job the caller's org can see:

- `POST /api/curricula/:curriculumId/imports`: the file as the body
  (`application/octet-stream`), `X-File-Name` percent-encoded, optional `Idempotency-Key`.
- `GET /api/curricula/:curriculumId/imports/latest`: the newest job and the newest
  version's issues grouped by cause, for Teacher Settings → Curriculum data (T2).
- `GET /api/imports/:jobId`: one job's status and steps, polled while it runs.

`pnpm dev:auth` also runs an import worker in its own process, so a local upload goes all
the way to a draft (uploads in a temporary directory unless `UPLOAD_DIR` is set).

## Roster import

`POST /api/roster/import` (admins) takes OneRoster 1.1 `users.csv`, `classes.csv` and
`enrollments.csv` as text, plus the curriculum for new classes. Users and classes are
matched by `sourcedId` (and unrostered users by email), so re-importing changes nothing.
Only names, email and ids are kept. Sample files: `fixtures/oneroster/`.

## AI gateway

Every model call goes through `src/ai/` (ARCHITECTURE.md §6, §9, §10; task A1). Browser
packages never import a model SDK, know a provider's URL or see the key;
`src/ai/boundary.test.ts` checks that.

**Routes.** One per persona, so the server, not the request, picks the persona:

| Route                                 | Persona | Who (F5 policy)                                |
| ------------------------------------- | ------- | ---------------------------------------------- |
| `POST /api/classes/:classId/ai/tutor` | Ms. Ivy | the class's students, its teacher, admins      |
| `POST /api/classes/:classId/ai/peer`  | Milo    | the class's students, its teacher, admins      |
| `POST /api/classes/:classId/ai/agent` | Atlas   | the class's teacher and admins (A4 adds tools) |

The body is only the conversation: `{ message, history? }` (`AiChatRequestSchema` in
`@ideamap/contracts`). Any other key, such as `system`, `prompt_template`, `persona` or
variables, is a 400. The reply is `{ interactionId, persona, reply }`. Errors are
`{ error, code }` with a sentence a student can read: 429 `rate_limited` (with
`Retry-After`), 502 `unavailable` for a timeout, a provider error or a malformed reply.
The student app's client is `apps/student/src/ai.ts`.

**What happens on each call** (`src/ai/gateway.ts`):

1. The route policy checks the caller; the body is parsed strictly.
2. The persona comes from `@ideamap/ai`'s registry (D13), with the pack's Personas tab and
   the curriculum defaults, then the class's overrides, on top. A student may call it
   only if its audience is Students; a class with no published curriculum gets a 409.
3. One call is taken from the student's and the class's limits. Refused calls (401, 403, 409) take none; a call the provider then fails does count.
4. The template is filled with `fill(cfg, persona)` from the class's effective subject,
   topic and grade (§6). Unknown `{variables}` stay as written.
5. The identifier backstop (`patternBackstop` in `@ideamap/ai`) blurs the filled prompt
   and every turn, in one pass so labels match. A teacher's template or topic can name
   a student too. Emails become `[email]`, phone numbers `[phone]`, the roster and
   sign-in ids of people in the class (its students and teacher, and the caller) `[id]`,
   and their names `Person A`, `Person B`, …. Each replacement is a privacy miss (D26).
   What it doesn't catch yet: a single name part written in lower case ("sam"), and
   people outside the class. A7 adds on-device blurring and a fuller backstop behind
   the same `IdentifierBackstop` interface; pass it as `backstop` in the gateway
   options.
6. The provider gets the blurred prompt, the blurred turns and a pseudonymous user id (an
   HMAC of the user, keyed from the session secret), never a user id, roster id or email.
7. The transcript is stored blurred in `ai_interaction` (system prompt, turns, reply or
   failure kind, token counts, privacy misses). F6's retention job (default 90 days),
   student export and student delete already cover that table. Calls are not audited one
   by one; persona and config changes are, by F6's triggers.

Logs carry the persona, interaction id, failure kind, token counts and privacy-miss
count, never text. A failure answers the client with a fixed sentence and no provider
detail.

**Keys and limits.** From the environment only (`src/ai/config.ts`; names in
`.env.example`): `IDEAMAP_AI_API_KEY` (without it the routes aren't registered),
`IDEAMAP_AI_MODEL` (default `claude-opus-5-5`), `IDEAMAP_AI_FALLBACKS` (`off` turns off the
server-side refusal fallback), `IDEAMAP_AI_MAX_TOKENS`, `IDEAMAP_AI_TIMEOUT_MS`, `IDEAMAP_AI_MODERATION_TIMEOUT_MS` (default 5000),
`IDEAMAP_AI_STUDENT_PER_MINUTE` (default 10) and `IDEAMAP_AI_CLASS_PER_MINUTE` (default
120). Limits are kept in memory per API process, like the sign-in limiter, so with several
API processes each enforces its own window. §10 requires a zero-retention, no-training
agreement with the provider.

**Adding a provider.** Implement `ModelProvider` (`src/ai/provider.ts`): `complete()` takes
the filled request and an abort signal and returns the text, token counts and model id,
or throws `ModelError` with a failure kind. Never put provider messages, keys or URLs in
the error. Keep the SDK import in that one module and add it to the allow-list in
`src/ai/boundary.test.ts`. Choose it in `src/index.ts` from configuration. Tests use the
mock in `src/test/mock-model.ts`, which records every request it receives.

## Tests

`pnpm --filter @ideamap/api test` with `DATABASE_URL` set, as for `packages/db`: each test
file gets a fresh database and its own mock identity provider. Set
`IDEAMAP_PERF_VERBOSE=1` to print the auth timing.

## Learning events (M2)

`POST /events` (`src/events.ts`) takes a student's batch of M1 events (ARCHITECTURE.md
§8.5), up to 200 events and 20 typed texts:

- **Who:** students only, for themselves, in classes they're enrolled in. A batch naming
  another student or class is refused whole (403). Teacher actions and model verdicts
  (`teaching` events, `teachback.judged`) are recorded by the server.
- **Each event on its own:** checked against M1's catalogue; rejected with a reason
  (`unknown_type`, `forbidden_field`, `invalid`, `server_only`, `version_not_pinned`,
  `text_missing`, `id_taken`) while the rest of the batch is stored. Resent ids are
  returned as `duplicates`, never stored twice.
- **seq and level:** `seq` continues per student with no gaps. A batch's numbers come
  from one upsert on `student_event_seq` (constant time, whatever the history), whose
  row lock puts a student's batches one after another; a resend racing its first send
  loses on the ledger's unique key and is judged again as a duplicate. `level` is
  generated from the type by the database, which also refuses any type outside the
  catalogue.
- **Round trips:** one statement reads everything a batch is judged against
  (enrolment, pins, re-pins, opt-out, ids already recorded), and one allocates the
  numbers and inserts the events. Text queries run only when the batch has typed text.
- **Versions:** the class's pinned version, or the one it replaced within the grace
  period after a publish (`VERSION_GRACE_MS`, 24 hours; read from the class's audit log).
- **Typed text** comes anonymised from the device (D26, task A7). The server backstop
  (`@ideamap/ai/backstop`) blurs any real roster name, email or phone number that slipped
  through, stores only the blurred text, and counts a `privacy_miss`.
- **Opt-out (D24):** events of a student in `tracing_opt_out` are stored with
  `tracing_opted_out`. Admins set it with `PUT /api/privacy/students/:id/tracing`.
- **Leaving the district (D22):** `POST /api/privacy/students/:id/unenrol` (admin) deletes
  the student's events, as the FERPA delete now does too.
- **Nothing extra:** no IP address, user agent or device is stored, and the route logs at
  warn and above only, so request logs carrying the client address aren't written for it.

The student app's queue (`apps/student/src/tracker/queue.ts`) batches events every 5
seconds and on page hide, keeps them in sessionStorage per signed-in student while
offline, and resends with the same ids until the server answers.
