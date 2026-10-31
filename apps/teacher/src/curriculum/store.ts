import {
  CSRF_HEADER,
  CurriculumDataResponseSchema,
  ImportJobViewSchema,
  countIssues,
  type CurriculumDataResponse,
  type ImportJobView,
} from '@ideamap/contracts';

// Teacher Settings → Curriculum data (T2): loads the newest import and draft, starts an
// import (C4) and follows the job's steps until it finishes, without a reload. Plain
// TypeScript with a subscribe/getState pair, so the section reads it with
// useSyncExternalStore and tests drive it with a fake fetch and clock.

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface CurriculumDataState {
  /** The newest job and version; null until the first load. */
  data: CurriculumDataResponse | null;
  loading: boolean;
  /** True while an upload is being sent. */
  uploading: boolean;
  /** Why the last request didn't work, for the teacher; null when it did. */
  problem: string | null;
  /** The latest progress, for the section's live region (T2-U2). */
  announcement: string;
}

export interface CurriculumDataStore {
  subscribe(onChange: () => void): () => void;
  getState(): CurriculumDataState;
  load(): Promise<void>;
  upload(file: File): Promise<void>;
  /** Stops following a job, when the section goes away. */
  stop(): void;
}

export interface StoreDeps {
  fetch: Fetch;
  curriculumId: string;
  /** The CSRF token from /api/me (F5). */
  csrf: () => string;
  /** Called on a 401: the session ran out. */
  onSignedOut: () => void;
  /** Waits between polls; tests replace it. */
  wait?: (ms: number) => Promise<void>;
  /** A new Idempotency-Key per upload, so a retried request makes one job. */
  newKey?: () => string;
}

/** How often a running job is polled. */
export const POLL_MS = 1000;

const STEP_WORDS = {
  pending: 'queued',
  running: 'running',
  done: 'done',
  failed: 'failed',
} as const;

/** The `error` text of a refusal, if the body has one. */
const errorText = (body: unknown): string | null =>
  typeof body === 'object' &&
  body !== null &&
  typeof (body as { error?: unknown }).error === 'string'
    ? (body as { error: string }).error
    : null;

/** The job in a `{ job }` body. */
const jobIn = (body: unknown) =>
  ImportJobViewSchema.safeParse(
    typeof body === 'object' && body !== null ? (body as { job?: unknown }).job : undefined,
  );

const running = (job: ImportJobView | null | undefined) =>
  job?.status === 'queued' || job?.status === 'running';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What changed between two snapshots of a job, as one sentence to read out. */
export function describeProgress(before: ImportJobView | null, after: ImportJobView): string {
  const changed = after.steps.filter((step) => {
    const was = before?.steps.find((s) => s.name === step.name);
    return !was || was.status !== step.status;
  });
  return changed
    .filter((s) => s.status !== 'pending')
    .map((s) => `${s.name}: ${STEP_WORDS[s.status]}${s.result ? `, ${s.result}` : ''}.`)
    .join(' ');
}

/** The sentence read out when a job ends. */
export function describeEnd(data: CurriculumDataResponse): string {
  const { job, version } = data;
  if (!job) return '';
  if (job.status === 'failed') {
    return `Import failed. ${job.error?.message ?? ''} ${job.error?.next_action ?? ''}`.trim();
  }
  if (!version) return 'Import finished.';
  const counts = countIssues(version.groups);
  const checks = `${plural(counts.error, 'error')}, ${plural(counts.warning, 'warning')}, ${counts.info} info`;
  return version.can_publish
    ? `Import finished. Draft version ${version.number} is ready to publish: ${checks}.`
    : `Import finished. Draft version ${version.number} can't be published yet: ${checks}.`;
}

export function createCurriculumDataStore(deps: StoreDeps): CurriculumDataStore {
  const wait = deps.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const newKey = deps.newKey ?? (() => crypto.randomUUID());
  const base = `/api/curricula/${encodeURIComponent(deps.curriculumId)}/imports`;
  const listeners = new Set<() => void>();
  let state: CurriculumDataState = {
    data: null,
    loading: true,
    uploading: false,
    problem: null,
    announcement: '',
  };
  let following: string | null = null;
  let stopped = false;

  const set = (next: Partial<CurriculumDataState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  /** The response body, or null after a refusal the teacher has been told about. */
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
            ? "You can't import into this curriculum."
            : (errorText(body) ?? 'Something went wrong. Try again.'),
      });
      return null;
    }
    return body;
  };

  const load = async (): Promise<void> => {
    stopped = false;
    const body = await call(`${base}/latest`);
    const parsed = CurriculumDataResponseSchema.safeParse(body);
    if (!parsed.success) {
      set({ loading: false });
      return;
    }
    set({ data: parsed.data, loading: false });
    if (running(parsed.data.job)) void follow(parsed.data.job!);
  };

  /** Polls a queued or running job until it ends, then loads the draft it made. */
  const follow = async (job: ImportJobView): Promise<void> => {
    if (following === job.id) return;
    following = job.id;
    let last = job;
    while (!stopped && following === job.id && running(last)) {
      await wait(POLL_MS);
      if (stopped || following !== job.id) return;
      const body = jobIn(await call(`/api/imports/${encodeURIComponent(job.id)}`));
      if (!body.success) {
        following = null;
        return;
      }
      const next = body.data;
      const said = describeProgress(last, next);
      last = next;
      set({
        data: state.data
          ? { ...state.data, job: next }
          : { job: next, unchanged: false, version: null },
        ...(said ? { announcement: said } : {}),
      });
    }
    if (stopped || following !== job.id) return;
    following = null;
    await load();
    if (state.data) set({ announcement: describeEnd(state.data) });
  };

  const upload = async (file: File): Promise<void> => {
    if (state.uploading || running(state.data?.job)) return;
    set({ uploading: true, problem: null, announcement: `Uploading ${file.name}.` });
    const body = await call(base, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-file-name': encodeURIComponent(file.name),
        'idempotency-key': newKey(),
        [CSRF_HEADER]: deps.csrf(),
      },
      body: file,
    });
    const parsed = jobIn(body);
    if (!parsed.success) {
      set({ uploading: false, announcement: state.problem ?? '' });
      return;
    }
    const job = parsed.data;
    set({
      uploading: false,
      // The new job replaces the last one; the version stays until the job makes a new one.
      data: { job, unchanged: false, version: state.data?.version ?? null },
      announcement: `Import started for ${file.name}.`,
    });
    if (running(job)) await follow(job);
    else await load();
  };

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getState: () => state,
    load,
    upload,
    stop() {
      stopped = true;
      following = null;
    },
  };
}
