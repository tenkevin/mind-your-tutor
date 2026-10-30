// Which ideas a student can open (ARCHITECTURE.md §8.4). Deterministic: no clock, no
// randomness, no I/O. S10 uses it at zero progress; S2 passes the mastered set from the
// tracker replay. An idea is open when every idea it requires is mastered, so with
// nothing mastered only ideas with no `requires` are open.

export interface LockInput {
  idea_id: string;
  requires: readonly string[];
}

export interface IdeaLock {
  idea_id: string;
  state: 'open' | 'locked';
  /** The prerequisite ideas still to master, in the order the sheet lists them. */
  unlocks_after: string[];
}

export function lockStates(
  ideas: readonly LockInput[],
  mastered: ReadonlySet<string> = new Set(),
): IdeaLock[] {
  const known = new Set(ideas.map((i) => i.idea_id));
  return ideas.map((idea) => {
    // A requirement the pack doesn't define can never be met, so it can't lock an idea
    // forever; the data checks report it to the teacher.
    const missing = [...new Set(idea.requires)].filter(
      (id) => id !== idea.idea_id && known.has(id) && !mastered.has(id),
    );
    return {
      idea_id: idea.idea_id,
      state: missing.length === 0 ? 'open' : 'locked',
      unlocks_after: missing,
    };
  });
}

export type MapState = 'open' | 'next' | 'far';

export interface IdeaMapState {
  idea_id: string;
  state: MapState;
  /** The prerequisite ideas still to master, in the order the sheet lists them. */
  unlocks_after: string[];
}

/**
 * What the map shows for each idea (§8.4): `open`, `next` (locked, but every
 * prerequisite still needed is itself open, so one step away) or `far` (needs at least
 * one prerequisite that is still locked). Built on `lockStates`, so the lock rule
 * stays in one place; M4's stored MapView calls this same function.
 */
export function mapStates(
  ideas: readonly LockInput[],
  mastered: ReadonlySet<string> = new Set(),
): IdeaMapState[] {
  const locks = lockStates(ideas, mastered);
  const open = new Set(locks.filter((l) => l.state === 'open').map((l) => l.idea_id));
  return locks.map((l) => ({
    idea_id: l.idea_id,
    state:
      l.state === 'open' ? 'open' : l.unlocks_after.every((id) => open.has(id)) ? 'next' : 'far',
    unlocks_after: l.unlocks_after,
  }));
}
