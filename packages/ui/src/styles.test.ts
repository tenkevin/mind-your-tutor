import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { classes, cssVar, tokens, type Token } from './index.js';

const pkg = new URL('../', import.meta.url);
const css = readFileSync(new URL('styles.css', pkg), 'utf8');

const dsDir = new URL('../../project/_ds/', pkg);
const dsName = readdirSync(dsDir).find((d) => d.startsWith('nocturne-'));
if (!dsName) throw new Error('project/_ds/nocturne-* not found');
const prototypeCss = readFileSync(new URL(`${dsName}/styles.css`, dsDir), 'utf8');

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const squash = (s: string) => stripComments(s).replace(/\s+/g, ' ').trim();

/** The first :root block, or with `all` every one (S10 adds a map-token block at the end). */
function rootTokens(source: string, all = false): Record<string, string> {
  const blocks = [...source.matchAll(/:root\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]!);
  if (blocks.length === 0) throw new Error('no :root block');
  const block = (all ? blocks : blocks.slice(0, 1)).join(';');
  const out: Record<string, string> = {};
  for (const decl of stripComments(block).split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    out[decl.slice(0, i).trim()] = decl
      .slice(i + 1)
      .trim()
      .replace(/\s+/g, ' ');
  }
  return out;
}

describe('tokens', () => {
  it('match the prototype :root exactly', () => {
    expect(rootTokens(css)).toEqual(rootTokens(prototypeCss));
  });

  it('are exported to TypeScript with the same values', () => {
    expect(tokens).toEqual(rootTokens(css, true));
  });

  it('cssVar wraps a token name', () => {
    const t: Token = '--color-accent';
    expect(cssVar(t)).toBe('var(--color-accent)');
  });
});

describe('stylesheet', () => {
  it('keeps every prototype rule verbatim, minus the Google Fonts import', () => {
    const prototypeRules = squash(prototypeCss.replace(/@import url\([^)]*\);/, ''));
    expect(squash(css)).toContain(prototypeRules);
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
const hex = (t: Token): Rgb => {
  const v = tokens[t];
  return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) as Rgb;
};
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

describe('map and category tokens (S10, D46)', () => {
  const MAP_TEXT: [Token, Token][] = [
    ['--map-node-text', '--map-node-open'],
    ['--map-node-locked-text', '--map-node-locked'],
    ['--map-hint', '--map-canvas'],
    ['--map-link-label', '--map-canvas'],
    ['--map-banner-text', '--map-banner'],
    ['--map-heading', '--map-canvas'],
    ['--map-placeholder-text', '--map-placeholder'],
  ];
  const MAP_UI: [Token, Token][] = [
    ['--map-node-open-border', '--map-canvas'],
    ['--map-node-locked-border', '--map-canvas'],
    ['--map-node-centre-border', '--map-node-centre'],
    ['--map-link', '--map-canvas'],
    ['--map-link-active', '--map-canvas'],
    ['--map-focus', '--map-canvas'],
    ['--map-banner-border', '--map-banner'],
    ['--map-term-border', '--map-canvas'],
    ['--map-placeholder-border', '--map-canvas'],
  ];
  const categories = [1, 2, 3, 4, 5, 6].map((n) => `--category-${n}` as Token);

  it.each(MAP_TEXT)('%s reads at 4.5:1 on %s', (fg, bgToken) => {
    expect(contrast(hex(fg), hex(bgToken))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(MAP_UI)('%s is a 3:1 UI colour on %s', (fg, bgToken) => {
    expect(contrast(hex(fg), hex(bgToken))).toBeGreaterThanOrEqual(3);
  });
  it.each(categories)('%s reads at 4.5:1 on the map and on a card', (c) => {
    expect(contrast(hex(c), hex('--map-canvas'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(c), hex('--map-node-open'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(c), hex('--map-node-locked'))).toBeGreaterThanOrEqual(4.5);
  });
  it('gives each category slot its own colour', () => {
    expect(new Set(categories.map((c) => tokens[c])).size).toBe(6);
  });
});

describe('contrast (WCAG AA)', () => {
  const bg = hex('--color-bg');
  const surface = hex('--color-surface');
  const text = hex('--color-text');
  const accent = hex('--color-accent');
  const grounds = { bg, surface } as const;

  // A state's background tint, read from styles.css so the test follows the CSS:
  // `<selector> { background: color-mix(in srgb, var(--token) N%, transparent); }`.
  const tint = (selector: string, ground: Rgb): Rgb => {
    const escaped = selector.replace(/[.:]/g, '\\$&');
    const m = new RegExp(
      `${escaped} \\{ background: color-mix\\(in srgb, var\\((--[\\w-]+)\\) (\\d+)%, transparent\\); \\}`,
    ).exec(squash(css));
    if (!m) throw new Error(`no background tint for ${selector}`);
    return over(hex(m[1] as Token), ground, Number(m[2]) / 100);
  };

  // The placeholder colour, read from styles.css. It must be a token at full
  // opacity: a missing rule would fall back to the browser's 3.30:1 grey.
  const placeholder = (): Rgb => {
    const m = /\.input::placeholder \{ color: var\((--[\w-]+)\); opacity: 1; \}/.exec(squash(css));
    if (!m) throw new Error('no .input::placeholder { color: var(--token); opacity: 1; } rule');
    return hex(m[1] as Token);
  };

  // Button text is 14px at weight 500, so it needs 4.5:1. Each variant's text colour:
  const buttons = { '.btn-primary': accent, '.btn-secondary': text, '.btn-ghost': accent };

  // [name, foreground, background, minimum ratio]. 4.5 for text, 3 for UI parts.
  const pairs: [string, Rgb, Rgb, number][] = [];
  for (const [g, ground] of Object.entries(grounds)) {
    pairs.push(
      [`--color-text on ${g}`, text, ground, 4.5],
      [`--color-neutral-300 on ${g}`, hex('--color-neutral-300'), ground, 4.5],
      [`--color-neutral-400 on ${g}`, hex('--color-neutral-400'), ground, 4.5],
      [`--color-neutral-500 on ${g}`, hex('--color-neutral-500'), ground, 4.5],
      [`.tag-outline / a on ${g}`, accent, ground, 4.5],
      [`.field > label on ${g}`, over(text, ground, 0.7), ground, 4.5],
      [`.table th on ${g}`, over(text, ground, 0.6), ground, 4.5],
      [`.text-muted on ${g}`, over(text, ground, 0.55), ground, 4.5],
      [`.card-meta on ${g}`, over(text, ground, 0.5), ground, 4.5],
      [`:focus-visible ring on ${g}`, accent, ground, 3],
      [`.input border on ${g}`, over(text, ground, 0.16), ground, 3],
      // The field paints --color-surface itself; both grounds are measured so a
      // transparent field on either would still pass.
      [`input.input::placeholder on ${g}`, placeholder(), ground, 4.5],
      [`textarea.input::placeholder on ${g}`, placeholder(), ground, 4.5],
    );
    for (const [btn, fg] of Object.entries(buttons)) {
      pairs.push(
        [`${btn} on ${g}`, fg, ground, 4.5],
        [`${btn}:hover on ${g}`, fg, tint(`${btn}:hover`, ground), 4.5],
        [`${btn}:active on ${g}`, fg, tint(`${btn}:active`, ground), 4.5],
      );
    }
  }
  pairs.push(
    ['.tag-accent', hex('--color-accent-100'), hex('--color-accent-800'), 4.5],
    ['.tag-accent-2', hex('--color-accent-2-100'), hex('--color-accent-2-800'), 4.5],
    ['.tag-neutral', hex('--color-neutral-100'), hex('--color-neutral-800'), 4.5],
  );

  // The only pairs allowed below AA: those accepted in docs/ARCHITECTURE.md D10.
  // Any other pair below the bar fails. Don't add to this list without a new decision.
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

  it('measures every listed exception', () => {
    const names = pairs.map(([name]) => name);
    for (const a of acceptedBelowAA) expect(names).toContain(a);
  });

  it('has exactly the D10 pairs below AA', () => {
    // A new failure, or a fixed exception still on the list, breaks this.
    const failing = pairs.filter(([, fg, back, min]) => contrast(fg, back) < min);
    expect(failing.map(([name]) => name).sort()).toEqual([...acceptedBelowAA].sort());
  });

  it.each(pairs)('%s', (name, fg, back, min) => {
    const ratio = contrast(fg, back);
    if (!acceptedBelowAA.includes(name))
      expect(ratio, `${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });
});
