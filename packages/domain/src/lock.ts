// Which ideas a student can open (ARCHITECTURE.md §8.4). Deterministic: no clock, no
// randomness, no I/O. S10 uses it at zero progress; S2 passes the mastered set from the
// tracker replay. An idea is open when the tracker has unlocked it, or when every idea it
// requires is mastered, so with nothing mastered only ideas with no `requires` are open.
// The tracker's unlocked set is the one authority (§8.4 rule 5, §7).

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

/**
 * `unlocked` is the tracker's unlocked set (`progress().ideas` with `unlocked: true`),
 * passed as plain ids so this package never imports the tracker (§8.4 rule 5). An idea
 * the tracker has unlocked stays open even if a publish added a prerequisite (§7).
 *
 * Without `unlocked` (S10 at zero progress, nothing from the tracker yet) a `requires`
 * naming an id outside the version is ignored, as before. With it, the tracker is the
 * authority and such an id (or the idea itself) is unmet, exactly as in the tracker:
 * the idea never opens. C2 blocks publishing it, so this only guards unpublished data.
 */
export function lockStates(
  ideas: readonly LockInput[],
  mastered: ReadonlySet<string> = new Set(),
  unlocked?: ReadonlySet<string>,
): IdeaLock[] {
  return evaluate(ideas, mastered, unlocked).map((e) => e.lock);
}

function evaluate(
  ideas: readonly LockInput[],
  mastered: ReadonlySet<string>,
  unlocked: ReadonlySet<string> | undefined,
): { lock: IdeaLock; never: boolean }[] {
  const known = new Set(ideas.map((i) => i.idea_id));
  return ideas.map((idea) => {
    const required = [...new Set(idea.requires)];
    const missing = required.filter(
      (id) => id !== idea.idea_id && known.has(id) && !mastered.has(id),
    );
    // Strict mode: an unknown or self requirement can never be mastered.
    const never =
      unlocked !== undefined && required.some((id) => id === idea.idea_id || !known.has(id));
    const open = unlocked?.has(idea.idea_id) === true || (missing.length === 0 && !never);
    return {
      lock: {
        idea_id: idea.idea_id,
        state: open ? 'open' : 'locked',
        unlocks_after: open ? [] : missing,
      },
      never: !open && never,
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
 * stays in one place; M4's stored MapView calls this same function. `unlocked` is as in
 * `lockStates`: the open set includes what the tracker unlocked, and `next`/`far` derive
 * from that open set.
 */
export function mapStates(
  ideas: readonly LockInput[],
  mastered: ReadonlySet<string> = new Set(),
  unlocked?: ReadonlySet<string>,
): IdeaMapState[] {
  const locks = evaluate(ideas, mastered, unlocked);
  const open = new Set(locks.filter((l) => l.lock.state === 'open').map((l) => l.lock.idea_id));
  return locks.map(({ lock, never }) => ({
    idea_id: lock.idea_id,
    // An idea that can never unlock is not one step away, however its other
    // prerequisites stand.
    state:
      lock.state === 'open'
        ? 'open'
        : !never && lock.unlocks_after.every((id) => open.has(id))
          ? 'next'
          : 'far',
    unlocks_after: lock.unlocks_after,
  }));
}
