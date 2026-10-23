import {
  CSRF_HEADER,
  MeResponseSchema,
  ProvidersResponseSchema,
  safeReturnTo,
  type MeResponse,
  type ProvidersResponse,
} from '@ideamap/contracts';

// The teacher app's side of sign-in (F5). The session lives in an HttpOnly cookie the
// app never sees; it only keeps the CSRF token from /api/me in memory. Nothing about
// the session goes to localStorage (F5-S2).
//
// Expired sessions (F5-U3): a write refused with 401 is kept in sessionStorage, for
// this tab and this user only, and the teacher is sent to sign in and back to the
// same page. After sign-in, `replayPendingWrites` sends it again, so autosaved
// Teacher Settings edits aren't lost.

const PENDING_KEY = 'ideamap.pendingWrites';

export interface PendingWrite {
  userId: string;
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  body: unknown;
}

/** Storage for pending writes: sessionStorage in the browser, a stub in tests. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class SignedOut extends Error {}

export function signInPath(returnTo: string): string {
  return `/sign-in?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`;
}

export function readPending(store: KeyValue): PendingWrite[] {
  try {
    const value: unknown = JSON.parse(store.getItem(PENDING_KEY) ?? '[]');
    return Array.isArray(value) ? (value as PendingWrite[]) : [];
  } catch {
    return [];
  }
}

/** Keep a refused write; a later write to the same URL replaces it (autosave). */
export function stashWrite(store: KeyValue, write: PendingWrite): void {
  const rest = readPending(store).filter(
    (w) => !(w.url === write.url && w.method === write.method),
  );
  store.setItem(PENDING_KEY, JSON.stringify([...rest, write]));
}

type Fetch = typeof fetch;

export interface SessionClient {
  me: MeResponse | null;
  load(): Promise<MeResponse | null>;
  send(method: PendingWrite['method'], url: string, body?: unknown): Promise<Response>;
  replayPendingWrites(): Promise<number>;
  signOut(): Promise<void>;
}

export function createSessionClient(deps: {
  fetch: Fetch;
  store: KeyValue;
  /** Where the browser is now (path, query and hash), to come back to after sign-in. */
  here: () => string;
  go: (path: string) => void;
}): SessionClient {
  const client: SessionClient = {
    me: null,
    async load() {
      const res = await deps.fetch('/api/me', { credentials: 'same-origin' });
      client.me = res.ok ? MeResponseSchema.parse(await res.json()) : null;
      return client.me;
    },
    async send(method, url, body) {
      const res = await deps.fetch(url, {
        method,
        credentials: 'same-origin',
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          [CSRF_HEADER]: client.me?.csrfToken ?? '',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (res.status === 401) {
        if (client.me) stashWrite(deps.store, { userId: client.me.user.id, method, url, body });
        deps.go(signInPath(deps.here()));
        throw new SignedOut();
      }
      return res;
    },
    async replayPendingWrites() {
      const me = client.me;
      if (!me) return 0;
      const pending = readPending(deps.store);
      deps.store.removeItem(PENDING_KEY);
      // Only this user's edits: someone else signing in on this tab never sends them.
      const mine = pending.filter((w) => w.userId === me.user.id);
      for (const w of mine) await client.send(w.method, w.url, w.body);
      return mine.length;
    },
    async signOut() {
      await client.send('POST', '/auth/sign-out');
      client.me = null;
      deps.store.removeItem(PENDING_KEY);
      deps.go('/sign-in');
    },
  };
  return client;
}

export async function loadProviders(fetchFn: Fetch): Promise<ProvidersResponse['providers']> {
  const res = await fetchFn('/auth/providers');
  return ProvidersResponseSchema.parse(await res.json()).providers;
}
