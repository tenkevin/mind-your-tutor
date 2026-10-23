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

`apps/teacher/reference.html` renders every class below. Run `pnpm --filter
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

`src/styles.test.ts` checks that every token and rule still matches the
prototype, and fails if they drift apart.

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
the only pairs below AA:

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
