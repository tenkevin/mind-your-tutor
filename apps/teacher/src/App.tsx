import type { MeResponse, ProvidersResponse } from '@ideamap/contracts';
import { useEffect, useMemo, useState } from 'react';
import { createSessionClient, loadProviders, signInPath, type SessionClient } from './auth/session';
import { SignIn } from './auth/SignIn';

type View =
  | { kind: 'loading' }
  | { kind: 'sign-in'; providers: ProvidersResponse['providers'] | null }
  | { kind: 'signed-in'; me: MeResponse };

function browserClient(): SessionClient {
  return createSessionClient({
    fetch: (...args) => fetch(...args),
    store: window.sessionStorage,
    here: () => `${location.pathname}${location.search}${location.hash}`,
    go: (path) => location.assign(path),
  });
}

/** The signed-in shell. Teacher Settings (T1) mounts here. */
export function Shell({ me, onSignOut }: { me: MeResponse; onSignOut: () => void }) {
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
        // Edits refused when the session ran out are sent now (F5-U3).
        await client.replayPendingWrites();
        setView({ kind: 'signed-in', me });
      })
      .catch(() => setView({ kind: 'sign-in', providers: [] }));
  }, [client]);

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
  return <Shell me={view.me} onSignOut={() => void client?.signOut()} />;
}
