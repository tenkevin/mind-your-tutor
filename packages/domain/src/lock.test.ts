import { expectBestUnder } from '@ideamap/testing';
import { describe, expect, it } from 'vitest';
import { lockStates, mapStates } from './lock.js';

describe('lockStates (S10-F5)', () => {
  const ideas = [
    { idea_id: 'a', requires: [] },
    { idea_id: 'b', requires: ['a'] },
    { idea_id: 'c', requires: ['a', 'b'] },
  ];

  it('opens only ideas with no requires at zero progress', () => {
    expect(lockStates(ideas)).toEqual([
      { idea_id: 'a', state: 'open', unlocks_after: [] },
      { idea_id: 'b', state: 'locked', unlocks_after: ['a'] },
      { idea_id: 'c', state: 'locked', unlocks_after: ['a', 'b'] },
    ]);
  });

  it('names only the prerequisites still to master', () => {
    const states = lockStates(ideas, new Set(['a']));
    expect(states.map((s) => [s.idea_id, s.state, s.unlocks_after])).toEqual([
      ['a', 'open', []],
      ['b', 'open', []],
      ['c', 'locked', ['b']],
    ]);
  });

  it('ignores unknown, self and repeated requirements', () => {
    const states = lockStates([
      { idea_id: 'x', requires: ['x', 'ghost'] },
      { idea_id: 'y', requires: ['x', 'x'] },
    ]);
    expect(states).toEqual([
      { idea_id: 'x', state: 'open', unlocks_after: [] },
      { idea_id: 'y', state: 'locked', unlocks_after: ['x'] },
    ]);
  });

  it('gives the same answer every time', () => {
    expect(lockStates(ideas)).toEqual(lockStates(ideas));
  });
});

describe('mapStates (S10b-F1)', () => {
  // Water cycle, as the fixture lists it (checked by hand, not from the implementation).
  const water = [
    { idea_id: 'evap', requires: [] },
    { idea_id: 'cond', requires: ['evap'] },
    { idea_id: 'precip', requires: ['cond'] },
    { idea_id: 'coll', requires: ['precip'] },
    { idea_id: 'cycle', requires: ['cond', 'precip', 'coll'] },
  ];
  const states = (m?: string[]) =>
    Object.fromEntries(mapStates(water, new Set(m)).map((s) => [s.idea_id, s.state]));

  it('marks one step away next and the rest far at zero progress', () => {
    expect(states()).toEqual({
      evap: 'open',
      cond: 'next',
      precip: 'far',
      coll: 'far',
      cycle: 'far',
    });
  });

  it('moves ideas forward as prerequisites are mastered', () => {
    expect(states(['evap'])).toMatchObject({ cond: 'open', precip: 'next', cycle: 'far' });
    expect(states(['evap', 'cond', 'precip'])).toMatchObject({ coll: 'open', cycle: 'next' });
  });

  it('ignores unknown prerequisites and keeps open ideas open', () => {
    const s = mapStates([
      { idea_id: 'x', requires: ['ghost'] },
      { idea_id: 'y', requires: ['x', 'ghost'] },
    ]);
    expect(s.map((i) => i.state)).toEqual(['open', 'next']);
  });

  it('is pure and fast on 2,000 ideas (S10b-P1)', async () => {
    const big = Array.from({ length: 2000 }, (_, i) => ({
      idea_id: `i${i}`,
      requires: i === 0 ? [] : [`i${i - 1}`, `i${Math.floor(i / 2)}`],
    }));
    const a = mapStates(big); // warms up, so parallel test load doesn't time a cold start
    await expectBestUnder('mapStates on 2,000 ideas (S10b-P1)', 5, () => mapStates(big), {
      runs: 5,
    });
    expect(mapStates(big)).toEqual(a);
  });

  it('property: every next idea opens once its open prerequisites are mastered', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let run = 0; run < 200; run++) {
      const n = 2 + Math.floor(rnd() * 10);
      const ideas = Array.from({ length: n }, (_, i) => ({
        idea_id: `n${i}`,
        requires: Array.from({ length: Math.floor(rnd() * 3) }, () => `n${Math.floor(rnd() * n)}`),
      }));
      const mastered = new Set(ideas.filter(() => rnd() < 0.3).map((i) => i.idea_id));
      const before = mapStates(ideas, mastered);
      const open = new Set(before.filter((s) => s.state === 'open').map((s) => s.idea_id));
      const after = mapStates(ideas, new Set([...mastered, ...open]));
      for (const s of before) {
        if (s.state === 'open')
          expect(after.find((a) => a.idea_id === s.idea_id)!.state).toBe('open');
        if (s.state === 'next')
          expect(after.find((a) => a.idea_id === s.idea_id)!.state).toBe('open');
        if (s.state === 'far')
          expect(after.find((a) => a.idea_id === s.idea_id)!.state).not.toBe('open');
      }
    }
  });
});

describe('one source of unlocks (M3-F9, §8.4 rule 5)', () => {
  // Version 2 added `c` as a prerequisite of `b` after the student had unlocked it.
  const v2 = [
    { idea_id: 'a', requires: [] },
    { idea_id: 'c', requires: [] },
    { idea_id: 'b', requires: ['a', 'c'] },
  ];
  const map = (mastered: string[], unlocked?: string[]) =>
    Object.fromEntries(
      mapStates(v2, new Set(mastered), unlocked && new Set(unlocked)).map((s) => [
        s.idea_id,
        s.state,
      ]),
    );

  it('keeps an idea the tracker unlocked open after a publish adds a prerequisite', () => {
    expect(map(['a'])).toMatchObject({ b: 'next' });
    expect(map(['a'], ['a', 'b'])).toMatchObject({ b: 'open' });
    expect(lockStates(v2, new Set(['a']), new Set(['b'])).find((l) => l.idea_id === 'b')).toEqual({
      idea_id: 'b',
      state: 'open',
      unlocks_after: [],
    });
  });

  it('derives next and far from the open set including tracker unlocks', () => {
    const chain = [
      { idea_id: 'x', requires: [] },
      { idea_id: 'y', requires: ['x'] },
      { idea_id: 'z', requires: ['y'] },
    ];
    const s = (u: string[]) => mapStates(chain, new Set(), new Set(u)).map((i) => i.state);
    expect(s([])).toEqual(['open', 'next', 'far']);
    expect(s(['y'])).toEqual(['open', 'open', 'next']);
  });

  it('treats a requires outside the version as unmet when the tracker is consulted', () => {
    const ghost = [
      { idea_id: 'a', requires: ['ghost'] },
      { idea_id: 'b', requires: ['a'] },
      { idea_id: 'c', requires: ['c'] },
    ];
    expect(mapStates(ghost, new Set(), new Set()).map((i) => i.state)).toEqual([
      'far',
      'far',
      'far',
    ]);
    expect(lockStates(ghost, new Set(), new Set())[0]).toEqual({
      idea_id: 'a',
      state: 'locked',
      unlocks_after: [],
    });
    // Without tracker input, S10b behaviour is unchanged.
    expect(mapStates(ghost)[0]?.state).toBe('open');
  });
});
