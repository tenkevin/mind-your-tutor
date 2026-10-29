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

/** Switches the page's theme without a reload. Unknown ids fall back to Nocturne. */
/** `root` is normally `document.documentElement`. */
export function applyTheme(id: unknown, root: { dataset: Record<string, string | undefined> }) {
  const theme = resolveTheme(id);
  root.dataset['theme'] = theme.id;
  return theme;
}
