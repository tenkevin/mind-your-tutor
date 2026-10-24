import { z } from 'zod';

// The interaction tracker's event catalogue (ARCHITECTURE.md §8.1–§8.2, spec v1, D19).
// Exactly the 17 learning events D19 allows, each with its fixed educational level
// (D18). Payloads hold ids, enums, numbers and booleans only, never free text: typed
// text lives in InteractionText and an event carries only its `textRef` (§8.2, D26).
// Every object is strict, so an unknown key (an IP address, a device, a location,
// coordinates, keystrokes, a comment) fails to parse. What is traced is a user
// decision (D19): do not add a type or a field here without one.

export const EDUCATIONAL_LEVELS = ['participating', 'teaching', 'other'] as const;
export type EventLevel = (typeof EDUCATIONAL_LEVELS)[number];

/** The educational level of each event type, fixed by type (§8.2); never sent by the client. */
export const EVENT_LEVELS = {
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
} as const satisfies Record<string, EventLevel>;

export type EventType = keyof typeof EVENT_LEVELS;
export const EVENT_TYPES = Object.keys(EVENT_LEVELS) as EventType[];

export function eventLevel(type: EventType): EventLevel {
  return EVENT_LEVELS[type];
}

/** `idea.active_time` is rounded to this many seconds (D19). */
export const ACTIVE_TIME_GRID_SECONDS = 30;
/** `quiz.answered.secondsToAnswer` is rounded to this many seconds (D19). */
export const ANSWER_TIME_GRID_SECONDS = 5;
/** The longest quiz a class can set (§8.3). */
export const MAX_QUIZ_QUESTIONS = 12;

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Quiz bank question ids (C3): `<idea>/<kind>/<from>><to>[/<idea>]`, made from slugs.
const QUESTION_ID = /^[a-z0-9][a-z0-9_>/-]{0,299}$/;
// A pack link, named by its two ideas as quiz question ids name it: `<from_id>><to_id>`.
const LINK_ID = /^[a-z0-9][a-z0-9-]{0,63}>[a-z0-9][a-z0-9-]{0,63}$/;

const rowId = z.uuid();
const ideaId = z.string().regex(SLUG, 'Expected an idea_id slug.');
const questionId = z.string().regex(QUESTION_ID, 'Expected a quiz question id.');
const linkId = z.string().regex(LINK_ID, 'Expected a link id: <from_id>><to_id>.');
/** A pack unit number (Units.unit). */
const unitNumber = z.number().int().min(1).max(9999);
const count = (max: number) => z.number().int().min(0).max(max);

/** Rounds a duration to the nearest multiple of `grid`, so only grid values are stored. */
function roundedSeconds(grid: number) {
  return z
    .number()
    .min(0)
    .max(24 * 60 * 60)
    .transform((s) => Math.round(s / grid) * grid);
}

const unique = <T>(items: readonly T[]) => new Set(items).size === items.length;

export const EVENT_PAYLOAD_SCHEMAS = {
  'idea.opened': z.strictObject({ ideaId }),
  'idea.active_time': z.strictObject({
    ideaId,
    /** Per session, rounded to the nearest 30 s on parse. */
    seconds: roundedSeconds(ACTIVE_TIME_GRID_SECONDS),
  }),
  'quiz.started': z.strictObject({
    ideaId,
    attemptId: rowId,
    /** From the published version's quiz bank, in the order asked. */
    questionIds: z
      .array(questionId)
      .min(1)
      .max(MAX_QUIZ_QUESTIONS)
      .refine(unique, 'Question ids must be different.'),
  }),
  'quiz.answered': z.strictObject({
    attemptId: rowId,
    questionId,
    /** Index of the chosen option in the question's `options`, from 0. */
    choice: count(63),
    correct: z.boolean(),
    /** Which try at this question, from 1. */
    attemptNumber: z.number().int().min(1).max(999),
    /** Rounded to the nearest 5 s on parse. */
    secondsToAnswer: roundedSeconds(ANSWER_TIME_GRID_SECONDS),
  }),
  'quiz.finished': z
    .strictObject({
      attemptId: rowId,
      score: count(MAX_QUIZ_QUESTIONS),
      of: z.number().int().min(1).max(MAX_QUIZ_QUESTIONS),
    })
    .refine((p) => p.score <= p.of, { path: ['score'], message: 'Score cannot exceed of.' }),
  'hint.requested': z.union([z.strictObject({ ideaId }), z.strictObject({ questionId })]),
  'review.link_rebuilt': z.strictObject({ ideaId, linkId }),
  'teachback.done': z.strictObject({ unitId: unitNumber, textRef: rowId }),
  'teachback.judged': z.strictObject({
    unitId: unitNumber,
    verdict: z.enum(['pass', 'retry']),
    /** Indexes into the unit's Assessment key_points, from 0. */
    keyPointsHit: z.array(count(99)).max(100).refine(unique, 'Key points must be different.'),
    aiOutputId: rowId,
  }),
  'feedback.shown': z.strictObject({
    feedbackId: rowId,
    source: z.enum(['ai', 'teacher']),
    /** The stored reason and the rubric or key point it rests on (D15). */
    reasonRef: rowId,
  }),
  'feedback.challenged': z.strictObject({ feedbackId: rowId, textRef: rowId }),
  'feedback.ruled': z.strictObject({
    feedbackId: rowId,
    ruling: z.enum(['upheld', 'overturned', 'edited']),
  }),
  'teacher.feedback.approved': z.strictObject({ feedbackId: rowId }),
  'teacher.feedback.edited': z.strictObject({ feedbackId: rowId }),
  /** A mission is a unit with a due date (T4), named by its unit number. */
  'mission.completed': z.strictObject({ missionId: unitNumber }),
  'map.shown': z.strictObject({ mapViewId: rowId }),
  'ai.output_shown': z.strictObject({ aiOutputId: rowId }),
} as const satisfies Record<EventType, z.ZodType>;

type PayloadSchemas = typeof EVENT_PAYLOAD_SCHEMAS;
/** A payload as the client sends it. */
export type EventPayloadInput<T extends EventType> = z.input<PayloadSchemas[T]>;
/** A payload after parsing: durations are on their grid. */
export type EventPayload<T extends EventType> = z.output<PayloadSchemas[T]>;

// The envelope fields the client sends (§8.2). The server knows the student from the
// session and sets `seq` and `level` itself (§8.5), so a client event carrying
// `studentId`, `seq` or `level` is rejected rather than trusted.
const clientEnvelope = {
  /** Client ULID; a resent event is recorded once. */
  id: z.string().regex(ULID, 'Expected a ULID.'),
  classId: z.uuid(),
  /** The curriculum version the student was on. */
  versionId: z.uuid(),
  /** Client time, ISO 8601 with an offset; used for durations, `seq` decides order. */
  at: z.iso.datetime({ offset: true }),
};

// Matches the F4 interaction_event columns, plus `level` from the type.
const storedEnvelope = {
  ...clientEnvelope,
  /** Pseudonymous app_user id. */
  studentId: z.uuid(),
  /** Per student, set by the server; replay order. */
  seq: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
};

function variants<E extends z.ZodRawShape>(envelope: E, withLevel: boolean) {
  return EVENT_TYPES.map((type) =>
    z.strictObject({
      ...envelope,
      type: z.literal(type),
      ...(withLevel ? { level: z.literal(EVENT_LEVELS[type]) } : {}),
      payload: EVENT_PAYLOAD_SCHEMAS[type],
    }),
  ) as unknown as [z.ZodObject, ...z.ZodObject[]];
}

/**
 * One event as the client sends it to `POST /events` (M2). Unknown types, unknown
 * keys anywhere and client-set `studentId`, `seq` or `level` are rejected.
 */
export const ClientEventSchema = z.discriminatedUnion('type', variants(clientEnvelope, false));

/** One stored event (§8.2): the client event plus `studentId`, `seq` and its type's `level`. */
export const InteractionEventSchema = z.discriminatedUnion('type', variants(storedEnvelope, true));

type ClientEnvelope = {
  id: string;
  classId: string;
  versionId: string;
  at: string;
};

export type ClientEventInput = {
  [T in EventType]: ClientEnvelope & { type: T; payload: EventPayloadInput<T> };
}[EventType];

export type ClientEvent = {
  [T in EventType]: ClientEnvelope & { type: T; payload: EventPayload<T> };
}[EventType];

export type InteractionEvent = {
  [T in EventType]: ClientEnvelope & {
    studentId: string;
    seq: number;
    type: T;
    level: (typeof EVENT_LEVELS)[T];
    payload: EventPayload<T>;
  };
}[EventType];

export function parseClientEvent(input: unknown) {
  return ClientEventSchema.safeParse(input) as z.ZodSafeParseResult<ClientEvent>;
}

export function parseInteractionEvent(input: unknown) {
  return InteractionEventSchema.safeParse(input) as z.ZodSafeParseResult<InteractionEvent>;
}
