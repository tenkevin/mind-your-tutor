import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILT_IN_PERSONAS } from '@ideamap/ai';
import { describe, expect, it } from 'vitest';

// A1-F1, A1-F8, A1-S1: one server-side call path. Only the gateway's provider module
// talks to a model; browser packages never import a model SDK, name a provider host or
// read the key; persona text lives only in packages/ai's registry.

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SOURCE = /\.(ts|tsx|js|mjs|cjs|jsx|html|css)$/;
const PROVIDER_MARKERS = [
  /@anthropic-ai\//,
  /\bopenai\b/i,
  /api\.anthropic\.com/,
  /api\.openai\.com/,
  /generativelanguage\.googleapis\.com/,
  /IDEAMAP_AI_API_KEY/,
];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules') return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : SOURCE.test(name) ? [path] : [];
  });
}

const rel = (path: string) => relative(ROOT, path);
const BROWSER = ['apps/teacher', 'apps/student', 'packages/ui'];
const WORKSPACES = ['apps', 'packages'].flatMap((d) =>
  readdirSync(join(ROOT, d)).map((name) => `${d}/${name}`),
);

describe('one server-side call path (A1-F1, A1-S1)', () => {
  it('keeps model SDKs, provider hosts and the key out of the browser packages', () => {
    for (const pkg of BROWSER) {
      // Source, and the built bundles when a build has run.
      for (const file of [...files(join(ROOT, pkg, 'src')), ...files(join(ROOT, pkg, 'dist'))]) {
        const text = readFileSync(file, 'utf8');
        for (const marker of PROVIDER_MARKERS) {
          expect(marker.test(text), `${rel(file)} matches ${marker}`).toBe(false);
        }
      }
      const manifest = readFileSync(join(ROOT, pkg, 'package.json'), 'utf8');
      expect(manifest, pkg).not.toMatch(/@anthropic-ai|openai/);
    }
  });

  it('lets only the gateway provider module import a model SDK', () => {
    const importers = WORKSPACES.flatMap((pkg) => files(join(ROOT, pkg, 'src')))
      .filter((file) =>
        /^import[^;]*from ['"](@anthropic-ai\/[^'"]+|openai)['"]/m.test(readFileSync(file, 'utf8')),
      )
      .map(rel);
    expect(importers).toEqual(['apps/api/src/ai/anthropic.ts']);
  });
});

describe('one persona registry (A1-F8, D13)', () => {
  it('holds built-in prompt text only in packages/ai', () => {
    const snippets = BUILT_IN_PERSONAS.map((p) => p.prompt_template!.slice(0, 40));
    const copies = WORKSPACES.filter((pkg) => pkg !== 'packages/ai')
      .flatMap((pkg) => files(join(ROOT, pkg, 'src')))
      // The C2 import tests check the fixture's persona rows, which copy the built-ins.
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return snippets.some((s) => text.includes(s));
      })
      .map(rel);
    expect(copies).toEqual([]);
  });
});
