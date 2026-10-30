import { expectBestUnder } from '@ideamap/testing';
import { describe, expect, it } from 'vitest';
import {
  ClientEventSchema,
  EVENT_LEVELS,
  EVENT_PAYLOAD_SCHEMAS,
  EVENT_TYPES,
  InteractionEventSchema,
  eventLevel,
  parseClientEvent,
  parseInteractionEvent,
  type EventType,
} from './index.js';

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ENVELOPE = {
  id: '01JB3Z8Q4M6V9X2K7N5R1T0ABC',
  classId: UUID(1),
  versionId: UUID(2),
  at: '2026-10-23T09:15:00.000Z',
};
const STORED = { ...ENVELOPE, studentId: UUID(3), seq: 1 };

// One valid payload per type (§8.2).
const PAYLOADS: Record<EventType, Record<string, unknown>> = {
  'idea.opened': { ideaId: 'evaporation' },
  'idea.active_time': { ideaId: 'evaporation', seconds: 90 },
  'quiz.started': {
    ideaId: 'evaporation',
    attemptId: UUID(10),
    questionIds: ['evaporation/category', 'evaporation/true/evaporation>condensation'],
  },
  'quiz.answered': {
    attemptId: UUID(10),
    questionId: 'evaporation/category',
    choice: 2,
    correct: true,
    attemptNumber: 1,
    secondsToAnswer: 10,
  },
  'quiz.finished': { attemptId: UUID(10), score: 6, of: 8 },
  'hint.requested': { ideaId: 'evaporation' },
  'review.link_rebuilt': { ideaId: 'evaporation', linkId: 'evaporation>condensation' },
  'teachback.done': { unitId: 1, textRef: UUID(11) },
  'teachback.judged': { unitId: 1, verdict: 'pass', keyPointsHit: [0, 2], aiOutputId: UUID(12) },
  'feedback.shown': { feedbackId: UUID(13), source: 'ai', reasonRef: UUID(14) },
  'feedback.challenged': { feedbackId: UUID(13), textRef: UUID(15) },
  'feedback.ruled': { feedbackId: UUID(13), ruling: 'upheld' },
  'teacher.feedback.approved': { feedbackId: UUID(13) },
  'teacher.feedback.edited': { feedbackId: UUID(13) },
  'mission.completed': { missionId: 2 },
  'map.shown': { mapViewId: UUID(16) },
  'ai.output_shown': { aiOutputId: UUID(17) },
};

const client = (type: string, payload: unknown = PAYLOADS[type as EventType]) => ({
  ...ENVELOPE,
  type,
  payload,
});
const stored = (type: EventType, extra: object = {}) => ({
  ...STORED,
  type,
  level: EVENT_LEVELS[type],
  payload: PAYLOADS[type],
  ...extra,
});

describe('event catalogue (§8.2, D19)', () => {
  it('has exactly the 17 §8.2 types with their levels', () => {
    expect(EVENT_LEVELS).toEqual({
      'idea.opened': 'participating',
      'idea.active_time': 'participating',
      'quiz.started': 'participating',
      'quiz.answered': 'participating',
      'quiz.finished': 'participating',
      'hint.requested': 'participating',
      'review.link_rebuilt': 'participating',
      'teachback.done': 'participating',
      'teachback.judged': 'other',
      'feedback.shown': 'participating',
      'feedback.challenged': 'participating',
      'feedback.ruled': 'teaching',
      'teacher.feedback.approved': 'teaching',
      'teacher.feedback.edited': 'teaching',
      'mission.completed': 'participating',
      'map.shown': 'other',
      'ai.output_shown': 'other',
    });
    expect(EVENT_TYPES).toHaveLength(17);
    expect(Object.keys(EVENT_PAYLOAD_SCHEMAS).sort()).toEqual([...EVENT_TYPES].sort());
    for (const type of EVENT_TYPES) expect(eventLevel(type)).toBe(EVENT_LEVELS[type]);
  });

  it.each(EVENT_TYPES)('parses a valid %s, as a client event and as a stored one', (type) => {
    expect(parseClientEvent(client(type)).success).toBe(true);
    expect(parseInteractionEvent(stored(type)).success).toBe(true);
  });

  it.each(EVENT_TYPES)('rejects %s with any one payload field missing', (type) => {
    for (const key of Object.keys(PAYLOADS[type])) {
      const payload: Record<string, unknown> = { ...PAYLOADS[type] };
      delete payload[key];
      const result = ClientEventSchema.safeParse(client(type, payload));
      expect(result.success, `${type} without ${key}`).toBe(false);
      expect(result.error?.issues[0]?.path[0]).toBe('payload');
    }
  });

  it.each(EVENT_TYPES)('rejects %s with any one payload field of the wrong type', (type) => {
    for (const [key, value] of Object.entries(PAYLOADS[type])) {
      const wrong = typeof value === 'string' ? 42 : 'x';
      const result = ClientEventSchema.safeParse(client(type, { ...PAYLOADS[type], [key]: wrong }));
      expect(result.success, `${type}.${key} = ${String(wrong)}`).toBe(false);
      const issue = result.error!.issues[0]!;
      // Unions report at the payload; every other schema names the field.
      expect(issue.path.slice(0, type === 'hint.requested' ? 1 : 2)).toEqual(
        type === 'hint.requested' ? ['payload'] : ['payload', key],
      );
    }
  });

  it('accepts hint.requested for a question, but not both ids or neither', () => {
    expect(parseClientEvent(client('hint.requested', { questionId: 'a/category' })).success).toBe(
      true,
    );
    expect(
      parseClientEvent(client('hint.requested', { ideaId: 'a', questionId: 'a/category' })).success,
    ).toBe(false);
    expect(parseClientEvent(client('hint.requested', {})).success).toBe(false);
  });

  it('rejects impossible values', () => {
    const bad: [EventType, Record<string, unknown>][] = [
      ['quiz.finished', { attemptId: UUID(10), score: 9, of: 8 }],
      ['quiz.started', { ...PAYLOADS['quiz.started'], questionIds: [] }],
      ['quiz.started', { ...PAYLOADS['quiz.started'], questionIds: ['a/category', 'a/category'] }],
      ['quiz.answered', { ...PAYLOADS['quiz.answered'], choice: -1 }],
      ['quiz.answered', { ...PAYLOADS['quiz.answered'], attemptNumber: 0 }],
      ['quiz.answered', { ...PAYLOADS['quiz.answered'], secondsToAnswer: -5 }],
      ['idea.active_time', { ideaId: 'a', seconds: Number.NaN }],
      ['idea.active_time', { ideaId: 'a', seconds: Infinity }],
      ['teachback.judged', { ...PAYLOADS['teachback.judged'], verdict: 'fail' }],
      ['feedback.shown', { ...PAYLOADS['feedback.shown'], source: 'peer' }],
      ['feedback.ruled', { ...PAYLOADS['feedback.ruled'], ruling: 'ignored' }],
    ];
    for (const [type, payload] of bad) {
      expect(parseClientEvent(client(type, payload)).success, JSON.stringify(payload)).toBe(false);
    }
  });
});

describe('rounding (D19)', () => {
  // Durations are normalised to the nearest grid value, so the stored value is always on it.
  it('rounds idea.active_time to the nearest 30 s', () => {
    const cases: [number, number][] = [
      [47, 60],
      [44, 30],
      [45, 60],
      [0, 0],
      [14, 0],
      [90, 90],
      [301.2, 300],
    ];
    for (const [sent, kept] of cases) {
      const result = parseClientEvent(client('idea.active_time', { ideaId: 'a', seconds: sent }));
      expect(result.data?.payload).toEqual({ ideaId: 'a', seconds: kept });
    }
  });

  it('rounds quiz.answered secondsToAnswer to the nearest 5 s', () => {
    for (const [sent, kept] of [
      [7, 5],
      [8, 10],
      [0, 0],
      [62.4, 60],
    ] as const) {
      const result = parseClientEvent(
        client('quiz.answered', { ...PAYLOADS['quiz.answered'], secondsToAnswer: sent }),
      );
      expect(result.data?.payload).toMatchObject({ secondsToAnswer: kept });
    }
  });

  it('keeps stored events on the grid', () => {
    const result = parseInteractionEvent({
      ...stored('idea.active_time'),
      payload: { ideaId: 'a', seconds: 47 },
    });
    expect(result.data?.payload).toEqual({ ideaId: 'a', seconds: 60 });
  });
});

describe('envelope (§8.2, F4 interaction_event)', () => {
  it('parses the stored envelope fields', () => {
    const result = parseInteractionEvent(stored('idea.opened'));
    expect(result.data).toEqual({
      ...STORED,
      type: 'idea.opened',
      level: 'participating',
      payload: PAYLOADS['idea.opened'],
    });
  });

  it.each([
    ['id', 'not-a-ulid'],
    ['id', '01jb3z8q4m6v9x2k7n5r1t0abc'],
    ['id', '01JB3Z8Q4M6V9X2K7N5R1T0ABI'],
    ['classId', 'class-1'],
    ['versionId', 7],
    ['at', '23 Oct 2026'],
    ['at', '2026-10-23T09:15:00'],
  ])('rejects a client event with %s = %j', (key, value) => {
    const result = ClientEventSchema.safeParse({ ...client('idea.opened'), [key]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([key]);
  });

  it.each([
    ['studentId', 'a uuid', 'ab'],
    ['seq', 'a positive integer', 0],
    ['seq', 'an integer', 1.5],
  ])('rejects a stored event whose %s is not %s', (key, _what, value) => {
    expect(parseInteractionEvent(stored('idea.opened', { [key]: value })).success).toBe(false);
  });

  it.each([
    ['seq', 5],
    ['level', 'participating'],
    ['studentId', UUID(3)],
  ])('rejects a client event that sets %s (the server sets it)', (key, value) => {
    const result = ClientEventSchema.safeParse({ ...client('idea.opened'), [key]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ code: 'unrecognized_keys', keys: [key] });
  });

  it('fixes level by type: a stored event with another level is rejected', () => {
    for (const type of EVENT_TYPES) {
      for (const level of ['participating', 'teaching', 'other']) {
        const ok = level === EVENT_LEVELS[type];
        expect(parseInteractionEvent(stored(type, { level })).success, `${type} ${level}`).toBe(ok);
      }
    }
    expect(parseInteractionEvent({ ...stored('idea.opened'), level: undefined }).success).toBe(
      false,
    );
  });
});

describe('forbidden data (D19)', () => {
  const FORBIDDEN: [string, unknown][] = [
    ['ip', '203.0.113.7'],
    ['ipAddress', '203.0.113.7'],
    ['userAgent', 'Mozilla/5.0'],
    ['device', 'iPad'],
    ['location', { lat: 51.5, lon: -0.1 }],
    ['x', 120],
    ['y', 340],
    ['keystrokes', ['a', 'b']],
    ['text', 'I think evaporation is when water gets hot'],
    ['comment', 'free text'],
    ['scrollY', 800],
    ['hoveredLinkId', 'a>b'],
  ];

  it.each(EVENT_TYPES)('rejects every forbidden key in a %s payload or envelope', (type) => {
    for (const [key, value] of FORBIDDEN) {
      const inPayload = client(type, { ...PAYLOADS[type], [key]: value });
      expect(ClientEventSchema.safeParse(inPayload).success, `payload.${key}`).toBe(false);
      expect(ClientEventSchema.safeParse({ ...client(type), [key]: value }).success, key).toBe(
        false,
      );
      expect(parseInteractionEvent(stored(type, { [key]: value })).success, key).toBe(false);
      expect(
        parseInteractionEvent(stored(type, { payload: { ...PAYLOADS[type], [key]: value } }))
          .success,
      ).toBe(false);
    }
  });

  // No payload field accepts free text: every string is an id, a ref or an enum.
  it.each(EVENT_TYPES)('accepts no free text in any %s payload field', (type) => {
    const sentences = [
      'I feel sad today',
      'water gets hot.',
      'see https://example.com',
      'Évaporation',
    ];
    for (const [key, value] of Object.entries(PAYLOADS[type])) {
      for (const sentence of sentences) {
        const replaced = Array.isArray(value) ? [sentence] : sentence;
        const result = ClientEventSchema.safeParse(
          client(type, { ...PAYLOADS[type], [key]: replaced }),
        );
        expect(result.success, `${type}.${key} = ${sentence}`).toBe(false);
      }
    }
  });

  it('keeps typed text out of events: only textRef ids', () => {
    for (const type of ['teachback.done', 'feedback.challenged'] as const) {
      const result = parseClientEvent(
        client(type, { ...PAYLOADS[type], textRef: 'my answer is…' }),
      );
      expect(result.success).toBe(false);
    }
  });

  it.each(['link.hovered', 'zoom.changed', 'session.idle', 'idea.clicked', 'page.scrolled', ''])(
    'rejects the unknown type %j',
    (type) => {
      const result = ClientEventSchema.safeParse(client(type, {}));
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['type']);
      expect(
        InteractionEventSchema.safeParse({ ...STORED, type, level: 'other', payload: {} }).success,
      ).toBe(false);
    },
  );
});

describe('validation speed', () => {
  it('validates 500 mixed events in under 20 ms', async () => {
    const batch = Array.from({ length: 500 }, (_, i) =>
      client(EVENT_TYPES[i % EVENT_TYPES.length]!),
    );
    for (const event of batch) ClientEventSchema.parse(event); // warm up
    return expectBestUnder(
      'validates 500 mixed events',
      20,
      () => {
        for (const event of batch) ClientEventSchema.parse(event);
      },
      { runs: 5 },
    );
  });
});
