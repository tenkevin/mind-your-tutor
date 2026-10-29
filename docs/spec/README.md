# Specs

| File | What it is |
|---|---|
| `curriculum-pack.fields.json` | Every pack tab and column: type, required, who edits it (`sheet`, `app` or `both`) and what happens when it's missing. Exported from `project/curriculum-pack.js`; this is the field-level spec for F3, C1 and C2 |
| `curriculum-pack.schema.json` | JSON Schema for a pack as JSON |

## Differences from the prototype's generator

`curriculum-pack.schema.json` was exported from the prototype's `jsonSchema()` with three changes:
1. Columns that reference `Units.unit` are integers. The generator typed them as strings, which rejected the prototype's own `buildPack()` output.
2. Optional columns accept `null`, which the prototype's own pack output uses for empty values.
3. `ideas.explanation` is added as an optional column (decision D9 in `docs/ARCHITECTURE.md`). It is also in `curriculum-pack.fields.json`, but not yet in the prototype's `curriculum-pack.js`.

`edit` meanings: `sheet` comes only from the source data; `app` is set only in Teacher Settings; `both` means the sheet seeds it and Teacher Settings can override it for a class.

Text cells are trimmed before validation. For `Ideas.explanation`, leading and trailing whitespace is removed, internal line breaks and spacing are kept, and a blank-only value becomes `null`.

## Practice (the ninth tab, D40)

Columns, types, required flags and missing behaviour are the prototype's (`project/curriculum-pack.js`), plus `source_bank_id`, `license_type` and `attribution_string`.

- **One row per problem.** Rows that share an `exercise_id` form one exercise. `demo_video_url` and `demo_steps` are read from an exercise's first row. A quiz row has `kind` = `quiz` and lists the `exercise_id`s it draws from in `quiz_from` (comma-separated); a quiz can't draw from another quiz.
- **Pipe lists.** `choices` and `demo_steps` are separated by `|` (entries may hold commas); the first choice is the correct one and the app shuffles. `quiz_from` is comma-separated like other id lists. In pack JSON all three are arrays.
- **`answer`** is text. For `problem_type` `number` it must be a plain number (`-5`, `0.25`); for `mc` it must be the first choice.
- **`visual`** is `graph: x,y; x,y` (points) or `table: t: 0, 2, 4; x: 0, 6, 12` (rows of a label and numbers, all the same length). Anything else is rejected.
- **`media_url` and `demo_video_url`** are media references like `Ideas.media_url`: an https URL or a file name. They are never fetched at import.
- **Vetted sources only.** Items come from external, vetted item banks and are shown verbatim with their attribution; nothing generates or rewrites a question. `source_bank_id` and `license_type` must be on the allow-list, and a licence that needs it (CC-BY) needs an `attribution_string`. Otherwise the data checks report an **error** that blocks publishing. The allow-list is configuration (`PRACTICE_SOURCES_FILE` for the worker; OpenStax, PhET, NASA and NOAA under Public Domain and CC-BY-4.0 when unset). The test-only bank `fixture` is not in production configuration.
- `source_bank_id`, `license_type` and `attribution_string` are optional in the parser so an incomplete row still imports; the data check is what stops it being published.
