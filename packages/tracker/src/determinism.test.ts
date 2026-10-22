import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Guards the lint rules that keep tracker code deterministic (ARCHITECTURE.md §8).
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

async function ruleIds(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: 'packages/tracker/src/sample.ts' });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse-error');
}

describe('tracker determinism lint rules', () => {
  it.each([
    ['Date.now()', 'no-restricted-properties'],
    ['new Date()', 'no-restricted-syntax'],
    ['Math.random()', 'no-restricted-properties'],
    ["fetch('/x')", 'no-restricted-globals'],
    ["globalThis.fetch('/x')", 'no-restricted-properties'],
  ])('rejects %s', async (expr, rule) => {
    expect(await ruleIds(`export const x = ${expr};\n`)).toContain(rule);
  });

  it('allows dates built from event time', async () => {
    expect(await ruleIds("export const x = new Date('2026-01-01T00:00:00Z');\n")).toEqual([]);
  });
});
