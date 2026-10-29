# Specs

| File | What it is |
|---|---|
| `curriculum-pack.fields.json` | Every pack tab and column: type, required, who edits it (`sheet`, `app` or `both`) and what happens when it's missing. Exported from `project/curriculum-pack.js`; this is the field-level spec for F3, C1 and C2 |
| `curriculum-pack.schema.json` | JSON Schema for a pack as JSON |

## Differences from the prototype's generator

`curriculum-pack.schema.json` was exported from the prototype's `jsonSchema()` with these changes:
1. Columns that reference `Units.unit` are integers. The generator typed them as strings, which rejected the prototype's own `buildPack()` output.
2. Optional columns accept `null`, which the prototype's own pack output uses for empty values.
3. `ideas.explanation` is added as an optional column (decision D9 in `docs/ARCHITECTURE.md`). It is also in `curriculum-pack.fields.json`, but not yet in the prototype's `curriculum-pack.js`.
4. `ideas.layer` is added as an optional column (decision D41). `process` is the surface idea and `mechanism` the causal idea beneath it; an empty cell means `process`, so single-layer packs need no change. Mechanism ideas should carry `standard_codes`. `requires` must stay acyclic in both layers (the surface loop goes in Links), and a mechanism that requires a process idea is a warning.

`edit` meanings: `sheet` comes only from the source data; `app` is set only in Teacher Settings; `both` means the sheet seeds it and Teacher Settings can override it for a class.

Text cells are trimmed before validation. For `Ideas.explanation`, leading and trailing whitespace is removed, internal line breaks and spacing are kept, and a blank-only value becomes `null`.
