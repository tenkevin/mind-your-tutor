import {
  CSRF_HEADER,
  ColumnMappingResponseSchema,
  DATA_PAGE_DEFAULT,
  DataTabPageSchema,
  VersionListResponseSchema,
  type ColumnMapping,
  type ColumnMappingResponse,
  type DataTabId,
  type DataTabPage,
  type VersionListResponse,
} from '@ideamap/contracts';
import type { Fetch } from '../curriculum/store';

// Teacher Settings → From the spreadsheet (T6): which version is shown, which data view,
// which page of it, and the column mapping. Plain TypeScript with a subscribe/getState
// pair like the Curriculum data store (T2), so tests drive it with a fake fetch.
//
// A page is shown only while it is the one asked for: when the version, view or page
// changes, `page` is cleared at once, so the previous version's rows never show beside
// the new version's label while the new ones load.

export interface DataTabsState {
  /** Newest first; null until the first load. */
  versions: VersionListResponse['versions'] | null;
  versionId: string | null;
  tab: DataTabId;
  /** Standards view: only ideas with this code. */
  code: string | null;
  offset: number;
  /** The page for exactly the version, view, filter and offset above; null while it loads. */
  page: DataTabPage | null;
  loading: boolean;
  mapping: ColumnMappingResponse | null;
  saving: boolean;
  /** Set when the last save worked, until the mapping is next changed. */
  saved: boolean;
  problem: string | null;
}

export interface DataTabsStore {
  subscribe(onChange: () => void): () => void;
  getState(): DataTabsState;
  load(): Promise<void>;
  /** The newest version changed (a new import finished): reload the list and follow it. */
  refresh(): Promise<void>;
  selectVersion(id: string): void;
  selectTab(tab: DataTabId): void;
  filterCode(code: string | null): void;
  goTo(offset: number): void;
  saveMapping(mapping: ColumnMapping): Promise<boolean>;
}

export interface DataTabsDeps {
  fetch: Fetch;
  curriculumId: string;
  csrf: () => string;
  onSignedOut: () => void;
  pageSize?: number;
}

export function createDataTabsStore(deps: DataTabsDeps): DataTabsStore {
  const pageSize = deps.pageSize ?? DATA_PAGE_DEFAULT;
  const base = `/api/curricula/${encodeURIComponent(deps.curriculumId)}`;
  const listeners = new Set<() => void>();
  let state: DataTabsState = {
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
  /** Bumped for every page request; an older answer is dropped. */
  let asked = 0;

  const set = (next: Partial<DataTabsState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  const call = async (url: string, init?: RequestInit): Promise<unknown> => {
    let res: Response;
    try {
      res = await deps.fetch(url, { credentials: 'same-origin', ...init });
    } catch {
      set({ problem: "Couldn't reach Idea Map. Check your connection and try again." });
      return null;
    }
    if (res.status === 401) {
      deps.onSignedOut();
      return null;
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      set({
        problem:
          res.status === 403
            ? "You can't change this curriculum's column mapping."
            : 'Something went wrong. Try again.',
      });
      return null;
    }
    return body;
  };

  const loadPage = async (): Promise<void> => {
    const { versionId, tab, code, offset } = state;
    const mine = ++asked;
    if (!versionId) {
      set({ page: null, loading: false });
      return;
    }
    set({ page: null, loading: true, problem: null });
    const query = new URLSearchParams({ offset: String(offset), limit: String(pageSize) });
    if (tab === 'standards' && code) query.set('code', code);
    const body = await call(
      `${base}/versions/${encodeURIComponent(versionId)}/data/${tab}?${query.toString()}`,
    );
    if (mine !== asked) return;
    const parsed = DataTabPageSchema.safeParse(body);
    set({ page: parsed.success ? parsed.data : null, loading: false });
  };

  const loadVersions = async (): Promise<boolean> => {
    const parsed = VersionListResponseSchema.safeParse(await call(`${base}/versions`));
    if (!parsed.success) return false;
    const { versions } = parsed.data;
    const had = state.versions;
    // Follow the newest version unless the teacher picked an older one that still exists.
    const followed = !had || state.versionId === had[0]?.id;
    const keep = state.versionId && versions.some((v) => v.id === state.versionId);
    const versionId = followed || !keep ? (versions[0]?.id ?? null) : state.versionId;
    const changed = versionId !== state.versionId;
    set({ versions, versionId, ...(changed ? { offset: 0, code: null, page: null } : {}) });
    return changed || had === null;
  };

  const loadMapping = async () => {
    const parsed = ColumnMappingResponseSchema.safeParse(await call(`${base}/column-mapping`));
    if (parsed.success) set({ mapping: parsed.data });
  };

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getState: () => state,
    async load() {
      await Promise.all([loadVersions().then(loadPage), loadMapping()]);
    },
    async refresh() {
      const changed = await loadVersions();
      await loadMapping();
      if (changed) await loadPage();
    },
    selectVersion(id) {
      if (id === state.versionId || !state.versions?.some((v) => v.id === id)) return;
      set({ versionId: id, offset: 0, code: null, page: null, loading: true });
      void loadPage();
    },
    selectTab(tab) {
      if (tab === state.tab) return;
      set({ tab, offset: 0, code: null, page: null, loading: true });
      void loadPage();
    },
    filterCode(code) {
      set({ code, offset: 0, page: null, loading: true });
      void loadPage();
    },
    goTo(offset) {
      set({ offset: Math.max(0, offset), page: null, loading: true });
      void loadPage();
    },
    async saveMapping(mapping) {
      if (state.saving) return false;
      set({ saving: true, saved: false, problem: null });
      const body = await call(`${base}/column-mapping`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: deps.csrf() },
        body: JSON.stringify({ mapping }),
      });
      const parsed = ColumnMappingResponseSchema.safeParse(body);
      if (!parsed.success) {
        set({ saving: false });
        return false;
      }
      set({ mapping: parsed.data, saving: false, saved: true });
      return true;
    },
  };
}
