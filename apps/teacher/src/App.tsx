import {
  ClassesResponseSchema,
  ClassHeaderResponseSchema,
  type MeResponse,
  type ProvidersResponse,
} from '@ideamap/contracts';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  createSessionClient,
  loadProviders,
  SignedOut,
  signInPath,
  type SaveState,
  type SessionClient,
} from './auth/session';
import { SignIn } from './auth/SignIn';
import { CurriculumData } from './curriculum/CurriculumData';
import { DraftsToApprove } from './drafts/DraftsToApprove';
import { NotForStudents, Shell, type HeaderState } from './shell/Shell';
import { sectionFor } from './shell/sections';

export { NotForStudents, Shell } from './shell/Shell';

type View =
  | { kind: 'loading' }
  | { kind: 'sign-in'; providers: ProvidersResponse['providers'] | null }
  /** `pending`: edits kept from an expired session that still need saving (F5-U3). */
  | { kind: 'signed-in'; me: MeResponse; pending: number }
  /** A student signed in to the teacher app: refused, with no teacher data (T1-S2). */
  | { kind: 'not-staff'; me: MeResponse };

/** Where "Preview as student" goes: the student app. Set VITE_STUDENT_APP_URL to deploy. */
const STUDENT_URL: string =
  (import.meta.env.VITE_STUDENT_APP_URL as string | undefined) || 'http://localhost:5174/';

function browserClient(): SessionClient {
  return createSessionClient({
    fetch: (...args) => fetch(...args),
    store: window.sessionStorage,
    here: () => `${location.pathname}${location.search}${location.hash}`,
    go: (path) => location.assign(path),
  });
}

const here = () => `${location.pathname}${location.search}${location.hash}`;

/** The class the console shows: `?class=<id>` if it's one of theirs, else their first. */
interface Chosen {
  header: HeaderState;
  /** The class's curriculum, for the Curriculum data section; null with no class. */
  curriculumId: string | null;
}

async function loadHeader(wanted: string | null): Promise<Chosen> {
  const get = async (url: string) => {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (res.status === 401) {
      location.assign(signInPath(here()));
      throw new SignedOut();
    }
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res.json() as Promise<unknown>;
  };
  const { classes } = ClassesResponseSchema.parse(await get('/api/classes'));
  const klass = classes.find((c) => c.id === wanted) ?? classes[0];
  if (!klass) return { header: 'none', curriculumId: null };
  const header = ClassHeaderResponseSchema.parse(
    await get(`/api/classes/${encodeURIComponent(klass.id)}/header`),
  );
  return { header, curriculumId: klass.curriculumId };
}

function useHash(): string {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('hashchange', onChange);
      return () => window.removeEventListener('hashchange', onChange);
    },
    () => location.hash,
    () => '',
  );
}

const noClient = {
  subscribe: () => () => {},
  saveState: (): SaveState => 'saved',
};

export function App({ initial = { kind: 'loading' } }: { initial?: View }) {
  const client = useMemo(() => (typeof window === 'undefined' ? null : browserClient()), []);
  // The sign-in page renders at once; its buttons fill in when the providers load.
  const [view, setView] = useState<View>(() =>
    typeof location !== 'undefined' && location.pathname === '/sign-in'
      ? { kind: 'sign-in', providers: null }
      : initial,
  );
  const saves = client ?? noClient;
  const saveState = useSyncExternalStore(saves.subscribe, saves.saveState, noClient.saveState);
  const hash = useHash();
  const [header, setHeader] = useState<HeaderState>('loading');
  const [curriculumId, setCurriculumId] = useState<string | null>(null);

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
        if (me.user.role === 'student') {
          setView({ kind: 'not-staff', me });
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

  const signedIn = view.kind === 'signed-in';
  useEffect(() => {
    if (!signedIn) return;
    // The sections render only now, so a fragment in the URL (say, back from sign-in)
    // had nothing to scroll to on load.
    const section = sectionFor(location.hash);
    if (section) document.getElementById(section.id)?.scrollIntoView();
    let live = true;
    loadHeader(new URLSearchParams(location.search).get('class'))
      .then((chosen) => {
        if (!live) return;
        setHeader(chosen.header);
        setCurriculumId(chosen.curriculumId);
      })
      .catch((error: unknown) => {
        if (live && !(error instanceof SignedOut)) setHeader('none');
      });
    return () => {
      live = false;
    };
  }, [signedIn]);

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
  const signOut = () => void client?.signOut();

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
  if (view.kind === 'not-staff') {
    return <NotForStudents studentUrl={STUDENT_URL} onSignOut={signOut} />;
  }
  return (
    <Shell
      me={view.me}
      header={header}
      saveState={saveState}
      current={sectionFor(hash)?.id ?? null}
      studentUrl={STUDENT_URL}
      pending={view.pending}
      retrying={retrying}
      onRetry={retry}
      onSignOut={signOut}
      content={{
        'sec-source': curriculumId ? (
          <>
            <CurriculumData
              curriculumId={curriculumId}
              csrf={view.me.csrfToken}
              onSignedOut={() => location.assign(signInPath(here()))}
            />
            <DraftsToApprove
              curriculumId={curriculumId}
              csrf={view.me.csrfToken}
              onSignedOut={() => location.assign(signInPath(here()))}
            />
          </>
        ) : null,
      }}
    />
  );
}
