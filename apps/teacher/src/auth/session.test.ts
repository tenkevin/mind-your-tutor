import { CSRF_HEADER, type MeResponse } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import {
  createSessionClient,
  readPending,
  SignedOut,
  signInPath,
  stashWrite,
  type KeyValue,
} from './session';

// F5-U3: an expired session sends the teacher to sign in and back, and keeps their edits.

function memoryStore(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const me = (id: string): MeResponse => ({
  user: { id, role: 'teacher', name: 'Terry Teacher' },
  org: { id: '7f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f00', name: 'Example District A' },
  csrfToken: `csrf-${id}`,
  session: { idleMinutes: 480, expiresAt: '2026-10-23T12:00:00.000Z' },
});
const TERRY = '1f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f01';
const TESS = '2f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f02';

type Outcome = 'ok' | 401 | 500 | 'network';

function fakeServer() {
  const state = {
    signedIn: TERRY as string | null,
    writes: [] as { url: string; body: unknown; csrf: string }[],
    /** Per-URL outcome for writes; anything unlisted succeeds. */
    outcome: new Map<string, Outcome>(),
    attempts: [] as string[],
  };
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/me') {
      return state.signedIn
        ? new Response(JSON.stringify(me(state.signedIn)), { status: 200 })
        : new Response('{}', { status: 401 });
    }
    state.attempts.push(url);
    const outcome = state.outcome.get(url) ?? 'ok';
    if (outcome === 'network') throw new TypeError('Failed to fetch');
    if (outcome !== 'ok') return new Response('{}', { status: outcome });
    if (!state.signedIn) return new Response('{}', { status: 401 });
    const headers = new Headers(init?.headers);
    state.writes.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      csrf: headers.get(CSRF_HEADER) ?? '',
    });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  return { state, fetchFn };
}

describe('session client (F5-U3)', () => {
  it('sends the CSRF token from /api/me on writes', async () => {
    const { state, fetchFn } = fakeServer();
    const client = createSessionClient({
      fetch: fetchFn,
      store: memoryStore(),
      here: () => '/',
      go: () => {},
    });
    await client.load();
    await client.send('PUT', '/api/classes/x/config', { course: {} });
    expect(state.writes[0]!.csrf).toBe(`csrf-${TERRY}`);
  });

  it('keeps an edit refused by an expired session, returns to the page and resends it', async () => {
    const { state, fetchFn } = fakeServer();
    const store = memoryStore();
    const visits: string[] = [];
    const page = '/classes/x/settings?tab=units#due-dates';
    const client = createSessionClient({
      fetch: fetchFn,
      store,
      here: () => page,
      go: (p) => visits.push(p),
    });
    await client.load();

    state.signedIn = null; // idle limit passed
    await expect(
      client.send('PUT', '/api/classes/x/config', { course: { pass_mark: 70 } }),
    ).rejects.toBeInstanceOf(SignedOut);
    // A later autosave of the same form replaces the first.
    await expect(
      client.send('PUT', '/api/classes/x/config', { course: { pass_mark: 75 } }),
    ).rejects.toBeInstanceOf(SignedOut);
    expect(visits[0]).toBe(signInPath(page));
    expect(decodeURIComponent(visits[0]!.split('returnTo=')[1]!)).toBe(page);
    expect(readPending(store)).toHaveLength(1);

    // Signed in again, back on the page: the edit is sent with the new CSRF token.
    state.signedIn = TERRY;
    const again = createSessionClient({ fetch: fetchFn, store, here: () => page, go: () => {} });
    await again.load();
    expect(await again.replayPendingWrites()).toEqual({ saved: 1, pending: 0 });
    expect(state.writes).toEqual([
      { url: '/api/classes/x/config', body: { course: { pass_mark: 75 } }, csrf: `csrf-${TERRY}` },
    ]);
    expect(readPending(store)).toEqual([]);
  });

  it("never sends one teacher's kept edits as another's", async () => {
    const { state, fetchFn } = fakeServer();
    const store = memoryStore();
    const client = createSessionClient({ fetch: fetchFn, store, here: () => '/', go: () => {} });
    await client.load();
    state.signedIn = null;
    await expect(client.send('PUT', '/api/classes/x/config', {})).rejects.toBeInstanceOf(SignedOut);
    state.signedIn = TESS;
    const other = createSessionClient({ fetch: fetchFn, store, here: () => '/', go: () => {} });
    await other.load();
    expect(await other.replayPendingWrites()).toEqual({ saved: 0, pending: 0 });
    expect(state.writes).toEqual([]);
    expect(readPending(store)).toEqual([]);
  });

  it('keeps no session token anywhere it can read', async () => {
    const { fetchFn } = fakeServer();
    const store = memoryStore();
    const client = createSessionClient({ fetch: fetchFn, store, here: () => '/', go: () => {} });
    await client.load();
    expect([...store.data.values()].join()).not.toContain('csrf');
  });

  describe('keeps every edit until the server accepts it (F5-E1)', () => {
    const URLS = ['/api/classes/a/config', '/api/classes/b/config', '/api/classes/c/library/d'];
    const page = '/classes/a/settings?tab=units';

    /** Three edits kept by an expired session, then a fresh sign-in on the same tab. */
    async function keptEdits() {
      const server = fakeServer();
      const store = memoryStore();
      const visits: string[] = [];
      const deps = {
        fetch: server.fetchFn,
        store,
        here: () => page,
        go: (p: string) => visits.push(p),
      };
      const before = createSessionClient(deps);
      await before.load();
      server.state.signedIn = null;
      for (const [i, url] of URLS.entries()) {
        await expect(before.send('PUT', url, { edit: i })).rejects.toBeInstanceOf(SignedOut);
      }
      server.state.signedIn = TERRY;
      server.state.attempts.length = 0;
      visits.length = 0;
      const client = createSessionClient(deps);
      await client.load();
      return { ...server, store, visits, client };
    }
    const keptUrls = (store: KeyValue) => readPending(store).map((w) => [w.url, w.body]);

    it('on a 401 for the first write: keeps all three and returns to the page', async () => {
      const { state, store, visits, client } = await keptEdits();
      state.outcome.set(URLS[0]!, 401);
      await expect(client.replayPendingWrites()).rejects.toBeInstanceOf(SignedOut);
      expect(keptUrls(store)).toEqual(URLS.map((u, i) => [u, { edit: i }]));
      expect(visits).toEqual([signInPath(page)]);
    });

    it('on a 401 midway: keeps the failed write and the untried one, not the saved one', async () => {
      const { state, store, visits, client } = await keptEdits();
      state.outcome.set(URLS[1]!, 401);
      await expect(client.replayPendingWrites()).rejects.toBeInstanceOf(SignedOut);
      expect(state.attempts).toEqual([URLS[0], URLS[1]]);
      expect(keptUrls(store)).toEqual([
        [URLS[1], { edit: 1 }],
        [URLS[2], { edit: 2 }],
      ]);
      expect(visits).toEqual([signInPath(page)]);
    });

    it('on a server error: keeps that write, saves the others, and reports it', async () => {
      const { state, store, client } = await keptEdits();
      state.outcome.set(URLS[1]!, 500);
      expect(await client.replayPendingWrites()).toEqual({ saved: 2, pending: 1 });
      expect(keptUrls(store)).toEqual([[URLS[1], { edit: 1 }]]);
    });

    it('on a dropped connection: keeps the write and everything after it', async () => {
      const { state, store, client } = await keptEdits();
      state.outcome.set(URLS[0]!, 'network');
      expect(await client.replayPendingWrites()).toEqual({ saved: 0, pending: 3 });
      expect(keptUrls(store)).toEqual(URLS.map((u, i) => [u, { edit: i }]));
    });

    it('then recovers every edit when a retry succeeds', async () => {
      const { state, store, client } = await keptEdits();
      state.outcome.set(URLS[0]!, 500);
      state.outcome.set(URLS[2]!, 'network');
      expect(await client.replayPendingWrites()).toEqual({ saved: 1, pending: 2 });
      state.outcome.clear();
      expect(await client.replayPendingWrites()).toEqual({ saved: 2, pending: 0 });
      expect(readPending(store)).toEqual([]);
      expect(
        state.writes
          .map((w) => [w.url, w.body, w.csrf])
          .sort(([a], [b]) => String(a).localeCompare(String(b))),
      ).toEqual(URLS.map((u, i) => [u, { edit: i }, `csrf-${TERRY}`]));
    });

    it("still drops another user's kept edits without sending them", async () => {
      const { state, store, client } = await keptEdits();
      store.setItem(
        'ideamap.pendingWrites',
        JSON.stringify([
          ...readPending(store),
          { userId: TESS, method: 'PUT', url: '/api/x', body: 1 },
        ]),
      );
      state.outcome.set(URLS[0]!, 500);
      expect(await client.replayPendingWrites()).toEqual({ saved: 2, pending: 1 });
      expect(state.attempts).not.toContain('/api/x');
      expect(readPending(store).map((w) => w.userId)).toEqual([TERRY]);
    });
  });

  describe('keeps edits made while a replay waits on the server (F5-E1)', () => {
    const A = '/api/classes/a/config';
    const B = '/api/classes/b/config';

    /** A server whose write responses wait until the test releases them. */
    function heldServer() {
      const sent: { url: string; body: unknown }[] = [];
      const held: ((status: number) => void)[] = [];
      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/me') return new Response(JSON.stringify(me(TERRY)), { status: 200 });
        sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        const status = await new Promise<number>((resolve) => held.push(resolve));
        return new Response('{}', { status });
      }) as typeof fetch;
      /** Let the oldest waiting request answer with `status`, then let the replay go on. */
      const release = async (status = 200) => {
        for (let i = 0; i < 20 && held.length === 0; i++) await Promise.resolve();
        held.shift()!(status);
        for (let i = 0; i < 20; i++) await Promise.resolve();
      };
      return { sent, fetchFn, release, waiting: () => held.length };
    }

    async function signedIn(server: ReturnType<typeof heldServer>, store: KeyValue) {
      const client = createSessionClient({
        fetch: server.fetchFn,
        store,
        here: () => '/',
        go: () => {},
      });
      await client.load();
      return client;
    }

    it('sends and keeps a write to another URL queued mid-replay', async () => {
      const server = heldServer();
      const store = memoryStore();
      stashWrite(store, { userId: TERRY, method: 'PUT', url: A, body: { edit: 70 } });
      const client = await signedIn(server, store);
      const replay = client.replayPendingWrites();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      stashWrite(store, { userId: TERRY, method: 'PUT', url: B, body: { edit: 75 } });
      await server.release(200); // A accepted
      expect(readPending(store).map((w) => [w.url, w.body])).toEqual([[B, { edit: 75 }]]);
      await server.release(200); // B, sent by the same replay
      expect(await replay).toEqual({ saved: 2, pending: 0 });
      expect(server.sent).toEqual([
        { url: A, body: { edit: 70 } },
        { url: B, body: { edit: 75 } },
      ]);
      expect(readPending(store)).toEqual([]);
    });

    it('keeps and sends a newer autosave of the same form, not the acknowledged one', async () => {
      const server = heldServer();
      const store = memoryStore();
      stashWrite(store, { userId: TERRY, method: 'PUT', url: A, body: { edit: 70 } });
      const client = await signedIn(server, store);
      const replay = client.replayPendingWrites();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      stashWrite(store, { userId: TERRY, method: 'PUT', url: A, body: { edit: 75 } });
      await server.release(200); // the older A accepted
      expect(readPending(store).map((w) => w.body)).toEqual([{ edit: 75 }]);
      await server.release(200); // the newer A
      expect(await replay).toEqual({ saved: 2, pending: 0 });
      expect(server.sent.map((w) => w.body)).toEqual([{ edit: 70 }, { edit: 75 }]);
      expect(readPending(store)).toEqual([]);
    });

    it('keeps a newer autosave for a later retry when the replay then fails', async () => {
      const server = heldServer();
      const store = memoryStore();
      stashWrite(store, { userId: TERRY, method: 'PUT', url: A, body: { edit: 70 } });
      const client = await signedIn(server, store);
      const replay = client.replayPendingWrites();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      stashWrite(store, { userId: TERRY, method: 'PUT', url: A, body: { edit: 75 } });
      await server.release(200);
      await server.release(500); // the newer A fails this time
      expect(await replay).toEqual({ saved: 1, pending: 1 });
      expect(readPending(store).map((w) => w.body)).toEqual([{ edit: 75 }]);
      const retry = client.replayPendingWrites();
      await server.release(200);
      expect(await retry).toEqual({ saved: 1, pending: 0 });
      expect(server.sent.map((w) => w.body)).toEqual([{ edit: 70 }, { edit: 75 }, { edit: 75 }]);
      expect(readPending(store)).toEqual([]);
    });

    it('runs overlapping replays once, with no duplicate saves', async () => {
      const server = heldServer();
      const store = memoryStore();
      stashWrite(store, { userId: TERRY, method: 'PUT', url: A, body: { edit: 70 } });
      const client = await signedIn(server, store);
      const first = client.replayPendingWrites();
      const second = client.replayPendingWrites();
      expect(second).toBe(first);
      await server.release(200);
      expect(await first).toEqual({ saved: 1, pending: 0 });
      expect(server.sent).toHaveLength(1);
      expect(server.waiting()).toBe(0);
      expect(readPending(store)).toEqual([]);
    });
  });
});
