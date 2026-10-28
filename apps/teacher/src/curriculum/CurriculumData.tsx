import {
  countIssues,
  type CurriculumDataResponse,
  type GroupedIssue,
  type ImportJobView,
  type ImportStep,
  type IssueGroup,
} from '@ideamap/contracts';
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon, type IconName } from '../shell/icons';
import {
  createCurriculumDataStore,
  type CurriculumDataState,
  type CurriculumDataStore,
  type Fetch,
} from './store';

// Teacher Settings → Curriculum data (T2), after the section in
// project/Teacher Settings.dc.html: the source card with Import new version (the
// prototype's Re-sync, ARCHITECTURE.md §11), the pipeline steps from the import job,
// and the draft's data checks grouped by cause. Publishing is T8's; this section only
// says whether the draft can be published (D2). Every text from the sheet or the
// server is rendered as text, never as markup.

const KIND_LABEL = {
  xlsx: 'Excel workbook',
  csv: 'CSV files',
  json: 'Pack JSON',
  google_sheets: 'Google Sheets',
} as const;

const STEP_ICON: Record<ImportStep['status'], IconName> = {
  pending: 'pending',
  running: 'spinner',
  done: 'check',
  failed: 'failed',
};

const LEVEL = {
  error: { icon: 'error', word: 'Error' },
  warning: { icon: 'warning', word: 'Warning' },
  info: { icon: 'info', word: 'Info' },
} as const satisfies Record<IssueGroup['level'], { icon: IconName; word: string }>;

/** Names listed before the rest fold away. */
const SHOWN_ITEMS = 12;
/** Issues of one cause shown before the rest fold away (T2-P1). */
const SHOWN_ISSUES = 3;
/** Failure problems shown before the rest fold away. */
const SHOWN_PROBLEMS = 10;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

export function defaultFormatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

const busy = (job: ImportJobView | null | undefined) =>
  job?.status === 'queued' || job?.status === 'running';

/** The words beside a step's icon, so status isn't told by colour alone (T2-U2). */
function stepText(step: ImportStep, job: ImportJobView | null): string {
  switch (step.status) {
    case 'done':
      return step.result ? `Done · ${step.result}` : 'Done';
    case 'running':
      return 'Running…';
    case 'failed':
      return step.result ? `Failed · ${step.result}` : 'Failed';
    case 'pending':
      if (!job) return 'Not run yet';
      return job.status === 'failed' ? 'Not run' : 'Queued';
  }
}

function SourceCard({
  data,
  locked,
  onChoose,
  formatTime,
}: {
  data: CurriculumDataResponse | null;
  locked: boolean;
  onChoose: (file: File) => void;
  formatTime: (iso: string) => string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const job = data?.job ?? null;
  const version = data?.version ?? null;
  const source = job?.source ?? version?.source ?? null;
  const when = job ? (job.finished_at ?? job.created_at) : version?.created_at;
  const steps = job?.steps ?? [];
  const failed = job?.status === 'failed';
  return (
    <div className="cdata-source">
      <div className="cdata-source-row">
        <span className="cdata-source-icon">
          <Icon name="table" />
        </span>
        <div className="cdata-source-text">
          <span className="cdata-source-name">
            {source ? source.file_name || 'Unnamed file' : 'No curriculum imported yet'}
          </span>
          <span className="cdata-source-meta">
            {source
              ? `${KIND_LABEL[source.kind]} · ${failed ? 'import failed' : busy(job) ? 'importing since' : 'imported'} ${when ? formatTime(when) : ''}`
              : 'Import the Curriculum Pack workbook, its CSV files or pack JSON.'}
          </span>
        </div>
        {data?.unchanged && job?.status === 'succeeded' && (
          <span className="tag tag-neutral">Unchanged since last import</span>
        )}
        <div className="cdata-actions">
          <input
            ref={input}
            className="visually-hidden"
            type="file"
            accept=".xlsx,.csv,.json,.zip"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) onChoose(file);
            }}
          />
          <button
            type="button"
            className="btn btn-primary tshell-nowrap"
            disabled={locked}
            onClick={() => input.current?.click()}
          >
            <Icon
              name={locked ? 'spinner' : 'upload'}
              className={locked ? 'tshell-spin' : undefined}
            />
            {locked ? 'Importing…' : 'Import new version'}
          </button>
        </div>
      </div>
      {/* The tabs of the version shown below; not after a failed import (that file made none). */}
      {version && !failed && !busy(job) && (
        <ul className="cdata-tabs" aria-label={`Tabs in version ${version.number}`}>
          {version.tabs.map((t) => (
            <li key={t.tab}>
              <Icon name="table" />
              {t.tab}
              <span className="cdata-tab-rows">{t.rows.toLocaleString('en')}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="cdata-pipeline">
        <h3 className="cdata-eyebrow" id="cdata-steps-h">
          How Atlas builds the map
        </h3>
        <ol className="cdata-steps" aria-labelledby="cdata-steps-h">
          {(steps.length > 0 ? steps : PLACEHOLDER_STEPS).map((step) => (
            <li key={step.name} className="cdata-step" data-status={step.status}>
              <span className="cdata-step-name">
                <Icon
                  name={STEP_ICON[step.status]}
                  className={step.status === 'running' ? 'tshell-spin' : undefined}
                />
                <span>{step.name}</span>
              </span>
              <span className="cdata-step-sub">{stepText(step, job)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const PLACEHOLDER_STEPS: ImportStep[] = [
  'Read sheet',
  'Check data',
  'Rank links',
  'Lay out map',
  'Make quizzes',
  'Index library',
].map((name) => ({
  name: name as ImportStep['name'],
  status: 'pending',
  result: null,
  started_at: null,
  finished_at: null,
}));

/** "Ideas, row 7, title: …", the way C1 locates a problem. */
function located(issue: {
  tab: string | null;
  row: number | null;
  column: string | null;
  message: string;
}): string {
  const at = [issue.tab, issue.row === null ? null : `row ${issue.row}`, issue.column].filter(
    (part): part is string => part !== null,
  );
  return at.length > 0 ? `${at.join(', ')}: ${issue.message}` : issue.message;
}

function Failure({ job, earlier }: { job: ImportJobView; earlier: number | null }) {
  const error = job.error;
  const problems = error?.problems.filter((p) => p.severity === 'error') ?? [];
  const shown = problems.slice(0, SHOWN_PROBLEMS);
  const rest = problems.slice(SHOWN_PROBLEMS);
  const item = (p: (typeof problems)[number], i: number) => <li key={i}>{located(p)}</li>;
  return (
    <div className="cdata-failure">
      <Icon name="failed" />
      <div className="cdata-failure-body">
        <p className="cdata-strong">Import failed: no draft was made.</p>
        <p>{error?.message ?? 'The import stopped, so nothing was imported.'}</p>
        {shown.length > 0 && <ul className="cdata-problems">{shown.map(item)}</ul>}
        {rest.length > 0 && (
          <details className="cdata-more">
            <summary>Show {plural(rest.length, 'more problem')}</summary>
            <ul className="cdata-problems">{rest.map((p, i) => item(p, i + SHOWN_PROBLEMS))}</ul>
          </details>
        )}
        {error?.next_action && <p>{error.next_action}</p>}
        {earlier !== null && (
          <p className="cdata-muted">Version {earlier}, from an earlier import, is unchanged.</p>
        )}
      </div>
    </div>
  );
}

export function PublishState({
  version,
}: {
  version: NonNullable<CurriculumDataResponse['version']>;
}) {
  if (version.status !== 'draft') {
    return (
      <p className="cdata-publish" data-state="published">
        <Icon name="check" />
        <span>
          Version {version.number} is {version.status}.
        </span>
      </p>
    );
  }
  if (version.can_publish) {
    return (
      <p className="cdata-publish" data-state="ready">
        <Icon name="check" />
        <span>
          <span className="cdata-strong">Draft version {version.number} can be published.</span>{' '}
          Warnings and info don&apos;t block publishing.
        </span>
      </p>
    );
  }
  const blocking = version.groups.filter((g) => g.blocks_publish);
  const n = blocking.reduce((sum, g) => sum + g.issues.length, 0);
  return (
    <p className="cdata-publish" data-state="blocked">
      <Icon name="error" />
      <span>
        <span className="cdata-strong">Can&apos;t publish yet.</span> Draft version {version.number}{' '}
        has {plural(n, 'error')} that {n === 1 ? 'blocks' : 'block'} publishing:{' '}
        {blocking.map((g) => g.label).join(', ')}. Fix {n === 1 ? 'it' : 'them'} in the sheet, then
        import a new version.
      </span>
    </p>
  );
}

function where(issue: GroupedIssue): string | null {
  if (!issue.at) return null;
  const parts = [
    issue.at.tab,
    issue.at.row === null ? null : `row ${issue.at.row}`,
    issue.at.column,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** "ground (row 9)": an item with its sheet row, when the version records rows (T2-U3). */
function itemLabels(issue: GroupedIssue): string[] {
  return issue.items.map((item, i) => {
    const at = issue.item_rows[i];
    return at ? `${item} (row ${at.row})` : item;
  });
}

function Items({ issue, tab }: { issue: GroupedIssue; tab: string }) {
  if (issue.items.length === 0) return null;
  // The tab the rows are in: unit numbers are Units rows; most ids are Ideas rows.
  const located = issue.item_rows.find((r) => r !== null);
  const noun = located?.tab ?? (tab === 'Units' ? 'Units' : 'Ideas');
  const labels = itemLabels(issue);
  if (labels.length <= SHOWN_ITEMS) {
    return (
      <p className="cdata-items">
        {noun}: {labels.join(', ')}
      </p>
    );
  }
  return (
    <div className="cdata-items">
      <p>
        {noun}: {labels.slice(0, SHOWN_ITEMS).join(', ')}…
      </p>
      <details className="cdata-more">
        <summary>Show all {labels.length.toLocaleString('en')}</summary>
        <p>{labels.join(', ')}</p>
      </details>
    </div>
  );
}

function GroupIssue({ issue, tab }: { issue: GroupedIssue; tab: string }) {
  const at = where(issue);
  return (
    <>
      <p className="cdata-issue-text">
        {at && <span className="cdata-at">{at}: </span>}
        {issue.message}
      </p>
      <Items issue={issue} tab={tab} />
    </>
  );
}

function Group({ group }: { group: IssueGroup }) {
  const level = LEVEL[group.level];
  const [first, ...more] = group.issues;
  const tab = group.fix?.tab ?? '';
  const shown = more.slice(0, SHOWN_ISSUES - 1);
  const folded = more.slice(SHOWN_ISSUES - 1);
  const columns = group.fix?.columns?.join(', ') ?? group.fix?.column;
  return (
    <li className="cdata-group" data-level={group.level}>
      <Icon name={level.icon} />
      <div className="cdata-group-body">
        <p className="cdata-group-head">
          <span className="cdata-level">{level.word}</span>
          <span className="cdata-strong">{group.label}</span>
          {group.issues.length > 1 && (
            <span className="cdata-muted">· {group.issues.length.toLocaleString('en')}</span>
          )}
          {group.fix && (
            <span className="tag tag-outline">
              Fix in {group.fix.tab}
              {columns ? ` → ${columns}` : ''}
            </span>
          )}
          {group.draftable && <span className="tag tag-accent">Atlas can draft this</span>}
        </p>
        {first && <GroupIssue issue={first} tab={tab} />}
        {shown.map((issue, i) => (
          <GroupIssue key={i} issue={issue} tab={tab} />
        ))}
        {folded.length > 0 && (
          <details className="cdata-more">
            <summary>Show {folded.length.toLocaleString('en')} more</summary>
            <ul className="cdata-folded">
              {folded.map((issue, i) => (
                <li key={i}>
                  <GroupIssue issue={issue} tab={tab} />
                </li>
              ))}
            </ul>
          </details>
        )}
        {group.draftable && (
          <p className="cdata-muted">Atlas can draft the missing text for you to approve.</p>
        )}
      </div>
    </li>
  );
}

export function DataChecks({
  version,
}: {
  version: NonNullable<CurriculumDataResponse['version']>;
}) {
  const counts = countIssues(version.groups);
  const summary =
    version.groups.length === 0
      ? 'no problems found'
      : `${plural(counts.error, 'error')}, ${plural(counts.warning, 'warning')}, ${counts.info.toLocaleString('en')} info`;
  return (
    <div className="cdata-checks">
      <h3 className="cdata-checks-h" id="cdata-checks-h">
        Data checks · {summary}
      </h3>
      {version.groups.length > 0 && (
        <ul className="cdata-groups" aria-labelledby="cdata-checks-h">
          {version.groups.map((group) => (
            <Group
              key={`${group.origin}-${group.cause}-${group.level}-${group.fix?.tab}-${group.fix?.column}-${group.blocks_publish}`}
              group={group}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export interface CurriculumDataViewProps {
  state: CurriculumDataState;
  onChoose: (file: File) => void;
  formatTime?: (iso: string) => string;
}

export function CurriculumDataView({
  state,
  onChoose,
  formatTime = defaultFormatTime,
}: CurriculumDataViewProps) {
  const { data } = state;
  const job = data?.job ?? null;
  const version = data?.version ?? null;
  const locked = state.uploading || busy(job) || state.loading;
  // A job that just succeeded, before its draft has loaded: the version is still the
  // previous one, so its checks would be the wrong draft's.
  const stale = job?.status === 'succeeded' && job.version?.id !== version?.id;
  return (
    <div className="cdata">
      {/* Each step change and the end of an import are read out once (T2-U2). */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {state.announcement}
      </p>
      {state.problem && (
        <p className="cdata-problem" role="alert">
          <Icon name="warning" />
          <span>{state.problem}</span>
        </p>
      )}
      <SourceCard data={data} locked={locked} onChoose={onChoose} formatTime={formatTime} />
      {state.loading && !data && <p className="cdata-muted">Loading curriculum data…</p>}
      {busy(job) && (
        <p className="cdata-muted">Data checks appear here when the import finishes.</p>
      )}
      {stale && <p className="cdata-muted">Loading the new draft&apos;s data checks…</p>}
      {job?.status === 'failed' && <Failure job={job} earlier={version?.number ?? null} />}
      {version && !busy(job) && job?.status !== 'failed' && !stale && (
        <Fragment>
          <PublishState version={version} />
          <DataChecks version={version} />
        </Fragment>
      )}
    </div>
  );
}

export interface CurriculumDataProps {
  curriculumId: string;
  csrf: string;
  onSignedOut: () => void;
  fetch?: Fetch;
}

const LOADING: CurriculumDataState = {
  data: null,
  loading: true,
  uploading: false,
  problem: null,
  announcement: '',
};
/** Before the store exists (and when rendered on the server): loading. */
const NO_STORE = { subscribe: () => () => {}, getState: () => LOADING };

/** The section's content, loading and following imports for one curriculum. */
export function CurriculumData({
  curriculumId,
  csrf,
  onSignedOut,
  fetch: fetchFn,
}: CurriculumDataProps) {
  const csrfRef = useRef(csrf);
  const signedOut = useRef(onSignedOut);
  useEffect(() => {
    csrfRef.current = csrf;
    signedOut.current = onSignedOut;
  });
  const [store, setStore] = useState<CurriculumDataStore | null>(null);
  useEffect(() => {
    const created = createCurriculumDataStore({
      fetch: fetchFn ?? ((input, init) => fetch(input, init)),
      curriculumId,
      csrf: () => csrfRef.current,
      onSignedOut: () => signedOut.current(),
    });
    setStore(created);
    void created.load();
    return () => created.stop();
  }, [curriculumId, fetchFn]);
  const live = store ?? NO_STORE;
  const state = useSyncExternalStore(live.subscribe, live.getState, live.getState);
  return <CurriculumDataView state={state} onChoose={(file) => void store?.upload(file)} />;
}
