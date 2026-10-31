import type { InteractionEvent } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { apply, replay, type TrackerState } from './index.js';
import { Log, UNIT_1_IN_ORDER, WATER_CYCLE_IDEAS, config } from './support.test.helpers.js';

// docs/qa/M3.md M3-P1: replay 10,000 events for one student in under 100 ms, and
// apply incrementally after a snapshot in under 1 ms per event.

function tenThousandEvents(): InteractionEvent[] {
  const log = new Log('2026-09-01T12:00:00Z');
  let n = 0;
  while (log.events.length < 10_000) {
    n += 1;
    const idea = (n % 3 === 0 ? UNIT_1_IN_ORDER : WATER_CYCLE_IDEAS)[n % 7] as string;
    log.add('idea.opened', { ideaId: idea });
    if (n % 5 === 0) log.add('hint.requested', { ideaId: idea });
    log.quiz(
      idea,
      Array.from({ length: 8 }, (_, i) => (i + n) % 4 !== 0),
    );
    log.add('idea.active_time', { ideaId: idea, seconds: 90 });
    if (n % 9 === 0)
      log.add('teachback.judged', {
        unitId: (n % 3) + 1,
        verdict: n % 2 ? 'pass' : 'retry',
        keyPointsHit: [],
        aiOutputId: '00000000-0000-4000-8000-0000000000f1',
      });
    log.wait(n % 4 === 0 ? 20 * 60 : 7);
  }
  return log.events.slice(0, 10_000);
}

const now = () => performance.now();

describe('replay speed (M3-P1)', () => {
  const c = config();
  const events = tenThousandEvents();

  it('replays 10,000 events in under 100 ms', () => {
    replay(c, events); // warm up
    const times: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const t = now();
      replay(c, events);
      times.push(now() - t);
    }
    const best = Math.min(...times);
    console.log(
      `replay of 10,000 events: best ${best.toFixed(1)} ms, runs ${times.map((x) => x.toFixed(1)).join(', ')}`,
    );
    expect(best).toBeLessThan(100);
  });

  it('applies events after a snapshot in under 1 ms each', () => {
    const snapshot = JSON.parse(JSON.stringify(replay(c, events.slice(0, 9_000)))) as TrackerState;
    const rest = events.slice(9_000);
    let state = snapshot;
    for (const event of rest.slice(0, 100)) state = apply(c, state, event); // warm up
    state = snapshot;
    const t = now();
    for (const event of rest) state = apply(c, state, event);
    const perEvent = (now() - t) / rest.length;
    console.log(`incremental apply: ${(perEvent * 1000).toFixed(1)} µs per event`);
    expect(perEvent).toBeLessThan(1);
    expect(JSON.stringify(state)).toBe(JSON.stringify(replay(c, events)));
  });
});
