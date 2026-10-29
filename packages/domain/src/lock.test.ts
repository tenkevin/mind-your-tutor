import { describe, expect, it } from 'vitest';
import { lockStates } from './lock.js';

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
