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
