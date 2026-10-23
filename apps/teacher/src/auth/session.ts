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
//
// Autosave can keep new writes while a replay is waiting on the server, so every kept
// write carries a revision. An acknowledgement removes only the revision that was
// sent, from the queue as it is now: a newer autosave of the same form, or a write to
// another URL, stays kept (and is sent by the same replay). Only one replay runs at a
// time; a second call shares the first.
//
// Save state (T1): the header's "Saving…" / "Saved" reads `saveState()`. It is
// `saving` while a write or a replay is waiting on the server, `unsaved` while a kept
// write is waiting to be retried or the last write to some URL failed, and `saved`
// only once every write has been accepted. A write never reads as saved before the
// server's response says so.

const PENDING_KEY = 'ideamap.pendingWrites';

export interface PendingWrite {
  userId: string;
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  body: unknown;
  /** Identifies this exact version of the write; set when it's kept. */
  rev: string;
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

function writePending(store: KeyValue, writes: readonly PendingWrite[]): void {
  if (writes.length > 0) store.setItem(PENDING_KEY, JSON.stringify(writes));
  else store.removeItem(PENDING_KEY);
}

let revisions = 0;
function newRevision(): string {
  return `${Date.now().toString(36)}-${(++revisions).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Keep a refused write; a later write to the same URL replaces it (autosave). */
export function stashWrite(
  store: KeyValue,
  write: Omit<PendingWrite, 'rev'> & { rev?: string },
): void {
  const rest = readPending(store).filter(
    (w) => !(w.url === write.url && w.method === write.method),
  );
  writePending(store, [...rest, { ...write, rev: write.rev ?? newRevision() }]);
}

type Fetch = typeof fetch;

/** What a replay did: writes the server accepted, and writes still kept to retry. */
export interface ReplayResult {
  saved: number;
  pending: number;
}

export type SaveState = 'saving' | 'saved' | 'unsaved';

export interface SessionClient {
  me: MeResponse | null;
  load(): Promise<MeResponse | null>;
  send(method: PendingWrite['method'], url: string, body?: unknown): Promise<Response>;
  /**
   * Resend kept writes. Throws SignedOut (after keeping them) if the session ends again.
   * Overlapping calls share one replay.
   */
  replayPendingWrites(): Promise<ReplayResult>;
  /** Whether this user's writes have all reached the server (T1). */
  saveState(): SaveState;
  /** Call `listener` whenever `saveState()` may have changed; returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
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

  let replaying: Promise<ReplayResult> | null = null;
  let inFlight = 0;
  /** `method url` of writes whose latest attempt failed and wasn't kept to retry. */
  const failed = new Set<string>();
  const listeners = new Set<() => void>();
  let state: SaveState = 'saved';
  const changed = () => {
    const me = client.me;
    const kept = me ? readPending(deps.store).some((w) => w.userId === me.user.id) : false;
    const next: SaveState =
      inFlight > 0 || replaying ? 'saving' : kept || failed.size > 0 ? 'unsaved' : 'saved';
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const replay = async (): Promise<ReplayResult> => {
    const me = client.me;
    if (!me) return { saved: 0, pending: readPending(deps.store).length };
    const mine = (w: PendingWrite) => w.userId === me.user.id;
    // Only this user's edits: someone else signing in on this tab never sends them.
    // Writes kept before revisions existed get one now, so they can be acknowledged.
    writePending(
      deps.store,
      readPending(deps.store)
        .filter(mine)
        .map((w) => (w.rev ? w : { ...w, rev: newRevision() })),
    );
    const tried = new Set<string>();
    let saved = 0;
    for (;;) {
      // Read the queue afresh each time: autosave may have changed it meanwhile.
      const next = readPending(deps.store).find((w) => mine(w) && !tried.has(w.rev));
      if (!next) break;
      tried.add(next.rev);
      // A replayed write supersedes an earlier failure of the same write.
      failed.delete(`${next.method} ${next.url}`);
      let res: Response;
      try {
        res = await request(next.method, next.url, next.body);
      } catch {
        // Offline or the connection dropped: keep this write and the rest.
        break;
      }
      // Signed out again: everything not yet saved stays kept for the next sign-in.
      if (res.status === 401) throw toSignIn();
      if (!res.ok) continue; // kept, to retry; later writes are independent
      // Remove exactly the version the server accepted, from the queue as it is now.
      writePending(
        deps.store,
        readPending(deps.store).filter((w) => w.rev !== next.rev),
      );
      saved++;
      changed();
    }
    return { saved, pending: readPending(deps.store).filter(mine).length };
  };

  const client: SessionClient = {
    me: null,
    async load() {
      const res = await deps.fetch('/api/me', { credentials: 'same-origin' });
      client.me = res.ok ? MeResponseSchema.parse(await res.json()) : null;
      changed();
      return client.me;
    },
    async send(method, url, body) {
      const key = `${method} ${url}`;
      inFlight++;
      changed();
      try {
        let res: Response;
        try {
          res = await request(method, url, body);
        } catch (error) {
          failed.add(key);
          throw error;
        }
        if (res.status === 401) {
          if (client.me) stashWrite(deps.store, { userId: client.me.user.id, method, url, body });
          throw toSignIn();
        }
        if (res.ok) failed.delete(key);
        else failed.add(key);
        return res;
      } finally {
        inFlight--;
        changed();
      }
    },
    replayPendingWrites() {
      if (!replaying) {
        replaying = replay().finally(() => {
          replaying = null;
          changed();
        });
        changed();
      }
      return replaying;
    },
    saveState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signOut() {
      // Signing out isn't a save, so it isn't tracked, and it is never kept to replay: a
      // 401 means the session has already ended, which is what was asked for.
      await request('POST', '/auth/sign-out', undefined);
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
