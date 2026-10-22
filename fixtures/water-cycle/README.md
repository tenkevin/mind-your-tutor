# Water cycle sample curriculum pack

The Grade 6 science sample from the design prototype, in the **Curriculum Pack** format (`project/Curriculum Pack.dc.html`; field spec in `docs/spec/`). The same content comes in three forms, and an importer must produce identical results from each:

- One CSV per tab: `Course.csv` (key/value), `Units.csv`, `Ideas.csv`, `Links.csv`, `Categories.csv`, `Assessment.csv`, `Personas.csv`, `Library.csv`
- One workbook with those eight sheets: `water-cycle.xlsx`
- The pack as JSON: `pack.json`, which validates against `docs/spec/curriculum-pack.schema.json`

Counts: 18 ideas, 31 links, 3 units, 3 categories, 18 assessment questions (one per idea), 3 personas, 5 library documents.

Lists (`standard_codes`, `requires`, `key_points`) are comma-separated in CSV and XLSX, and arrays in JSON.

## `Ideas.explanation`

The student-facing text on each idea page, in the last column of Ideas (decision D9). `notes` stays teacher-only and is empty here. Every idea in this sample has an explanation. To test AI drafting, clear one in a copy of the fixture rather than editing this one.

## Deliberate data problems

Data-check tests (task C2) rely on these, so leave them in:

| Row | Problem | Expected check |
|---|---|---|
| Ideas · `ground` | `requires` lists `aquifer`, which is not an `idea_id` | error: unknown prerequisite |
| Ideas · `rain` | empty `standard_codes` | warning: missing from alignment reports |
| Ideas · 11 rows | empty `media_url` | info: shows a placeholder |

## Media and library files

`media_url` and `file_url` values are file names only, and the files don't exist. Treat them as placeholders until a media provider exists (task X2).
