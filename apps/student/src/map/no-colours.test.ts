import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// D46: no colour is written into the map or the idea page; every colour is a custom
// property from @ideamap/ui.
describe('map styles use tokens only (D46)', () => {
  const dir = new URL('./', import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.(css|tsx?)$/.test(f) && !f.endsWith('.test.ts'));
  it.each(files)('%s has no hex, rgb or hsl colour', (file) => {
    const source = readFileSync(new URL(file, dir), 'utf8');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  });
});
