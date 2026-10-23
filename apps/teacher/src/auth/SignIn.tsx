import { safeReturnTo, signInMessage, type ProvidersResponse } from '@ideamap/contracts';

// The sign-in screen (F5-U1, F5-U2): one button per enabled provider, by name, and no
// password field: sign-in is SSO only. Readable from 320 px up.

export interface SignInProps {
  app: string;
  providers: ProvidersResponse['providers'] | null;
  error: string | null;
  returnTo: string;
}

export function SignIn({ app, providers, error, returnTo }: SignInProps) {
  const message = signInMessage(error);
  const back = safeReturnTo(returnTo);
  return (
    <main
      style={{
        boxSizing: 'border-box',
        maxWidth: 420,
        margin: '0 auto',
        padding: 'var(--space-8) var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
      }}
    >
      <h1 style={{ fontSize: 32, margin: 0 }}>Idea Map</h1>
      <p style={{ margin: 0 }}>Sign in to {app} with your school account.</p>
      {message && (
        <p role="alert" className="card" style={{ margin: 0 }}>
          {message}
        </p>
      )}
      {providers === null ? (
        <p className="text-muted" style={{ margin: 0 }}>
          Loading…
        </p>
      ) : providers.length === 0 ? (
        <p style={{ margin: 0 }}>Sign-in isn't set up yet. Ask your school's admin.</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {providers.map((p) => (
            <li key={p.id}>
              <a
                className="btn btn-primary btn-block"
                href={`/auth/${encodeURIComponent(p.id)}/start?returnTo=${encodeURIComponent(back)}`}
              >
                Sign in with {p.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
