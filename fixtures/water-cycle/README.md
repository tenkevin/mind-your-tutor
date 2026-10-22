# Water cycle sample curriculum

The Grade 6 science sample from the design prototype, as an import fixture. It holds the same rows in two forms:

- One CSV per tab: `Ideas.csv`, `Links.csv`, `Units.csv`, `Categories.csv`, `Assessment.csv`
- One workbook with those five sheets: `water-cycle.xlsx`

Counts: 18 ideas, 31 links, 3 units, 3 categories, 18 assessment questions (one per idea).

Sources: `project/curriculum.js` (`SHEET`) and `project/Idea Map Explorer v2.dc.html` (`IDEAS`, `CANDIDATES`, `PROBES`). The `notes` column holds each idea's student-facing explanation.

## Deliberate data problems

Data-check tests (task C2) rely on these, so leave them in:

| Row | Problem | Expected check |
|---|---|---|
| Ideas · `ground` | `requires` lists `aquifer`, which is not an `idea_id` | error: unknown prerequisite |
| Ideas · `rain` | empty `standard_codes` | warning: missing from alignment reports |
| Ideas · 11 rows | empty `media_url` | info: shows a placeholder |

## Media

`media_url` values are file names only. The files themselves don't exist. Treat them as placeholders until a media provider exists (task X2).
