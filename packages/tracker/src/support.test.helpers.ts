// Test support for the tracker (not a test file, never built: tsconfig.build.json
// excludes *.test.*). Builds valid §8.2 events, checked against M1's schemas, and
// class configs from the water-cycle fixture.
import { readFileSync } from 'node:fs';
import type { InteractionEvent } from '@ideamap/contracts';
// M1's schemas, from source: tracker code may only use contracts' types, and the
// tests run before the build.
import { EVENT_LEVELS, parseInteractionEvent } from '../../contracts/src/events.js';
import type { EffectiveRarity, TrackerConfig, TrackerCurriculum } from './index.js';

export const STUDENT = '00000000-0000-4000-8000-000000000001';
export const CLASS = '00000000-0000-4000-8000-0000000000c1';
export const V1 = '00000000-0000-4000-8000-0000000000a1';
export const V2 = '00000000-0000-4000-8000-0000000000a2';
export const NEW_YORK = 'EST5EDT,M3.2.0,M11.1.0';

type PackIdea = { idea_id: string; unit: number; requires: string[] };
type PackUnit = { unit: number; due_date: string | null };
const pack = JSON.parse(
  // A pinned copy of the water-cycle pack as M3's rules were reviewed against it; the
  // shared fixture grows with later tasks (C12's mechanism layer), and these rule tests
  // shouldn't change with it.
  readFileSync(new URL('./test-data/water-cycle-m3.json', import.meta.url), 'utf8'),
) as { ideas: PackIdea[]; units: PackUnit[] };

/** T5 would resolve `auto`; the tests fix one rarity per idea. */
const RARITY: EffectiveRarity[] = ['Common', 'Rare', 'Legendary'];

export function waterCycle(edit?: (c: TrackerCurriculum) => TrackerCurriculum): TrackerCurriculum {
  const curriculum: TrackerCurriculum = {
    ideas: pack.ideas.map((i, n) => ({
      id: i.idea_id,
      unit: i.unit,
      requires: i.requires,
      rarity: RARITY[n % 3] as EffectiveRarity,
    })),
    units: pack.units.map((u) => ({ unit: u.unit, dueDate: u.due_date })),
  };
  return edit ? edit(curriculum) : curriculum;
}

export const WATER_CYCLE_IDEAS = pack.ideas.map((i) => i.idea_id);

/** Unit 1's ideas in an order that respects `requires`. */
export const UNIT_1_IN_ORDER = ['evap', 'sun', 'ocean', 'plants', 'trans', 'temp', 'vap'];

export function config(overrides: Partial<TrackerConfig> = {}): TrackerConfig {
  return { rulesVersion: 1, timeZone: NEW_YORK, versions: { [V1]: waterCycle() }, ...overrides };
}

export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

type Payloads = { [E in InteractionEvent as E['type']]: E['payload'] };

/** Writes a student's event log: seq, ids and times are assigned in order. */
export class Log {
  readonly events: InteractionEvent[] = [];
  private seq = 0;
  private attempts = 0;
  versionId = V1;
  studentId = STUDENT;

  constructor(public at = '2026-10-19T13:00:00.000Z') {}

  /** Moves the clock forward. */
  wait(minutes: number): this {
    this.at = new Date(Date.parse(this.at) + minutes * 60_000).toISOString();
    return this;
  }

  /** Sets the clock, keeping the offset as written (client times carry their own). */
  on(at: string): this {
    this.at = at;
    return this;
  }

  add<T extends keyof Payloads>(type: T, payload: Payloads[T]): InteractionEvent {
    this.seq += 1;
    const raw = {
      id: `01J${String(this.seq).padStart(23, '0')}`,
      studentId: this.studentId,
      classId: CLASS,
      versionId: this.versionId,
      seq: this.seq,
      at: this.at,
      type,
      level: EVENT_LEVELS[type],
      payload,
    };
    const parsed = parseInteractionEvent(raw);
    if (!parsed.success) throw new Error(`Invalid test event: ${parsed.error.message}`);
    this.events.push(parsed.data);
    this.wait(1);
    return parsed.data;
  }

  /** A full quiz: started, one answer per entry, finished with the number correct. */
  quiz(
    ideaId: string,
    answers: readonly boolean[],
  ): { attemptId: string; finished: InteractionEvent } {
    this.attempts += 1;
    const attemptId = uuid(0xa000 + this.attempts);
    const questionIds = answers.map((_, i) => `${ideaId}/q${i}`);
    this.add('quiz.started', { ideaId, attemptId, questionIds });
    answers.forEach((correct, i) =>
      this.add('quiz.answered', {
        attemptId,
        questionId: questionIds[i] as string,
        choice: correct ? 0 : 1,
        correct,
        attemptNumber: 1,
        secondsToAnswer: 10,
      }),
    );
    const finished = this.add('quiz.finished', {
      attemptId,
      score: answers.filter(Boolean).length,
      of: answers.length,
    });
    return { attemptId, finished };
  }

  /** A quiz scoring `score` out of `of`, right answers first. */
  score(ideaId: string, score: number, of = 10) {
    return this.quiz(
      ideaId,
      Array.from({ length: of }, (_, i) => i < score),
    );
  }

  pass(ideaId: string) {
    return this.score(ideaId, 8, 8);
  }
}
