import { DRAFT_MAX, type DraftItem, type DraftList } from '@ideamap/contracts';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Fetch } from '../curriculum/store';
import { Icon } from '../shell/icons';
import { createDraftsStore, type DraftsState, type DraftsStore } from './store';

// Teacher Settings → Drafts to approve (A6; ARCHITECTURE.md D9, D12, §11). Where the
// sheet leaves an explanation, objective or question empty, Ms. Ivy or Atlas drafts
// one. Nothing here reaches students until a teacher approves it: each draft shows its
// row's context beside the text, which can be edited in place, and has one button each
// to approve (with any edit) and to reject. Text from the AI or the sheet is rendered
// as text, never markup.

const TABS = ['Ideas', 'Units', 'Assessment'] as const;
const WHAT = {
  Ideas: 'Idea explanations',
  Units: 'Unit objectives',
  Assessment: 'Assessment questions',
} as const;

function Draft({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: DraftItem;
  busy: boolean;
  onApprove: (text: string | undefined) => void;
  onReject: () => void;
}) {
  const [text, setText] = useState(item.draft);
  const id = `draft-${item.id}`;
  const edited = text.trim() !== item.draft;
  const tooLong = text.length > DRAFT_MAX[item.kind];
  return (
    <li className="drafts-item">
      <div className="drafts-context">
        <p className="cdata-strong">{item.context.title}</p>
        <dl>
          {item.context.detail.map((d) => (
            <div key={d.label}>
              <dt>{d.label}</dt>
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="drafts-text">
        <label htmlFor={id}>
          Draft{' '}
          <span className="cdata-muted">(AI-written; students don’t see it until you approve)</span>
        </label>
        <textarea
          id={id}
          value={text}
          rows={Math.min(8, Math.max(3, Math.ceil(text.length / 70)))}
          onChange={(e) => setText(e.target.value)}
        />
        {tooLong && (
          <p className="cdata-muted" role="alert">
            Too long: at most {DRAFT_MAX[item.kind].toLocaleString('en')} characters.
          </p>
        )}
        <div className="drafts-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || tooLong || !text.trim()}
            onClick={() => onApprove(edited ? text.trim() : undefined)}
          >
            {edited ? 'Save edit and approve' : 'Approve'}
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onReject}>
            Reject
          </button>
        </div>
      </div>
    </li>
  );
}

export interface DraftsViewProps {
  state: DraftsState;
  onApprove: (id: string, text: string | undefined) => void;
  onReject: (id: string) => void;
  onRedraft: (id: string) => void;
}

export function DraftsView({ state, onApprove, onReject, onRedraft }: DraftsViewProps) {
  const list: DraftList | null = state.list;
  const items = list?.items ?? [];
  const pending = items.filter((i) => i.status === 'pending');
  const approved = items.filter((i) => i.status === 'approved');
  const rejected = items.filter((i) => i.status === 'rejected');
  return (
    <div className="cdata drafts">
      <h3 className="cdata-eyebrow">Drafts to approve</h3>
      <p className="visually-hidden" role="status" aria-live="polite">
        {state.announcement}
      </p>
      {state.problem && (
        <p className="cdata-problem" role="alert">
          <Icon name="warning" />
          <span>{state.problem}</span>
        </p>
      )}
      {state.loading && !list && <p className="cdata-muted">Loading drafts…</p>}
      {list && pending.length === 0 && (
        <p className="cdata-muted">
          {list.waiting > 0
            ? `${list.waiting} ${list.waiting === 1 ? 'draft is' : 'drafts are'} being written. They appear here when ready.`
            : 'Nothing is waiting for your approval.'}
        </p>
      )}
      {list && pending.length > 0 && list.waiting > 0 && (
        <p className="cdata-muted">{list.waiting} more are still being written.</p>
      )}
      {TABS.map((tab) => {
        const group = pending.filter((i) => i.tab === tab);
        if (group.length === 0) return null;
        return (
          <section key={tab} aria-label={WHAT[tab]}>
            <h4 className="drafts-tab">
              {WHAT[tab]}{' '}
              <span className="cdata-muted">
                · {tab} tab · {group.length} to review
              </span>
            </h4>
            <ul className="drafts-list">
              {group.map((item) => (
                <Draft
                  key={item.id}
                  item={item}
                  busy={state.busy.has(item.id)}
                  onApprove={(text) => onApprove(item.id, text)}
                  onReject={() => onReject(item.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {approved.length > 0 && (
        <details className="cdata-more">
          <summary>{approved.length} approved</summary>
          <ul className="drafts-list">
            {approved.map((item) => (
              <li key={item.id} className="drafts-item">
                <div className="drafts-context">
                  <p className="cdata-strong">{item.context.title}</p>
                </div>
                <div className="drafts-text">
                  <p>{item.approved}</p>
                  <div className="drafts-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={state.busy.has(item.id)}
                      onClick={() => onReject(item.id)}
                    >
                      Withdraw approval
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {rejected.length > 0 && (
        <details className="cdata-more">
          <summary>{rejected.length} rejected</summary>
          <ul className="drafts-list">
            {rejected.map((item) => (
              <li key={item.id} className="drafts-item">
                <div className="drafts-context">
                  <p className="cdata-strong">{item.context.title}</p>
                </div>
                <div className="drafts-text">
                  <div className="drafts-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={state.busy.has(item.id)}
                      onClick={() => onRedraft(item.id)}
                    >
                      Draft again
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export interface DraftsToApproveProps {
  curriculumId: string;
  csrf: string;
  onSignedOut: () => void;
  fetch?: Fetch;
}

const LOADING: DraftsState = {
  list: null,
  loading: true,
  busy: new Set(),
  problem: null,
  announcement: '',
};
const NO_STORE = { subscribe: () => () => {}, getState: () => LOADING };

/** The queue for one curriculum, loaded from the API. */
export function DraftsToApprove({
  curriculumId,
  csrf,
  onSignedOut,
  fetch: fetchFn,
}: DraftsToApproveProps) {
  const csrfRef = useRef(csrf);
  const signedOut = useRef(onSignedOut);
  useEffect(() => {
    csrfRef.current = csrf;
    signedOut.current = onSignedOut;
  });
  const [store, setStore] = useState<DraftsStore | null>(null);
  useEffect(() => {
    const created = createDraftsStore({
      fetch: fetchFn ?? ((input, init) => fetch(input, init)),
      curriculumId,
      csrf: () => csrfRef.current,
      onSignedOut: () => signedOut.current(),
    });
    setStore(created);
    void created.load();
  }, [curriculumId, fetchFn]);
  const live = store ?? NO_STORE;
  const state = useSyncExternalStore(live.subscribe, live.getState, live.getState);
  return (
    <DraftsView
      state={state}
      onApprove={(id, text) => void store?.approve(id, text)}
      onReject={(id) => void store?.reject(id)}
      onRedraft={(id) => void store?.redraft(id)}
    />
  );
}
