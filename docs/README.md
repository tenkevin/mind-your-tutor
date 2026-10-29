# Idea Map docs

Start with [ROADMAP.md](ROADMAP.md) for where the product is going and [PLAN.md](PLAN.md) for where the work stands. Agents read `AGENTS.md` at the repo root first.

## Product and design

| File | What it is |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Versions v0.1–v0.4: goals, scope, and what each leaves out (D45) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Settled decisions D1–D46 (§1), system design (§2–§11) and open questions (§12) |
| [decisions/](decisions/) | The user's longer decision records: the prototype spec and the Water Cycle pilot graph (D44) |
| [spec/](spec/) | The Curriculum Pack format, field by field (fields JSON, JSON Schema) |
| [privacy/data-inventory.md](privacy/data-inventory.md) | What data is held, where, and for how long |
| [idea-map-blueprint.html](idea-map-blueprint.html) | Visual blueprint (also published as an artifact) |

## Work

| File | What it is |
|---|---|
| [tasks.json](tasks.json) | Source of truth for tasks: version, dependencies, done-when and status. Change status only with `node scripts/plan.mjs` |
| [PLAN.md](PLAN.md) | Generated from `tasks.json`: progress per version, what's ready, blocked and in review, and the v0.1 dependency map. Never edit by hand |
| [plan-map.png](plan-map.png) | Rendered snapshot of the dependency map |
| [HANDOFF.md](HANDOFF.md) | The coordinator's handoff: roles, rules, gotchas, state and next actions |

## Quality

| File | What it is |
|---|---|
| [qa/README.md](qa/README.md) | How independent QA works, Codex routing, and the UDL 3.0 checklist |
| `qa/<ID>.md` | Each task's acceptance criteria (functional, security, performance, usability), written before the task can be claimed |
| [qa/STATUS.md](qa/STATUS.md) | Live review queue: PR heads, criteria versions and next actions |
| `qa/reports/<ID>.md` | Saved QA verdicts for merged tasks |
| `qa/codex/Codex-*.md`, [qa/codex-ledger.json](qa/codex-ledger.json) | The external reviewer's findings (never edit them) and how each was routed |
| [qa/CXB.md](qa/CXB.md) | Suggestions waiting for a task's criteria |
