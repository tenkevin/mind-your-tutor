# @ideamap/ui

Nocturne, the Idea Map design system: tokens and component classes ported from
`project/_ds/nocturne-*/styles.css`. Plain CSS on plain HTML elements, with no
components and no runtime JavaScript. The design rules (when to use the accent,
how rules fade, and so on) are in that folder's `readme.md`.

## Use it

Import the stylesheet once, at the app's entry point:

```ts
import '@ideamap/ui/styles.css';
```

Then use the classes on native elements and take every colour, font, space,
radius and shadow from the `var(--…)` tokens. Never hard-code a value a token
already carries.

From TypeScript, the token names and values and the class names are typed:

```ts
import { classes, cssVar, tokens, type ClassName, type Token } from '@ideamap/ui';

const style = { color: cssVar('--color-accent') }; // 'var(--color-accent)'
tokens['--radius-md']; // '8px'
```

`apps/teacher/reference.html` renders every class below, and every colour token with a theme switcher. `apps/student/udl-reference.html` has the same switcher. Run `pnpm --filter
@ideamap/teacher dev` and open `/reference.html`.

## What changed from the prototype

`styles.css` is the prototype's stylesheet verbatim, except:

1. **Fonts are self-hosted.** The Google Fonts `@import` is replaced by
   `@font-face` rules for Inter 400, 500, 600 and 700 (latin subset, woff2,
   `font-display: swap`, about 97 KB in total) in `fonts/`. Student IP addresses
   must not go to third parties. Inter is under the SIL Open Font License 1.1;
   see `fonts/OFL.txt`. The files come from `@fontsource/inter` 5.2.8.
   Weight 600 is shipped to match the prototype's font request, but no rule in
   `styles.css` uses it yet. Browsers only download a weight a page renders, so
   it costs nothing until an app sets `font-weight: 600`.
2. **`.input:disabled`** is added (45% opacity, `not-allowed` cursor), to match
   `.btn:disabled`. The prototype has no disabled field style.
3. **`.input::placeholder`** is added: `color: var(--color-neutral-500)` with
   `opacity: 1`, on `input` and `textarea`. The prototype left placeholders to
   the browser default, `rgb(117,117,117)`, which is 3.30:1 on the field's
   surface and fails AA (Codex F2-E1). neutral-500 passes 4.5:1 on both grounds
   and still reads dimmer than typed text. `opacity: 1` stops Firefox dimming it
   further.

4. **Themes (F8, D46).** The `:root` tokens for colour, type, radius and shadow
   move into a generated theme block (see Themes). The four focus outlines use
   `--color-focus`, and the four secondary-text mixes (field labels, table
   headers, `.text-muted`, `.card-meta`) use `--alpha-label`, `--alpha-th`,
   `--alpha-muted` and `--alpha-meta`. Nocturne's values are the old literals
   (the accent, 70, 60, 55 and 50%), so Nocturne looks exactly as before.

`src/styles.test.ts` checks that every token and rule still matches the
prototype (undoing change 4), and fails if they drift apart.

## Tokens

| Group     | Tokens                                                                                                   | Example                              |
| --------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Colour    | `--color-bg`, `--color-surface`, `--color-text`, `--color-accent`, `--color-accent-2`, `--color-divider` | `background: var(--color-surface)`   |
| Ramps     | `--color-neutral-100` … `-900`, `--color-accent-100` … `-900`, `--color-accent-2-100` … `-900`           | `color: var(--color-neutral-300)`    |
| Section   | `--color-section`, `--color-section-glow`, `--color-section-ghost` (deck-scale fills only)               | `background: var(--color-section)`   |
| Type      | `--font-heading`, `--font-heading-weight`, `--font-body`                                                 | `font: 500 20px var(--font-heading)` |
| Spacing   | `--space-1` (2.8px), `-2`, `-3`, `-4`, `-6`, `-8` (22.4px)                                               | `gap: var(--space-4)`                |
| Radius    | `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (14px)                                           | `border-radius: var(--radius-md)`    |
| Elevation | `--shadow-sm`, `--shadow-md`, `--shadow-lg`                                                              | `box-shadow: var(--shadow-md)`       |

On this dark ground, use ramp steps 700–900 for tinted fills and borders, 500 as
a role's base, and 100–300 for text on tints.

## Themes

D46: every colour, and the fonts, radii and shadows a theme may change, reaches
the apps only through named tokens that a **theme file** defines. Nocturne is the
default theme and is unchanged (D10).

**The contract** is `src/themes/contract.ts`: one typed list of the tokens every
theme must set.

| Group    | Tokens                                                                                                                                                                                                                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core     | `--color-bg`, `-surface`, `-text`, `-accent`, `-accent-2`, `-divider`, `-focus`, the three ramps, the three section grounds                                                                                                                                                                                                                                 |
| Map      | Fills `--map-canvas`, `-canvas-glow`, `--map-node-open/-locked/-mastered/-centre`, `-banner`, `-term`, `-placeholder`; marks and borders `--map-node-*-border`, `-hover-border`, `--map-link`, `-link-active`, `--map-focus`, `--map-ring`; text `--map-node-text`, `-locked-text`, `-link-label`, `-hint`, `-heading`, `-banner-text`, `-placeholder-text` |
| Category | `--category-1` to `--category-6`: slot n is the n-th category in curriculum order, so no category name is hard-coded                                                                                                                                                                                                                                        |
| State    | `--state-success`, `--state-warning`, `--state-danger`, `--state-info`                                                                                                                                                                                                                                                                                      |
| Text mix | `--alpha-label`, `--alpha-th`, `--alpha-muted`, `--alpha-meta`: how strongly text mixes into its ground                                                                                                                                                                                                                                                     |
| Shape    | `--font-heading`, `--font-heading-weight`, `--font-body`, `--radius-sm/md/lg`, `--shadow-sm/md/lg`                                                                                                                                                                                                                                                          |

Spacing (`--space-*`) is the same in every theme and stays in `styles.css`.

Map tokens come in three kinds, each with its own contrast rule: a **fill** is what
a node or panel is painted (text on it needs 4.5:1); a **mark or border** needs
3:1 against its fill and the canvas; **text** needs 4.5:1 against its fill.
`--map-focus` is the map's focus ring, drawn over node fills and the canvas; the
rest of the app uses `--color-focus`.

**Use:** take every colour from a token, for example `background:
var(--map-node-mastered)`. A theme `defineTheme({...})` that misses a token or adds
an unknown one fails to type-check, and `themeProblems()` rejects it at run time.

**How it is applied.** `src/themes/<id>.ts` is generated into CSS: Nocturne into
`styles.css` as `:root, [data-theme="nocturne"]`, every other registered theme
into `themes.css` as `[data-theme="<id>"]`. With no attribute, or an unknown
one, the page shows Nocturne. Switch at run time with no reload:

```ts
import { applyTheme } from '@ideamap/ui';
applyTheme('daylight-test', document.documentElement); // unknown ids give Nocturne
```

Values come only from the typed theme files, never from user input or the
network, and `themeProblems()` refuses values that could close a declaration or
block (`;`, `{`, `}`, `url(`, comments), unbalanced quotes or parentheses,
newlines and `!important`. `offeredThemes` lists the registered themes without
the `testOnly` ones; anything that offers themes to students (S14) must use it.

**Add a theme:** (1) create `src/themes/<id>.ts` that default-exports a
`defineTheme({ id, name, values })` with every token; (2) add it to `themes` in
`src/themes/index.ts`; (3) run `UPDATE_THEMES=1 pnpm --filter @ideamap/ui test` to
regenerate `styles.css` and `themes.css`, and commit them. The drift test fails
if they are stale. `src/themes/daylight-test.ts` is a test-only light theme
(`testOnly: true`) that shows the shape. Choosing and unlocking themes is S14.

**Contrast rule.** `styles.test.ts` measures every text pair (4.5:1) and every
UI-component pair (3:1) on both grounds for every registered theme, including
the map, category, state and focus tokens and each button state. Only Nocturne
may have below-AA pairs, and only D10's nine. Any other theme must pass outright.

**No raw colours.** `src/no-raw-colours.test.ts` (run by `pnpm test`, so by CI)
scans `styles.css` outside theme blocks and the source of `apps/*` (CSS, TS, TSX,
HTML) for hex, `rgb()`/`hsl()`/`oklch()` and named colours, and reports file and
line. It finds named colours in CSS values and, in code, in style-like strings
(a colour property's value, `style="…"`, gradients, shadows, and CSS inside
template literals), so ordinary words are not flagged. Only `transparent` and
`currentcolor` are allowed. Raw colours belong in
`src/themes/*.ts`.

## Classes

| Class                                                                              | Example                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `.btn` + `.btn-primary`, `.btn-secondary`, `.btn-ghost`                            | `<button class="btn btn-primary">Save</button>`                                             |
| `.btn-icon` (36 px square), `.btn-block` (full width)                              | `<button class="btn btn-ghost btn-icon" aria-label="Remove">…</button>`                     |
| `.field` + `label`                                                                 | `<div class="field"><label for="s">Subject</label><input id="s" class="input"></div>`       |
| `.input` on `input`, `select` and `textarea`                                       | `<select class="input">…</select>`                                                          |
| `.tag` + `.tag-accent`, `.tag-accent-2`, `.tag-neutral`, `.tag-outline`            | `<span class="tag tag-outline">Editable here</span>`                                        |
| `.table` (with `thead`/`tbody`, `th`, `td`)                                        | `<table class="table"><thead><tr><th>Unit</th></tr></thead>…</table>`                       |
| `.radio` + `.dot`                                                                  | `<label class="radio"><input type="radio" name="r"><span class="dot"></span> Yes</label>`   |
| `.seg` + `.seg-opt`                                                                | `<div class="seg"><label class="seg-opt"><input type="radio" name="v"> Week</label>…</div>` |
| `.card` + `.card-kicker`, `.card-title`, `.card-body`, `.card-meta`                | `<article class="card"><div class="card-title">Clouds</div></article>`                      |
| `.elev-sm`, `.elev-md`, `.elev-lg`                                                 | `<div class="card elev-md">…</div>`                                                         |
| `.nav` + `.nav-brand`                                                              | `<nav class="nav"><span class="nav-brand">Idea Map</span><a href="/">Home</a></nav>`        |
| `.dialog-backdrop` + `.dialog`, `.dialog-title`, `.dialog-body`, `.dialog-actions` | `<div class="dialog-backdrop"><div class="dialog" role="dialog">…</div></div>`              |
| `.hr` (avoid; the system prefers whitespace)                                       | `<hr class="hr">`                                                                           |
| `.lighten` (wraps content photographs)                                             | `<img class="lighten" src="…" alt="…">`                                                     |
| `.text-muted`                                                                      | `<p class="text-muted">Last synced 2 min ago</p>`                                           |

States are built in: hover and pressed tints, a 2px accent `:focus-visible`
ring, and 45% opacity with a `not-allowed` cursor when disabled. Don't restyle
them per page.

## Contrast

The design system meets WCAG AA except for a short list of accepted contrast
deviations (D10). It is not fully AA compliant.

Text tokens pass AA (4.5:1) on `--color-bg` and `--color-surface`:
`--color-text`, `--color-neutral-300/400/500`, the accent, field labels, table
headers, `input` and `textarea` placeholders, and every `.tag-*` variant. Don't
use `--color-neutral-600` or darker for text.

The accepted contrast deviations (decision D10 in `docs/ARCHITECTURE.md`) are
the only pairs below AA, and they apply to Nocturne only (D46); other themes must
pass AA outright:

- the `.input` border, on both grounds
- `.card-meta` on `--color-surface`
- `.btn-primary` hover on surface, and active on both grounds
- `.btn-ghost` hover on surface, and active on both grounds

New colours and components must meet AA. `src/styles.test.ts` measures the
text, tag, input and placeholder pairs and every button variant's default, hover
and active state on both grounds. It reads the placeholder colour and the hover
and active tints from `styles.css`.
It fails if the set of pairs below AA differs from D10's list in either
direction: a new failure, or a fixed pair still on the list.
