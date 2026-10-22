# Idea Map

A mind-map learning tool for K-12. A teacher imports a curriculum spreadsheet. Students explore it as a map, prove mastery idea by idea, and teach Milo, a virtual classmate, at the end of each unit.

This branch (`idea-map`) holds the Idea Map project. `main` and `init` belong to MindyourTutor, a separate project.

| Start here              |                                                           |
| ----------------------- | --------------------------------------------------------- |
| `AGENTS.md`             | How to pick up, claim and finish work (agents and people) |
| `docs/ARCHITECTURE.md`  | The architecture and settled decisions                    |
| `docs/PLAN.md`          | Live to-do list and dependency map (generated)            |
| `docs/tasks.json`       | The task list behind the plan                             |
| `fixtures/water-cycle/` | Sample curriculum for tests                               |
| `project/`              | Claude Design prototypes (visual reference)               |
| `chats/chat1.md`        | The design conversation (intent)                          |

```
node scripts/plan.mjs ready     # what can start now
node scripts/plan.mjs check     # validate the plan (CI runs this)
```

## Development

Needs Node 22 (see `.nvmrc`) and pnpm 10 (`corepack enable` picks up the version pinned in `package.json`).

```
pnpm install          # install all workspaces
pnpm test             # Vitest in every workspace
pnpm lint             # ESLint (flat config, eslint.config.js)
pnpm format:check     # Prettier; `pnpm format` rewrites files
pnpm typecheck        # tsc --noEmit in every workspace
pnpm build            # build every workspace
```

Run one workspace with `pnpm --filter @ideamap/<name> <script>`, for example `pnpm --filter @ideamap/teacher dev`. Workspaces live under `apps/` and `packages/`, as laid out in `docs/ARCHITECTURE.md` §4. Shared dependency versions are in the `catalog` in `pnpm-workspace.yaml`. CI (`.github/workflows/ci.yml`) runs install, lint, format check, typecheck, test and build on every push and pull request to `idea-map`.
