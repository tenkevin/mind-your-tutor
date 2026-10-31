import { describe, expect, it, vi } from 'vitest';
import { createEventQueue, ulid, type KeyValue } from './queue';

// M2-F5 and M2-U1: the offline queue batches, survives a reload, sends in order,
// never duplicates, is scoped to the signed-in user, and never throws at the student.

const CLASS = {
  classId: '6d1f4a52-2a8b-4c1e-9a1f-1f2e3d4c5b6a',
  versionId: '0b7c9e1d-3f4a-4b5c-8d6e-7f8091a2b3c4',
};
const SAM = '11111111-1111-4111-8111-111111111111';
const SKY = '22222222-2222-4222-8222-222222222222';

function memoryStore(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

interface Sent {
  events: { id: string; type: string }[];
  texts?: { id: string; body: string }[];
}

/** A fake server: stores ids once, in order, like POST /events. */
function fakeServer() {
  const stored: string[] = [];
  const requests: { body: Sent; init: RequestInit }[] = [];
  let mode: 'up' | 'offline' | 'error' | 'signed-out' = 'up';
  const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (mode === 'offline') throw new TypeError('Failed to fetch');
    const body = JSON.parse(String(init!.body)) as Sent;
    requests.push({ body, init: init! });
    if (mode === 'error') return new Response('{}', { status: 503 });
    if (mode === 'signed-out') return new Response('{}', { status: 401 });
    const accepted: { id: string; seq: number }[] = [];
    const duplicates: string[] = [];
    for (const e of body.events) {
      if (stored.includes(e.id)) duplicates.push(e.id);
      else {
        stored.push(e.id);
        accepted.push({ id: e.id, seq: stored.length });
      }
    }
    return Response.json({ accepted, duplicates, rejected: [] });
  });
  return {
    fetch: fetchFn as unknown as typeof fetch,
    stored,
    requests,
    set: (m: typeof mode) => {
      mode = m;
    },
  };
}

function queueFor(userId: string, store: KeyValue, server: ReturnType<typeof fakeServer>) {
  return createEventQueue({ fetch: server.fetch, store, userId, csrfToken: () => 'csrf-token' });
}

const open = (q: ReturnType<typeof createEventQueue>, ideaId = 'rain') =>
  q.track('idea.opened', { ideaId }, CLASS);

describe('event queue (M2-F5)', () => {
  it('queues while offline, then sends everything once, in order', async () => {
    const store = memoryStore();
    const server = fakeServer();
    const q = queueFor(SAM, store, server);
    server.set('offline');
    for (const idea of ['rain', 'cloud', 'river', 'sea']) expect(open(q, idea)).toBe(true);
    await q.flush();
    expect(q.pending()).toBe(4);

    server.set('up');
    await q.flush();
    expect(q.pending()).toBe(0);
    expect(server.requests).toHaveLength(1);
    const sent = server.requests[0]!.body.events;
    expect(
      sent.map((e) => (e as unknown as { payload: { ideaId: string } }).payload.ideaId),
    ).toEqual(['rain', 'cloud', 'river', 'sea']);
    expect(server.stored).toEqual(sent.map((e) => e.id));
    expect(server.requests[0]!.init.headers).toMatchObject({ 'x-csrf-token': 'csrf-token' });
    // Nothing left to send: no more requests.
    await q.flush();
    expect(server.requests).toHaveLength(1);
  });

  it('keeps a batch the server failed on, and resends it with the same ids', async () => {
    const store = memoryStore();
    const server = fakeServer();
    const q = queueFor(SAM, store, server);
    open(q);
    open(q, 'cloud');
    server.set('error');
    await q.flush();
    expect(q.pending()).toBe(2);
    server.set('up');
    await q.flush();
    expect(server.requests.map((r) => r.body.events.map((e) => e.id))).toEqual([
      server.stored,
      server.stored,
    ]);
    expect(server.stored).toHaveLength(2);
  });

  it('survives a reload: a new queue on the same tab sends what was left, once', async () => {
    const store = memoryStore();
    const server = fakeServer();
    server.set('offline');
    const before = queueFor(SAM, store, server);
    open(before);
    open(before, 'cloud');
    await before.flush();

    server.set('up');
    const after = queueFor(SAM, store, server);
    expect(after.pending()).toBe(2);
    await after.flush();
    // The old page's queue sees it was sent and sends nothing again.
    await before.flush();
    expect(server.stored).toHaveLength(2);
    expect(server.requests).toHaveLength(1);
  });

  it('is scoped to the signed-in user: another student on the tab never sends it', async () => {
    const store = memoryStore();
    const server = fakeServer();
    server.set('offline');
    const sam = queueFor(SAM, store, server);
    open(sam);
    await sam.flush();

    server.set('up');
    const sky = queueFor(SKY, store, server);
    expect(sky.pending()).toBe(0);
    await sky.flush();
    expect(server.requests).toHaveLength(0);
    expect([...store.data.keys()]).toEqual([`ideamap.events.${SAM}`]);
    // Signing out clears only Sam's.
    sky.clear();
    expect(sam.pending()).toBe(1);
    sam.clear();
    expect(store.data.size).toBe(0);
  });

  it('keeps events across a 401 and reports it', async () => {
    const store = memoryStore();
    const server = fakeServer();
    const onSignedOut = vi.fn();
    const q = createEventQueue({
      fetch: server.fetch,
      store,
      userId: SAM,
      csrfToken: () => 't',
      onSignedOut,
    });
    open(q);
    server.set('signed-out');
    await q.flush();
    expect(onSignedOut).toHaveBeenCalledOnce();
    expect(q.pending()).toBe(1);
  });

  it('drops events the server answered for, keeping ones tracked during the send', async () => {
    const store = memoryStore();
    const server = fakeServer();
    const q = queueFor(SAM, store, server);
    open(q);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = server.fetch;
    const q2 = createEventQueue({
      fetch: (async (url: string, init: RequestInit) => {
        await gate;
        return slow(url, init);
      }) as unknown as typeof fetch,
      store,
      userId: SAM,
      csrfToken: () => 't',
    });
    const sending = q2.flush();
    open(q, 'late');
    release();
    await sending;
    // The first batch held one event; the late one was sent by the same flush's next round.
    expect(server.stored).toHaveLength(2);
    expect(q.pending()).toBe(0);
    expect(server.requests.map((r) => r.body.events.length)).toEqual([1, 1]);
  });

  it('sends typed text with its event and splits big queues into batches', async () => {
    const store = memoryStore();
    const server = fakeServer();
    const q = queueFor(SAM, store, server);
    const textRef = crypto.randomUUID();
    expect(
      q.track('teachback.done', { unitId: 1, textRef }, CLASS, 'Person A said rain falls.'),
    ).toBe(true);
    // A text event without its text, or an invalid event, is never queued.
    expect(q.track('teachback.done', { unitId: 1, textRef: crypto.randomUUID() }, CLASS)).toBe(
      false,
    );
    expect(q.track('idea.opened', { ideaId: 'Not A Slug' }, CLASS)).toBe(false);
    for (let i = 0; i < 250; i++) open(q);
    await q.flush();
    expect(server.requests.map((r) => r.body.events.length)).toEqual([200, 51]);
    expect(server.requests[0]!.body.texts).toEqual([
      { id: textRef, body: 'Person A said rain falls.' },
    ]);
    expect(server.requests[1]!.body.texts).toBeUndefined();
    expect(q.pending()).toBe(0);
    expect(store.data.size).toBe(0);
  });

  it('flushes on a timer, on page hide (keepalive) and on reconnect', async () => {
    vi.useFakeTimers();
    try {
      const store = memoryStore();
      const server = fakeServer();
      const q = createEventQueue({
        fetch: server.fetch,
        store,
        userId: SAM,
        csrfToken: () => 't',
        intervalMs: 5000,
      });
      const target = new EventTarget();
      const stop = q.start(target);
      open(q);
      await vi.advanceTimersByTimeAsync(5000);
      expect(server.requests).toHaveLength(1);
      open(q);
      target.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);
      expect(server.requests[1]!.init.keepalive).toBe(true);
      open(q);
      target.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      expect(server.requests).toHaveLength(3);
      stop();
      open(q);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(server.requests).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('invisible to students (M2-U1)', () => {
  it('never throws or rejects, whatever the network or storage does', async () => {
    const broken: KeyValue = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const q = createEventQueue({
      fetch: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
      store: broken,
      userId: SAM,
      csrfToken: () => 't',
    });
    expect(() => open(q)).not.toThrow();
    await expect(q.flush()).resolves.toBeUndefined();
    expect(() => q.clear()).not.toThrow();
  });

  it('returns from track at once, without waiting on the network', () => {
    const server = fakeServer();
    const q = queueFor(SAM, memoryStore(), server);
    const started = performance.now();
    for (let i = 0; i < 100; i++) open(q);
    expect(performance.now() - started).toBeLessThan(500);
    expect(server.requests).toHaveLength(0);
  });
});

describe('ulid', () => {
  it('makes ULIDs that sort in creation order, even within a millisecond', () => {
    const ids = Array.from({ length: 50 }, () => ulid(1_700_000_000_000));
    expect(ids.every((id) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id))).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(50);
  });
});
