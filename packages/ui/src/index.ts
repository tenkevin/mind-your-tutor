// The styles live in ../styles.css (import '@ideamap/ui/styles.css' once per app).
// This module only carries names, so it has no runtime cost beyond constants.
export { cssVar, tokens, type Token } from './tokens.js';

/** Component classes in styles.css, grouped as in the design-system readme. */
export const classes = {
  button: ['btn', 'btn-primary', 'btn-secondary', 'btn-ghost', 'btn-icon', 'btn-block'],
  tag: ['tag', 'tag-accent', 'tag-accent-2', 'tag-neutral', 'tag-outline'],
  form: ['field', 'input', 'radio', 'dot', 'seg', 'seg-opt'],
  table: ['table'],
  card: [
    'card',
    'card-kicker',
    'card-title',
    'card-body',
    'card-meta',
    'elev-sm',
    'elev-md',
    'elev-lg',
  ],
  nav: ['nav', 'nav-brand'],
  dialog: ['dialog-backdrop', 'dialog', 'dialog-title', 'dialog-body', 'dialog-actions'],
  utility: ['hr', 'lighten', 'text-muted'],
} as const;

export type ClassName = (typeof classes)[keyof typeof classes][number];
