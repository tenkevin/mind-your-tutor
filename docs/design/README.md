# Design iteration brief

This brief is for a Claude Code **design session** that changes Idea Map's look directly in the codebase while the user gives feedback in chat. It ships changes as pull requests that go through the same review and merge rules as every other change (AGENTS.md). The design session never merges.

**Start it only after S10 (student map preview) and F8 (theme contract) have merged**, so it doesn't edit files that builders are changing. The coordinator hands the user the prompt in §8 at that point.

## 1. Where the design lives

| What | Where |
|---|---|
| Colour, type, space, radius and shadow tokens | `packages/ui/styles.css` (`:root`) and `packages/ui/src/tokens.ts` |
| Themes (after F8) | `packages/ui/src/themes/`. Nocturne is the default |
| Design rules (accent use, fading rules, spacing) | `project/_ds/nocturne-*/readme.md` |
| Visual targets (prototypes) | `project/*.dc.html`, mainly `Idea Map Explorer v2`, `Kinematics Explorer`, `Chat Panel`, `Milo`, `Student Onboarding`, `Teacher Settings` |
| Student screens | `apps/student/src` (the map and idea page are S10) |
| Teacher screens | `apps/teacher/src` (shell, curriculum data, publish) |
| Every component on one page | `apps/teacher/reference.html` and `apps/student/udl-reference.html` |
| Who owns each screen, and its acceptance checks | `docs/qa/<ID>.md` (for example S10, T3, T6, T8) |

## 2. How to see the real app

1. Start Postgres (with pgvector) and set `DATABASE_URL`, or use `pnpm db:up`.
2. Run `pnpm dev:auth` to start the API and the mock sign-in. Then run `pnpm --filter @ideamap/teacher dev` (port 5173) and `pnpm --filter @ideamap/student dev` (port 5174). See `apps/api/README.md`.
3. Sign in as `teacher-a1` (Terry Teacher), import `fixtures/water-cycle/water-cycle.xlsx`, and publish a version to Science 6A. Until T8 (#40) merges, `dev:auth` doesn't wire the publish routes. Instead, pin a version directly: insert a published `curriculum_version` row whose `derived` comes from `derive()` in `packages/domain`, and set `class.pinned_version_id`. This is the same approach S10's QA took. The sample has one deliberate error, so publish the earlier version or fix the two cells described in `docs/decisions/2026-10-29-water-cycle-pilot-graph.md`.
4. Sign in to the student app as `student-a1` (Sam Student).
5. Take before-and-after screenshots with Playwright, which is pre-installed, at 1440 px (laptop), 1366 px with a 4x CPU throttle (Chromebook) and 400 px (phone).

## 3. Rules it can't break

- **Contrast:** WCAG 2.1 AA. Nocturne keeps exactly D10's 9 accepted exceptions; any other theme must pass outright (D46). `packages/ui` tests enforce this.
- **No raw colours:** every colour comes from a theme file (D46). CI fails on any hex, rgb or hsl value elsewhere.
- **UDL 3.0 (D17):** read-aloud, keyboard access, visible focus, reduced motion, and state shown by shape or icon as well as colour. Run the checklist in `docs/qa/README.md`.
- **Nothing from third parties:** fonts are self-hosted, with no Google Fonts or CDN, and there are no third-party video players. Student IP addresses never leave (§10, D42).
- **No rankings:** no leaderboards or comparisons between students (D20). Motivation stays personal.
- **Performance:** on a school Chromebook (4x throttle, 60 ideas), the map's first paint is under 2 s and pan or zoom runs at 30 fps or more.
- **Audience:** K–12. Plain words, with a lower reading level for younger grades.

## 4. What it may and may not change

| May change | May not change |
|---|---|
| Styles, layout, components, icons, motion, copy on screens | Tracker logic (`packages/tracker`), the API (`apps/api`), privacy and the anonymous layer, the AI layer (`packages/ai`), curriculum data and import |
| A new theme file (it must pass AA) | Nocturne's own token values: that reopens D10, so the user must approve it explicitly in chat first |
| A screen's look within its task's checks | What a student sees about other students; tracked events (D19) |

## 5. Vocabulary

| Term | Meaning |
|---|---|
| **Idea** | A node on the map |
| **Link** | A labelled arrow between two ideas |
| **Card** | An idea collected by a student. Rarity is common, rare or legendary |
| **Mission** | A teacher-assigned unit of work |
| **Ms. Ivy** | The AI tutor |
| **Milo** | The virtual classmate a student teaches |
| **Atlas** | The teacher-facing helper |
| **Scope** | prerequisite, core or extension (D43) |
| **Layer** | process or mechanism (D41) |

The roadmap (`docs/ROADMAP.md`) says what belongs to which version. Don't design v0.3 features, such as avatars, rewards or cosmetic themes, into v0.1 screens unless the user asks.

## 6. Workflow

1. One change per PR, on a branch named `design/<short-name>` cut from `idea-map`. Merge `origin/idea-map` before each push.
2. Before each push, run root lint, `format:check`, typecheck, the tests with `DATABASE_URL` (including `function_binding.test.ts`), build and `node scripts/plan.mjs check`.
3. The PR body has before-and-after screenshots at the three widths, the rules checked, and a "## Decisions for the coordinator" section listing anything that touches a decision.
4. Don't finish until CI has passed on the exact head. Don't merge, never edit `Codex-*` files, and don't change task status in `docs/tasks.json`. The coordinator routes the PR to review and merges it.
5. If feedback needs a logic change, or contradicts a rule in §3 or a decision in `docs/ARCHITECTURE.md`, say so in chat and stop. The user and coordinator decide.

## 7. Design issues carried over from builder QA

Rule (user, 2026-10-29): when a task's QA fails on a **design aspect** (colour values, contrast of a theme's palette, visual treatment, layout, legibility) for the third time, the builder stops iterating on it. Instead:
- The coordinator merges the task once every other must passes, records the failing design checks here as deferred, and the design session fixes them first.
- Functional, security, performance and privacy failures never defer; they must pass before merge.

| Task | Check | Problem | Evidence | Status |
|---|---|---|---|---|
| _none_ | | F8 passed on run 4 within the limit; nothing deferred | | |

**Logic the design session asked for (2026-10-29):** the split of locked ideas into "next up" and "far" comes from the server (task S10b, then M4), never from the browser. Draw the two states once S10b merges. Whether far ideas hide their titles, as the prototype's "Hidden idea" does, is the user's call; titles stay visible until the user decides.

Should findings from QA that the design session should also take up:
- S10 run 2 #2 and #5: on a phone, the first view of the map is clipped or tiny, and the header is too tall (also S2-U3).
- S10 run 2 #3: "Words on the page" doesn't enlarge map card text (S2-U4).
- F8 run 4: hover-out on map cards now snaps instead of easing (transitions live only on `:hover` and `:focus-visible`, so theme switches stay one recalc). Optional: restore an ease-out without a resting colour transition.
- S10 runs 1 and 2 #4: cards crowd and overlap at 60 ideas (layout belongs to C16, but the card size and density are design).

## 8. Prompt for the design session

The user pastes this into a new Claude Code session on `tenkevin/mind-your-tutor`. Use Sonnet, as for builders. S10 merged as `3ad9110` and F8 as `eff7d02` on 2026-10-29.

> You are the Idea Map design agent. You change the look of the app directly in the codebase while I give you feedback in this chat, and you ship each change as a pull request into `idea-map`.
>
> First read `AGENTS.md`, then `docs/design/README.md` (this brief) and follow it exactly, then `docs/ROADMAP.md` and the decisions it cites (D10, D17, D20, D42, D43, D46 in `docs/ARCHITECTURE.md`). The student map (S10, merged at 3ad9110) and the theme contract (F8, merged at eff7d02) are on `idea-map`.
>
> Then start the app as the brief's §2 describes and publish the water cycle to Science 6A. Until T8 (#40) merges, the local publish route isn't wired, so pin a version in the database as the brief's §2 note explains. Send me screenshots of the student map, an idea page and the teacher console at laptop, Chromebook and phone widths. Then list the items in the brief's §7 (QA findings carried over to design), each with a screenshot and a proposed fix. Deferred must-checks come first. Wait for my feedback before changing anything.
>
> For each piece of feedback, make the change on a `design/<short-name>` branch, show me before-and-after screenshots, and when I approve, open a PR following the brief's §6. Stay within §3 and §4. If my feedback would break a rule or needs a logic change, tell me before doing anything. Never merge, never edit `Codex-*` files, and keep model identifiers out of commits, PRs and code.
