import { z } from 'zod';
import { EVENT_TYPES, parseClientEvent, type ClientEvent, type EventType } from './events.js';

// `POST /events` (ARCHITECTURE.md §8.5, task M2). The client sends a batch of M1
// client events, plus the typed text that `teachback.done` and `feedback.challenged`
// refer to by `textRef` (§8.2: text lives in InteractionText, never in an event).
// Each event is judged on its own: one bad event never costs the others in its batch.
// Nothing here adds to what is traced (D19); it only carries M1's events.

/** The most events one batch may carry. The client sends smaller batches every few seconds. */
export const MAX_EVENTS_PER_BATCH = 200;
/** The most typed texts one batch may carry. */
export const MAX_TEXTS_PER_BATCH = 20;
/** The longest typed text, in characters; the same limit as `interaction_text.body`. */
export const MAX_TEXT_LENGTH = 20_000;

/** The event types that carry a `textRef` to typed text, and the kind of text each is. */
export const TEXT_EVENT_KINDS = {
  'teachback.done': 'teachback',
  'feedback.challenged': 'challenge',
} as const satisfies Partial<Record<EventType, string>>;

/**
 * Event types a student's app may send. The rest are recorded by the server itself:
 * `teaching` events are teacher actions, and `teachback.judged` is the model's verdict
 * (§8.4 rule 3), which a student's client must never be able to write.
 */
export const CLIENT_EVENT_TYPES: readonly EventType[] = EVENT_TYPES.filter(
  (t) =>
    t !== 'teachback.judged' &&
    t !== 'feedback.ruled' &&
    t !== 'teacher.feedback.approved' &&
    t !== 'teacher.feedback.edited',
);

/**
 * One typed text, already anonymised on the device (D26): names and places are
 * neutral labels. `id` is chosen by the client so a resent batch stores it once.
 */
export const EventTextSchema = z.strictObject({
  id: z.uuid(),
  body: z.string().min(1).max(MAX_TEXT_LENGTH),
});
export type EventText = z.infer<typeof EventTextSchema>;

/** The batch envelope. Events are checked one by one afterwards, by `judgeClientEvent`. */
export const EventBatchSchema = z.strictObject({
  events: z.array(z.unknown()).min(1).max(MAX_EVENTS_PER_BATCH),
  texts: z.array(EventTextSchema).max(MAX_TEXTS_PER_BATCH).default([]),
});
export type EventBatch = z.infer<typeof EventBatchSchema>;

export const REJECTION_CODES = [
  /** Not a §8.2 event type. */
  'unknown_type',
  /** A key the catalogue doesn't have, including client-set studentId, seq or level. */
  'forbidden_field',
  /** Any other schema failure. */
  'invalid',
  /** A type only the server records. */
  'server_only',
  /** A curriculum version the class isn't pinned to (outside the grace period). */
  'version_not_pinned',
  /** A `textRef` with no text in this batch or already stored for this student. */
  'text_missing',
  /** An event id already used by someone else. */
  'id_taken',
] as const;
export type RejectionCode = (typeof REJECTION_CODES)[number];

export const EventRejectionSchema = z.strictObject({
  /** Position in the batch, from 0. */
  index: z.number().int().min(0),
  /** The event's id, when it had a valid one. */
  id: z.string().nullable(),
  code: z.enum(REJECTION_CODES),
  message: z.string(),
});
export type EventRejection = z.infer<typeof EventRejectionSchema>;

export const EventBatchResponseSchema = z.strictObject({
  /** Stored now, with the seq the server gave each, in batch order. */
  accepted: z.array(z.strictObject({ id: z.string(), seq: z.number().int().min(1) })),
  /** Already stored (a resend): dropped without error. */
  duplicates: z.array(z.string()),
  rejected: z.array(EventRejectionSchema),
});
export type EventBatchResponse = z.infer<typeof EventBatchResponseSchema>;

export type JudgedEvent =
  { ok: true; event: ClientEvent } | { ok: false; code: RejectionCode; message: string };

const MAX_KEYS_NAMED = 5;

/**
 * Check one client event against M1 and the client allowance, with a reason a
 * person can read. Unknown keys are named (a few, truncated); their values never are.
 */
export function judgeClientEvent(input: unknown): JudgedEvent {
  const type =
    input !== null && typeof input === 'object' ? (input as { type?: unknown }).type : undefined;
  if (typeof type !== 'string' || !(EVENT_TYPES as string[]).includes(type)) {
    return { ok: false, code: 'unknown_type', message: 'Not an event type Idea Map records.' };
  }
  const parsed = parseClientEvent(input);
  if (!parsed.success) {
    const keys = parsed.error.issues.flatMap((i) => (i.code === 'unrecognized_keys' ? i.keys : []));
    if (keys.length > 0) {
      const named = keys.slice(0, MAX_KEYS_NAMED).map((k) => k.slice(0, 40));
      return {
        ok: false,
        code: 'forbidden_field',
        message: `Fields not recorded: ${named.join(', ')}.`,
      };
    }
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? issue.path.join('.') : 'event';
    return { ok: false, code: 'invalid', message: `Invalid ${where}.` };
  }
  if (!CLIENT_EVENT_TYPES.includes(parsed.data.type)) {
    return { ok: false, code: 'server_only', message: 'This event is recorded by the server.' };
  }
  return { ok: true, event: parsed.data };
}

/** The `textRef` an event carries, if its type has one. */
export function eventTextRef(event: ClientEvent): string | null {
  return event.type === 'teachback.done' || event.type === 'feedback.challenged'
    ? event.payload.textRef
    : null;
}

/** `PUT /api/privacy/students/:studentId/tracing`: the district opts a student out of tracing, or back in (D24). */
export const TracingOptOutRequestSchema = z.strictObject({ optedOut: z.boolean() });
export type TracingOptOutRequest = z.infer<typeof TracingOptOutRequestSchema>;
