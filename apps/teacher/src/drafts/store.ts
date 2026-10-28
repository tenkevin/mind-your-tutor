import { CSRF_HEADER, DraftListSchema, type DraftList } from '@ideamap/contracts';
import type { Fetch } from '../curriculum/store';

// Teacher Settings → Drafts to approve (A6): loads the curriculum's AI drafts and sends
// each decision. Plain TypeScript with subscribe/getState, as the Curriculum data store.

export interface DraftsState {
  list: DraftList | null;
  loading: boolean;
  /** Ids with a request in flight, so a button can't be pressed twice. */
  busy: ReadonlySet<string>;
  problem: string | null;
  /** The last decision, for the section's live region. */
  announcement: string;
}

export interface DraftsStore {
  subscribe(onChange: () => void): () => void;
  getState(): DraftsState;
  load(): Promise<void>;
  /** Approve a draft; `text` is the teacher's edit, left out to approve as written. */
  approve(id: string, text?: string): Promise<void>;
  reject(id: string): Promise<void>;
  redraft(id: string): Promise<void>;
}

export interface DraftsDeps {
  fetch: Fetch;
  curriculumId: string;
  csrf: () => string;
  onSignedOut: () => void;
}

export function createDraftsStore(deps: DraftsDeps): DraftsStore {
  const base = `/api/curricula/${encodeURIComponent(deps.curriculumId)}/drafts`;
  const listeners = new Set<() => void>();
  let state: DraftsState = {
    list: null,
    loading: true,
    busy: new Set(),
    problem: null,
    announcement: '',
  };
  const set = (next: Partial<DraftsState>) => {
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
    if (!res.ok) {
      set({
        problem:
          res.status === 403
            ? "You can't review drafts for this curriculum."
            : 'Something went wrong. Try again.',
      });
      return null;
    }
    return res.json().catch(() => ({}));
  };

  const load = async () => {
    const parsed = DraftListSchema.safeParse(await call(base));
    set(parsed.success ? { list: parsed.data, loading: false, problem: null } : { loading: false });
  };

  const decide = async (id: string, verb: string, body: object | undefined, said: string) => {
    if (state.busy.has(id)) return;
    set({ busy: new Set([...state.busy, id]), problem: null });
    const result = await call(`${base}/${encodeURIComponent(id)}/${verb}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: deps.csrf() },
      body: JSON.stringify(body ?? {}),
    });
    const busy = new Set(state.busy);
    busy.delete(id);
    set({ busy });
    if (result === null) return;
    await load();
    set({ announcement: said });
  };

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getState: () => state,
    load,
    approve: (id, text) =>
      decide(id, 'approve', text === undefined ? undefined : { text }, 'Draft approved.'),
    reject: (id) => decide(id, 'reject', undefined, 'Draft rejected.'),
    redraft: (id) => decide(id, 'redraft', undefined, 'A new draft has been requested.'),
  };
}
