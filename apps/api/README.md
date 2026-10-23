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

The app servers proxy `/auth` and `/api` to the API, so the session cookie is host-only on
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

## Roster import

`POST /api/roster/import` (admins) takes OneRoster 1.1 `users.csv`, `classes.csv` and
`enrollments.csv` as text, plus the curriculum for new classes. Users and classes are
matched by `sourcedId` (and unrostered users by email), so re-importing changes nothing.
Only names, email and ids are kept. Sample files: `fixtures/oneroster/`.

## Tests

`pnpm --filter @ideamap/api test` with `DATABASE_URL` set, as for `packages/db`: each test
file gets a fresh database and its own mock identity provider. Set
`IDEAMAP_PERF_VERBOSE=1` to print the auth timing.
