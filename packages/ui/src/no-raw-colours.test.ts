import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findRawColours, withoutThemeBlocks } from './no-raw-colours.js';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'public') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

describe('findRawColours', () => {
  it('finds hex, functional and named colours, with line numbers', () => {
    const css = '.a { color: #fff; }\n.b { background: rgb(1,2,3) }\n.c { border: 1px solid red; }';
    expect(findRawColours(css, 'x.css')).toEqual([
      { line: 1, text: '#fff' },
      { line: 2, text: 'rgb(' },
      { line: 3, text: 'red' },
    ]);
  });

  it('finds colours in TSX style props and inline styles', () => {
    const tsx = "const a = <p style={{ color: 'tomato', background: '#abcdef' }} fill=\"blue\" />;";
    expect(findRawColours(tsx, 'x.tsx').map((c) => c.text)).toEqual(['#abcdef', 'tomato', 'blue']);
  });

  it('allows tokens, transparent, currentcolor, comments and font names', () => {
    const css =
      '/* #fff red */\n.a { color: var(--color-accent); background: transparent; border-color: currentcolor;\n  color: color-mix(in srgb, var(--color-text) 50%, transparent); font-family: "Inter", sans-serif; }';
    expect(findRawColours(css, 'x.css')).toEqual([]);
    expect(findRawColours("// red #fff\nconst s = 'var(--x)';", 'x.ts')).toEqual([]);
  });

  it('ignores theme blocks', () => {
    const css = '/* theme:begin a */\n:root { --c: #fff; }\n/* theme:end a */\n.x { color: #000; }';
    expect(findRawColours(withoutThemeBlocks(css), 'x.css')).toEqual([{ line: 4, text: '#000' }]);
  });
});

describe('no raw colours outside theme files (F8-F5)', () => {
  const files = [
    join(repo, 'packages/ui/styles.css'),
    ...['apps/student', 'apps/teacher', 'apps/api', 'apps/worker'].flatMap((app) =>
      walk(join(repo, app)).filter((f) => /\.(css|tsx?|html)$/.test(f)),
    ),
  ];

  it('covers the stylesheet and both apps', () => {
    const rel = files.map((f) => relative(repo, f));
    expect(rel).toContain('packages/ui/styles.css');
    expect(rel.some((f) => f.startsWith('apps/student/src/'))).toBe(true);
    expect(rel.some((f) => f.startsWith('apps/teacher/src/'))).toBe(true);
  });

  it('finds none', () => {
    const problems: string[] = [];
    for (const file of files) {
      const rel = relative(repo, file);
      let source = readFileSync(file, 'utf8');
      if (rel === 'packages/ui/styles.css') source = withoutThemeBlocks(source);
      for (const c of findRawColours(source, file)) problems.push(`${rel}:${c.line}  ${c.text}`);
    }
    expect(
      problems,
      `raw colours (use a var(--token) from a theme file):\n${problems.join('\n')}`,
    ).toEqual([]);
  });
});
