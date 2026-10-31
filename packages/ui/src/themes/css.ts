import { themeTokenNames, type Theme } from './contract.js';

/** The declarations of one theme, in contract order, each on its own line. */
function declarations(theme: Theme): string {
  return themeTokenNames.map((name) => `  ${name}: ${theme.values[name]};`).join('\n');
}

/** CSS for a theme. The default theme also answers to :root, so no attribute means Nocturne. */
export function themeCss(theme: Theme, isDefault: boolean): string {
  const selector = isDefault ? `:root,\n[data-theme="${theme.id}"]` : `[data-theme="${theme.id}"]`;
  return `/* theme:begin ${theme.id} (generated from src/themes/${theme.id}.ts; run UPDATE_THEMES=1 pnpm --filter @ideamap/ui test) */\n${selector} {\n${declarations(theme)}\n}\n/* theme:end ${theme.id} */\n`;
}
