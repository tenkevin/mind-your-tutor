import {
  CSRF_HEADER,
  CurriculumDataResponseSchema,
  DiffResponseSchema,
  PublishPreviewSchema,
  PublishResultSchema,
  PublishingOptionsSchema,
  RepinResultSchema,
  type CurriculumDataResponse,
  type DiffResponse,
  type PublishPreview,
  type PublishResult,
  type PublishingOptions,
  type RepinResult,
} from '@ideamap/contracts';

// Teacher Settings → Publish (T8): loads the newest draft, its diff against the
// published version and the classes the teacher may publish to (C5, T2), previews the
// audience for the chosen classes (D14), publishes after an explicit confirmation and
// re-pins a class to an earlier published version (rollback, §7). Plain TypeScript
// with a subscribe/getState pair, like T2's store, so the screen reads it with
// useSyncExternalStore and tests drive it with a fake fetch.

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface PublishState {
  /** True until the first load finishes, and again while a reload is under way. */
  loading: boolean;
  /**
   * The newest version and its data checks (T2). Cleared at the start of every reload, so
   * the previous version's checks never show while the new ones load.
   */
  latest: CurriculumDataResponse | null;
  /** The draft's diff against the published version; null unless the newest version is a draft. */
  diff: DiffResponse | null;
  options: PublishingOptions | null;
  /** The classes ticked in the picker, none to begin with (T8-F3). */
  selected: readonly string[];
  /** The preview for exactly `selected`; null while it loads or with nothing selected. */
  preview: PublishPreview | null;
  previewing: boolean;
  /** The explicit confirm step is open (T8-S2). */
  confirming: boolean;
  publishing: boolean;
  result: PublishResult | null;
  /** The class asking whether to go back, and the version it would go back to. */
  repinning: { classId: string; versionId: string } | null;
  repinBusy: boolean;
  repinned: RepinResult | null;
  /** Why the last request didn't work, for the teacher. */
  problem: string | null;
  /** The latest outcome, for the screen's live region (T8-U2). */
  announcement: string;
}

export interface PublishStore {
  subscribe(onChange: () => void): () => void;
  getState(): PublishState;
  load(): Promise<void>;
  toggleClass(classId: string): void;
  openConfirm(): void;
  cancelConfirm(): void;
  confirmPublish(): Promise<void>;
  askRepin(classId: string, versionId: string): void;
  cancelRepin(): void;
  confirmRepin(): Promise<void>;
}

export interface StoreDeps {
  fetch: Fetch;
  curriculumId: string;
  /** The CSRF token from /api/me (F5). */
  csrf: () => string;
  /** Called on a 401: the session ran out. */
  onSignedOut: () => void;
  /** A new Idempotency-Key per publish attempt, so a double click or retry publishes once. */
  newKey?: () => string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const errorText = (body: unknown): string | null =>
  typeof body === 'object' &&
  body !== null &&
  typeof (body as { error?: unknown }).error === 'string'
    ? (body as { error: string }).error
    : null;

const INITIAL: PublishState = {
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
};

export function createPublishStore(deps: StoreDeps): PublishStore {
  const newKey = deps.newKey ?? (() => crypto.randomUUID());
  const listeners = new Set<() => void>();
  let state: PublishState = INITIAL;
  /** Orders loads and previews: only the newest one's answer is used. */
  let loadSeq = 0;
  let previewSeq = 0;
  /** One key per confirmed publish; kept until it succeeds or is refused. */
  let publishKey: string | null = null;

  const set = (next: Partial<PublishState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  /** The response body, or undefined after a refusal the teacher has been told about. */
  const call = async (url: string, init?: RequestInit): Promise<unknown> => {
    let res: Response;
    try {
      res = await deps.fetch(url, { credentials: 'same-origin', ...init });
    } catch {
      set({ problem: "Couldn't reach Idea Map. Check your connection and try again." });
      return undefined;
    }
    if (res.status === 401) {
      deps.onSignedOut();
      return undefined;
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      set({
        problem:
          errorText(body) ??
          (res.status === 403
            ? "You can't publish to one of these classes."
            : 'Something went wrong. Try again.'),
      });
      return undefined;
    }
    return body;
  };

  const post = (url: string, payload: unknown, extra: Record<string, string> = {}) =>
    call(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: deps.csrf(), ...extra },
      body: JSON.stringify(payload),
    });

  const base = `/api/curricula/${encodeURIComponent(deps.curriculumId)}`;

  const load = async (): Promise<void> => {
    const seq = ++loadSeq;
    previewSeq++;
    publishKey = null;
    // Nothing from the earlier load shows while this one is under way.
    set({
      loading: true,
      latest: null,
      diff: null,
      options: null,
      selected: [],
      preview: null,
      previewing: false,
      confirming: false,
      repinning: null,
    });
    const [latestBody, optionsBody] = await Promise.all([
      call(`${base}/imports/latest`),
      call(`${base}/publishing`),
    ]);
    if (seq !== loadSeq) return;
    const latest = CurriculumDataResponseSchema.safeParse(latestBody);
    const options = PublishingOptionsSchema.safeParse(optionsBody);
    let diff: DiffResponse | null = null;
    if (latest.success && latest.data.version?.status === 'draft') {
      const body = await call(`/api/versions/${encodeURIComponent(latest.data.version.id)}/diff`);
      if (seq !== loadSeq) return;
      const parsed = DiffResponseSchema.safeParse(body);
      if (parsed.success) diff = parsed.data;
    }
    set({
      loading: false,
      latest: latest.success ? latest.data : null,
      options: options.success ? options.data : null,
      diff,
    });
  };

  const draftId = (): string | null => {
    const version = state.latest?.version;
    return version?.status === 'draft' ? version.id : null;
  };

  const refreshPreview = async (): Promise<void> => {
    const seq = ++previewSeq;
    const id = draftId();
    if (!id || state.selected.length === 0) {
      set({ preview: null, previewing: false });
      return;
    }
    set({ preview: null, previewing: true });
    const body = await post(`/api/versions/${encodeURIComponent(id)}/preview`, {
      class_ids: [...state.selected],
    });
    if (seq !== previewSeq) return;
    const parsed = PublishPreviewSchema.safeParse(
      typeof body === 'object' && body !== null ? (body as { preview?: unknown }).preview : null,
    );
    set({ previewing: false, preview: parsed.success ? parsed.data : null });
  };

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getState: () => state,
    load,

    toggleClass(classId) {
      if (state.publishing) return;
      const known = state.options?.classes.some((c) => c.id === classId);
      if (!known) return;
      const selected = state.selected.includes(classId)
        ? state.selected.filter((id) => id !== classId)
        : [...state.selected, classId];
      publishKey = null;
      set({ selected, confirming: false, result: null, repinned: null, problem: null });
      void refreshPreview();
    },

    openConfirm() {
      if (!state.preview?.can_publish || state.previewing || state.publishing) return;
      set({ confirming: true, problem: null });
    },
    cancelConfirm() {
      if (state.publishing) return;
      set({ confirming: false });
    },

    async confirmPublish() {
      // A second click while the first is under way does nothing.
      if (state.publishing || !state.confirming) return;
      const id = draftId();
      const { preview } = state;
      if (!id || !preview?.can_publish) return;
      const names = classNames(state, state.selected);
      publishKey ??= newKey();
      set({ publishing: true, problem: null, announcement: 'Publishing…' });
      const body = await post(
        `/api/versions/${encodeURIComponent(id)}/publish`,
        { class_ids: [...state.selected] },
        { 'idempotency-key': publishKey },
      );
      if (body === undefined) {
        // Refused or unreachable: the confirm panel stays, and a retry uses the same key.
        set({ publishing: false, announcement: state.problem ?? '' });
        return;
      }
      const parsed = PublishResultSchema.safeParse(
        typeof body === 'object' && body !== null ? (body as { publish?: unknown }).publish : null,
      );
      publishKey = null;
      if (!parsed.success) {
        set({ publishing: false, problem: 'Something went wrong. Try again.' });
        return;
      }
      const result = parsed.data;
      const where = names.length > 0 ? names.join(', ') : plural(result.classes.length, 'class');
      set({
        publishing: false,
        confirming: false,
        result,
        repinned: null,
        announcement: `Version ${result.version.number} is published to ${where}.`,
      });
      // The draft is now published and the pins moved; show the new state, not the old.
      await load();
    },

    askRepin(classId, versionId) {
      if (state.repinBusy) return;
      set({ repinning: { classId, versionId }, repinned: null, problem: null });
    },
    cancelRepin() {
      if (state.repinBusy) return;
      set({ repinning: null });
    },
    async confirmRepin() {
      const ask = state.repinning;
      if (!ask || state.repinBusy) return;
      set({ repinBusy: true, problem: null });
      const body = await post(`/api/classes/${encodeURIComponent(ask.classId)}/pin`, {
        version_id: ask.versionId,
      });
      if (body === undefined) {
        set({ repinBusy: false, announcement: state.problem ?? '' });
        return;
      }
      const parsed = RepinResultSchema.safeParse(
        typeof body === 'object' && body !== null ? (body as { pin?: unknown }).pin : null,
      );
      if (!parsed.success) {
        set({ repinBusy: false, problem: 'Something went wrong. Try again.' });
        return;
      }
      const name = classNames(state, [ask.classId])[0] ?? 'The class';
      const message = `${name} is back on version ${parsed.data.version.number}.`;
      set({ repinBusy: false });
      await load();
      set({ repinned: parsed.data, result: null, announcement: message });
    },
  };
}

/** The names of the classes with these ids, in the order given. */
export function classNames(state: PublishState, ids: readonly string[]): string[] {
  return ids.map((id) => state.options?.classes.find((c) => c.id === id)?.name ?? 'a class');
}
