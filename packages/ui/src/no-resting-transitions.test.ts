import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// A resting transition on a colour makes a theme switch animate: extra style
// recalculations on every element that has one (F8-P1). A colour transition may
// be declared only on an interaction state (:hover, :focus, :focus-visible,
// :active, :focus-within).

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const COLOUR =
  /\b(all|color|background|background-color|border|border-\w+|outline\w*|fill|stroke|box-shadow|text-decoration\w*|caret-color)\b/;
const INTERACTION = /:(hover|focus|focus-visible|focus-within|active)\b/;

/** Transitions that are allowed at rest, with the reason. Keep this list short. */
const allowed = new Set([
  // One transient highlight on the word being read aloud; it exists only while reading.
  'apps/student/src/udl/udl.css|.udl-word-now',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.css')) out.push(path);
  }
  return out;
}

/** [selector, declaration block] for each rule, with at-rule wrappers flattened. */
export function rules(css: string): [string, string][] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [
    (m[1] ?? '')
      .trim()
      .replace(/^@media[^{]*\{/, '')
      .trim(),
    m[2] ?? '',
  ]);
}

export function restingColourTransitions(css: string): string[] {
  const found: string[] = [];
  for (const [selector, body] of rules(css)) {
    for (const d of body.matchAll(/(?:^|;)\s*transition(?:-property)?\s*:\s*([^;]+)/g)) {
      const value = (d[1] ?? '').trim();
      if (/^none\b/.test(value) || value === 'inherit') continue;
      if (!COLOUR.test(value)) continue;
      const resting = selector.split(',').filter((s) => !INTERACTION.test(s));
      for (const s of resting) found.push(s.trim().replace(/\s+/g, ' '));
    }
  }
  return found;
}

describe('restingColourTransitions', () => {
  it('flags a colour transition on a resting rule, not on an interaction state', () => {
    expect(restingColourTransitions('.a { transition: border-color 120ms; }')).toEqual(['.a']);
    expect(restingColourTransitions('.a { transition: all 1s }')).toEqual(['.a']);
    expect(
      restingColourTransitions('.a:hover, .a:focus-visible { transition: border-color 1s; }'),
    ).toEqual([]);
    expect(
      restingColourTransitions(
        '@media (prefers-reduced-motion: no-preference) { .a { transition: color 1s; } }',
      ),
    ).toEqual(['.a']);
    expect(restingColourTransitions('.a, .b:hover { transition: color 1s; }')).toEqual(['.a']);
    expect(restingColourTransitions('.a { transition: inline-size 200ms; }')).toEqual([]);
    expect(restingColourTransitions('.a { transition: none !important; }')).toEqual([]);
  });
});

describe('no resting colour transitions (F8-P1)', () => {
  const files = [join(repo, 'packages/ui/styles.css'), ...walk(join(repo, 'apps'))];

  it('covers the stylesheet, the map and the UDL styles', () => {
    const rel = files.map((f) => relative(repo, f));
    expect(rel).toContain('apps/student/src/map/map.css');
    expect(rel).toContain('apps/student/src/udl/udl.css');
  });

  it('finds none outside the short allowed list', () => {
    const problems: string[] = [];
    for (const file of files) {
      const rel = relative(repo, file);
      for (const sel of restingColourTransitions(readFileSync(file, 'utf8')))
        if (!allowed.has(`${rel}|${sel}`)) problems.push(`${rel}: ${sel}`);
    }
    expect(problems, `resting colour transitions:\n${problems.join('\n')}`).toEqual([]);
  });
});
