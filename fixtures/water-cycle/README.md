# Water cycle sample curriculum pack

The Grade 6 science sample from the design prototype, in the **Curriculum Pack** format (`project/Curriculum Pack.dc.html`; field spec in `docs/spec/`). The same content comes in three forms, and an importer must produce identical results from each:

- One CSV per tab: `Course.csv` (key/value), `Units.csv`, `Ideas.csv`, `Links.csv`, `Categories.csv`, `Assessment.csv`, `Personas.csv`, `Library.csv`
- One workbook with those eight sheets: `water-cycle.xlsx`
- The pack as JSON: `pack.json`, which validates against `docs/spec/curriculum-pack.schema.json`

Counts: 23 ideas (18 process, 5 mechanism), 43 links, 3 units, 3 categories, 23 assessment questions (one per idea), 3 personas, 5 library documents.

Lists (`standard_codes`, `requires`, `key_points`) are comma-separated in CSV and XLSX, and arrays in JSON.

## `Ideas.explanation`

The student-facing text on each idea page, in the last column of Ideas (decision D9). `notes` stays teacher-only and is empty here. Every idea in this sample has an explanation. To test AI drafting, clear one in a copy of the fixture rather than editing this one.

## Two layers (`Ideas.layer`, D41)

The 18 original ideas are the surface **process** layer (`layer` is `process`, which is also what an empty cell means). Five **mechanism** ideas sit underneath, each with an NGSS code, and the process ideas `require` them:

| `idea_id` | Mechanism | `standard_codes` | Needs | Needed by |
|---|---|---|---|---|
| `thermal` | Thermal energy | MS-PS1-4 | | `evap`, `phase` |
| `phase` | Phase change | MS-PS1-4 | `thermal` | `evap`, `cond`, `dropmass` |
| `gravity` | Gravity | MS-ESS2-4 | | `prec`, `coll`, `dropmass`, `topo` |
| `dropmass` | Droplet mass | MS-PS2-4 | `phase`, `gravity` | `prec` |
| `topo` | Topography | MS-ESS2-2 | `gravity` | `coll` |

The process loop evaporation → condensation → precipitation → collection → evaporation is four rows in **Links** (`evap`→`cond`, `cond`→`prec`, `prec`→`coll`, `coll`→`evap`). `requires` stays acyclic: `cond` requires `evap`, `prec` requires `cond`, `coll` requires `prec`, and nothing requires back. Trace-back from a process idea goes down to the mechanisms, never round the loop. The mechanism ideas have media names, and a link and an Assessment question each, so the counts of the problems below don't change.

## Deliberate data problems

Data-check tests (task C2) rely on these, so leave them in:

| Row | Problem | Expected check |
|---|---|---|
| Ideas · `ground` | `requires` lists `aquifer`, which is not an `idea_id` | error: unknown prerequisite |
| Ideas · `rain` | empty `standard_codes` | warning: missing from alignment reports |
| Ideas · 11 rows | empty `media_url` | info: shows a placeholder |

## Media and library files

`media_url` and `file_url` values are file names only, and the files don't exist. Treat them as placeholders until a media provider exists (task X2).
