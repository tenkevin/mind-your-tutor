// Design tokens as TypeScript: Nocturne's values (the default theme) plus the
// layout tokens no theme changes. styles.test.ts fails if this list and
// styles.css drift apart.
import nocturne from './themes/nocturne.js';
import type { ThemeToken } from './themes/contract.js';

/** Spacing is the same in every theme, so it lives in styles.css, not in a theme. */
export const layoutTokens = {
  '--space-1': '2.8px',
  '--space-2': '5.6px',
  '--space-3': '8.4px',
  '--space-4': '11.2px',
  '--space-6': '16.8px',
  '--space-8': '22.4px',
} as const;

export const tokens = { ...nocturne.values, ...layoutTokens } as const;

export type Token = ThemeToken | keyof typeof layoutTokens;

/** `var(--token)` for use in inline styles, e.g. `{ color: cssVar('--color-accent') }`. */
export function cssVar(token: Token): `var(${Token})` {
  return `var(${token})`;
}
