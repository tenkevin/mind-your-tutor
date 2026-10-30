import {
  CSRF_HEADER,
  EventBatchResponseSchema,
  eventTextRef,
  judgeClientEvent,
  MAX_EVENTS_PER_BATCH,
  MAX_TEXTS_PER_BATCH,
  type ClientEventInput,
  type EventText,
  type EventType,
} from '@ideamap/contracts';

// The student app's side of event ingest (ARCHITECTURE.md §8.5, task M2).
//
// `track` records a learning event (D19) in a queue and returns at once; it never
// throws and never blocks the student (M2-U1). The queue is sent to `POST /events` in
// batches every few seconds, when the page is hidden or closed, and when the browser
// comes back online. Like F5's autosave it lives in sessionStorage, under a key for
// the signed-in user only: a different student signing in on this tab never sends
// (or sees) it, and nothing goes to localStorage (F5-S2).
//
// Order and duplicates: one batch is in flight at a time, oldest events first, and an
// event leaves the queue only once the server has answered for it (stored, already
// stored, or refused for good). A dropped connection or a server error keeps the batch
// to resend; event ids don't change, so the server drops anything it already has
// (M2-F2). A 401 keeps everything for after sign-in.
//
// Typed text (teach-back answers, challenges) is passed in already anonymised by the
// device's anonymous layer (D26, task A7), and travels with the event that refers to it.

const KEY_PREFIX = 'ideamap.events.';
/** Under the 64 KiB browsers allow a keepalive request, with room for headers. */
const KEEPALIVE_MAX_BYTES = 60_000;

/** Storage for the queue: sessionStorage in the browser, a stub in tests. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Stored {
  events: ClientEventInput[];
  texts: Record<string, string>;
}

export interface EventQueueOptions {
  fetch: typeof fetch;
  store: KeyValue;
  /** The signed-in student; the queue is theirs alone. */
  userId: string;
  /** The CSRF token from /api/me, read at send time. */
  csrfToken: () => string;
  /** How often queued events are sent. */
  intervalMs?: number;
  now?: () => Date;
  /** Called on a 401, so the app can send the student to sign in. Events stay queued. */
  onSignedOut?: () => void;
}

export interface Context {
  classId: string;
  versionId: string;
}

export interface EventQueue {
  /** Queue one event. Returns false (and queues nothing) if it isn't a valid event. */
  track<T extends EventType>(
    type: T,
    payload: Extract<ClientEventInput, { type: T }>['payload'],
    context: Context,
    /** Typed text the payload's `textRef` refers to, already anonymised (D26). */
    text?: string,
  ): boolean;
  /** Send what is queued now. Overlapping calls share one send. Never throws. */
  flush(options?: { keepalive?: boolean }): Promise<void>;
  /** Events waiting to be sent. */
  pending(): number;
  /** Start sending on a timer, on page hide and on reconnect; returns a stop function. */
  start(target?: EventTarget): () => void;
  /** Forget this user's queue, for sign-out. */
  clear(): void;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastTime = -1;
let lastRandom: number[] = [];

/** A monotonic ULID: ids made in the same millisecond still sort in order. */
export function ulid(now = Date.now()): string {
  if (now <= lastTime) {
    // Same (or earlier) millisecond: increment the previous random part.
    let i = lastRandom.length - 1;
    while (i >= 0 && lastRandom[i] === 31) lastRandom[i--] = 0;
    if (i >= 0) lastRandom[i]! += 1;
    now = lastTime;
  } else {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    lastRandom = [...bytes].map((b) => b % 32);
    lastTime = now;
  }
  let time = '';
  for (let i = 0, t = now; i < 10; i++, t = Math.floor(t / 32)) time = CROCKFORD[t % 32]! + time;
  return time + lastRandom.map((n) => CROCKFORD[n]).join('');
}

export function createEventQueue(options: EventQueueOptions): EventQueue {
  const key = `${KEY_PREFIX}${options.userId}`;
  const now = options.now ?? (() => new Date());

  const read = (): Stored => {
    try {
      const value = JSON.parse(options.store.getItem(key) ?? 'null') as Stored | null;
      if (value && Array.isArray(value.events) && value.texts && typeof value.texts === 'object') {
        return value;
      }
    } catch {
      // Unreadable or unavailable storage: start empty rather than fail.
    }
    return { events: [], texts: {} };
  };
  const write = (value: Stored) => {
    try {
      if (value.events.length === 0) options.store.removeItem(key);
      else options.store.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the events in memory are lost on reload, never shown.
    }
  };

  let sending: Promise<void> | null = null;

  const sendOnce = async (keepalive: boolean): Promise<void> => {
    for (;;) {
      const queued = read();
      if (queued.events.length === 0) return;
      // Oldest first, up to the batch limits.
      const events: ClientEventInput[] = [];
      const texts: EventText[] = [];
      for (const event of queued.events) {
        if (events.length === MAX_EVENTS_PER_BATCH) break;
        const ref = eventTextRef(event as Parameters<typeof eventTextRef>[0]);
        const body = ref ? queued.texts[ref] : undefined;
        if (body !== undefined && texts.length === MAX_TEXTS_PER_BATCH) break;
        events.push(event);
        if (body !== undefined && ref) texts.push({ id: ref, body });
      }

      const body = JSON.stringify(texts.length > 0 ? { events, texts } : { events });
      let res: Response;
      try {
        res = await options.fetch('/events', {
          method: 'POST',
          credentials: 'same-origin',
          // Browsers refuse keepalive bodies over 64 KiB; a bigger batch is sent as
          // usual and, if the page closes first, stays queued for this tab's next load.
          keepalive: keepalive && new TextEncoder().encode(body).length <= KEEPALIVE_MAX_BYTES,
          headers: { 'content-type': 'application/json', [CSRF_HEADER]: options.csrfToken() },
          body,
        });
      } catch {
        return; // Offline or the connection dropped: keep everything for next time.
      }
      if (res.status === 401) {
        options.onSignedOut?.();
        return;
      }
      // Busy or broken server: keep the batch and try again later.
      if (res.status >= 500 || res.status === 408 || res.status === 429) return;

      // Answered: every event in the batch is done, whether stored, already stored or
      // refused. A refusal (bad event, class left) won't change on resending, so the
      // queue never gets stuck behind it.
      let done = new Set(events.map((e) => e.id));
      if (res.ok) {
        try {
          const answer = EventBatchResponseSchema.parse(await res.json());
          done = new Set([
            ...answer.accepted.map((a) => a.id),
            ...answer.duplicates,
            ...answer.rejected.flatMap((r) => (r.id ? [r.id] : [])),
          ]);
          // Rejections without a valid id are matched by position.
          for (const r of answer.rejected)
            if (!r.id && events[r.index]) done.add(events[r.index]!.id);
        } catch {
          return;
        }
      }
      // Remove exactly what was answered, from the queue as it is now: `track` may have
      // added events meanwhile.
      const latest = read();
      const left = latest.events.filter((e) => !done.has(e.id));
      const refs = new Set(
        left.flatMap((e) => eventTextRef(e as Parameters<typeof eventTextRef>[0]) ?? []),
      );
      write({
        events: left,
        texts: Object.fromEntries(Object.entries(latest.texts).filter(([id]) => refs.has(id))),
      });
      if (keepalive || left.length === latest.events.length) return;
    }
  };

  const queue: EventQueue = {
    track(type, payload, context, text) {
      const event = {
        id: ulid(now().getTime()),
        classId: context.classId,
        versionId: context.versionId,
        at: now().toISOString(),
        type,
        payload,
      } as ClientEventInput;
      const verdict = judgeClientEvent(event);
      if (!verdict.ok) return false;
      const ref = eventTextRef(verdict.event);
      if (ref && text === undefined) return false;
      const queued = read();
      queued.events.push(event);
      if (ref && text !== undefined) queued.texts[ref] = text;
      write(queued);
      return true;
    },
    flush({ keepalive = false } = {}) {
      if (!sending) {
        sending = sendOnce(keepalive)
          .catch(() => undefined)
          .finally(() => {
            sending = null;
          });
      }
      return sending;
    },
    pending: () => read().events.length,
    start(target = globalThis as unknown as EventTarget) {
      const timer = setInterval(() => void queue.flush(), options.intervalMs ?? 5000);
      const hidden = () => {
        const doc = (globalThis as { document?: { visibilityState?: string } }).document;
        if (!doc || doc.visibilityState === 'hidden') void queue.flush({ keepalive: true });
      };
      const online = () => void queue.flush();
      const pagehide = () => void queue.flush({ keepalive: true });
      target.addEventListener('visibilitychange', hidden);
      target.addEventListener('pagehide', pagehide);
      target.addEventListener('online', online);
      return () => {
        clearInterval(timer);
        target.removeEventListener('visibilitychange', hidden);
        target.removeEventListener('pagehide', pagehide);
        target.removeEventListener('online', online);
      };
    },
    clear: () => {
      try {
        options.store.removeItem(key);
      } catch {
        // Nothing to clear.
      }
    },
  };
  return queue;
}
