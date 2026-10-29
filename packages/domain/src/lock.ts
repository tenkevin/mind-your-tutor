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
