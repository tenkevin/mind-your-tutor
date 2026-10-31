import type { ClassHeaderResponse, MeResponse } from '@ideamap/contracts';
import type { ReactNode } from 'react';
import type { SaveState } from '../auth/session';
import { Icon } from './icons';
import { SECTIONS } from './sections';

// The signed-in teacher console (T1): the header from the Teacher Settings design
// (Idea Map, Teacher, subject · topic, save state, Preview as student), the section
// nav, and one anchored section per nav item. Later tasks fill in the sections.

/** What the header knows about the class: still loading, none, or the class. */
export type HeaderState = 'loading' | 'none' | ClassHeaderResponse;

const SAVE_TEXT: Record<SaveState, string> = {
  saving: 'Saving…',
  saved: 'Saved',
  unsaved: 'Not saved',
};
const SAVE_ICON = { saving: 'spinner', saved: 'check', unsaved: 'warning' } as const;

export function headerTitle(header: HeaderState): string {
  if (header === 'loading') return '';
  if (header === 'none') return 'No class yet';
  const parts = [header.subject, header.topic].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' · ') : header.className;
}

export function SaveStatus({ state }: { state: SaveState }) {
  return (
    // A polite live region: each change (Saving…, then Saved) is read out once.
    <span className="tshell-save" role="status" aria-live="polite" data-state={state}>
      <Icon name={SAVE_ICON[state]} className={state === 'saving' ? 'tshell-spin' : undefined} />
      {SAVE_TEXT[state]}
    </span>
  );
}

export interface ShellProps {
  me: MeResponse;
  header?: HeaderState;
  saveState?: SaveState;
  /** The section the URL fragment names, marked as the current one in the nav. */
  current?: string | null;
  studentUrl?: string;
  /** Edits kept from an expired session that still need saving (F5-U3). */
  pending?: number;
  retrying?: boolean;
  onRetry?: () => void;
  onSignOut: () => void;
  /** Each section's content, by section id, below its heading and summary. */
  content?: Partial<Record<string, ReactNode>>;
}

export function Shell({
  me,
  header = 'loading',
  saveState = 'saved',
  current = null,
  studentUrl = '/',
  pending = 0,
  retrying = false,
  onRetry,
  onSignOut,
  content = {},
}: ShellProps) {
  const title = headerTitle(header);
  return (
    <div className="tshell">
      <header className="tshell-header">
        <span className="tshell-brand">Idea Map</span>
        <span className="tag tag-accent">Teacher</span>
        <span className="tshell-title" title={title || undefined}>
          {title}
        </span>
        <span className="tshell-spacer" />
        <SaveStatus state={saveState} />
        <a className="btn btn-secondary tshell-nowrap" href={studentUrl}>
          <Icon name="eye" /> Preview as student
        </a>
        <span className="tshell-account" title={`${me.user.name} · ${me.org.name}`}>
          {me.user.name}
        </span>
        <button type="button" className="btn btn-ghost tshell-nowrap" onClick={onSignOut}>
          Sign out
        </button>
      </header>
      <nav className="tshell-nav" aria-label="Sections">
        <ul>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} aria-current={current === s.id ? 'location' : undefined}>
                <Icon name={s.icon} />
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main className="tshell-main">
        <h1 className="visually-hidden">
          Teacher settings{header !== 'loading' && header !== 'none' ? `: ${header.className}` : ''}
        </h1>
        {pending > 0 && (
          <p role="alert" className="card tshell-notice">
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
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="tshell-section" aria-labelledby={`${s.id}-h`}>
            <div className="tshell-heading">
              <h2 id={`${s.id}-h`}>{s.heading}</h2>
              {s.tag && <span className="tag tag-outline">{s.tag}</span>}
            </div>
            <p className="tshell-summary">{s.summary}</p>
            {content[s.id]}
          </section>
        ))}
      </main>
    </div>
  );
}

/** Shown to a signed-in student: the teacher console isn't theirs (T1-S2). */
export function NotForStudents({
  studentUrl = '/',
  onSignOut,
}: {
  studentUrl?: string;
  onSignOut: () => void;
}) {
  return (
    <main className="tshell-refusal">
      <h1>Idea Map</h1>
      <p role="alert">The teacher console is only for teachers.</p>
      <p>
        <a className="btn btn-primary" href={studentUrl}>
          Go to your map
        </a>{' '}
        <button type="button" className="btn btn-ghost" onClick={onSignOut}>
          Sign out
        </button>
      </p>
    </main>
  );
}
