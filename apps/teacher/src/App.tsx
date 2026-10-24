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
import { CourseDetails } from './course/CourseDetails';
import { createCourseForm, type CourseForm, type FormState } from './course/form';
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

/** A GET from the API; signed out, it goes to sign in and back here. */
async function get(url: string): Promise<unknown> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) {
    location.assign(signInPath(here()));
    throw new SignedOut();
  }
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<unknown>;
}

/** The class the header shows: `?class=<id>` if it's one of theirs, else their first. */
async function loadHeader(wanted: string | null): Promise<HeaderState> {
  const { classes } = ClassesResponseSchema.parse(await get('/api/classes'));
  const klass = classes.find((c) => c.id === wanted) ?? classes[0];
  if (!klass) return 'none';
  return ClassHeaderResponseSchema.parse(
    await get(`/api/classes/${encodeURIComponent(klass.id)}/header`),
  );
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
const noForm = { subscribe: () => () => {}, getState: (): FormState | null => null };

/** The header as Course details last saved it: subject and topic are effective values. */
function withCourse(header: HeaderState, course: FormState | null): HeaderState {
  if (typeof header !== 'object' || !course?.details) return header;
  const value = (field: 'subject' | 'topic') =>
    course.details!.fields.find((f) => f.field === field)?.value ?? null;
  return { ...header, subject: value('subject'), topic: value('topic') };
}

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
  /** Counts replays that saved something, so the sections read the saved values again. */
  const [replayed, setReplayed] = useState(0);
  const classId = typeof header === 'object' ? header.classId : null;
  const course = useMemo<CourseForm | null>(
    () => (client && classId ? createCourseForm({ classId, client, get }) : null),
    [client, classId],
  );
  const courseState = useSyncExternalStore(
    course?.subscribe ?? noForm.subscribe,
    course?.getState ?? noForm.getState,
    noForm.getState,
  );
  useEffect(() => {
    if (course && replayed > 0) void course.load();
  }, [course, replayed]);

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
        // Edits refused when the session ran out are sent now (F5-U3). The shell shows
        // at once, reading Saving… while they go (T3-U4); any the server doesn't
        // accept stay kept, and the shell offers to try again.
        setView({ kind: 'signed-in', me, pending: 0 });
        const { pending, saved } = await client.replayPendingWrites();
        setView({ kind: 'signed-in', me, pending });
        if (saved > 0) setReplayed((n) => n + 1);
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
      .then((h) => live && setHeader(h))
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
      .then(({ pending, saved }) => {
        setView({ kind: 'signed-in', me, pending });
        if (saved > 0) setReplayed((n) => n + 1);
      })
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
      header={withCourse(header, courseState)}
      saveState={saveState}
      current={sectionFor(hash)?.id ?? null}
      studentUrl={STUDENT_URL}
      pending={view.pending}
      retrying={retrying}
      onRetry={retry}
      onSignOut={signOut}
      content={course ? { 'sec-course': <CourseDetails form={course} /> } : {}}
    />
  );
}
