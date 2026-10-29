import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { classes, cssVar, defaultTheme, themes, tokens, type Theme, type Token } from './index.js';

const pkg = new URL('../', import.meta.url);
const css = readFileSync(new URL('styles.css', pkg), 'utf8');

const dsDir = new URL('../../project/_ds/', pkg);
const dsName = readdirSync(dsDir).find((d) => d.startsWith('nocturne-'));
if (!dsName) throw new Error('project/_ds/nocturne-* not found');
const prototypeCss = readFileSync(new URL(`${dsName}/styles.css`, dsDir), 'utf8');

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const squash = (s: string) => stripComments(s).replace(/\s+/g, ' ').trim();

// Every custom property declared in a :root block (spacing, and the default theme's block).
function rootTokens(source: string): Record<string, string> {
  const blocks = [...source.matchAll(/(?:^|\n):root[^{]*\{([\s\S]*?)\n\}/g)].map((m) => m[1] ?? '');
  if (blocks.length === 0) throw new Error('no :root block');
  const out: Record<string, string> = {};
  for (const block of blocks) {
    for (const decl of stripComments(block).split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      out[decl.slice(0, i).trim()] = decl
        .slice(i + 1)
        .trim()
        .replace(/\s+/g, ' ');
    }
  }
  return out;
}

describe('tokens', () => {
  it('keep every prototype :root token, with its value (F8 only adds tokens)', () => {
    expect(rootTokens(css)).toMatchObject(rootTokens(prototypeCss));
  });

  it('are exported to TypeScript with the same values', () => {
    expect(tokens).toEqual(rootTokens(css));
  });

  it('cssVar wraps a token name', () => {
    const t: Token = '--color-accent';
    expect(cssVar(t)).toBe('var(--color-accent)');
  });
});

describe('stylesheet', () => {
  it('keeps every prototype rule verbatim, minus the Google Fonts import', () => {
    // Token blocks are checked above. F8 swaps four literals for tokens that
    // hold the same value in Nocturne; undo that to compare the rules.
    const nocturne = defaultTheme.values;
    const original = squash(css)
      .replace(/var\(--color-focus\)/g, 'var(--color-accent)')
      .replace(/var\(--alpha-(label|th|muted|meta)\)/g, (_, k: string) =>
        k === 'label'
          ? nocturne['--alpha-label']
          : k === 'th'
            ? nocturne['--alpha-th']
            : k === 'muted'
              ? nocturne['--alpha-muted']
              : nocturne['--alpha-meta'],
      );
    const withoutRoot = (x: string) => x.replace(/:root[^{]*\{[^}]*\}/g, '');
    const prototypeRules = squash(prototypeCss.replace(/@import url\([^)]*\);/, ''));
    expect(withoutRoot(original)).toContain(withoutRoot(prototypeRules));
  });

  it('defines every exported class', () => {
    for (const name of Object.values(classes).flat()) {
      expect(css, name).toMatch(new RegExp(`\\.${name}(?![\\w-])`));
    }
  });

  it.each([
    '.btn:disabled',
    '.btn-primary:hover',
    '.btn-primary:active',
    '.btn-secondary:hover',
    '.btn-secondary:active',
    '.btn-ghost:hover',
    '.btn-ghost:active',
    '.input:hover',
    '.input:focus-visible',
    '.input:disabled',
    '.input::placeholder',
    'textarea.input',
    '.field > label',
    '.table th',
    '.table td',
    '.table thead tr',
    '.table tbody tr',
    '.table tbody tr:hover',
    ':focus-visible',
  ])('has the %s rule', (selector) => {
    expect(squash(css)).toContain(`${selector} {`);
  });

  it('loads nothing from another host', () => {
    expect(stripComments(css)).not.toMatch(/@import/);
    expect(css).not.toMatch(/(url|image-set)\(\s*["']?(https?:)?\/\//);
  });

  it('is under 10 KB gzipped', () => {
    expect(gzipSync(css).length).toBeLessThan(10 * 1024);
  });
});

describe('fonts', () => {
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? '');

  it('self-host Inter 400, 500, 600 and 700 as swap-displayed woff2', () => {
    const weights = faces.map((f) => /font-weight:\s*(\d+)/.exec(f)?.[1]);
    expect(weights).toEqual(['400', '500', '600', '700']);
    for (const face of faces) {
      expect(face).toMatch(/font-family:\s*"Inter"/);
      expect(face).toMatch(/font-display:\s*swap/);
      expect(face).toMatch(/unicode-range:\s*U\+0000-00FF/);
      const urls = [...face.matchAll(/url\("([^"]+)"\)\s*format\("([^"]+)"\)/g)];
      expect(urls).toHaveLength(1);
      expect(urls[0]?.[2]).toBe('woff2');
      expect(existsSync(new URL(urls[0]?.[1] ?? '', pkg)), urls[0]?.[1]).toBe(true);
    }
  });

  it('total under 150 KB', () => {
    const fontDir = new URL('fonts/', pkg);
    const total = readdirSync(fontDir)
      .filter((f) => f.endsWith('.woff2'))
      .reduce((sum, f) => sum + statSync(new URL(f, fontDir)).size, 0);
    expect(total).toBeLessThan(150 * 1024);
  });

  it('ship with the SIL Open Font License', () => {
    expect(readFileSync(new URL('fonts/OFL.txt', pkg), 'utf8')).toContain(
      'SIL Open Font License, Version 1.1',
    );
  });
});

// WCAG 2.1 contrast. color-mix(in srgb, X p%, transparent) over a ground is X at p% alpha.
type Rgb = [number, number, number];
const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
  fg.map((c, i) => c * alpha + (bg[i] ?? 0) * (1 - alpha)) as Rgb;
const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

// The pairs below AA that D10 accepts for Nocturne only. Any other theme must pass outright.
// Don't add to this list without a new decision.
const acceptedBelowAA = [
  '.input border on bg',
  '.input border on surface',
  '.card-meta on surface',
  '.btn-primary:hover on surface',
  '.btn-primary:active on bg',
  '.btn-primary:active on surface',
  '.btn-ghost:hover on surface',
  '.btn-ghost:active on bg',
  '.btn-ghost:active on surface',
];

type Pair = [string, Rgb, Rgb, number];

/** Every foreground/background pair a theme must get right, with its minimum ratio (4.5 text, 3 UI part). */
function pairsFor(theme: Theme): Pair[] {
  const v = theme.values;
  const hex = (t: keyof Theme['values']): Rgb => {
    const value = v[t];
    if (!/^#[0-9a-f]{6}$/i.test(value))
      throw new Error(`${theme.id} ${t} is not #rrggbb: ${value}`);
    return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
  };
  const pct = (t: keyof Theme['values']) => Number.parseFloat(v[t]) / 100;
  const bg = hex('--color-bg');
  const surface = hex('--color-surface');
  const text = hex('--color-text');
  const accent = hex('--color-accent');
  const grounds = { bg, surface } as const;

  // --color-divider is `color-mix(in srgb, #rrggbb N%, transparent)`.
  const dm = /^color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, transparent\)$/i.exec(
    v['--color-divider'],
  );
  if (!dm) throw new Error(`${theme.id} --color-divider has an unexpected form`);
  const dividerInk = [1, 3, 5].map((i) => parseInt((dm[1] ?? '').slice(i, i + 2), 16)) as Rgb;
  const dividerAlpha = Number(dm[2]) / 100;

  // A state's background tint, read from styles.css so the test follows the CSS:
  // `<selector> { background: color-mix(in srgb, var(--token) N%, transparent); }`.
  const tint = (selector: string, ground: Rgb): Rgb => {
    const escaped = selector.replace(/[.:]/g, '\\$&');
    const m = new RegExp(
      `${escaped} \\{ background: color-mix\\(in srgb, var\\((--[\\w-]+)\\) (\\d+)%, transparent\\); \\}`,
    ).exec(squash(css));
    if (!m) throw new Error(`no background tint for ${selector}`);
    return over(hex(m[1] as keyof Theme['values']), ground, Number(m[2]) / 100);
  };

  // The placeholder colour, read from styles.css. It must be a token at full
  // opacity: a missing rule would fall back to the browser's 3.30:1 grey.
  const placeholder = (): Rgb => {
    const m = /\.input::placeholder \{ color: var\((--[\w-]+)\); opacity: 1; \}/.exec(squash(css));
    if (!m) throw new Error('no .input::placeholder { color: var(--token); opacity: 1; } rule');
    return hex(m[1] as keyof Theme['values']);
  };

  // Button text is 14px at weight 500, so it needs 4.5:1. Each variant's text colour:
  const buttons = { '.btn-primary': accent, '.btn-secondary': text, '.btn-ghost': accent };

  const pairs: Pair[] = [];
  for (const [g, ground] of Object.entries(grounds)) {
    pairs.push(
      [`--color-text on ${g}`, text, ground, 4.5],
      [`--color-neutral-300 on ${g}`, hex('--color-neutral-300'), ground, 4.5],
      [`--color-neutral-400 on ${g}`, hex('--color-neutral-400'), ground, 4.5],
      [`--color-neutral-500 on ${g}`, hex('--color-neutral-500'), ground, 4.5],
      [`.tag-outline / a on ${g}`, accent, ground, 4.5],
      [`.field > label on ${g}`, over(text, ground, pct('--alpha-label')), ground, 4.5],
      [`.table th on ${g}`, over(text, ground, pct('--alpha-th')), ground, 4.5],
      [`.text-muted on ${g}`, over(text, ground, pct('--alpha-muted')), ground, 4.5],
      [`.card-meta on ${g}`, over(text, ground, pct('--alpha-meta')), ground, 4.5],
      [`:focus-visible ring on ${g}`, hex('--color-focus'), ground, 3],
      [`.input border on ${g}`, over(dividerInk, ground, dividerAlpha), ground, 3],
      // The field paints --color-surface itself; both grounds are measured so a
      // transparent field on either would still pass.
      [`input.input::placeholder on ${g}`, placeholder(), ground, 4.5],
      [`textarea.input::placeholder on ${g}`, placeholder(), ground, 4.5],
    );
    for (let n = 1; n <= 6; n++)
      pairs.push([
        `--category-${n} on ${g}`,
        hex(`--category-${n}` as keyof Theme['values']),
        ground,
        3,
      ]);
    // State colours may be used as text, so they need 4.5:1.
    for (const s of ['success', 'warning', 'danger', 'info'])
      pairs.push([
        `--state-${s} on ${g}`,
        hex(`--state-${s}` as keyof Theme['values']),
        ground,
        4.5,
      ]);
    for (const [btn, fg] of Object.entries(buttons)) {
      pairs.push(
        [`${btn} on ${g}`, fg, ground, 4.5],
        [`${btn}:hover on ${g}`, fg, tint(`${btn}:hover`, ground), 4.5],
        [`${btn}:active on ${g}`, fg, tint(`${btn}:active`, ground), 4.5],
      );
    }
  }
  // The student map (S10) is painted on --map-canvas, brightening to --map-canvas-glow at the
  // centre, so marks are measured on both. Nodes are measured against their own fill (text 4.5,
  // border 3) and against the canvas (border 3). --map-ring is a decorative guide and carries no
  // information, so it has no pair.
  type T = keyof Theme['values'];
  const map = (t: string) => hex(`--map-${t}` as T);
  const canvases = { canvas: map('canvas'), 'canvas-glow': map('canvas-glow') } as const;
  const nodes = {
    open: ['node-open', 'node-open-border', 'node-text'],
    locked: ['node-locked', 'node-locked-border', 'node-locked-text'],
    mastered: ['node-mastered', 'node-mastered-border', 'node-text'],
    centre: ['node-centre', 'node-centre-border', 'node-text'],
  } as const;
  for (const [name, [fill, border, textTok]] of Object.entries(nodes)) {
    pairs.push(
      [`--map-${textTok} on ${fill} (${name})`, map(textTok), map(fill), 4.5],
      [`--map-${border} on ${fill}`, map(border), map(fill), 3],
      [`--map-node-hover-border on ${fill}`, map('node-hover-border'), map(fill), 3],
      [`--map-focus on ${fill}`, map('focus'), map(fill), 3],
    );
    for (const [c, ground] of Object.entries(canvases))
      pairs.push([`--map-${border} on ${c}`, map(border), ground, 3]);
  }
  for (const [c, ground] of Object.entries(canvases)) {
    pairs.push(
      [`--map-link on ${c}`, map('link'), ground, 3],
      [`--map-link-active on ${c}`, map('link-active'), ground, 3],
      [`--map-link-label on ${c}`, map('link-label'), ground, 4.5],
      [`--map-hint on ${c}`, map('hint'), ground, 4.5],
      [`--map-heading on ${c}`, map('heading'), ground, 4.5],
      [`--map-focus on ${c}`, map('focus'), ground, 3],
      [`--map-node-hover-border on ${c}`, map('node-hover-border'), ground, 3],
      [`--map-banner-border on ${c}`, map('banner-border'), ground, 3],
      [`--map-term-border on ${c}`, map('term-border'), ground, 3],
      [`--map-placeholder-border on ${c}`, map('placeholder-border'), ground, 3],
    );
  }
  pairs.push(
    ['--map-banner-text on --map-banner', map('banner-text'), map('banner'), 4.5],
    ['--map-banner-border on --map-banner', map('banner-border'), map('banner'), 3],
    ['--map-heading on --map-term', map('heading'), map('term'), 4.5],
    ['--map-term-border on --map-term', map('term-border'), map('term'), 3],
    [
      '--map-placeholder-text on --map-placeholder',
      map('placeholder-text'),
      map('placeholder'),
      4.5,
    ],
    [
      '--map-placeholder-border on --map-placeholder',
      map('placeholder-border'),
      map('placeholder'),
      3,
    ],
    ['--map-hint on bg', map('hint'), bg, 4.5],
    ['--map-heading on bg', map('heading'), bg, 4.5],
  );
  pairs.push(
    ['.tag-accent', hex('--color-accent-100'), hex('--color-accent-800'), 4.5],
    ['.tag-accent-2', hex('--color-accent-2-100'), hex('--color-accent-2-800'), 4.5],
    ['.tag-neutral', hex('--color-neutral-100'), hex('--color-neutral-800'), 4.5],
  );
  return pairs;
}

describe.each(themes.map((t) => [t.id, t] as const))('contrast (WCAG AA) · %s', (id, theme) => {
  const pairs = pairsFor(theme);
  const exceptions = id === defaultTheme.id ? acceptedBelowAA : [];
  const failing = pairs.filter(([, fg, back, min]) => contrast(fg, back) < min);

  it('measures every listed exception', () => {
    const names = pairs.map(([name]) => name);
    for (const a of exceptions) expect(names).toContain(a);
  });

  it(exceptions.length > 0 ? 'has exactly the D10 pairs below AA' : 'passes AA outright', () => {
    // A new failure, or a fixed exception still on the list, breaks this.
    expect(failing.map(([name]) => name).sort()).toEqual([...exceptions].sort());
  });

  it.each(pairs)('%s', (name, fg, back, min) => {
    const ratio = contrast(fg, back);
    if (!exceptions.includes(name))
      expect(ratio, `${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });
});
