import { CSRF_HEADER, type MeResponse } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { createSessionClient, readPending, SignedOut, signInPath, type KeyValue } from './session';

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

function fakeServer() {
  const state = {
    signedIn: TERRY as string | null,
    writes: [] as { url: string; body: unknown; csrf: string }[],
  };
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/me') {
      return state.signedIn
        ? new Response(JSON.stringify(me(state.signedIn)), { status: 200 })
        : new Response('{}', { status: 401 });
    }
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
    expect(await again.replayPendingWrites()).toBe(1);
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
    expect(await other.replayPendingWrites()).toBe(0);
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
});
