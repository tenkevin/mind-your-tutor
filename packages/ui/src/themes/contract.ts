// The theme contract (D46): every token a theme must define, and nothing else.
// A theme is one file under ./ that default-exports a complete `Theme`; a
// missing token is a type error and an unknown one is an excess-property error.
// Layout tokens (spacing) are not themeable and live in styles.css.

/** Colours a theme sets, in the order they are written to CSS. */
export const colourTokens = [
  // Surfaces, text, accent, divider, focus
  '--color-bg',
  '--color-surface',
  '--color-text',
  '--color-accent',
  '--color-accent-2',
  '--color-divider',
  '--color-focus',
  // Ramps
  '--color-neutral-100',
  '--color-neutral-200',
  '--color-neutral-300',
  '--color-neutral-400',
  '--color-neutral-500',
  '--color-neutral-600',
  '--color-neutral-700',
  '--color-neutral-800',
  '--color-neutral-900',
  '--color-accent-100',
  '--color-accent-200',
  '--color-accent-300',
  '--color-accent-400',
  '--color-accent-500',
  '--color-accent-600',
  '--color-accent-700',
  '--color-accent-800',
  '--color-accent-900',
  '--color-accent-2-100',
  '--color-accent-2-200',
  '--color-accent-2-300',
  '--color-accent-2-400',
  '--color-accent-2-500',
  '--color-accent-2-600',
  '--color-accent-2-700',
  '--color-accent-2-800',
  '--color-accent-2-900',
  // Deck section grounds
  '--color-section',
  '--color-section-glow',
  '--color-section-ghost',
  // The student map (S10)
  '--map-node-open',
  '--map-node-locked',
  '--map-node-mastered',
  '--map-link',
  '--map-centre',
  // Category palette: slot n is the n-th category in curriculum order
  '--category-1',
  '--category-2',
  '--category-3',
  '--category-4',
  '--category-5',
  '--category-6',
  // Feedback states
  '--state-success',
  '--state-warning',
  '--state-danger',
  '--state-info',
] as const;

/** How strongly text is mixed into its ground for secondary text, as a percentage. */
export const alphaTokens = [
  '--alpha-label',
  '--alpha-th',
  '--alpha-muted',
  '--alpha-meta',
] as const;

/** Type, radius and elevation. */
export const shapeTokens = [
  '--font-heading',
  '--font-heading-weight',
  '--font-body',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
] as const;

export const themeTokenNames = [...colourTokens, ...alphaTokens, ...shapeTokens] as const;

export type ThemeToken = (typeof themeTokenNames)[number];
export type ThemeValues = Record<ThemeToken, string>;

export interface Theme {
  /** Matches [data-theme="<id>"]; lowercase letters, digits and hyphens. */
  readonly id: string;
  readonly name: string;
  /** True for themes that exist to exercise the mechanism and are never offered to students. */
  readonly testOnly?: boolean;
  readonly values: ThemeValues;
}

export const themeIdPattern = /^[a-z][a-z0-9-]*$/;

// Values are written straight into a stylesheet, so they are checked: no
// declaration or block can be closed from inside a value (F8-S1).
const unsafeValue = /[;{}<>\\\n\r]|\/\*|@|url\(|expression\(|!\s*important/i;

/** True when every quote is closed and every parenthesis matched. */
function balanced(value: string): boolean {
  let depth = 0;
  let quote = '';
  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0 && quote === '';
}

/** Problems with a theme, empty when it is valid. Checked at run time for themes built from untyped data. */
export function themeProblems(theme: Theme): string[] {
  const problems: string[] = [];
  if (!themeIdPattern.test(theme.id)) problems.push(`bad id "${theme.id}"`);
  const known = new Set<string>(themeTokenNames);
  for (const name of themeTokenNames) {
    if (typeof theme.values[name] !== 'string' || theme.values[name].trim() === '')
      problems.push(`missing ${name}`);
  }
  for (const [name, value] of Object.entries(theme.values)) {
    if (!known.has(name)) problems.push(`unknown token ${name}`);
    if (unsafeValue.test(value) || !balanced(value)) problems.push(`unsafe value for ${name}`);
  }
  return problems;
}

/** Identity helper that gives theme files their types. */
export function defineTheme(theme: Theme): Theme {
  return theme;
}
