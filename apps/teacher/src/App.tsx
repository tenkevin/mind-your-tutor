import type { MeResponse, ProvidersResponse } from '@ideamap/contracts';
import { useEffect, useMemo, useState } from 'react';
import {
  createSessionClient,
  loadProviders,
  SignedOut,
  signInPath,
  type SessionClient,
} from './auth/session';
import { SignIn } from './auth/SignIn';

type View =
  | { kind: 'loading' }
  | { kind: 'sign-in'; providers: ProvidersResponse['providers'] | null }
  /** `pending`: edits kept from an expired session that still need saving (F5-U3). */
  | { kind: 'signed-in'; me: MeResponse; pending: number };

function browserClient(): SessionClient {
  return createSessionClient({
    fetch: (...args) => fetch(...args),
    store: window.sessionStorage,
    here: () => `${location.pathname}${location.search}${location.hash}`,
    go: (path) => location.assign(path),
  });
}

/** The signed-in shell. Teacher Settings (T1) mounts here. */
export function Shell({
  me,
  pending = 0,
  retrying = false,
  onRetry,
  onSignOut,
}: {
  me: MeResponse;
  pending?: number;
  retrying?: boolean;
  onRetry?: () => void;
  onSignOut: () => void;
}) {
  return (
    <>
      <nav className="nav">
        <span className="nav-brand">Idea Map · Teacher</span>
        <span>
          {me.user.name} · {me.org.name}
        </span>
        <button type="button" className="btn btn-ghost" onClick={onSignOut}>
          Sign out
        </button>
      </nav>
      <main style={{ padding: 'var(--space-6)' }}>
        {pending > 0 && (
          <p role="alert" className="card">
            {pending === 1
              ? "1 change from before you signed in hasn't been saved yet."
              : `${pending} changes from before you signed in haven't been saved yet.`}{' '}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRetry}
              disabled={retrying}
            >
              {retrying ? 'Saving…' : 'Try again'}
            </button>
          </p>
        )}
        <h1>Idea Map · Teacher</h1>
      </main>
    </>
  );
}

export function App({ initial = { kind: 'loading' } }: { initial?: View }) {
  const client = useMemo(() => (typeof window === 'undefined' ? null : browserClient()), []);
  // The sign-in page renders at once; its buttons fill in when the providers load.
  const [view, setView] = useState<View>(() =>
    typeof location !== 'undefined' && location.pathname === '/sign-in'
      ? { kind: 'sign-in', providers: null }
      : initial,
  );

  useEffect(() => {
    if (!client) return;
    const path = location.pathname;
    if (path === '/sign-in') {
      loadProviders(fetch)
        .then((providers) => setView({ kind: 'sign-in', providers }))
        .catch(() => setView({ kind: 'sign-in', providers: [] }));
      return;
    }
    client
      .load()
      .then(async (me) => {
        if (!me) {
          location.assign(signInPath(`${path}${location.search}${location.hash}`));
          return;
        }
        // Edits refused when the session ran out are sent now (F5-U3). Any the server
        // doesn't accept stay kept, and the shell offers to try again.
        const { pending } = await client.replayPendingWrites();
        setView({ kind: 'signed-in', me, pending });
      })
      .catch((error: unknown) => {
        // SignedOut is already on its way to the sign-in page, edits kept.
        if (!(error instanceof SignedOut)) setView({ kind: 'sign-in', providers: [] });
      });
  }, [client]);

  const [retrying, setRetrying] = useState(false);
  const retry = () => {
    if (!client || view.kind !== 'signed-in' || retrying) return;
    const me = view.me;
    setRetrying(true);
    client
      .replayPendingWrites()
      .then(({ pending }) => setView({ kind: 'signed-in', me, pending }))
      .catch(() => {})
      .finally(() => setRetrying(false));
  };

  if (view.kind === 'loading') return <h1>Idea Map · Teacher</h1>;
  if (view.kind === 'sign-in') {
    const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
    return (
      <SignIn
        app="the teacher console"
        providers={view.providers}
        error={query.get('error')}
        returnTo={query.get('returnTo') ?? '/'}
      />
    );
  }
  return (
    <Shell
      me={view.me}
      pending={view.pending}
      retrying={retrying}
      onRetry={retry}
      onSignOut={() => void client?.signOut()}
    />
  );
}
