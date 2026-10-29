# Water cycle sample curriculum pack

The Grade 6 science sample from the design prototype, in the **Curriculum Pack** format (`project/Curriculum Pack.dc.html`; field spec in `docs/spec/`). The same content comes in three forms, and an importer must produce identical results from each:

- One CSV per tab: `Course.csv` (key/value), `Units.csv`, `Ideas.csv`, `Links.csv`, `Categories.csv`, `Assessment.csv`, `Personas.csv`, `Library.csv`, `Practice.csv`
- One workbook with those nine sheets: `water-cycle.xlsx`
- The pack as JSON: `pack.json`, which validates against `docs/spec/curriculum-pack.schema.json`

Counts: 18 ideas, 31 links, 3 units, 3 categories, 18 assessment questions (one per idea), 3 personas, 5 library documents, 5 Practice problems (3 exercises).

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

## Practice

`Practice.csv` (sheet `Practice` in the workbook, `practice` in `pack.json`) has 5 problems in 3 exercises: `wc-evap-1` (a multiple-choice problem with a worked-example video, and a number problem with a `graph:` visual), `wc-cond-1` (a number problem with a `table:` visual and a hint video, and a multiple-choice problem) and `wc-quiz-1`, a quiz drawing from the other two. The problems are **test content written for this fixture, not vetted items**: they name the test-only bank `fixture`, which production configuration does not allow, so data checks on this pack with the production allow-list report one `practice_source` error per row. Tests pass `TEST_PRACTICE_SOURCES` (production's list plus `fixture`) and then see no Practice issues; the quiz row is licensed `CC-BY-4.0` with an attribution to cover that path. `choices` and `demo_steps` are `|`-separated in CSV and XLSX and arrays in JSON; `quiz_from` is comma-separated. There are no deliberate Practice errors: the data-check tests build bad rows themselves.

## Media and library files

`media_url`, `demo_video_url` and `file_url` values are file names only, and the files don't exist. Treat them as placeholders until a media provider exists (task X2).
