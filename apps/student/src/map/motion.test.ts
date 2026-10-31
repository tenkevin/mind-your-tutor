import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// F8-P1: a theme switch must stay one style recalculation, even with the pointer on the
// map. Colour transitions may sit only on the card being hovered, focused or just left,
// never on every card or link while the map is hovered.
describe('map motion keeps theme switches cheap (F8-P1)', () => {
  const css = readFileSync(new URL('./map.css', import.meta.url), 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }));

  it('has no colour transition on a map-wide hover selector', () => {
    const wide = rules.filter((r) => /\.imap:hover/.test(r.selector) && /transition/.test(r.body));
    for (const r of wide) expect(r.body).not.toMatch(/border-color|stroke|fill|(^|[\s,])color/);
  });

  it('keeps finished arrival animations off the cards', () => {
    expect(css).not.toMatch(/animation:\s*imap-[a-z-]+[^;]*\bboth\b/);
  });
});
