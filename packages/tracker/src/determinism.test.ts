import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

// Guards the lint rules that keep tracker code deterministic (ARCHITECTURE.md §8).
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

async function lint(code: string, filePath = 'packages/tracker/src/sample.ts') {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages ?? [];
}

function expectBanned(messages: Linter.LintMessage[], rule: string) {
  const hits = messages.filter((m) => m.ruleId === rule);
  expect(hits.length).toBeGreaterThan(0);
  for (const { message } of hits) {
    expect(message).toContain('is banned in tracker code');
    expect(message).toContain('from event data instead');
    expect(message).toContain('ARCHITECTURE.md §8');
  }
}

describe('tracker determinism lint rules', () => {
  it.each([
    // The ten F1-F4 cases
    ['Date.now()', 'no-restricted-properties'],
    ['new Date()', 'no-restricted-syntax'],
    ['Math.random()', 'no-restricted-properties'],
    ["fetch('/x')", 'no-restricted-globals'],
    ["globalThis.fetch('/x')", 'no-restricted-globals'],
    ['performance.now()', 'no-restricted-globals'],
    ['crypto.randomUUID()', 'no-restricted-globals'],
    ['crypto.getRandomValues(new Uint8Array(4))', 'no-restricted-globals'],
    ['setTimeout(() => {}, 0)', 'no-restricted-globals'],
    ["import('node:http')", 'no-restricted-syntax'],
    // Aliases
    ["Date['now']()", 'no-restricted-properties'],
    ['new globalThis.Date()', 'no-restricted-globals'],
    ['Reflect.construct(Date, [])', 'no-restricted-syntax'],
    ['globalThis.performance.now()', 'no-restricted-globals'],
    ['window.fetch', 'no-restricted-globals'],
    ['process.hrtime()', 'no-restricted-globals'],
    ["eval('Date.now()')", 'no-restricted-globals'],
    ["new Function('return Date.now()')", 'no-restricted-globals'],
  ])('rejects %s', async (expr, rule) => {
    expectBanned(await lint(`export const x = ${expr};\n`), rule);
  });

  it.each([
    ['const D = Date; D.now();'],
    ['const M = Math; M.random();'],
    ['const { now } = Date; now();'],
  ])('rejects the alias in %s', async (code) => {
    expectBanned(await lint(`${code}\n`), 'no-restricted-syntax');
  });

  it.each(
    [
      'crypto',
      'http',
      'https',
      'net',
      'fs',
      'fs/promises',
      'timers',
      'child_process',
      'perf_hooks',
    ].flatMap((mod) => [mod, `node:${mod}`]),
  )('rejects importing %s', async (mod) => {
    expectBanned(await lint(`import '${mod}';\n`), 'no-restricted-imports');
  });

  it('rejects named imports from node:crypto', async () => {
    const code = "import { randomUUID } from 'node:crypto';\nexport const x = randomUUID();\n";
    expectBanned(await lint(code), 'no-restricted-imports');
  });

  it.each([
    'packages/tracker/src/q.mts',
    'packages/tracker/src/q.cts',
    'packages/tracker/src/q.js',
    'packages/tracker/src/q.mjs',
    'packages/tracker/src/q.tsx',
    'packages/tracker/src/rules/deep/q.ts',
    'packages/tracker/qa-root.ts',
  ])('covers %s', async (filePath) => {
    expectBanned(
      await lint('export const z = Date.now();\n', filePath),
      'no-restricted-properties',
    );
  });

  it.each([
    ["new Date('2026-01-01T00:00:00Z')"],
    ["Date.parse('2026-01-01T00:00:00Z')"],
    ['Date.UTC(2026, 0, 1)'],
    ['Math.max(1, 2)'],
    ['({}) instanceof Date'],
    ['{ Date: 1, Math: 2 }'],
  ])('allows %s', async (expr) => {
    expect(await lint(`export const x = ${expr};\n`)).toEqual([]);
  });

  it('allows Date as a type', async () => {
    expect(await lint('export type T = { at: Date };\n')).toEqual([]);
  });

  it('leaves other packages alone', async () => {
    const code = 'export const x = Date.now();\n';
    expect(await lint(code, 'packages/domain/src/x.ts')).toEqual([]);
  });
});
