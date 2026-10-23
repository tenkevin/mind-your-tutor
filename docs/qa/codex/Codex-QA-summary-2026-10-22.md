Reviews: F1, F1b, F1c, F2, F3, F4, C1, C2, C3 (routing index only)

# Codex independent QA: overall assessment and routing

Review date: 2026-10-22. Three independent gpt-6.1-sol agents at medium reasoning tested seven isolated commits, followed by coordinator reading of every report and targeted reruns. This publishes the original review. Publication context inspected at `92963ed9bee24c3451c8d081885bb723320906ba`; newer-commit QA follows separately. Only new Codex report files are included; no implementation or plan changes.

## Overall

**Good engineering foundations; acceptance coverage needs stronger semantic and integration tests.** Installs/builds/types/tests generally passed. Parser security/normalization, graph algorithms, performance, deterministic API guards, and much of database isolation held up well. The independent review nevertheless found serious database integrity and student-answer correctness defects despite green suites. The team has already created C8/C9 for several overlaps, which is useful follow-through.

Do not infer a numerical quality score from passing test counts. Existing tests often asserted the stated examples, but missed temporary-table name resolution, visible quiz-answer ambiguity, distinct-idea coverage, cross-package issue shapes and browser-default placeholder styles. Several older concerns were resolved or deliberately accepted, rather than still being open errors.

## Errors

**Index only: no additional errors to turn into tasks from this file.** The ten canonical errors are in the task files below. Route once; coordinate already-started C8 fixes before duplicating work.

| Task/report | Reviewed commit | Canonical errors | Existing overlap |
|---|---|---|---|
| [F4 database](Codex-F4-database.md) | `8d951bc67ac65c9400a71f7d453edbade3d13e6f` | F4-E1 event uniqueness; F4-E2 draft pin — high | No fix claimed |
| [F2 UI](Codex-F2-ui.md) | `feceb3a45d2549ccee805b0014d6014b10bcb8ae` | F2-E1 placeholder contrast — medium | Outside D10 |
| [C3 derivation](Codex-C3-derivation.md) | `26ded0468368e12509196d45086ef2b662a0563b` | C3-E1 ambiguous answers — high; C3-E2 grammar — medium | C8-F5/F6/U2 |
| [C2 checks](Codex-C2-checks.md) | `01f1eab6dc3a13c2a8c65fc81e50a2edf6d77eb6` | C2-E1–E5 coverage, units, objective, repair advice, issue contract — medium | C8-F1/F2/F4; E5 needs contract coordination |
| [F3 contracts](Codex-F3-contracts.md) | `d1ac39a6fb985be32963ba24f2491442c0092105` | None independently routed; C2-E5 owns integration mismatch | Suggestions / C9 context |
| [C1 import](Codex-C1-import.md) | `600c5a3813b5ecd9ecce05974dd1cba0bc0f8c12` | None confirmed locally | New head9ce1018 has green CI, untested in this review |
| [F1c tracker/platform](Codex-F1c-tracker.md) | `098ee229ca6f0a4eed8e6fd694fe9cadd4fd1864` | None against named criteria | Transitive guard follow-up |

## Suggestions

**Index only; canonical suggestions are in the task files.** Prioritize transitive dependency enforcement, map-scoped true/false wording, bounded/grouped diagnostics, friendly validation errors, URL credential hygiene and cross-browser coverage in the next relevant tasks. Seed normalization and warning aggregation already have C8 criteria. D12/D13 and C9 supersede older assumptions about missing fields/personas.

The publication source comparison found UI/check-engine/contract-validator finding sites unchanged at92963ed; C3 production derivation was unchanged although test helpers moved. These are static comparisons, not fresh execution. Earlier C3 merge conflicts are resolved by its merge. Earlier C1 missing CI is historical: newer PR head9ce1018 has green checks.

## Evidence and limits

- Existing baseline suites: tracker159, UI73, contracts205, import97, checks32, derivation43, DB142. These are per-area counts, not a disjoint total; shared contract tests also ran elsewhere.
- Independent oracles/probes included200 graph trials,62 derivation invariant runs,30 duplicate-title seeds and browser colour/focus/request measurements. Coordinator reran data-check and quiz harnesses and reproduced the high-severity database uniqueness error.
- Fresh Node22 container validated initial baseccdce491 with no reused packages; this is not a fresh-container run for every task head.
- Browser coverage was Chrome155 at400/1280px; no full assistive-technology suite. DB performance/schema checks partly reused the implementation suite. An automated security filter interrupted the DB agent; further security probing stopped and completed evidence was retained. This is not an exhaustive security sign-off.
- The detailed artifacts, harnesses, logs and screenshots remain locally at `/home/kevin/codex-qa-2026-10-22/`. Published task reports contain the reproduction inputs, outcomes and fixes needed for routing without those local paths.
- No task IDs were claimed or created, no ledger entries added, and no fixes applied. The coordinator can assign `<ID>cx<n>` and update its ledger from the canonical error entries.
