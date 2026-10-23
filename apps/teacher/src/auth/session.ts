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
// Teacher Settings edits aren't lost. A kept write leaves storage only once the
// server has accepted it: a 401, a server error or a dropped connection keeps it (and
// every write not yet tried) for the next attempt.

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

/** What a replay did: writes the server accepted, and writes still kept to retry. */
export interface ReplayResult {
  saved: number;
  pending: number;
}

export interface SessionClient {
  me: MeResponse | null;
  load(): Promise<MeResponse | null>;
  send(method: PendingWrite['method'], url: string, body?: unknown): Promise<Response>;
  /** Resend kept writes. Throws SignedOut (after keeping them) if the session ends again. */
  replayPendingWrites(): Promise<ReplayResult>;
  signOut(): Promise<void>;
}

export function createSessionClient(deps: {
  fetch: Fetch;
  store: KeyValue;
  /** Where the browser is now (path, query and hash), to come back to after sign-in. */
  here: () => string;
  go: (path: string) => void;
}): SessionClient {
  const request = (method: PendingWrite['method'], url: string, body: unknown) =>
    deps.fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        [CSRF_HEADER]: client.me?.csrfToken ?? '',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const toSignIn = () => {
    deps.go(signInPath(deps.here()));
    return new SignedOut();
  };

  const client: SessionClient = {
    me: null,
    async load() {
      const res = await deps.fetch('/api/me', { credentials: 'same-origin' });
      client.me = res.ok ? MeResponseSchema.parse(await res.json()) : null;
      return client.me;
    },
    async send(method, url, body) {
      const res = await request(method, url, body);
      if (res.status === 401) {
        if (client.me) stashWrite(deps.store, { userId: client.me.user.id, method, url, body });
        throw toSignIn();
      }
      return res;
    },
    async replayPendingWrites() {
      const me = client.me;
      if (!me) return { saved: 0, pending: readPending(deps.store).length };
      // Only this user's edits: someone else signing in on this tab never sends them.
      let kept = readPending(deps.store).filter((w) => w.userId === me.user.id);
      const save = () =>
        kept.length > 0
          ? deps.store.setItem(PENDING_KEY, JSON.stringify(kept))
          : deps.store.removeItem(PENDING_KEY);
      save();
      let saved = 0;
      for (const w of [...kept]) {
        let res: Response;
        try {
          res = await request(w.method, w.url, w.body);
        } catch {
          // Offline or the connection dropped: keep this write and the rest.
          break;
        }
        // Signed out again: everything not yet saved stays kept for the next sign-in.
        if (res.status === 401) throw toSignIn();
        if (!res.ok) continue; // kept, to retry; later writes are independent
        kept = kept.filter((k) => k !== w);
        save();
        saved++;
      }
      return { saved, pending: kept.length };
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
