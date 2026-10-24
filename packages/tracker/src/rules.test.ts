import { describe, expect, it } from 'vitest';
import { progress, replay, xpLedger, type TrackerConfig } from './index.js';
import {
  Log,
  NEW_YORK,
  UNIT_1_IN_ORDER,
  V1,
  V2,
  config,
  waterCycle,
} from './support.test.helpers.js';

// §8.3 rulesVersion 1, one rule at a time (docs/qa/M3.md M3-F1 to M3-F7).

const run = (c: TrackerConfig, log: Log, asOf?: string) => progress(c, replay(c, log.events), asOf);
const idea = (p: ReturnType<typeof progress>, id: string) => p.ideas.find((i) => i.ideaId === id);

describe('mastery and pass mark (M3-F1)', () => {
  it('takes the best score, and masters only above the pass mark', () => {
    const c = config();
    const log = new Log();
    const sixty = log.score('evap', 6).finished;
    expect(idea(run(c, log), 'evap')).toMatchObject({ masteryPercent: 60, mastered: false });

    log.score('evap', 7);
    const at70 = idea(run(c, log), 'evap');
    expect(at70).toMatchObject({ masteryPercent: 70, mastered: false });

    log.score('evap', 5);
    const eighty = log.score('evap', 8).finished;
    const after = idea(run(c, log), 'evap');
    expect(after).toMatchObject({ masteryPercent: 80, mastered: true });
    expect(after?.eventIds.mastery).toEqual([eighty.id]);
    expect(after?.eventIds.mastered).toEqual([eighty.id]);
    expect(sixty.id).not.toBe(eighty.id);
  });

  it('keeps mastery once won, and uses the class pass mark', () => {
    const log = new Log();
    log.score('evap', 8);
    log.score('evap', 2);
    expect(idea(run(config(), log), 'evap')).toMatchObject({ masteryPercent: 80, mastered: true });
    expect(idea(run(config({ passMark: 80 }), log), 'evap')).toMatchObject({ mastered: false });
    expect(idea(run(config({ passMark: 79 }), log), 'evap')).toMatchObject({ mastered: true });
  });

  it('rounds a finished score to a whole percentage, as the prototype does', () => {
    const log = new Log();
    log.score('evap', 5, 7); // 71.4 → 71
    expect(idea(run(config(), log), 'evap')).toMatchObject({ masteryPercent: 71, mastered: true });
  });

  it('echoes the class quiz length, 3–12, default 8', () => {
    const log = new Log();
    log.pass('sun');
    expect(run(config(), log).quizLength).toBe(8);
    expect(run(config({ quizLength: 12 }), log).quizLength).toBe(12);
    expect(() => run(config({ quizLength: 2 }), log)).toThrow(/quizLength/);
    expect(() => run(config({ quizLength: 13 }), log)).toThrow(/quizLength/);
  });
});

describe('unlock (M3-F2)', () => {
  it('unlocks after the last prerequisite and keeps it after a publish adds one', () => {
    const v2 = waterCycle((cur) => ({
      ...cur,
      ideas: cur.ideas.map((i) =>
        i.id === 'climate' || i.id === 'vap' ? { ...i, requires: [...i.requires, 'ocean'] } : i,
      ),
    }));
    const c = config({ versions: { [V1]: waterCycle(), [V2]: v2 } });
    const log = new Log();
    log.add('idea.opened', { ideaId: 'sun' });
    expect(idea(run(c, log), 'temp')?.unlocked).toBe(false);
    expect(idea(run(c, log), 'sun')?.unlocked).toBe(true); // no prerequisites

    const sun = log.pass('sun').finished;
    expect(idea(run(c, log), 'temp')).toMatchObject({
      unlocked: true,
      eventIds: { unlocked: [sun.id] },
    });

    // climate needs temp and prec; vap needs evap.
    log.pass('temp');
    const evap = log.pass('evap').finished;
    log.pass('cond');
    expect(idea(run(c, log), 'climate')?.unlocked).toBe(false);
    expect(idea(run(c, log), 'vap')?.unlocked).toBe(true);
    const prec = log.pass('prec').finished;
    expect(idea(run(c, log), 'climate')?.unlocked).toBe(true);

    // The teacher publishes v2: climate and vap now also need ocean, not yet mastered.
    log.versionId = V2;
    log.add('idea.opened', { ideaId: 'climate' });
    const after = run(c, log);
    expect(idea(after, 'climate')?.unlocked).toBe(true);
    expect(idea(after, 'vap')).toMatchObject({ unlocked: true, eventIds: { unlocked: [evap.id] } });
    expect(idea(after, 'climate')?.eventIds.unlocked).toContain(prec.id);
  });

  it('applies a new prerequisite to an idea not yet unlocked', () => {
    const v2 = waterCycle((cur) => ({
      ...cur,
      ideas: cur.ideas.map((i) => (i.id === 'temp' ? { ...i, requires: ['sun', 'ocean'] } : i)),
    }));
    const c = config({ versions: { [V1]: waterCycle(), [V2]: v2 } });
    const log = new Log();
    log.versionId = V2;
    log.pass('sun');
    expect(idea(run(c, log), 'temp')?.unlocked).toBe(false);
    log.pass('ocean');
    expect(idea(run(c, log), 'temp')?.unlocked).toBe(true);
  });

  it('archives, never deletes, a removed idea', () => {
    const v2 = waterCycle((cur) => ({ ...cur, ideas: cur.ideas.filter((i) => i.id !== 'ocean') }));
    const c = config({ versions: { [V1]: waterCycle(), [V2]: v2 } });
    const log = new Log();
    log.pass('ocean');
    log.versionId = V2;
    log.add('idea.opened', { ideaId: 'sun' });
    const p = run(c, log);
    expect(idea(p, 'ocean')).toMatchObject({ mastered: true, masteryPercent: 100, archived: true });
    expect(p.cards.find((card) => card.ideaId === 'ocean')).toMatchObject({ archived: true });
  });
});

describe('unit complete (M3-F3)', () => {
  it('completes only after every idea is mastered and the latest teach-back passes', () => {
    const c = config();
    const log = new Log();
    for (const id of UNIT_1_IN_ORDER.slice(0, -1)) log.pass(id);
    log.add('teachback.judged', {
      unitId: 1,
      verdict: 'pass',
      keyPointsHit: [0],
      aiOutputId: '00000000-0000-4000-8000-0000000000f1',
    });
    expect(run(c, log).units).toEqual([expect.objectContaining({ unit: 1, complete: false })]);

    const lastIdea = log.pass('vap').finished;
    // The pass came before the last idea was mastered; it still counts as the latest verdict.
    expect(run(c, log).units[0]?.complete).toBe(true);
    expect(run(c, log).units[0]?.eventIds).toContain(lastIdea.id);
  });

  it('a retry verdict is not complete; a later pass is', () => {
    const c = config();
    const log = new Log();
    for (const id of UNIT_1_IN_ORDER) log.pass(id);
    log.add('teachback.judged', {
      unitId: 1,
      verdict: 'retry',
      keyPointsHit: [],
      aiOutputId: '00000000-0000-4000-8000-0000000000f1',
    });
    const retry = run(c, log);
    expect(retry.units).toEqual([
      expect.objectContaining({ unit: 1, complete: false, latestVerdict: 'retry' }),
    ]);
    expect(retry.xp.unit).toBe(0);

    const judged = log.add('teachback.judged', {
      unitId: 1,
      verdict: 'pass',
      keyPointsHit: [0, 1],
      aiOutputId: '00000000-0000-4000-8000-0000000000f2',
    });
    const done = run(c, log);
    expect(done.units[0]).toMatchObject({ unit: 1, complete: true, latestVerdict: 'pass' });
    expect(done.units[0]?.eventIds.at(-1)).toBe(judged.id);
    expect(done.units[0]?.eventIds).toHaveLength(UNIT_1_IN_ORDER.length + 1);
    expect(done.xp.unit).toBe(200);

    // A later retry doesn't take completion (or its XP) away.
    log.add('teachback.judged', {
      unitId: 1,
      verdict: 'retry',
      keyPointsHit: [],
      aiOutputId: '00000000-0000-4000-8000-0000000000f3',
    });
    expect(run(c, log).units[0]?.complete).toBe(true);
    expect(run(c, log).xp.unit).toBe(200);
  });
});

describe('XP and combo (M3-F4)', () => {
  it('matches the prototype: combo multipliers, pass, perfect, link and unit bonuses', () => {
    const c = config();
    const log = new Log();
    // 7 right, 1 wrong, 1 right, 3 wrong: 8/12 (67%) is not a pass.
    const R = true;
    const W = false;
    const first = log.quiz('evap', [R, R, R, R, R, R, R, W, R, W, W, W]).finished;
    const ledger = xpLedger(c, log.events);
    expect(ledger.map((e) => e.points)).toEqual([10, 20, 20, 30, 30, 40, 40, 10]);
    expect(ledger.slice(0, 7).reduce((sum, e) => sum + e.points, 0)).toBe(190);
    expect(ledger.every((e) => e.source === 'answer')).toBe(true);
    expect(ledger.some((e) => e.eventId === first.id)).toBe(false);

    // A perfect passing quiz of 8: 10+20+20+30+30+40+40+40, then +50 pass and +50 perfect.
    const perfect = log.pass('evap').finished;
    const afterPerfect = xpLedger(c, log.events).slice(ledger.length);
    expect(afterPerfect.map((e) => e.points)).toEqual([10, 20, 20, 30, 30, 40, 40, 40, 50, 50]);
    expect(afterPerfect.slice(-2)).toEqual([
      { eventId: perfect.id, source: 'pass', points: 50 },
      { eventId: perfect.id, source: 'perfect', points: 50 },
    ]);

    // A pass that isn't perfect: +50 only.
    log.score('sun', 9, 10);
    expect(xpLedger(c, log.events).filter((e) => e.source === 'pass')).toHaveLength(2);
    expect(xpLedger(c, log.events).filter((e) => e.source === 'perfect')).toHaveLength(1);

    const link = log.add('review.link_rebuilt', { ideaId: 'evap', linkId: 'sun>evap' });
    expect(xpLedger(c, log.events).at(-1)).toEqual({ eventId: link.id, source: 'link', points: 5 });

    for (const id of UNIT_1_IN_ORDER.filter((i) => i !== 'evap' && i !== 'sun')) log.pass(id);
    const judged = log.add('teachback.judged', {
      unitId: 1,
      verdict: 'pass',
      keyPointsHit: [0],
      aiOutputId: '00000000-0000-4000-8000-0000000000f1',
    });
    expect(xpLedger(c, log.events).at(-1)).toEqual({
      eventId: judged.id,
      source: 'unit',
      points: 200,
    });

    const p = run(c, log);
    const total = xpLedger(c, log.events).reduce((sum, e) => sum + e.points, 0);
    expect(p.xp.total).toBe(total);
    expect(p.xp.answer + p.xp.pass + p.xp.perfect + p.xp.link + p.xp.unit).toBe(total);
    expect(p.xp.unit).toBe(200);
    expect(p.xp.link).toBe(5);
  });

  it('resets the combo on a wrong answer and at the start of each quiz', () => {
    const log = new Log();
    log.quiz('evap', [true, true, true]);
    log.quiz('evap', [true, false, true]);
    const answers = xpLedger(config(), log.events).filter((e) => e.source === 'answer');
    expect(answers.map((e) => e.points)).toEqual([10, 20, 20, 10, 10]);
  });
});

describe('day streak (M3-F5)', () => {
  // 2026 in New York: summer time starts Sun 8 March, ends Sun 1 November.
  it('adds one per day with a pass in the class time zone, across the spring change', () => {
    const c = config();
    const log = new Log('2026-03-06T17:00:00Z'); // Fri 12:00 EST
    log.pass('sun');
    expect(run(c, log).streak.days).toBe(1);
    log.pass('ocean'); // same day: no change
    expect(run(c, log).streak.days).toBe(1);
    log.on('2026-03-08T04:30:00Z').pass('evap'); // Sat 23:30 EST
    expect(run(c, log).streak.days).toBe(2);
    log.on('2026-03-08T16:00:00Z').pass('plants'); // Sun 12:00 EDT
    expect(run(c, log).streak.days).toBe(3);
    // Mon 00:30 EDT is 04:30 UTC; read as EST it would still be Sunday.
    const monday = log.on('2026-03-09T04:30:00Z').pass('temp').finished;
    const p = run(c, log);
    expect(p.streak).toMatchObject({ days: 4, lastPassDate: '2026-03-09' });
    expect(p.streak.eventIds).toHaveLength(4);
    expect(p.streak.eventIds.at(-1)).toBe(monday.id);
  });

  it('resets after a day without a pass, across the autumn change', () => {
    const c = config();
    const log = new Log('2026-10-31T03:30:00Z'); // Fri 30 Oct 23:30 EDT
    log.pass('sun');
    log.on('2026-11-01T03:30:00Z').pass('ocean'); // Sat 31 Oct 23:30 EDT
    expect(run(c, log).streak.days).toBe(2);
    // Mon 2 Nov 04:30 UTC is Sun 1 Nov 23:30 EST (it would be Monday read as EDT).
    log.on('2026-11-02T04:30:00Z');
    expect(run(c, log, log.at).streak.days).toBe(2);
    log.add('idea.opened', { ideaId: 'evap' }); // still Sunday: the streak is alive
    expect(run(c, log).streak.days).toBe(2);
    log.on('2026-11-02T13:00:00Z').add('idea.opened', { ideaId: 'evap' }); // Mon 08:00 EST
    expect(run(c, log).streak).toMatchObject({ days: 0, eventIds: [] });
    log.pass('evap');
    expect(run(c, log).streak).toMatchObject({ days: 1, lastPassDate: '2026-11-02' });
  });

  it('reads a broken streak as 0 at a later asOf, with no new events', () => {
    const c = config();
    const log = new Log('2026-10-19T16:00:00Z');
    log.pass('sun');
    const state = replay(c, log.events);
    expect(progress(c, state, '2026-10-20T23:00:00-04:00').streak.days).toBe(1);
    expect(progress(c, state, '2026-10-21T00:00:00-04:00').streak.days).toBe(0);
  });

  it('uses the class time zone, not UTC or the client offset', () => {
    const log = new Log('2026-10-19T22:30:00Z'); // Mon in UTC and in New York (18:30)
    log.pass('sun');
    log.on('2026-10-20T03:00:00+02:00').pass('ocean'); // Tue 01:00 UTC, Mon 21:00 in New York
    expect(run(config(), log).streak.days).toBe(1);
    expect(run(config({ timeZone: 'UTC0' }), log).streak.days).toBe(2);
  });
});

describe('cards (§8.3)', () => {
  it('gives one card per mastered idea, with its effective rarity', () => {
    const log = new Log();
    const evap = log.pass('evap').finished;
    log.pass('evap');
    log.score('sun', 3);
    const p = run(config(), log);
    expect(p.cards).toEqual([
      { ideaId: 'evap', rarity: 'Rare', archived: false, eventIds: [evap.id] },
    ]);
  });

  it('follows the current version’s rarity', () => {
    const v2 = waterCycle((cur) => ({
      ...cur,
      ideas: cur.ideas.map((i) => (i.id === 'evap' ? { ...i, rarity: 'Legendary' as const } : i)),
    }));
    const log = new Log();
    log.pass('evap');
    log.versionId = V2;
    log.add('idea.opened', { ideaId: 'evap' });
    expect(run(config({ versions: { [V1]: waterCycle(), [V2]: v2 } }), log).cards[0]?.rarity).toBe(
      'Legendary',
    );
  });
});

describe('may need help (M3-F6)', () => {
  it('raises (a) after 3 wrong answers following a hint, with its reason, and clears on a pass', () => {
    const c = config();
    const log = new Log();
    log.quiz('evap', [false, false, false, false]); // wrong without a hint: nothing
    expect(run(c, log).mayNeedHelp).toEqual([]);

    const hint = log.add('hint.requested', { questionId: 'evap/q1' });
    log.quiz('evap', [false, true, false]);
    expect(run(c, log).mayNeedHelp).toEqual([]); // two wrong
    log.quiz('sun', [false, false, false]); // another idea's questions don't count
    expect(run(c, log).mayNeedHelp).toEqual([]);
    const { attemptId } = log.quiz('evap', [true, false]);
    const signals = run(c, log).mayNeedHelp;
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: 'wrong-after-hint', ideaId: 'evap', missionId: null });
    expect(signals[0]?.reason).toBe('3 wrong answers on "evap" questions after asking for a hint.');
    expect(signals[0]?.eventIds[0]).toBe(hint.id);
    expect(signals[0]?.eventIds).toHaveLength(4);
    const answered = log.events.filter(
      (e) => e.type === 'quiz.answered' && e.payload.attemptId === attemptId,
    );
    expect(signals[0]?.eventIds.at(-1)).toBe(answered[1]?.id);

    log.pass('evap');
    expect(run(c, log).mayNeedHelp).toEqual([]);
  });

  it('raises (b) for an unlocked prerequisite of the next mission with no pass for 5 school days', () => {
    // Mission 1 is due Fri 30 Oct. Everything in unit 1 with no prerequisites unlocks at once.
    const c = config();
    const log = new Log('2026-10-19T13:00:00Z'); // Mon 19 Oct, 09:00 EDT
    for (const id of ['evap', 'ocean', 'plants', 'trans', 'vap']) log.pass(id);
    const state = replay(c, log.events);
    // Four school days later (Fri 23 Oct): nothing yet.
    expect(progress(c, state, '2026-10-23T20:00:00Z').mayNeedHelp).toEqual([]);
    // Saturday and Sunday aren't school days.
    expect(progress(c, state, '2026-10-25T20:00:00Z').mayNeedHelp).toEqual([]);
    // Mon 26 Oct is the fifth school day: sun is stalled.
    const signals = progress(c, state, '2026-10-26T13:00:00Z').mayNeedHelp;
    expect(signals).toEqual([
      expect.objectContaining({
        kind: 'stalled-prerequisite',
        ideaId: 'sun',
        missionId: 1,
        reason:
          '"sun" is needed for mission 1, unlocked on 2026-10-19, and has no pass after 5 school days.',
        since: '2026-10-19T13:00:00Z',
        eventIds: [log.events[0]?.id],
      }),
    ]);
    // temp needs sun, so it is still locked and not stalled.
    expect(signals.map((s) => s.ideaId)).not.toContain('temp');

    // A pass clears it.
    log.on('2026-10-26T14:00:00Z').pass('sun');
    const later = progress(c, replay(c, log.events), '2026-10-26T15:00:00Z').mayNeedHelp;
    expect(later.map((s) => s.ideaId)).not.toContain('sun');
  });

  it('counts holidays as non-school days and moves on to the next mission once one is completed', () => {
    const log = new Log('2026-10-19T13:00:00Z');
    log.add('idea.opened', { ideaId: 'sun' });
    const asOf = '2026-10-26T13:00:00Z';
    const holiday = config({ nonSchoolDates: ['2026-10-21'] });
    expect(progress(holiday, replay(holiday, log.events), asOf).mayNeedHelp).toEqual([]);

    const c = config();
    expect(
      progress(c, replay(c, log.events), asOf).mayNeedHelp.every((s) => s.missionId === 1),
    ).toBe(true);
    log.add('mission.completed', { missionId: 1 });
    // Mission 2's ideas (cond, prec, climate, clouds, rain) and their prerequisites (evap,
    // temp): only evap has no prerequisites of its own, so only it is unlocked and stalled.
    const next = progress(c, replay(c, log.events), asOf).mayNeedHelp;
    expect(next.map((s) => [s.ideaId, s.missionId])).toEqual([['evap', 2]]);
  });

  it('is never raised from durations alone', () => {
    const c = config();
    const quiet = new Log();
    const busy = new Log();
    for (const log of [quiet, busy]) log.add('idea.opened', { ideaId: 'evap' });
    for (let i = 0; i < 50; i += 1)
      busy.add('idea.active_time', { ideaId: 'evap', seconds: 86_400 });
    busy.add('hint.requested', { ideaId: 'evap' });
    busy.quiz('evap', [true, true, true]);
    busy.events.forEach((e) => {
      if (e.type === 'quiz.answered') e.payload.secondsToAnswer = 3600;
    });
    const p = run(c, busy);
    expect(p.mayNeedHelp).toEqual([]);
    expect(run(c, quiet).mayNeedHelp).toEqual([]);
  });
});

describe('opt-out (M3-F7, D24)', () => {
  it('gives identical outputs and marks the student excluded from audits and research', () => {
    const log = new Log();
    log.add('hint.requested', { ideaId: 'evap' });
    log.quiz('evap', [false, false, false]);
    for (const id of UNIT_1_IN_ORDER) log.pass(id);
    log.add('teachback.judged', {
      unitId: 1,
      verdict: 'pass',
      keyPointsHit: [0],
      aiOutputId: '00000000-0000-4000-8000-0000000000f1',
    });
    const asOf = '2026-11-20T12:00:00Z';
    const included = run(config(), log, asOf);
    const excluded = run(config({ optedOut: true }), log, asOf);
    expect(included.excludedFromAuditsAndResearch).toBe(false);
    expect(excluded.excludedFromAuditsAndResearch).toBe(true);
    expect({ ...excluded, excludedFromAuditsAndResearch: false }).toEqual(included);
    expect(replay(config({ optedOut: true }), log.events).excludedFromAuditsAndResearch).toBe(true);
  });
});

describe('configuration', () => {
  it('rejects an event for a version the config lacks, or another student', () => {
    const log = new Log();
    log.versionId = V2;
    log.add('idea.opened', { ideaId: 'evap' });
    expect(() => replay(config(), log.events)).toThrow(/version/);

    const two = new Log();
    two.add('idea.opened', { ideaId: 'evap' });
    two.studentId = '00000000-0000-4000-8000-000000000002';
    two.add('idea.opened', { ideaId: 'evap' });
    expect(() => replay(config(), two.events)).toThrow(/another student/);
  });

  it('rejects an unknown rulesVersion, time zone, pass mark or date', () => {
    const log = new Log();
    log.pass('sun');
    expect(() => replay({ ...config(), rulesVersion: 2 as 1 }, log.events)).toThrow(
      /rulesVersion 2/,
    );
    expect(() => replay(config({ timeZone: 'America/New_York' }), log.events)).toThrow(/POSIX TZ/);
    expect(() => replay(config({ timeZone: 'EST5EDT' }), log.events)).toThrow(/summer time/);
    expect(() => replay(config({ passMark: 101 }), log.events)).toThrow(/passMark/);
    expect(() => replay(config({ nonSchoolDates: ['2026-02-30'] }), log.events)).toThrow(
      /nonSchoolDates/,
    );
    expect(NEW_YORK).toBe('EST5EDT,M3.2.0,M11.1.0');
  });
});
