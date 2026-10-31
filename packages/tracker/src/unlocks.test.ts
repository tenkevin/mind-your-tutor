import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
// The domain package is read from source, as contracts is in the test helpers: the
// tracker itself never depends on it (§8.4 rule 5 passes a plain Set between them).
import { mapStates } from '../../domain/src/lock.js';
import {
  progress,
  replay,
  initialState,
  type TrackerConfig,
  type TrackerCurriculum,
  type TrackerIdea,
} from './index.js';
import { Log, V1, V2, config } from './support.test.helpers.js';

// M3-F9 / ARCHITECTURE §8.4 rule 5: the tracker's unlocked set and the domain's open
// states are one answer.

const curriculum = (ideas: Record<string, string[]>): TrackerCurriculum => ({
  ideas: Object.entries(ideas).map(([id, requires]): TrackerIdea => ({
    id,
    unit: 1,
    requires,
    rarity: 'Common',
  })),
  units: [{ unit: 1, dueDate: null }],
});

const unlockedOf = (c: TrackerConfig, log: Log) =>
  new Set(
    progress(c, replay(c, log.events))
      .ideas.filter((i) => i.unlocked)
      .map((i) => i.ideaId),
  );
const masteredOf = (c: TrackerConfig, log: Log) =>
  new Set(
    progress(c, replay(c, log.events))
      .ideas.filter((i) => i.mastered)
      .map((i) => i.ideaId),
  );

describe('tracker and domain agree on what is open (M3-F9)', () => {
  it('keeps an idea open after a publish adds a prerequisite', () => {
    const v1 = { a: [], b: ['a'] };
    const v2 = { a: [], c: [], b: ['a', 'c'] };
    const c = config({ versions: { [V1]: curriculum(v1), [V2]: curriculum(v2) } });
    const log = new Log();
    log.pass('a');
    log.versionId = V2;
    log.pass('a'); // any event stamped with version 2
    const unlocked = unlockedOf(c, log);
    const mastered = masteredOf(c, log);
    expect(unlocked.has('b')).toBe(true);
    const v2Ideas = Object.entries(v2).map(([idea_id, requires]) => ({ idea_id, requires }));
    const states = Object.fromEntries(
      mapStates(v2Ideas, mastered, unlocked).map((s) => [s.idea_id, s.state]),
    );
    expect(states).toEqual({ a: 'open', c: 'open', b: 'open' });
  });

  it('never unlocks an idea requiring an id outside the version, in either', () => {
    const v = { a: ['ghost'], b: ['a'], s: ['s'] };
    const c = config({ versions: { [V1]: curriculum(v) } });
    const log = new Log();
    log.pass('a');
    log.pass('b');
    const unlocked = unlockedOf(c, log);
    // Only b: its prerequisite a is mastered. a and s can never unlock.
    expect([...unlocked]).toEqual(['b']);
    const ideas = Object.entries(v).map(([idea_id, requires]) => ({ idea_id, requires }));
    expect(mapStates(ideas, masteredOf(c, log), unlocked).map((s) => s.state)).toEqual([
      'far',
      'open', // b's only prerequisite, a, was mastered by quiz, so it unlocks
      'far',
    ]);
  });

  it('property: over random acyclic graphs, publishes and events, open == unlocked', () => {
    const graph = fc
      .integer({ min: 2, max: 9 })
      .chain((n) =>
        fc.tuple(
          fc.array(fc.array(fc.nat(n - 1), { maxLength: 3 }), { minLength: n, maxLength: n }),
          fc.array(fc.array(fc.nat(n - 1), { maxLength: 2 }), { minLength: n, maxLength: n }),
          fc.array(fc.boolean(), { minLength: n, maxLength: n }),
        ),
      );
    const steps = fc.array(
      fc.record({ idea: fc.nat(8), version: fc.constantFrom(V1, V2), pass: fc.boolean() }),
      { maxLength: 25 },
    );
    fc.assert(
      fc.property(graph, steps, fc.boolean(), ([base, extra, ghosts], run, pinned) => {
        const id = (i: number) => `n${i}`;
        // Acyclic: an idea only requires lower-numbered ideas; a ghost is an unknown id.
        const v1: Record<string, string[]> = {};
        const v2: Record<string, string[]> = {};
        base.forEach((reqs, i) => {
          v1[id(i)] = [...new Set(reqs.filter((r) => r < i).map(id))];
          if (ghosts[i] && i % 3 === 0) v1[id(i)]?.push('ghost');
          // Version 2 adds prerequisites to some ideas.
          v2[id(i)] = [
            ...new Set([...(v1[id(i)] ?? []), ...(extra[i] ?? []).filter((r) => r < i).map(id)]),
          ];
        });
        const c = config({
          versions: { [V1]: curriculum(v1), [V2]: curriculum(v2) },
          ...(pinned ? { currentVersionId: V2 } : {}),
        });
        const log = new Log();
        for (const s of run) {
          log.versionId = s.version;
          const name = id(s.idea % base.length);
          if (s.pass) log.pass(name);
          else log.score(name, 2, 10);
        }
        if (log.events.length === 0) return;
        const state = replay(c, log.events);
        const p = progress(c, state);
        const current = state.versionId === V2 ? v2 : v1;
        const ideas = Object.entries(current).map(([idea_id, requires]) => ({
          idea_id,
          requires,
        }));
        const unlocked = new Set(p.ideas.filter((i) => i.unlocked).map((i) => i.ideaId));
        const mastered = new Set(p.ideas.filter((i) => i.mastered).map((i) => i.ideaId));
        const open = new Set(
          mapStates(ideas, mastered, unlocked)
            .filter((s) => s.state === 'open')
            .map((s) => s.idea_id),
        );
        const trackerSide = new Set([...unlocked].filter((u) => Object.hasOwn(current, u)));
        expect([...open].sort()).toEqual([...trackerSide].sort());
        // Sticky: nothing the tracker unlocked is shown locked.
        for (const u of trackerSide) expect(open.has(u)).toBe(true);
      }),
      { numRuns: 300, seed: 11 },
    );
  });
});

describe('currentVersionId (N1)', () => {
  const v1 = { a: [], b: ['a'] };
  const v2 = { a: [], c: [] };
  const base = { versions: { [V1]: curriculum(v1), [V2]: curriculum(v2) } };

  it('is not flipped back by a late event stamped with an older version', () => {
    const log = new Log();
    log.versionId = V2;
    log.pass('a');
    log.versionId = V1; // a student holding the old map
    log.pass('a');
    const run = (c: TrackerConfig) => replay(c, log.events);
    // Without a pinned version the latest event decides (as before).
    expect(run(config(base)).versionId).toBe(V1);
    const pinned = config({ ...base, currentVersionId: V2 });
    const state = run(pinned);
    expect(state.versionId).toBe(V2);
    expect(state.ideas['b']).toBeUndefined();
    expect(state.ideas['c']?.inCurrentVersion).toBe(true);
    expect(state.ideas['a']?.inCurrentVersion).toBe(true);
  });

  it('must name a version in the config', () => {
    expect(() => initialState(config({ ...base, currentVersionId: 'nope' }))).toThrow(
      /currentVersionId/,
    );
  });
});

describe('snapshots are bound to their config (N2)', () => {
  const base = config();
  const log = new Log();
  log.score('evap', 9, 12); // mastered at pass mark 70, not at 80
  log.pass('sun');
  const [first, ...rest] = [log.events.slice(0, 5), log.events.slice(5)];

  it('continues under the same config, and when only a new version is published', () => {
    const snapshot = replay(base, first ?? []);
    const whole = replay(base, log.events);
    expect(replay(base, rest.flat(), snapshot)).toEqual(whole);
    const published = config({ versions: { ...base.versions, [V2]: base.versions[V1] as never } });
    expect(() => replay(published, rest.flat(), snapshot)).not.toThrow();
  });

  it('rejects a different pass mark, quiz length, time zone or calendar', () => {
    const snapshot = replay(base, first ?? []);
    for (const other of [
      config({ passMark: 80 }),
      config({ quizLength: 10 }),
      config({ timeZone: 'PST8PDT,M3.2.0,M11.1.0' }),
      config({ nonSchoolDates: ['2026-11-11'] }),
      config({ schoolDays: [1, 2, 3] }),
    ]) {
      expect(() => replay(other, rest.flat(), snapshot)).toThrow(/rebuild it by replaying/);
    }
  });

  it('rejects a version the snapshot used when its content changed', () => {
    const snapshot = replay(base, first ?? []);
    const edited = config({
      versions: {
        [V1]: {
          ...(base.versions[V1] as TrackerCurriculum),
          ideas: (base.versions[V1] as TrackerCurriculum).ideas.slice(1),
        },
      },
    });
    expect(() => replay(edited, rest.flat(), snapshot)).toThrow(/no longer matches/);
  });

  it('does not count the opt-out flag, which is re-applied on every run', () => {
    const snapshot = replay(base, first ?? []);
    expect(() => replay(config({ optedOut: true }), rest.flat(), snapshot)).not.toThrow();
  });
});
