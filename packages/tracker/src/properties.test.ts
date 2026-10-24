import { readFileSync, readdirSync } from 'node:fs';
import type { InteractionEvent } from '@ideamap/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  apply,
  progress,
  replay,
  scorePercent,
  xpLedger,
  type TrackerConfig,
  type TrackerState,
} from './index.js';
import {
  Log,
  UNIT_1_IN_ORDER,
  V1,
  V2,
  WATER_CYCLE_IDEAS,
  config,
  uuid,
  waterCycle,
} from './support.test.helpers.js';

// Property tests over random valid event logs (docs/qa/M3.md M3-S1, M3-S2, M3-S3).

const CONFIG: TrackerConfig = config({
  versions: {
    [V1]: waterCycle(),
    // A publish that adds a prerequisite, drops an idea and changes a rarity.
    [V2]: waterCycle((c) => ({
      ...c,
      ideas: c.ideas
        .filter((i) => i.id !== 'glacier')
        .map((i) =>
          i.id === 'vap'
            ? { ...i, requires: [...i.requires, 'ocean'], rarity: 'Legendary' as const }
            : i,
        ),
    })),
  },
  nonSchoolDates: ['2026-11-11', '2026-11-26'],
});

// Unit 1 ideas twice as often, so some logs complete a unit.
const idea = fc.oneof(fc.constantFrom(...UNIT_1_IN_ORDER), fc.constantFrom(...WATER_CYCLE_IDEAS));
// Mostly right answers, so logs reach mastery, unlocks and unit completion.
const right = fc.integer({ min: 0, max: 9 }).map((n) => n < 8);
const action = fc.oneof(
  {
    arbitrary: fc.record({
      k: fc.constant('quiz' as const),
      idea,
      answers: fc.array(right, { minLength: 1, maxLength: 12 }),
      finish: fc.boolean(),
    }),
    weight: 6,
  },
  {
    arbitrary: fc.record({ k: fc.constant('hint' as const), idea, byQuestion: fc.boolean() }),
    weight: 2,
  },
  { arbitrary: fc.record({ k: fc.constant('link' as const), idea }), weight: 1 },
  {
    arbitrary: fc.record({
      k: fc.constant('judge' as const),
      unit: fc.integer({ min: 1, max: 3 }),
      pass: fc.boolean(),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('mission' as const),
      unit: fc.integer({ min: 1, max: 3 }),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('open' as const),
      idea,
      seconds: fc.integer({ min: 0, max: 86_400 }),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({ k: fc.constant('other' as const), n: fc.integer({ min: 0, max: 5 }) }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      k: fc.constant('wait' as const),
      minutes: fc.integer({ min: 0, max: 4 * 24 * 60 }),
    }),
    weight: 3,
  },
  { arbitrary: fc.record({ k: fc.constant('publish' as const) }), weight: 1 },
);
type Action = typeof action extends fc.Arbitrary<infer A> ? A : never;

function build(actions: readonly Action[], start = '2026-10-19T12:00:00Z'): InteractionEvent[] {
  const log = new Log(start);
  let n = 0;
  for (const a of actions) {
    n += 1;
    switch (a.k) {
      case 'quiz':
        if (a.finish) log.quiz(a.idea, a.answers);
        else
          log.add('quiz.started', {
            ideaId: a.idea,
            attemptId: uuid(0xb0000 + n),
            questionIds: [`${a.idea}/x`],
          });
        break;
      case 'hint':
        log.add(
          'hint.requested',
          a.byQuestion ? { questionId: `${a.idea}/q0` } : { ideaId: a.idea },
        );
        break;
      case 'link':
        log.add('review.link_rebuilt', { ideaId: a.idea, linkId: `sun>${a.idea}` });
        break;
      case 'judge':
        log.add('teachback.judged', {
          unitId: a.unit,
          verdict: a.pass ? 'pass' : 'retry',
          keyPointsHit: [],
          aiOutputId: uuid(0xc0000 + n),
        });
        break;
      case 'mission':
        log.add('mission.completed', { missionId: a.unit });
        break;
      case 'open':
        log.add('idea.opened', { ideaId: a.idea });
        log.add('idea.active_time', { ideaId: a.idea, seconds: a.seconds });
        break;
      case 'other': {
        const id = uuid(0xd0000 + n);
        const events = [
          () => log.add('feedback.shown', { feedbackId: id, source: 'ai', reasonRef: id }),
          () => log.add('feedback.challenged', { feedbackId: id, textRef: id }),
          () => log.add('feedback.ruled', { feedbackId: id, ruling: 'upheld' }),
          () => log.add('map.shown', { mapViewId: id }),
          () => log.add('ai.output_shown', { aiOutputId: id }),
          () => log.add('teachback.done', { unitId: 1, textRef: id }),
        ];
        events[a.n]?.();
        break;
      }
      case 'wait':
        log.wait(a.minutes);
        break;
      case 'publish':
        log.versionId = log.versionId === V1 ? V2 : V1;
        break;
    }
  }
  return log.events;
}

const logs = fc.array(action, { minLength: 0, maxLength: 150, size: 'max' }).map((a) => build(a));
const json = (state: TrackerState) => JSON.stringify(state);
const RUNS = { numRuns: 150 };

describe('the generator', () => {
  it('reaches every rule', () => {
    const seen = new Set<string>();
    for (const events of fc.sample(logs, { numRuns: 300, seed: 3 })) {
      const state = replay(CONFIG, events);
      const p = progress(CONFIG, state, '2026-12-01T12:00:00Z');
      if (p.ideas.some((i) => i.mastered)) seen.add('mastered');
      if (
        p.ideas.some(
          (i) =>
            i.unlocked &&
            i.eventIds.unlocked.some((id) => id !== i.eventIds.mastered[0]) &&
            i.ideaId === 'cond',
        )
      )
        seen.add('unlocked by a prerequisite');
      if (p.units.some((u) => u.complete)) seen.add('unit complete');
      if (p.ideas.some((i) => i.archived)) seen.add('archived');
      if (state.streak.days > 1) seen.add('streak');
      if (p.mayNeedHelp.some((s) => s.kind === 'wrong-after-hint')) seen.add('wrong-after-hint');
      if (p.mayNeedHelp.some((s) => s.kind === 'stalled-prerequisite'))
        seen.add('stalled-prerequisite');
      if (p.xp.perfect > 0 && p.xp.link > 0) seen.add('xp bonuses');
    }
    expect([...seen].sort()).toEqual(
      [
        'archived',
        'mastered',
        'stalled-prerequisite',
        'streak',
        'unit complete',
        'unlocked by a prerequisite',
        'wrong-after-hint',
        'xp bonuses',
      ].sort(),
    );
  });
});

describe('determinism (M3-S1)', () => {
  it('replays the same events to byte-identical state, every time', () => {
    fc.assert(
      fc.property(logs, (events) => {
        const a = replay(CONFIG, events);
        const b = replay(CONFIG, structuredClone(events));
        expect(json(b)).toBe(json(a));
        expect(JSON.stringify(progress(CONFIG, b))).toBe(JSON.stringify(progress(CONFIG, a)));
      }),
      RUNS,
    );
  });

  it('gives the same state from a snapshot taken at any point', () => {
    fc.assert(
      fc.property(logs, fc.nat(), (events, at) => {
        const cut = events.length ? at % (events.length + 1) : 0;
        const full = json(replay(CONFIG, events));
        const snapshot = JSON.parse(json(replay(CONFIG, events.slice(0, cut)))) as TrackerState;
        expect(json(replay(CONFIG, events.slice(cut), snapshot))).toBe(full);
        // The whole log onto the snapshot: covered events are skipped.
        expect(json(replay(CONFIG, events, snapshot))).toBe(full);
        // One event at a time.
        let state = snapshot;
        for (const event of events.slice(cut)) state = apply(CONFIG, state, event);
        expect(json(state)).toBe(full);
      }),
      RUNS,
    );
  });

  it('never changes the state it is given', () => {
    fc.assert(
      fc.property(logs, (events) => {
        const before = replay(CONFIG, events.slice(0, events.length >> 1));
        const copy = json(before);
        replay(CONFIG, events, before);
        progress(CONFIG, before, '2027-01-01T00:00:00Z');
        expect(json(before)).toBe(copy);
      }),
      RUNS,
    );
  });
});

describe('rules hold on every log', () => {
  it('mastery only grows, unlocks are never taken away, and XP never falls', () => {
    fc.assert(
      fc.property(logs, (events) => {
        let previous = replay(CONFIG, []);
        for (const event of events) {
          const next = apply(CONFIG, previous, event);
          for (const [id, was] of Object.entries(previous.ideas)) {
            const now = next.ideas[id];
            expect(now).toBeDefined();
            if (was.unlocked) expect(now?.unlocked).toBe(true);
            if (was.mastered) expect(now?.mastered).toBe(true);
            if (was.masteryPercent !== null)
              expect(now?.masteryPercent ?? -1).toBeGreaterThanOrEqual(was.masteryPercent);
          }
          for (const [unit, was] of Object.entries(previous.units))
            if (was.complete) expect(next.units[unit]?.complete).toBe(true);
          expect(next.xp.total).toBeGreaterThanOrEqual(previous.xp.total);
          previous = next;
        }
      }),
      { numRuns: 60 },
    );
  });

  it('mastered means a finished score above the pass mark; unlocked means prerequisites mastered', () => {
    fc.assert(
      fc.property(logs, (events) => {
        const state = replay(CONFIG, events);
        const byId = new Map(events.map((e) => [e.id, e]));
        for (const [id, p] of Object.entries(state.ideas)) {
          expect(p.mastered).toBe(p.masteredEventId !== null);
          if (p.mastered) {
            const e = byId.get(p.masteredEventId as string);
            expect(e?.type).toBe('quiz.finished');
            if (e?.type === 'quiz.finished')
              expect(scorePercent(e.payload.score, e.payload.of)).toBeGreaterThan(70);
            expect(p.masteryPercent).toBeGreaterThan(70);
          }
          if (p.unlocked) {
            for (const r of CONFIG.versions[V1]?.ideas.find((i) => i.id === id)?.requires ?? []) {
              // Unlocked under some version; v1 and v2 differ only by vap's extra prerequisite.
              if (!(id === 'vap' && r === 'ocean')) expect(state.ideas[r]?.mastered).toBe(true);
            }
          }
        }
      }),
      RUNS,
    );
  });
});

describe('traceability (M3-S3)', () => {
  it('names only real events behind every output, and the XP ledger sums to the total', () => {
    fc.assert(
      fc.property(logs, fc.integer({ min: 0, max: 60 }), (events, days) => {
        const ids = new Set(events.map((e) => e.id));
        const state = replay(CONFIG, events);
        const asOf = new Date(Date.parse('2026-10-19T12:00:00Z') + days * 86_400_000).toISOString();
        const p = progress(
          CONFIG,
          state,
          state.lastAt && state.lastAt > asOf ? state.lastAt : asOf,
        );
        const named = [
          ...p.ideas.flatMap((i) => [
            ...i.eventIds.mastery,
            ...i.eventIds.mastered,
            ...i.eventIds.unlocked,
          ]),
          ...p.units.flatMap((u) => u.eventIds),
          ...p.streak.eventIds,
          ...p.cards.flatMap((c) => c.eventIds),
          ...p.mayNeedHelp.flatMap((s) => s.eventIds),
        ];
        for (const id of named) expect(ids.has(id)).toBe(true);
        for (const i of p.ideas) {
          if (i.mastered) expect(i.eventIds.mastered).toHaveLength(1);
          if (i.masteryPercent !== null) expect(i.eventIds.mastery).toHaveLength(1);
          if (i.unlocked) expect(i.eventIds.unlocked.length).toBeGreaterThan(0);
        }
        for (const u of p.units) if (u.complete) expect(u.eventIds.length).toBeGreaterThan(1);
        for (const s of p.mayNeedHelp) {
          expect(s.reason.length).toBeGreaterThan(10);
          expect(s.eventIds.length).toBeGreaterThan(0);
        }
        expect(p.streak.eventIds).toHaveLength(p.streak.days);
        const ledger = xpLedger(CONFIG, events);
        expect(ledger.reduce((sum, e) => sum + e.points, 0)).toBe(p.xp.total);
        for (const e of ledger) expect(ids.has(e.eventId)).toBe(true);
      }),
      RUNS,
    );
  });
});

describe('nothing D20 forbids (M3-S2)', () => {
  it('ignores durations: any idea.active_time or secondsToAnswer gives the same state', () => {
    fc.assert(
      fc.property(logs, fc.integer({ min: 0, max: 86_400 }), (events, seconds) => {
        const changed = structuredClone(events);
        for (const e of changed) {
          if (e.type === 'idea.active_time') e.payload.seconds = seconds;
          if (e.type === 'quiz.answered') e.payload.secondsToAnswer = seconds;
        }
        expect(json(replay(CONFIG, changed))).toBe(json(replay(CONFIG, events)));
      }),
      RUNS,
    );
  });

  it('outputs only the §8.3 fields', () => {
    const log = new Log();
    log.pass('evap');
    const p = progress(CONFIG, replay(CONFIG, log.events));
    expect(Object.keys(p).sort()).toEqual(
      [
        'asOf',
        'cards',
        'excludedFromAuditsAndResearch',
        'ideas',
        'mayNeedHelp',
        'passMark',
        'quizLength',
        'rulesVersion',
        'streak',
        'units',
        'xp',
      ].sort(),
    );
    expect(Object.keys(p.ideas[0] ?? {}).sort()).toEqual([
      'archived',
      'eventIds',
      'ideaId',
      'mastered',
      'masteryPercent',
      'unlocked',
    ]);
  });

  it('has no prediction, engagement, behaviour, personality, clustering or ranking in the rules', () => {
    const forbidden =
      /\b(risk|dropout|drop-out|predict\w*|forecast\w*|engagement|behaviou?r\w*|personality|cluster\w*|rank\w*|percentile|leaderboard|grade)\b/i;
    const dir = new URL('.', import.meta.url);
    const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.includes('.test.'));
    expect(sources.length).toBeGreaterThan(3);
    for (const file of sources) {
      const code = readFileSync(new URL(file, dir), 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)); // comments may cite D20
      const hits = code.filter((line) => forbidden.test(line));
      expect({ file, hits }).toEqual({ file, hits: [] });
    }
  });
});

describe('opt-out (M3-F7)', () => {
  it('gives identical outputs on every log', () => {
    const optedOut = { ...CONFIG, optedOut: true };
    fc.assert(
      fc.property(logs, (events) => {
        const a = progress(CONFIG, replay(CONFIG, events));
        const b = progress(optedOut, replay(optedOut, events));
        expect(b.excludedFromAuditsAndResearch).toBe(true);
        expect({ ...b, excludedFromAuditsAndResearch: false }).toEqual(a);
      }),
      { numRuns: 60 },
    );
  });
});
