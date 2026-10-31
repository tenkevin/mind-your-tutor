import {
  DATA_TABS,
  tabSpec,
  type ColumnMapping,
  type DataTabId,
  type DataTabPage,
  type TabName,
} from '@ideamap/contracts';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Fetch } from '../curriculum/store';
import { Icon } from '../shell/icons';
import { DataIcon, type DataIconName } from './icons';
import { createDataTabsStore, type DataTabsState, type DataTabsStore } from './store';

// Teacher Settings → From the spreadsheet (T6), after the data tabs and Column mapping in
// project/Teacher Settings.dc.html: five read-only views of one version's data and the
// curriculum's column mapping. Nothing here edits data (D4): changes go through export,
// edit and re-import. The mapping belongs to the source (§6) and applies on the next
// import (§11). Everything from the sheet is rendered as text, never as markup, and
// media references are shown, never loaded (T6-S2).

const VIEWS: Record<
  DataTabId,
  { label: string; icon: DataIconName; sources: [TabName, string][] }
> = {
  prerequisites: { label: 'Prerequisites', icon: 'tree', sources: [['Ideas', 'requires']] },
  categories: {
    label: 'Categories',
    icon: 'shapes',
    sources: [
      ['Categories', 'icon'],
      ['Ideas', 'category'],
    ],
  },
  standards: { label: 'Standards codes', icon: 'seal', sources: [['Ideas', 'standard_codes']] },
  media: {
    label: 'Media',
    icon: 'play',
    sources: [
      ['Ideas', 'media_url'],
      ['Links', 'media_url'],
    ],
  },
  assessment: {
    label: 'Assessment questions',
    icon: 'student',
    sources: [['Assessment', 'question']],
  },
};

/** The tabs whose columns the mapping covers, in the pack's order. */
const MAPPED_TABS: readonly TabName[] = ['Units', 'Ideas', 'Links', 'Categories', 'Assessment'];

const STATUS_WORD = { draft: 'draft', published: 'published', archived: 'archived' } as const;

const count = (n: number) => n.toLocaleString('en');

function Tag({ children }: { children: ReactNode }) {
  return <span className="tag tag-neutral">{children}</span>;
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="ddata-cell">{children}</td>;
}

function Rows({ page }: { page: DataTabPage }) {
  switch (page.tab) {
    case 'prerequisites':
      return (
        <Table
          caption="Prerequisites of each idea"
          head={['Idea', 'Requires (all must be mastered)', 'Status']}
        >
          {page.rows.map((r) => (
            <tr key={r.idea_id}>
              <th scope="row" className="ddata-name">
                {r.title}
              </th>
              <Cell>
                <span className="ddata-chips">
                  {r.requires.map((q) => (
                    <span
                      key={q.idea_id}
                      className="ddata-req"
                      data-unknown={q.title === null ? 'true' : undefined}
                    >
                      {q.title ?? `${q.idea_id} (unknown)`}
                    </span>
                  ))}
                  {r.status === 'none' && (
                    <span className="ddata-muted">None · unlocks from a mastered neighbour</span>
                  )}
                </span>
              </Cell>
              <Cell>
                <span className="ddata-status" data-state={r.status}>
                  {r.status === 'unknown' ? 'Unknown idea_id' : r.status === 'ok' ? 'OK' : '—'}
                </span>
              </Cell>
            </tr>
          ))}
        </Table>
      );
    case 'categories':
      return (
        <Table caption="Categories" head={['Category', 'Icon', 'Description', 'Ideas']}>
          {page.rows.map((r) => (
            <tr key={r.category}>
              <th scope="row" className="ddata-name">
                {r.category}
              </th>
              <Cell>{r.icon ?? <span className="ddata-muted">—</span>}</Cell>
              <Cell>{r.description}</Cell>
              <Cell>{count(r.ideas)}</Cell>
            </tr>
          ))}
        </Table>
      );
    case 'standards':
      return (
        <Table caption="Standards codes of each idea" head={['Idea', 'Unit', 'Codes']}>
          {page.rows.map((r) => (
            <tr key={r.idea_id}>
              <th scope="row" className="ddata-name">
                {r.title}
              </th>
              <Cell>Unit {r.unit}</Cell>
              <Cell>
                <span className="ddata-chips">
                  {r.codes.map((c) => (
                    <Tag key={c}>{c}</Tag>
                  ))}
                  {r.codes.length === 0 && (
                    <span className="ddata-missing">Missing: add to standard_codes</span>
                  )}
                </span>
              </Cell>
            </tr>
          ))}
        </Table>
      );
    case 'media':
      return (
        <Table
          caption="Media of each idea and link"
          head={['In', 'Item', 'media_url', 'Students see']}
        >
          {page.rows.map((r, i) => (
            <tr key={i}>
              <Cell>{r.tab}</Cell>
              <th scope="row" className="ddata-name">
                {r.label}
              </th>
              <Cell>
                {r.media_url === null ? (
                  <span className="ddata-muted">(empty)</span>
                ) : (
                  <code className="ddata-url">{r.media_url}</code>
                )}
              </Cell>
              <Cell>
                {r.usable ? (
                  r.shows
                ) : (
                  <span className="ddata-missing">
                    Not used: only https links and file names work
                  </span>
                )}
              </Cell>
            </tr>
          ))}
        </Table>
      );
    case 'assessment':
      return (
        <Table caption="Assessment questions in each unit" head={['Unit', 'Questions', 'Status']}>
          {page.rows.map((r) => (
            <tr key={r.unit}>
              <th scope="row" className="ddata-name">
                Unit {r.unit} · {r.name}
              </th>
              <Cell>
                {count(r.questions)} of {count(r.ideas)}
              </Cell>
              <Cell>
                {r.questions >= r.ideas
                  ? 'Complete: one per objective'
                  : `${count(r.ideas - r.questions)} missing`}
              </Cell>
            </tr>
          ))}
        </Table>
      );
  }
}

function Table({
  caption,
  head,
  children,
}: {
  caption: string;
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="ddata-scroll">
      <table className="table ddata-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const TAB_FOOTNOTE: Partial<Record<DataTabId, string>> = {
  categories:
    'Categories are used in quiz questions (“What kind of idea is it?”), card icons and map labels. Icons use Phosphor names.',
  assessment:
    'Each question matches one lesson objective. Missing rows can be drafted by Atlas, then approved and written back to the Assessment tab.',
};

function Pager({ page, onGo }: { page: DataTabPage; onGo: (offset: number) => void }) {
  if (page.total <= page.limit) return null;
  const from = page.offset + 1;
  const to = Math.min(page.offset + page.limit, page.total);
  return (
    <nav className="ddata-pager" aria-label="Pages">
      <span>
        Showing {count(from)}–{count(to)} of {count(page.total)}
      </span>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={page.offset === 0}
        onClick={() => onGo(page.offset - page.limit)}
      >
        Previous
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={to >= page.total}
        onClick={() => onGo(page.offset + page.limit)}
      >
        Next
      </button>
    </nav>
  );
}

function sourceLine(tab: DataTabId, mapping: ColumnMapping | undefined): string {
  return VIEWS[tab].sources
    .map(([sheet, column]) => {
      const mapped = mapping?.find((m) => m.tab === sheet && m.column === column);
      return `${sheet} tab · column ${mapped?.source_column ?? column}`;
    })
    .join(', and ');
}

/** The value a draft has for a pack column: the saved source column, or '' for by-name. */
const keyOf = (tab: TabName, column: string) => `${tab}\u0000${column}`;

function MappingEditor({
  state,
  onSave,
  initiallyOpen,
}: {
  state: DataTabsState;
  onSave: (mapping: ColumnMapping) => void;
  initiallyOpen: boolean;
}) {
  const saved = state.mapping;
  // Only what the teacher has changed since the last save is kept here; everything else
  // reads from the saved mapping.
  const [kept, setKept] = useState<{ of: unknown; edits: Record<string, string> }>({
    of: null,
    edits: {},
  });
  const [open, setOpen] = useState(initiallyOpen);
  // Edits belong to the mapping they were made on; a new one (after a save) drops them.
  const edits = kept.of === saved ? kept.edits : {};
  const setEdits = (next: Record<string, string>) => setKept({ of: saved, edits: next });
  if (!saved) return null;
  const canEdit = saved.can_edit;
  const current = new Map(saved.mapping.map((m) => [keyOf(m.tab, m.column), m.source_column]));
  const valueOf = (key: string) => edits[key] ?? current.get(key) ?? '';
  const dirty = Object.entries(edits).some(([k, v]) => (current.get(k) ?? '') !== v);
  const build = (): ColumnMapping =>
    MAPPED_TABS.flatMap((tab) =>
      tabSpec(tab)
        .cols.filter((c) => valueOf(keyOf(tab, c.name)) !== '')
        .map((c) => ({ tab, column: c.name, source_column: valueOf(keyOf(tab, c.name)) })),
    );
  return (
    <div className="ddata-mapping">
      <h3 className="ddata-mapping-h">
        <button
          type="button"
          className="ddata-mapping-toggle"
          aria-expanded={open}
          aria-controls="ddata-mapping-body"
          onClick={() => setOpen(!open)}
        >
          <DataIcon name="plug" />
          <span>Column mapping</span>
          <DataIcon name={open ? 'up' : 'down'} />
        </button>
      </h3>
      {open && (
        <div id="ddata-mapping-body" className="ddata-mapping-body">
          <p className="ddata-muted">
            Tell the app which column holds each field, so any curriculum spreadsheet or table can
            plug in. This belongs to the curriculum, so every class using it shares one mapping. It
            applies from the next import; versions already made keep the mapping they were made
            with.
          </p>
          {!canEdit && (
            <p className="ddata-muted">
              Only the curriculum&apos;s author or an admin can change the mapping.
            </p>
          )}
          {MAPPED_TABS.map((tab) => {
            const cols = tabSpec(tab).cols.filter((c) => c.edit !== 'app');
            return (
              <fieldset key={tab} className="ddata-map-group" disabled={!canEdit || state.saving}>
                <legend>{tab} tab</legend>
                <div className="ddata-map-grid">
                  {cols.map((c) => {
                    const id = `map-${tab}-${c.name}`;
                    const value = valueOf(keyOf(tab, c.name));
                    const options = new Set(saved.headers[tab] ?? []);
                    if (value) options.add(value);
                    return (
                      <div key={c.name} className="ddata-map-row">
                        <label htmlFor={id}>
                          {c.name} <span className="ddata-muted">· {tab}</span>
                        </label>
                        <select
                          id={id}
                          className="input ddata-map-select"
                          value={value}
                          onChange={(e) =>
                            setEdits({ ...edits, [keyOf(tab, c.name)]: e.target.value })
                          }
                        >
                          <option value="">Match by name</option>
                          {[...options].map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          {canEdit && (
            <div className="ddata-map-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!dirty || state.saving}
                onClick={() => onSave(build())}
              >
                {state.saving ? 'Saving…' : 'Save mapping'}
              </button>
              {state.saved && !dirty && (
                <span className="ddata-saved" role="status">
                  <Icon name="check" /> Saved. It applies to the next import.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface DataTabsViewProps {
  state: DataTabsState;
  onVersion: (id: string) => void;
  onTab: (tab: DataTabId) => void;
  onCode: (code: string | null) => void;
  onGo: (offset: number) => void;
  onSaveMapping: (mapping: ColumnMapping) => void;
  /** Start with Column mapping open (tests render it that way). */
  mappingOpen?: boolean;
}

export function DataTabsView({
  state,
  onVersion,
  onTab,
  onCode,
  onGo,
  onSaveMapping,
  mappingOpen = false,
}: DataTabsViewProps) {
  const { versions, versionId, tab, page } = state;
  const selected = versions?.find((v) => v.id === versionId) ?? null;
  // Rows show only for the exact version, view, filter and page asked for.
  const current =
    page && page.version.id === versionId && page.tab === tab && page.offset === state.offset
      ? page
      : null;
  const heading = `ddata-view-h`;
  return (
    <div className="ddata">
      {state.problem && (
        <p className="cdata-problem" role="alert">
          <Icon name="warning" />
          <span>{state.problem}</span>
        </p>
      )}
      {versions && versions.length === 0 && (
        <p className="cdata-muted">
          Nothing has been imported yet. Import a curriculum in Curriculum data, and its tabs show
          here.
        </p>
      )}
      {versions && versions.length > 0 && (
        <>
          <div className="ddata-top">
            <div className="ddata-version">
              <label htmlFor="ddata-version-select">Version</label>
              <select
                id="ddata-version-select"
                className="input"
                value={versionId ?? ''}
                onChange={(e) => onVersion(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.number} · {STATUS_WORD[v.status]}
                    {v.file_name ? ` · ${v.file_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <p className="ddata-readonly">
              <Icon name="lock" />
              <span>
                Read-only. To change this data, export the spreadsheet, edit it, then import a new
                version.
              </span>
            </p>
          </div>
          <div className="ddata-chiprow" role="group" aria-label="Data views">
            {DATA_TABS.map((id) => (
              <button
                key={id}
                type="button"
                className="ddata-chip"
                aria-pressed={id === tab}
                onClick={() => onTab(id)}
              >
                <DataIcon name={VIEWS[id].icon} />
                {VIEWS[id].label}
              </button>
            ))}
          </div>
          <p className="ddata-source">
            <Icon name="table" />
            <span>
              Source: {sourceLine(tab, state.mapping?.mapping)}
              {selected && (
                <>
                  {' '}
                  · Version {selected.number} ({STATUS_WORD[selected.status]})
                </>
              )}
            </span>
          </p>
          <div className="ddata-panel" aria-labelledby={heading} aria-busy={current === null}>
            <h3 className="visually-hidden" id={heading}>
              {VIEWS[tab].label}
            </h3>
            {tab === 'standards' && current?.tab === 'standards' && (
              <div className="ddata-codes" role="group" aria-label="Filter by code">
                {current.codes.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    className="ddata-code"
                    aria-pressed={state.code === c.code}
                    onClick={() => onCode(state.code === c.code ? null : c.code)}
                  >
                    {c.code} <span className="ddata-muted">{count(c.count)}</span>
                  </button>
                ))}
              </div>
            )}
            {current === null ? (
              <p className="cdata-muted" role="status">
                {state.loading ? `Loading ${VIEWS[tab].label.toLowerCase()}…` : 'Nothing to show.'}
              </p>
            ) : current.total === 0 ? (
              <p className="cdata-muted">This version has no rows here.</p>
            ) : (
              <>
                <Rows page={current} />
                <Pager page={current} onGo={onGo} />
              </>
            )}
            {TAB_FOOTNOTE[tab] && <p className="cdata-muted">{TAB_FOOTNOTE[tab]}</p>}
          </div>
        </>
      )}
      <MappingEditor state={state} onSave={onSaveMapping} initiallyOpen={mappingOpen} />
    </div>
  );
}

const LOADING: DataTabsState = {
  versions: null,
  versionId: null,
  tab: 'prerequisites',
  code: null,
  offset: 0,
  page: null,
  loading: true,
  mapping: null,
  saving: false,
  saved: false,
  problem: null,
};
const NO_STORE = { subscribe: () => () => {}, getState: () => LOADING };

export interface DataTabsProps {
  curriculumId: string;
  csrf: string;
  onSignedOut: () => void;
  /** The newest version's id from the Curriculum data section; a change reloads the list. */
  latestVersionId?: string | null;
  fetch?: Fetch;
}

/** The section's content: the data views and the column mapping of one curriculum. */
export function DataTabs({
  curriculumId,
  csrf,
  onSignedOut,
  latestVersionId = null,
  fetch: fetchFn,
}: DataTabsProps) {
  const csrfRef = useRef(csrf);
  const signedOut = useRef(onSignedOut);
  useEffect(() => {
    csrfRef.current = csrf;
    signedOut.current = onSignedOut;
  });
  const [store, setStore] = useState<DataTabsStore | null>(null);
  useEffect(() => {
    const created = createDataTabsStore({
      fetch: fetchFn ?? ((input, init) => fetch(input, init)),
      curriculumId,
      csrf: () => csrfRef.current,
      onSignedOut: () => signedOut.current(),
    });
    setStore(created);
    void created.load();
  }, [curriculumId, fetchFn]);
  const first = useRef(true);
  useEffect(() => {
    // The first value is what `load` already fetched.
    if (first.current) {
      first.current = false;
      return;
    }
    void store?.refresh();
  }, [latestVersionId, store]);
  const live = store ?? NO_STORE;
  const state = useSyncExternalStore(live.subscribe, live.getState, live.getState);
  return (
    <DataTabsView
      state={state}
      onVersion={(id) => store?.selectVersion(id)}
      onTab={(tab) => store?.selectTab(tab)}
      onCode={(code) => store?.filterCode(code)}
      onGo={(offset) => store?.goTo(offset)}
      onSaveMapping={(mapping) => void store?.saveMapping(mapping)}
    />
  );
}
