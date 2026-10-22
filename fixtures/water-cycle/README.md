# Water cycle sample curriculum pack

The Grade 6 science sample from the design prototype, in the **Curriculum Pack** format (`project/Curriculum Pack.dc.html`; field spec in `docs/spec/`). The same content comes in three forms, and an importer must produce identical results from each:

- One CSV per tab: `Course.csv` (key/value), `Units.csv`, `Ideas.csv`, `Links.csv`, `Categories.csv`, `Assessment.csv`, `Personas.csv`, `Library.csv`
- One workbook with those eight sheets: `water-cycle.xlsx`
- The pack as JSON: `pack.json`, which validates against `docs/spec/curriculum-pack.schema.json`

Counts: 18 ideas, 31 links, 3 units, 3 categories, 18 assessment questions (one per idea), 3 personas, 5 library documents.

Lists (`standard_codes`, `requires`, `key_points`) are comma-separated in CSV and XLSX, and arrays in JSON.

## Proposed column: `Ideas.explanation`

The pack design defines `notes` as teacher-only and has no column for the student-facing explanation shown on an idea page. This fixture adds an optional `explanation` column, the last one in Ideas, and leaves `notes` empty. The proposal is pending confirmation (see Open questions in `docs/ARCHITECTURE.md`).

## Deliberate data problems

Data-check tests (task C2) rely on these, so leave them in:

| Row | Problem | Expected check |
|---|---|---|
| Ideas · `ground` | `requires` lists `aquifer`, which is not an `idea_id` | error: unknown prerequisite |
| Ideas · `rain` | empty `standard_codes` | warning: missing from alignment reports |
| Ideas · 11 rows | empty `media_url` | info: shows a placeholder |

## Media and library files

`media_url` and `file_url` values are file names only, and the files don't exist. Treat them as placeholders until a media provider exists (task X2).
