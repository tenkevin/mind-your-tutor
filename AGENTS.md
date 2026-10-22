# Working on Idea Map (agents)

Read this before starting any task.

**Base branch: `idea-map`.** All Idea Map work branches from `idea-map` and merges back into it. Never push to `main` or `init`. Those hold MindyourTutor, a separate project with its own `CANON.md`. Its rules don't apply here, and these don't apply there.

- **Architecture:** `docs/ARCHITECTURE.md`. Decisions there are settled. Raise a question instead of working around them.
- **Living to-do list and dependency map:** `docs/PLAN.md`, generated from `docs/tasks.json`.
- **Sample curriculum for tests:** `fixtures/water-cycle/` (CSV and XLSX; read its README for the deliberate data errors).
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
4. Do the work on a branch named `task/<ID>-<short-name>`, cut from `idea-map`. The task's `done_when` field is the bar for finishing.
5. Open a pull request into `idea-map`. Then, on `idea-map`, run `node scripts/plan.mjs review <ID>` and commit and push the plan change. A person reviews and merges. Agents don't merge their own PRs.
6. After the PR merges, run `node scripts/plan.mjs done <ID>` on `idea-map`, then commit and push.
7. If you can't finish, run `node scripts/plan.mjs release <ID>` and leave a note in the PR or commit saying why.

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

- Change task status only through `scripts/plan.mjs`. Never edit `docs/PLAN.md` by hand.
- Own one task at a time.
- Tasks marked `placeholder: true` have no spec yet and can't be claimed. Don't build them on your own initiative. If one blocks you, say so. A person writes the spec, then sets `placeholder` to false.
- Code in `packages/tracker` is deterministic: no clock, no randomness, no network, no model calls. Progress and behaviour metrics are always a replay of tracker events (ARCHITECTURE.md §8).
- Map generation and AI output may vary, but anything shown to a student is stored and recorded as a tracker event. Never let generation keep its own copy of progress.
- Model API keys live only on the server. No student names or emails in prompts.
- Adding or splitting tasks: edit `docs/tasks.json` (id, title, size, deps, done_when, placeholder, status `todo`), run `node scripts/plan.mjs`, and explain why in the commit message.
- `node scripts/plan.mjs check` must pass before you push. CI runs it on every push to `idea-map`.
- Stuck on a decision the architecture doesn't settle? Add it to "Open questions" in `docs/ARCHITECTURE.md` in your PR and carry on with the rest of the task.
