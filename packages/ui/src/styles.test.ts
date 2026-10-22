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

function rootTokens(source: string): Record<string, string> {
  const block = /:root\s*\{([\s\S]*?)\n\}/.exec(source)?.[1];
  if (!block) throw new Error('no :root block');
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
    expect(tokens).toEqual(rootTokens(css));
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

describe('contrast (WCAG AA)', () => {
  const bg = hex('--color-bg');
  const surface = hex('--color-surface');
  const text = hex('--color-text');
  const accent = hex('--color-accent');
  const grounds = { bg, surface } as const;

  // [name, foreground, background, minimum ratio]. 4.5 for text, 3 for UI parts.
  const pairs: [string, Rgb, Rgb, number][] = [];
  for (const [g, ground] of Object.entries(grounds)) {
    pairs.push(
      [`--color-text on ${g}`, text, ground, 4.5],
      [`--color-neutral-300 on ${g}`, hex('--color-neutral-300'), ground, 4.5],
      [`--color-neutral-400 on ${g}`, hex('--color-neutral-400'), ground, 4.5],
      [`--color-neutral-500 on ${g}`, hex('--color-neutral-500'), ground, 4.5],
      [`.btn-primary / .tag-outline / a on ${g}`, accent, ground, 4.5],
      [`.field > label on ${g}`, over(text, ground, 0.7), ground, 4.5],
      [`.table th on ${g}`, over(text, ground, 0.6), ground, 4.5],
      [`.text-muted on ${g}`, over(text, ground, 0.55), ground, 4.5],
      [`.card-meta on ${g}`, over(text, ground, 0.5), ground, 4.5],
      [`:focus-visible ring on ${g}`, accent, ground, 3],
    );
  }
  pairs.push(
    ['.tag-accent', hex('--color-accent-100'), hex('--color-accent-800'), 4.5],
    ['.tag-accent-2', hex('--color-accent-2-100'), hex('--color-accent-2-800'), 4.5],
    ['.tag-neutral', hex('--color-neutral-100'), hex('--color-neutral-800'), 4.5],
    ['.btn-primary:hover', accent, over(accent, bg, 0.12), 4.5],
    ['.btn-primary:active', accent, over(accent, bg, 0.22), 4.5],
    ['.input border on surface', over(text, surface, 0.16), surface, 3],
    ['.input border on bg', over(text, bg, 0.16), bg, 3],
  );

  // Design-system pairs below the bar. Listed in docs/ARCHITECTURE.md "Open questions"
  // rather than retuned here; remove an entry once the design is changed.
  const belowAA = new Set([
    '.card-meta on surface',
    '.btn-primary:active',
    '.input border on surface',
    '.input border on bg',
  ]);

  it.each(pairs)('%s', (name, fg, back, min) => {
    const ratio = contrast(fg, back);
    if (belowAA.has(name))
      expect(ratio, `${name} now passes; drop it from belowAA`).toBeLessThan(min);
    else expect(ratio, `${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });
});
