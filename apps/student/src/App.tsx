import {
  MeResponseSchema,
  ProvidersResponseSchema,
  safeReturnTo,
  type MeResponse,
  type ProvidersResponse,
} from '@ideamap/contracts';
import { useEffect, useState } from 'react';
import { SignIn } from './auth/SignIn';
import { MapScreen } from './map/MapScreen';

// The session lives in an HttpOnly cookie; the app only asks /api/me who is signed in.

type View =
  | { kind: 'loading' }
  | { kind: 'sign-in'; providers: ProvidersResponse['providers'] | null }
  | { kind: 'signed-in'; me: MeResponse };

export function App({ initial = { kind: 'loading' } }: { initial?: View }) {
  // The sign-in page renders at once; its buttons fill in when the providers load.
  const [view, setView] = useState<View>(() =>
    typeof location !== 'undefined' && location.pathname === '/sign-in'
      ? { kind: 'sign-in', providers: null }
      : initial,
  );

  useEffect(() => {
    if (location.pathname === '/sign-in') {
      fetch('/auth/providers')
        .then(async (res) => ProvidersResponseSchema.parse(await res.json()).providers)
        .then((providers) => setView({ kind: 'sign-in', providers }))
        .catch(() => setView({ kind: 'sign-in', providers: [] }));
      return;
    }
    fetch('/api/me', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) {
          const here = safeReturnTo(`${location.pathname}${location.search}${location.hash}`);
          location.assign(`/sign-in?returnTo=${encodeURIComponent(here)}`);
          return;
        }
        setView({ kind: 'signed-in', me: MeResponseSchema.parse(await res.json()) });
      })
      .catch(() => setView({ kind: 'sign-in', providers: [] }));
  }, []);

  if (view.kind === 'loading') return <h1>Idea Map · Student</h1>;
  if (view.kind === 'sign-in') {
    const query = new URLSearchParams(location.search);
    return (
      <SignIn
        providers={view.providers}
        error={query.get('error')}
        returnTo={query.get('returnTo') ?? '/'}
      />
    );
  }
  return (
    <main className="student-main">
      <header className="student-bar">
        <span className="student-brand">Idea Map</span>
        <span className="student-who">{view.me.user.name}</span>
      </header>
      <MapScreen
        onSignedOut={() =>
          location.assign(
            `/sign-in?returnTo=${encodeURIComponent(safeReturnTo(`${location.pathname}${location.search}${location.hash}`))}`,
          )
        }
      />
    </main>
  );
}
