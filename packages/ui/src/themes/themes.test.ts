import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  colourTokens,
  defaultTheme,
  defineTheme,
  offeredThemes,
  resolveTheme,
  themeCss,
  themeProblems,
  themeTokenNames,
  themes,
  type Theme,
} from '../index.js';
import daylight from './daylight-test.js';
import { renderStyles, renderThemes, writeGenerated } from './generate.js';

const pkg = new URL('../../', import.meta.url);

// UPDATE_THEMES=1 pnpm --filter @ideamap/ui test rewrites the generated CSS from the theme files.
if (process.env['UPDATE_THEMES'] === '1') writeGenerated();

describe('theme contract (F8-F1, F8-F4)', () => {
  it('lists each token once', () => {
    expect(new Set(themeTokenNames).size).toBe(themeTokenNames.length);
  });

  it('covers the map, six categories and the four feedback states', () => {
    for (const t of [
      '--map-node-open',
      '--map-node-locked',
      '--map-node-mastered',
      '--map-link',
      '--map-node-centre',
      '--map-node-mastered-border',
      '--map-focus',
      '--category-1',
      '--category-6',
      '--state-success',
      '--state-warning',
      '--state-danger',
      '--state-info',
      '--color-focus',
    ] as const)
      expect(themeTokenNames).toContain(t);
  });

  it('every registered theme is complete and has no unknown token', () => {
    for (const theme of themes) {
      expect(themeProblems(theme), theme.id).toEqual([]);
      expect(Object.keys(theme.values).sort(), theme.id).toEqual([...themeTokenNames].sort());
    }
  });

  it('rejects a theme missing a token, or with an extra one (types and run time)', () => {
    const rest = Object.fromEntries(
      Object.entries(daylight.values).filter(([k]) => k !== '--color-bg'),
    ) as Omit<Theme['values'], '--color-bg'>;
    // @ts-expect-error a missing token is a type error
    const missing = defineTheme({ id: 'x', name: 'x', values: rest });
    expect(themeProblems(missing)).toEqual(['missing --color-bg']);

    const extra = defineTheme({
      id: 'x',
      name: 'x',
      // @ts-expect-error an unknown token is a type error
      values: { ...daylight.values, '--color-bogus': '#000000' },
    });
    expect(themeProblems(extra)).toEqual(['unknown token --color-bogus']);
  });

  it('colour tokens are hex, except the divider and shadows', () => {
    for (const theme of themes)
      for (const t of colourTokens) {
        if (t === '--color-divider') continue;
        expect(theme.values[t], `${theme.id} ${t}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
  });
});

describe('generated CSS (F8-F2, F8-F4)', () => {
  it('styles.css carries the generated Nocturne block on :root', () => {
    const css = readFileSync(new URL('styles.css', pkg), 'utf8');
    expect(css).toBe(renderStyles());
    expect(themeCss(defaultTheme, true)).toContain(':root,\n[data-theme="nocturne"]');
  });

  it('themes.css carries every other theme under [data-theme]', () => {
    expect(readFileSync(new URL('themes.css', pkg), 'utf8')).toBe(renderThemes());
    expect(renderThemes()).toContain('[data-theme="daylight-test"] {');
    expect(renderThemes()).not.toContain(':root');
  });

  it('declares every token of the theme, and only those', () => {
    const block = themeCss(daylight, false);
    const names = [...block.matchAll(/^ {2}(--[\w-]+):/gm)].map((m) => m[1]);
    expect(names).toEqual([...themeTokenNames]);
  });

  it('a theme differs visibly from Nocturne', () => {
    for (const t of ['--color-bg', '--color-text', '--color-accent', '--map-node-open'] as const)
      expect(daylight.values[t]).not.toBe(defaultTheme.values[t]);
  });
});

describe('switching at run time (F8-F3, F8-S1)', () => {
  const root = () => ({ dataset: {} as Record<string, string | undefined> });

  it('sets data-theme to a registered id and back to Nocturne', () => {
    const r = root();
    expect(applyTheme('daylight-test', r).id).toBe('daylight-test');
    expect(r.dataset['theme']).toBe('daylight-test');
    expect(applyTheme('nocturne', r).id).toBe('nocturne');
    expect(r.dataset['theme']).toBe('nocturne');
  });

  it.each([undefined, null, '', 'nope', 'nocturne;}', 'x"] { color: red } [data-theme="', 42, {}])(
    'falls back to Nocturne for %j',
    (id) => {
      const r = root();
      expect(resolveTheme(id)).toBe(defaultTheme);
      applyTheme(id, r);
      expect(r.dataset['theme']).toBe('nocturne');
    },
  );

  it('refuses a theme whose value could close a declaration or block', () => {
    const evil = (value: string): Theme => ({
      ...daylight,
      id: 'evil',
      values: { ...daylight.values, '--color-bg': value },
    });
    for (const v of ['red;}', '#fff} body{display:none', 'url(http://x)', '/* x */', 'a\\b'])
      expect(themeProblems(evil(v)), v).toContain('unsafe value for --color-bg');
    for (const v of [
      '"Inter',
      "'x",
      'rgb(1,2,3',
      'a)',
      'a\nb',
      'a\rb',
      '#fff !important',
      '#fff ! important',
    ])
      expect(themeProblems(evil(v)), JSON.stringify(v)).toContain('unsafe value for --color-bg');
    for (const v of ['"Inter", system-ui, sans-serif', 'color-mix(in srgb, #fff 16%, transparent)'])
      expect(themeProblems(evil(v)), v).toEqual([]);
    expect(themeProblems({ ...daylight, id: 'A b' })).toContain('bad id "A b"');
  });
});

describe('test-only themes (S14)', () => {
  it('are registered but never offered', () => {
    expect(themes.map((t) => t.id)).toContain('daylight-test');
    expect(daylight.testOnly).toBe(true);
    expect(offeredThemes.map((t) => t.id)).toEqual(['nocturne']);
  });
});

describe('theme switch frame (F8-P1)', () => {
  it('zeroes transitions for the switch frame, flushes once, then restores them', () => {
    const log: string[] = [];
    const dataset: Record<string, string | undefined> = { theme: 'nocturne' };
    const root = {
      dataset: new Proxy(dataset, {
        set(t, k: string, v: string) {
          log.push(`set ${k}=${v}`);
          t[k] = v;
          return true;
        },
        deleteProperty(t, k: string) {
          log.push(`delete ${k}`);
          delete t[k];
          return true;
        },
      }),
    };
    let frame: (() => void) | undefined;
    const env = {
      requestAnimationFrame: (cb: () => void) => (frame = cb),
      getComputedStyle: () => ({ getPropertyValue: () => (log.push('flush'), '') }),
    };
    applyTheme('daylight-test', root, env);
    expect(log).toEqual(['set themeSwitching=', 'set theme=daylight-test', 'flush']);
    expect(dataset['themeSwitching']).toBe('');
    frame?.();
    expect(dataset['themeSwitching']).toBeUndefined();
    expect(dataset['theme']).toBe('daylight-test');
  });

  it('does nothing extra when the theme is unchanged or there is no browser', () => {
    const root = { dataset: { theme: 'nocturne' } as Record<string, string | undefined> };
    applyTheme('nocturne', root, {
      requestAnimationFrame: () => {
        throw new Error('no frame needed');
      },
      getComputedStyle: () => {
        throw new Error('no flush needed');
      },
    });
    applyTheme('daylight-test', root, {});
    expect(root.dataset).toEqual({ theme: 'daylight-test' });
  });

  it('styles.css switches every transition off while data-theme-switching is set', () => {
    const css = readFileSync(new URL('styles.css', pkg), 'utf8');
    expect(css).toMatch(
      /:root\[data-theme-switching\] \*[^{]*\{ transition-duration: 0s !important; \}/,
    );
  });
});
