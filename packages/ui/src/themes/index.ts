import { themeProblems, type Theme } from './contract.js';
import daylightTest from './daylight-test.js';
import nocturne from './nocturne.js';

export * from './contract.js';
export { themeCss } from './css.js';

/** The default theme: what a page shows with no data-theme attribute or an unknown one. */
export const defaultTheme: Theme = nocturne;

/** Every registered theme. To add one: create src/themes/<id>.ts and list it here. */
export const themes: readonly Theme[] = [nocturne, daylightTest];

/** The themes that may be offered to students: every registered theme except test-only ones (S14). */
export const offeredThemes: readonly Theme[] = themes.filter((t) => !t.testOnly);

for (const theme of themes) {
  const problems = themeProblems(theme);
  if (problems.length > 0) throw new Error(`theme ${theme.id}: ${problems.join('; ')}`);
}

/** The registered theme with this id, or Nocturne for anything else. */
export function resolveTheme(id: unknown): Theme {
  return themes.find((t) => t.id === id) ?? defaultTheme;
}

/** What applyTheme needs from the page. `root` is normally `document.documentElement`. */
export interface ThemeRoot {
  dataset: Record<string, string | undefined>;
}
/** The browser's `window`, or anything with the same two functions; omitted outside a browser. */
export interface ThemeEnv {
  requestAnimationFrame?: (callback: () => void) => unknown;
  getComputedStyle?: (root: never) => { getPropertyValue: (name: string) => string };
}

/**
 * Switches the page's theme without a reload. Unknown ids fall back to Nocturne.
 *
 * Colour transitions (the map's node borders, for one) would animate across
 * several frames and cost extra style recalculations, so for the switch frame
 * `data-theme-switching` on the root zeroes every transition (styles.css). The
 * theme is applied, one style flush settles it with no transition running, and
 * the attribute is removed on the next frame. Hover and focus transitions are
 * untouched at every other time.
 */
export function applyTheme(id: unknown, root: ThemeRoot, env: ThemeEnv = globalThis as ThemeEnv) {
  const theme = resolveTheme(id);
  const { requestAnimationFrame, getComputedStyle } = env;
  if (root.dataset['theme'] === theme.id || !requestAnimationFrame || !getComputedStyle) {
    root.dataset['theme'] = theme.id;
    return theme;
  }
  root.dataset['themeSwitching'] = '';
  root.dataset['theme'] = theme.id;
  getComputedStyle(root as never).getPropertyValue('--color-bg');
  requestAnimationFrame(() => {
    delete root.dataset['themeSwitching'];
  });
  return theme;
}
