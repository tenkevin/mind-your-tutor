import {
  STUDENTS_RECEIVING_LABEL,
  type CurriculumDiff,
  type DiffUnit,
  type PublishingOptions,
} from '@ideamap/contracts';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { DataChecks, PublishState as DraftStatus } from '../curriculum/CurriculumData';
import { Icon } from '../shell/icons';
import {
  classNames,
  createPublishStore,
  type Fetch,
  type PublishState,
  type PublishStore,
} from './store';

// Teacher Settings → Publish (T8): the draft's data checks first (errors block
// publishing, ARCHITECTURE.md §7), then the diff against the published version in
// plain language, the class picker with "Students receiving this update" (D14), an
// explicit confirm step, and each class's version history for rollback. Everything
// from the sheet or the server is rendered as text, never as markup.

/** Entries of one diff section shown before the rest fold away (T8-P1). */
const SHOWN = 25;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

const unitName = (u: DiffUnit) => (u.name ? `Unit ${u.unit}: ${u.name}` : `Unit ${u.unit}`);

/** A list that shows its first entries and the rest on request. */
function Entries<T>({
  items,
  render,
  label,
}: {
  items: readonly T[];
  render: (item: T) => React.ReactNode;
  label: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <>
      <ul className="pub-list" aria-label={label}>
        {shown.map((item, i) => (
          <li key={i}>{render(item)}</li>
        ))}
      </ul>
      {!all && items.length > SHOWN && (
        <button type="button" className="btn btn-ghost pub-more" onClick={() => setAll(true)}>
          Show {(items.length - SHOWN).toLocaleString('en')} more
        </button>
      )}
    </>
  );
}

function DiffSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="pub-diff-section" aria-label={`${title}: ${count}`}>
      <h4 className="pub-diff-h">
        {title} <span className="cdata-muted">· {count.toLocaleString('en')}</span>
      </h4>
      {children}
    </section>
  );
}

const names = (ideas: readonly { title: string }[]) => ideas.map((i) => i.title).join(', ');

export function DiffView({
  diff,
  fromNumber,
  toNumber,
}: {
  diff: CurriculumDiff;
  fromNumber: number | null;
  toNumber: number;
}) {
  const headline = diff.first_publish
    ? `Version ${toNumber} would be the first published version, so every idea is new.`
    : diff.empty
      ? `Nothing changed from version ${fromNumber}.`
      : `Changes from version ${fromNumber} to version ${toNumber}`;
  return (
    <div className="pub-diff">
      <h3 className="pub-h" id="pub-diff-h">
        {headline}
      </h3>
      <DiffSection title="Ideas added" count={diff.ideas_added.length}>
        <Entries
          label="Ideas added"
          items={diff.ideas_added}
          render={(i) => (
            <>
              <span className="pub-add">Added</span> {i.title}{' '}
              <span className="cdata-muted">· {unitName(i.unit)}</span>
            </>
          )}
        />
      </DiffSection>
      <DiffSection title="Ideas removed" count={diff.ideas_removed.length}>
        <Entries
          label="Ideas removed"
          items={diff.ideas_removed}
          render={(i) => (
            <>
              <span className="pub-del">Removed</span> {i.title}{' '}
              <span className="cdata-muted">· {unitName(i.unit)}</span>
            </>
          )}
        />
      </DiffSection>
      <DiffSection title="Ideas renamed" count={diff.ideas_renamed.length}>
        <Entries
          label="Ideas renamed"
          items={diff.ideas_renamed}
          render={(i) => (
            <>
              {i.before} → <span className="cdata-strong">{i.after}</span>
            </>
          )}
        />
      </DiffSection>
      <DiffSection title="Prerequisites changed" count={diff.prerequisites_changed.length}>
        <Entries
          label="Prerequisites changed"
          items={diff.prerequisites_changed}
          render={(i) => (
            <>
              <span className="cdata-strong">{i.title}</span>
              {i.added.length > 0 && <> now needs {names(i.added)}</>}
              {i.added.length > 0 && i.removed.length > 0 && ';'}
              {i.removed.length > 0 && <> no longer needs {names(i.removed)}</>}
            </>
          )}
        />
      </DiffSection>
      <DiffSection title="Moved to another unit" count={diff.units_changed.length}>
        <Entries
          label="Moved to another unit"
          items={diff.units_changed}
          render={(i) => (
            <>
              <span className="cdata-strong">{i.title}</span>: {unitName(i.from)} → {unitName(i.to)}
            </>
          )}
        />
      </DiffSection>
      <DiffSection title="Assessment questions changed" count={diff.assessment_changed.length}>
        <Entries
          label="Assessment questions changed"
          items={diff.assessment_changed}
          render={(i) => (
            <>
              <span className="cdata-strong">{i.title}</span>{' '}
              <span className="cdata-muted">· {unitName(i.unit)}</span>
              {i.removed.length > 0 && (
                <ul className="pub-questions">
                  {i.removed.map((q, n) => (
                    <li key={`r${n}`}>
                      <span className="pub-del">Removed</span> {q}
                    </li>
                  ))}
                </ul>
              )}
              {i.added.length > 0 && (
                <ul className="pub-questions">
                  {i.added.map((q, n) => (
                    <li key={`a${n}`}>
                      <span className="pub-add">Added</span> {q}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        />
      </DiffSection>
    </div>
  );
}

function versionText(v: { number: number; published_at: string | null }, fmt: Fmt): string {
  return v.published_at
    ? `Version ${v.number} · published ${fmt(v.published_at)}`
    : `Version ${v.number}`;
}

type Fmt = (iso: string) => string;

const defaultFormat: Fmt = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

function ClassPicker({
  options,
  state,
  store,
}: {
  options: PublishingOptions;
  state: PublishState;
  store: PublishStore;
}) {
  if (options.classes.length === 0) {
    return <p className="cdata-muted">You don&apos;t teach any class on this curriculum.</p>;
  }
  return (
    <fieldset className="pub-classes">
      <legend className="cdata-eyebrow">Publish to</legend>
      {options.classes.map((c) => (
        <label key={c.id} className="pub-class">
          <input
            type="checkbox"
            checked={state.selected.includes(c.id)}
            disabled={state.publishing}
            onChange={() => store.toggleClass(c.id)}
          />
          <span className="cdata-strong">{c.name}</span>
          <span className="cdata-muted">
            {c.pinned_version
              ? `now on version ${c.pinned_version.number}`
              : 'nothing published yet'}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function History({
  options,
  state,
  store,
  fmt,
}: {
  options: PublishingOptions;
  state: PublishState;
  store: PublishStore;
  fmt: Fmt;
}) {
  const classes = options.classes.filter((c) => c.pinned_version);
  if (classes.length === 0 || options.published_versions.length < 2) return null;
  return (
    <div className="pub-history">
      <h3 className="pub-h" id="pub-history-h">
        Version history
      </h3>
      <p className="cdata-muted">
        Put a class back on a version you published before. Students see that version again.
      </p>
      <ul className="pub-history-list" aria-labelledby="pub-history-h">
        {classes.map((c) => {
          const current = c.pinned_version!;
          const earlier = options.published_versions.filter((v) => v.number < current.number);
          const ask = state.repinning?.classId === c.id ? state.repinning : null;
          const target = ask && options.published_versions.find((v) => v.id === ask.versionId);
          return (
            <li key={c.id} className="pub-history-class">
              <p>
                <span className="cdata-strong">{c.name}</span>{' '}
                <span className="cdata-muted">is on version {current.number}</span>
              </p>
              {earlier.length === 0 && (
                <p className="cdata-muted">No earlier version to roll back to.</p>
              )}
              <ul className="pub-versions" aria-label={`Earlier versions for ${c.name}`}>
                {earlier.map((v) => (
                  <li key={v.id}>
                    <span>{versionText(v, fmt)}</span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={state.repinBusy}
                      onClick={() => store.askRepin(c.id, v.id)}
                      aria-label={`Put ${c.name} on version ${v.number}`}
                    >
                      Use version {v.number}
                    </button>
                  </li>
                ))}
              </ul>
              {ask && target && (
                <div className="pub-confirm" role="group" aria-label={`Confirm ${c.name}`}>
                  <p>
                    Put <span className="cdata-strong">{c.name}</span> on version {target.number}?
                    Its students will see that version of the map.
                  </p>
                  <div className="pub-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={state.repinBusy}
                      onClick={() => void store.confirmRepin()}
                    >
                      {state.repinBusy ? 'Working…' : `Yes, use version ${target.number}`}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={state.repinBusy}
                      onClick={() => store.cancelRepin()}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface PublishViewProps {
  state: PublishState;
  store: PublishStore;
  formatTime?: Fmt;
}

export function PublishView({ state, store, formatTime = defaultFormat }: PublishViewProps) {
  const { latest, options, preview, diff } = state;
  const version = latest?.version ?? null;
  const draft = version?.status === 'draft' ? version : null;
  const importing = latest?.job?.status === 'queued' || latest?.job?.status === 'running';
  const confirmHeading = useRef<HTMLHeadingElement>(null);
  const reasonId = useId();
  useEffect(() => {
    if (state.confirming) confirmHeading.current?.focus();
  }, [state.confirming]);

  const count = state.selected.length;
  const students = count === 0 ? 0 : (preview?.students_receiving_this_update.count ?? null);
  let reason: string | null = null;
  if (!draft) reason = 'There is no draft to publish. Import a new version first.';
  else if (importing) reason = 'An import is still running. Refresh when it finishes.';
  else if (!draft.can_publish)
    reason = `Version ${draft.number} has errors that block publishing. Fix them in the sheet, then import a new version.`;
  else if (count === 0) reason = 'Pick at least one class to publish to.';
  else if (state.previewing || !preview) reason = 'Working out who receives this update…';
  else if (!preview.can_publish) reason = `Version ${draft.number} can't be published yet.`;
  const chosen = classNames(state, state.selected);
  const publishLabel = `Publish to ${plural(count, 'class', 'classes')}`;

  return (
    <div className="cdata pub">
      {/* Outcomes are read out once (T8-U2). */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {state.announcement}
      </p>
      {state.problem && (
        <p className="cdata-problem" role="alert">
          <Icon name="warning" />
          <span>{state.problem}</span>
        </p>
      )}
      <div className="pub-toolbar">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={state.loading || state.publishing}
          onClick={() => void store.load()}
        >
          Refresh
        </button>
      </div>
      {state.loading && <p className="cdata-muted">Loading the draft and your classes…</p>}

      {state.result && (
        <p className="cdata-publish pub-success" data-state="published">
          <Icon name="check" />
          <span>
            <span className="cdata-strong">
              Version {state.result.version.number} is published to{' '}
              {state.result.classes
                .map((c) => options?.classes.find((k) => k.id === c.class_id)?.name ?? 'a class')
                .join(', ')}
              .
            </span>{' '}
            {STUDENTS_RECEIVING_LABEL}: {state.result.students_receiving_this_update.count}. Your
            other classes are unchanged.
          </span>
        </p>
      )}
      {state.repinned && (
        <p className="cdata-publish pub-success" data-state="published">
          <Icon name="check" />
          <span>
            <span className="cdata-strong">
              {options?.classes.find((c) => c.id === state.repinned!.class.class_id)?.name ??
                'The class'}{' '}
              is back on version {state.repinned.version.number}.
            </span>{' '}
            Your other classes are unchanged.
          </span>
        </p>
      )}

      {!state.loading && latest && (
        <>
          {version && !importing && (
            <>
              <DraftStatus version={version} />
              {draft && <DataChecks version={draft} />}
            </>
          )}
          {importing && (
            <p className="cdata-muted">
              An import is running. The draft and its checks appear here when it finishes; use
              Refresh.
            </p>
          )}
          {!version && !importing && (
            <p className="cdata-muted">Nothing has been imported yet. Import a sheet first.</p>
          )}
          {draft && diff && !importing && (
            <DiffView
              diff={diff.diff}
              fromNumber={diff.from_version?.number ?? null}
              toNumber={diff.to_version.number}
            />
          )}
        </>
      )}

      {!state.loading && options && (
        <>
          {draft && !importing && (
            <div className="pub-picker">
              <ClassPicker options={options} state={state} store={store} />
              <p className="pub-audience" role="status" aria-live="polite">
                <span className="cdata-muted">{STUDENTS_RECEIVING_LABEL}</span>{' '}
                <span className="pub-count">{students === null ? '…' : students}</span>
              </p>
              {!state.confirming && (
                <div className="pub-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={reason !== null}
                    aria-describedby={reason ? reasonId : undefined}
                    onClick={() => store.openConfirm()}
                  >
                    {publishLabel}
                  </button>
                  {reason && (
                    <span id={reasonId} className="cdata-muted">
                      {reason}
                    </span>
                  )}
                </div>
              )}
              {state.confirming && draft && (
                <div className="pub-confirm" role="group" aria-labelledby="pub-confirm-h">
                  <h4 id="pub-confirm-h" ref={confirmHeading} tabIndex={-1}>
                    Publish version {draft.number}?
                  </h4>
                  <p>
                    {plural(chosen.length, 'class', 'classes')} will move to version {draft.number}:{' '}
                    <span className="cdata-strong">{chosen.join(', ')}</span>.{' '}
                    {plural(students ?? 0, 'student')} will see the new map. Classes you didn&apos;t
                    pick stay as they are. You can put a class back on an earlier version
                    afterwards.
                  </p>
                  <div className="pub-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={state.publishing}
                      onClick={() => void store.confirmPublish()}
                    >
                      {state.publishing
                        ? 'Publishing…'
                        : `Yes, publish to ${plural(chosen.length, 'class', 'classes')}`}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={state.publishing}
                      onClick={() => store.cancelConfirm()}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <History options={options} state={state} store={store} fmt={formatTime} />
        </>
      )}
    </div>
  );
}

export interface PublishScreenProps {
  curriculumId: string;
  csrf: string;
  onSignedOut: () => void;
  fetch?: Fetch;
}

const LOADING = {
  loading: true,
  latest: null,
  diff: null,
  options: null,
  selected: [],
  preview: null,
  previewing: false,
  confirming: false,
  publishing: false,
  result: null,
  repinning: null,
  repinBusy: false,
  repinned: null,
  problem: null,
  announcement: '',
} satisfies PublishState;
const NO_STORE = { subscribe: () => () => {}, getState: () => LOADING };

/** The section's content, for one curriculum. */
export function PublishScreen({
  curriculumId,
  csrf,
  onSignedOut,
  fetch: fetchFn,
}: PublishScreenProps) {
  const csrfRef = useRef(csrf);
  const signedOut = useRef(onSignedOut);
  useEffect(() => {
    csrfRef.current = csrf;
    signedOut.current = onSignedOut;
  });
  const [store, setStore] = useState<PublishStore | null>(null);
  useEffect(() => {
    const created = createPublishStore({
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
  if (!store) return <PublishView state={state} store={noopStore} />;
  return <PublishView state={state} store={store} />;
}

const noopStore: PublishStore = {
  subscribe: () => () => {},
  getState: () => LOADING,
  load: async () => {},
  toggleClass: () => {},
  openConfirm: () => {},
  cancelConfirm: () => {},
  confirmPublish: async () => {},
  askRepin: () => {},
  cancelRepin: () => {},
  confirmRepin: async () => {},
};
