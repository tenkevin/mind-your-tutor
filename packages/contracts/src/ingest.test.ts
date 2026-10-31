import { describe, expect, it } from 'vitest';
import { EVENT_TYPES } from './events.js';
import {
  CLIENT_EVENT_TYPES,
  EventBatchSchema,
  eventTextRef,
  judgeClientEvent,
  MAX_EVENTS_PER_BATCH,
  TEXT_EVENT_KINDS,
} from './ingest.js';

// M2: the POST /events batch envelope and the per-event verdicts.

const base = {
  id: '01JB8Y2C3D4E5F6G7H8J9K0M1N',
  classId: '6d1f4a52-2a8b-4c1e-9a1f-1f2e3d4c5b6a',
  versionId: '0b7c9e1d-3f4a-4b5c-8d6e-7f8091a2b3c4',
  at: '2026-10-24T10:00:00.000Z',
};

describe('EventBatchSchema', () => {
  it('takes events and optional texts', () => {
    const batch = EventBatchSchema.parse({ events: [{}] });
    expect(batch.texts).toEqual([]);
  });

  it('caps batch size and refuses extra keys', () => {
    expect(
      EventBatchSchema.safeParse({ events: Array(MAX_EVENTS_PER_BATCH + 1).fill({}) }).success,
    ).toBe(false);
    expect(EventBatchSchema.safeParse({ events: [] }).success).toBe(false);
    expect(EventBatchSchema.safeParse({ events: [{}], studentId: 'x' }).success).toBe(false);
    expect(
      EventBatchSchema.safeParse({ events: [{}], texts: [{ id: base.classId, body: '' }] }).success,
    ).toBe(false);
  });
});

describe('judgeClientEvent', () => {
  it('accepts a valid participating event', () => {
    const v = judgeClientEvent({ ...base, type: 'idea.opened', payload: { ideaId: 'rain' } });
    expect(v.ok).toBe(true);
  });

  it('names an unknown type, a forbidden field and other failures', () => {
    expect(judgeClientEvent({ ...base, type: 'page.scrolled', payload: {} })).toMatchObject({
      ok: false,
      code: 'unknown_type',
    });
    const field = judgeClientEvent({
      ...base,
      type: 'idea.opened',
      payload: { ideaId: 'rain' },
      ip: '10.0.0.1',
    });
    expect(field).toMatchObject({ ok: false, code: 'forbidden_field' });
    expect(field.ok ? '' : field.message).toContain('ip');
    expect(field.ok ? '' : field.message).not.toContain('10.0.0.1');
    for (const key of ['studentId', 'seq', 'level']) {
      expect(
        judgeClientEvent({ ...base, type: 'idea.opened', payload: { ideaId: 'rain' }, [key]: 1 }),
        key,
      ).toMatchObject({ ok: false, code: 'forbidden_field' });
    }
    expect(
      judgeClientEvent({ ...base, type: 'idea.opened', payload: { ideaId: 'Not a slug' } }),
    ).toMatchObject({ ok: false, code: 'invalid', message: 'Invalid payload.ideaId.' });
    expect(judgeClientEvent(null)).toMatchObject({ ok: false, code: 'unknown_type' });
  });

  it('keeps teacher actions and model verdicts for the server', () => {
    expect(CLIENT_EVENT_TYPES).not.toContain('teachback.judged');
    expect(EVENT_TYPES.filter((t) => !CLIENT_EVENT_TYPES.includes(t))).toEqual([
      'teachback.judged',
      'feedback.ruled',
      'teacher.feedback.approved',
      'teacher.feedback.edited',
    ]);
    const v = judgeClientEvent({
      ...base,
      type: 'teachback.judged',
      payload: { unitId: 1, verdict: 'pass', keyPointsHit: [], aiOutputId: base.classId },
    });
    expect(v).toMatchObject({ ok: false, code: 'server_only' });
  });

  it('finds the text reference of the two text-carrying events', () => {
    expect(Object.keys(TEXT_EVENT_KINDS)).toEqual(['teachback.done', 'feedback.challenged']);
    const v = judgeClientEvent({
      ...base,
      type: 'teachback.done',
      payload: { unitId: 1, textRef: base.versionId },
    });
    expect(v.ok && eventTextRef(v.event)).toBe(base.versionId);
    const opened = judgeClientEvent({ ...base, type: 'idea.opened', payload: { ideaId: 'rain' } });
    expect(opened.ok && eventTextRef(opened.event)).toBeNull();
  });
});
