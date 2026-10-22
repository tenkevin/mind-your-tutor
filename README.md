# Idea Map

A mind-map learning tool for K-12. A teacher imports a curriculum spreadsheet. Students explore it as a map, prove mastery idea by idea, and teach Milo, a virtual classmate, at the end of each unit.

This branch (`idea-map`) holds the Idea Map project. `main` and `init` belong to MindyourTutor, a separate project.

| Start here | |
|---|---|
| `AGENTS.md` | How to pick up, claim and finish work (agents and people) |
| `docs/ARCHITECTURE.md` | The architecture and settled decisions |
| `docs/PLAN.md` | Live to-do list and dependency map (generated) |
| `docs/tasks.json` | The task list behind the plan |
| `fixtures/water-cycle/` | Sample curriculum for tests |
| `project/` | Claude Design prototypes (visual reference) |
| `chats/chat1.md` | The design conversation (intent) |

```
node scripts/plan.mjs ready     # what can start now
node scripts/plan.mjs check     # validate the plan (CI runs this)
```
