# Working on Idea Map (agents)

Read this before starting any task.

**Base branch: `idea-map`.** All Idea Map work branches from `idea-map` and merges back into it. Never push to `main` or `init`. Those hold MindyourTutor, a separate project with its own `CANON.md`. Its rules don't apply here, and these don't apply there.

- **Architecture:** `docs/ARCHITECTURE.md`. Decisions there are settled. Raise a question instead of working around them.
- **Living to-do list and dependency map:** `docs/PLAN.md`, generated from `docs/tasks.json`.
- **Independent QA:** `docs/qa/README.md` and `docs/qa/<ID>.md`. Each task's criteria cover functional, security, performance and usability testing, and are written before the task can be claimed.
- **Import format spec:** `docs/spec/` (the Curriculum Pack: eight tabs, field by field).
- **Sample curriculum for tests:** `fixtures/water-cycle/` (CSV, XLSX and pack JSON; read its README for the deliberate data errors).
- **Design reference:** `project/` (Claude Design export, HTML prototypes) and `chats/chat1.md` for intent. The prototypes show what to build, not how. Match the visuals; don't copy their structure.

## Picking up work

1. `git fetch origin idea-map && git checkout idea-map && git pull`, then `node scripts/plan.mjs ready`.
2. Choose one ready task. Prefer tasks marked critical in `docs/PLAN.md`.
3. Claim it on `idea-map`, and push the claim **before** writing any code:
   ```
   node scripts/plan.mjs claim <ID> <your-agent-name>
   git add docs/tasks.json docs/PLAN.md
   git commit -m "plan: claim <ID>"
   git push origin idea-map
   ```
   If the push is rejected, run `git pull --rebase origin idea-map`, then `node scripts/plan.mjs show <ID>`. If someone else now owns the task, reset your claim (`git reset --hard origin/idea-map`) and pick another task.
4. Do the work on a branch named `task/<ID>-<short-name>`, cut from `idea-map`. The bar for finishing is the task's `done_when` **and** every check in `docs/qa/<ID>.md`. Build to the criteria, but don't mark them yourself; an independent QA agent does that.
5. Open a pull request into `idea-map`. Then, on `idea-map`, run `node scripts/plan.mjs review <ID>` and commit and push the plan change. Agents don't merge their own PRs.
6. An independent QA agent runs `docs/qa/<ID>.md` against your PR and posts a report. The coordinator merges only on a QA PASS with CI green, then marks the task done. If QA or the coordinator asks for changes, fix them on the same branch; QA then runs again.
7. If you can't finish, run `node scripts/plan.mjs release <ID>` and leave a note in the PR or commit saying why.

## Coordinator

One coordinator session runs the swarm:

- **Criteria first:** before a task becomes claimable, it writes `docs/qa/<ID>.md` from the spec, never from an implementation, and pushes it to `idea-map`.
- **Launching:** it starts a build agent for each ready task that has criteria, with at most 4 build agents working at once. Each agent gets one task.
- **QA:** when a PR is open and CI is green, it starts a separate QA agent session for that PR. The QA agent never wrote the code, and QA agents don't count towards the limit of 4.
- **Review and merge:** it reviews each PR against `done_when`, `docs/ARCHITECTURE.md` and the rules below. It merges into `idea-map` only on a QA PASS with CI green, saves the report as `docs/qa/reports/<ID>.md`, then runs `node scripts/plan.mjs done <ID>`.
- **Changes:** when a PR needs work, it comments on the PR. The task's agent fixes it on the same branch.
- **Integration gate:** a PR merges only when its head already contains the current `idea-map` head (GitHub compare shows it 0 commits behind) and CI is green on that exact head. Otherwise the agent merges `origin/idea-map` and pushes first. Merges happen one at a time, and after each one the coordinator checks `idea-map`'s CI. If it's red, all merging stops until an immediate fix task lands. (Added after F4 and C3, each green on its own, broke `idea-map` together: Codex F4-E3.)
- **Never:** it doesn't merge to `main`, and it doesn't claim `placeholder` tasks.

## Conventions

Until F1 lands, these are the defaults it must set up. After F1, the repo config wins.

| Area | Choice |
|---|---|
| Runtime | Node 22 LTS, TypeScript `strict`, ES modules |
| Package manager | pnpm workspaces; packages named `@ideamap/<name>` under `apps/` and `packages/` (layout in ARCHITECTURE.md §4) |
| Tests | Vitest. Pure logic in `packages/domain` and `packages/tracker` needs unit tests; tracker rules also need property tests |
| Lint and format | ESLint and Prettier, run in CI |
| Validation | zod schemas in `packages/contracts` for every API payload and import tab |
| Web | React and Vite; styles from `packages/ui` (Nocturne tokens, ported from `project/_ds/`) |
| Server | Fastify; Postgres with pg-boss and pgvector |
| Commits | Imperative subject, prefixed with the task ID: `F3: add Ideas tab schema` |

## Rules

- Never edit, move or delete a file whose name starts with `Codex-`. Those are an external reviewer's findings (docs/qa/README.md, External review). Tasks named `<ID>cx<n>` fix Codex errors and take priority.

- Change task status only through `scripts/plan.mjs`. Never edit `docs/PLAN.md` by hand.
- Own one task at a time.
- Tasks marked `placeholder: true` have no spec yet and can't be claimed. Don't build them on your own initiative. If one blocks you, say so. A person writes the spec, then sets `placeholder` to false.
- Code in `packages/tracker` is deterministic: no clock, no randomness, no network, no model calls. Progress and behaviour metrics are always a replay of tracker events (ARCHITECTURE.md §8).
- Map generation and AI output may vary, but anything shown to a student is stored and recorded as a tracker event. Never let generation keep its own copy of progress.
- Model API keys live only on the server. No student names or emails in prompts.
- Adding or splitting tasks: edit `docs/tasks.json` (id, title, size, deps, done_when, placeholder, status `todo`), run `node scripts/plan.mjs`, and explain why in the commit message.
- `node scripts/plan.mjs check` must pass before you push. CI runs it on every push to `idea-map`.
- Stuck on a decision the architecture doesn't settle? Add it to "Open questions" in `docs/ARCHITECTURE.md` in your PR and carry on with the rest of the task.
