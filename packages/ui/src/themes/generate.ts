import { readFileSync, writeFileSync } from 'node:fs';
import { themeCss } from './css.js';
import { defaultTheme, themes } from './index.js';

const pkg = new URL('../../', import.meta.url);

/** styles.css with the default theme's generated block filled in. */
export function renderStyles(): string {
  const css = readFileSync(new URL('styles.css', pkg), 'utf8');
  const re = new RegExp(
    `/\\* theme:begin ${defaultTheme.id}[\\s\\S]*?/\\* theme:end ${defaultTheme.id} \\*/\\n`,
  );
  if (!re.test(css)) throw new Error('styles.css has no theme block for the default theme');
  return css.replace(re, () => themeCss(defaultTheme, true));
}

/** themes.css: every registered theme except the default, for apps that offer a choice. */
export function renderThemes(): string {
  const head =
    '/* Generated from src/themes/*.ts; do not edit by hand. Import after styles.css. */\n';
  return (
    head +
    themes
      .filter((t) => t !== defaultTheme)
      .map((t) => themeCss(t, false))
      .join('\n')
  );
}

export function writeGenerated(): void {
  writeFileSync(new URL('styles.css', pkg), renderStyles());
  writeFileSync(new URL('themes.css', pkg), renderThemes());
}
