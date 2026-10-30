# Completion record: design PRs #50, #51, #52 · 2026-10-30

These PRs came from the user's design session (`session_017xAqLciuNohCywzAy8sdeo`). Independent Claude design QA (`session_017xAqLcNqdUxEoYFENFHR6U`) passed all three final heads (#50 `7aa9a7b`, #51 `081fb1f`, #52 `eafcbb5`), then passed them again on a re-run merged with `idea-map` `11d5bb7`, with no must check regressing (relayed by the user, 2026-10-30; summary in `STATUS.md`). The user approved merging them on that QA, in this order, after F1e made `idea-map` green and S10c merged. Codex reviews them after merge (Codex queue B).

| PR | Synced head | How it was synced | Merge | Merge CI |
|---|---|---|---|---|
| #50 map emphasis | `fc55ef5` | GitHub update-branch. Every changed file equals `idea-map` except `MapScreen.test.tsx`, a clean automatic merge of #50's added test with S10c's test changes | squash `08375b7` | green |
| #51 smoother map | `ae05a45` | Stacked on #50. After #50's squash, `IdeaMap.tsx`, `geometry.test.ts` and `map.css` conflicted. On `idea-map` they equalled #50's reviewed head `7aa9a7b` exactly, which #51 contains, so the resolution keeps #51's files: byte for byte the reviewed `081fb1f`. Lint, format, typecheck, and student (96) and ui (387) tests passed locally | squash `8d84d2f` | green |
| #52 idea page | `58669eb` | `IdeaPage.tsx` conflicted with S10c. The resolution keeps #52's layout and adds S10c's hidden-link handling (null id and title, `hidden-<n>` keys, "A hidden idea" / "a hidden idea"), as the design session planned. One S10c assertion in `MapScreen.test.tsx` now checks the relation and the name as the separate elements this layout uses; the expectation is unchanged. `IdeaMap.tsx` and `map.css` differ from `idea-map` by exactly #52's own change. Student tests (97) and api student-map tests passed locally | squash `486f7b2` | `check` green; `build` running at commit time (confirmed in `STATUS.md`) |

**Disclosed by design QA, not reproduced on normal hardware:** on a machine about 2x slower, idea-page open measured 340 ms against the 300 ms budget, with the unchanged base at 342 ms in the same state, so it was attributed to the environment.

**Follow-ups for the design session:** (1) style next-up and far ideas with link option A (`docs/design/README.md` §7a), on a new branch; (2) the hidden-link wording "A hidden idea flow into this idea": the relation verb comes from the curriculum and doesn't agree with "A hidden idea" (S10c QA run 2, cosmetic). Named plurals already have the same problem ("Oceans supplies this idea").
