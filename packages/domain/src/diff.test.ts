import { CurriculumDiffSchema } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { diffPacks } from './index.js';
import { packA, packB, reordered } from '../../contracts/src/testing/publish.js';

// C5: the draft vs published diff (docs/qa/C5.md F1–F3, P1, U1).

describe('diffPacks (C5)', () => {
  it('C5-F1, U1: lists exactly each §7 change kind, with display names', () => {
    const diff = diffPacks(packA(), packB());
    expect(diff).toEqual({
      first_publish: false,
      empty: false,
      ideas_added: [
        { idea_id: 'snow', title: 'Snow', unit: { unit: 2, name: 'Water in the sky' } },
      ],
      ideas_removed: [
        { idea_id: 'glacier', title: 'Glaciers', unit: { unit: 3, name: 'Water comes back' } },
      ],
      ideas_renamed: [{ idea_id: 'vap', before: 'Water vapour', after: 'Vapour' }],
      prerequisites_changed: [
        {
          idea_id: 'climate',
          title: 'Climate',
          before: ['prec', 'temp'],
          after: ['temp'],
          added: [],
          removed: [{ idea_id: 'prec', title: 'Precipitation' }],
        },
      ],
      units_changed: [
        {
          idea_id: 'ocean',
          title: 'Oceans',
          from: { unit: 1, name: 'Water goes up' },
          to: { unit: 3, name: 'Water comes back' },
        },
      ],
      assessment_changed: [
        {
          idea_id: 'sun',
          title: 'The Sun',
          unit: { unit: 1, name: 'Water goes up' },
          before: ['What does the Sun have to do with water going up into the air?'],
          after: ['How does the Sun help water rise into the air?'],
          removed: ['What does the Sun have to do with water going up into the air?'],
          added: ['How does the Sun help water rise into the air?'],
        },
      ],
      practice_changed: [],
    });
    // The API's payload shape accepts it as it is.
    expect(CurriculumDiffSchema.parse(diff)).toEqual(diff);
  });

  it('matches renames by idea_id, not by title', () => {
    const before = packA();
    const after = packA();
    // Swap two titles: two renames, nothing added or removed.
    const [x, y] = [after.ideas[0]!, after.ideas[1]!];
    [x.title, y.title] = [y.title, x.title];
    const diff = diffPacks(before, after);
    expect(diff.ideas_added).toEqual([]);
    expect(diff.ideas_removed).toEqual([]);
    expect(diff.ideas_renamed.map((r) => r.idea_id).sort()).toEqual([x.idea_id, y.idea_id].sort());
  });

  it('C5-F2: a version against itself is empty; nothing published lists every idea as added', () => {
    expect(diffPacks(packA(), packA())).toMatchObject({
      first_publish: false,
      empty: true,
      ideas_added: [],
      ideas_removed: [],
      ideas_renamed: [],
      prerequisites_changed: [],
      units_changed: [],
      assessment_changed: [],
    });
    const first = diffPacks(null, packA());
    expect(first.first_publish).toBe(true);
    expect(first.empty).toBe(false);
    expect(first.ideas_added).toHaveLength(18);
    expect(first.ideas_added.map((i) => i.idea_id)).toEqual(
      packA()
        .ideas.map((i) => i.idea_id)
        .sort(),
    );
    expect(first.prerequisites_changed).toEqual([]);
    expect(first.assessment_changed).toEqual([]);
  });

  it('C5-F3: the same JSON every time, whatever the row order', () => {
    const text = JSON.stringify(diffPacks(packA(), packB()));
    for (let i = 0; i < 3; i++) expect(JSON.stringify(diffPacks(packA(), packB()))).toBe(text);
    expect(JSON.stringify(diffPacks(reordered(packA()), reordered(packB())))).toBe(text);
    expect(JSON.stringify(diffPacks(packA(), reordered(packA())))).toBe(
      JSON.stringify(diffPacks(packA(), packA())),
    );
  });

  it('reports added and cleared questions, and ignores questions of added or removed ideas', () => {
    const before = packA();
    const after = packA();
    after.assessment.find((a) => a.idea_id === 'sun')!.question = null;
    after.assessment = after.assessment.filter((a) => a.idea_id !== 'ocean');
    const diff = diffPacks(before, after);
    expect(diff.assessment_changed.map(({ idea_id, after: q }) => [idea_id, q])).toEqual([
      ['ocean', []],
      ['sun', []],
    ]);
    expect(diffPacks(after, before).assessment_changed.map((c) => c.before)).toEqual([[], []]);
    expect(diffPacks(packA(), packB()).assessment_changed.map((c) => c.idea_id)).toEqual(['sun']);
  });

  describe('C5cx1: every accepted question of an idea', () => {
    const sunRow = (pack: ReturnType<typeof packA>) =>
      pack.assessment.find((a) => a.idea_id === 'sun')!;
    const withSecond = (...extra: string[]) => {
      const pack = packA();
      for (const question of extra) pack.assessment.push({ ...sunRow(pack), question });
      return pack;
    };
    const SECOND = 'Second valid question about the Sun?';

    it('F1: editing only a later question is visible, old and new text, with idea and unit', () => {
      const edited = withSecond('Changed second valid question about the Sun?');
      const diff = diffPacks(withSecond(SECOND), edited);
      expect(diff.empty).toBe(false);
      expect(diff.assessment_changed).toHaveLength(1);
      expect(diff.assessment_changed[0]).toMatchObject({
        idea_id: 'sun',
        title: 'The Sun',
        unit: { unit: 1, name: 'Water goes up' },
        removed: [SECOND],
        added: ['Changed second valid question about the Sun?'],
      });
      expect(CurriculumDiffSchema.parse(diff)).toEqual(diff);
    });

    it('F2: reordering unchanged rows is an empty diff, for every permutation', () => {
      const base = withSecond(SECOND, 'Third valid question about the Sun?', 'Another?');
      const rows = base.assessment;
      let seed = 12345;
      const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      const text = JSON.stringify(diffPacks(base, base));
      for (let i = 0; i < 200; i++) {
        const shuffled = [...rows];
        for (let j = shuffled.length - 1; j > 0; j--) {
          const k = Math.floor(rand() * (j + 1));
          [shuffled[j], shuffled[k]] = [shuffled[k]!, shuffled[j]!];
        }
        const other = { ...base, assessment: shuffled };
        const diff = diffPacks(base, other);
        expect(diff.empty).toBe(true);
        expect(JSON.stringify(diffPacks(other, base))).toBe(text);
        // A real change reads the same whatever the order.
        const changed = withSecond(SECOND, 'Third valid question about the Sun?');
        const a = JSON.stringify(diffPacks(base, changed));
        expect(JSON.stringify(diffPacks({ ...base, assessment: shuffled }, changed))).toBe(a);
      }
    });

    it('F3: adding and removing questions', () => {
      const two = withSecond(SECOND);
      const three = withSecond(SECOND, 'Third valid question about the Sun?');
      const added = diffPacks(two, three).assessment_changed;
      expect(added.map((c) => [c.idea_id, c.removed, c.added])).toEqual([
        ['sun', [], ['Third valid question about the Sun?']],
      ]);
      const removed = diffPacks(three, withSecond('Third valid question about the Sun?'));
      expect(removed.assessment_changed.map((c) => [c.idea_id, c.removed, c.added])).toEqual([
        ['sun', [SECOND], []],
      ]);
    });

    it('F4: rows the checker skips are ignored, never chosen over an accepted row', () => {
      const base = packA();
      const noisy = packA();
      const row = sunRow(noisy);
      noisy.assessment.unshift(
        { ...row, question: 'Unknown idea?', idea_id: 'nope' },
        { ...row, question: 'Unknown unit?', unit: 99 },
        { ...row, question: 'Wrong unit?', unit: 2 },
        { ...row, question: '   ' },
        { ...row, question: null },
      );
      expect(diffPacks(base, noisy).empty).toBe(true);
      expect(diffPacks(noisy, base).empty).toBe(true);
    });
  });

  it('names a unit missing from Units as null rather than failing', () => {
    const after = packA();
    after.ideas.find((i) => i.idea_id === 'sun')!.unit = 9;
    expect(diffPacks(packA(), after).units_changed).toEqual([
      {
        idea_id: 'sun',
        title: 'The Sun',
        from: { unit: 1, name: 'Water goes up' },
        to: { unit: 9, name: null },
      },
    ]);
  });

  it('C5-P1: two 2,000-idea versions differing in 10% of rows diff well under 500 ms', () => {
    const big = (changed: boolean) => {
      const pack = packA();
      const template = pack.ideas[1]!;
      pack.ideas = Array.from({ length: 2000 }, (_, i) => ({
        ...template,
        idea_id: `idea-${i}`,
        title: changed && i % 10 === 0 ? `Idea ${i} (new)` : `Idea ${i}`,
        requires: i > 0 ? [`idea-${i - 1}`] : [],
      }));
      pack.assessment = pack.ideas.map((idea, i) => ({
        unit: idea.unit,
        idea_id: idea.idea_id,
        question: changed && i % 10 === 5 ? `New question ${i}?` : `Question ${i}?`,
        key_points: [],
      }));
      return pack;
    };
    const [before, after] = [big(false), big(true)];
    diffPacks(before, after);
    const runs = Array.from({ length: 5 }, () => {
      const started = performance.now();
      diffPacks(before, after);
      return performance.now() - started;
    }).sort((a, b) => a - b);
    const diff = diffPacks(before, after);
    expect(diff.ideas_renamed).toHaveLength(200);
    expect(diff.assessment_changed).toHaveLength(200);
    expect(
      runs[2],
      `diffPacks median ${runs[2]!.toFixed(2)} ms, budget 500 ms (samples: ${runs.map((r) => r.toFixed(2)).join(', ')})`,
    ).toBeLessThan(500);
  });
});
