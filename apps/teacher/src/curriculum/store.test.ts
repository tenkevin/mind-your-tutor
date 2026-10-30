import { CSRF_HEADER } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { CURRICULUM, data, job, steps } from './fixtures';
import { createCurriculumDataStore, describeEnd, describeProgress, type Fetch } from './store';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that answers from a queue of responses per URL, and records each call. */
function fakeFetch(routes: Record<string, Response[]>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init });
    const queue = routes[`${init?.method ?? 'GET'} ${url}`];
    const next = queue?.shift();
    if (!next) throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`);
    return next;
  };
  return { fetch, calls };
}

const LATEST = `GET /api/curricula/${CURRICULUM}/imports/latest`;
const UPLOAD = `POST /api/curricula/${CURRICULUM}/imports`;
const POLL = `GET /api/imports/${job().id}`;

function store(routes: Record<string, Response[]>, wait: () => Promise<void> = async () => {}) {
  const fake = fakeFetch(routes);
  let signedOut = 0;
  const s = createCurriculumDataStore({
    fetch: fake.fetch,
    curriculumId: CURRICULUM,
    csrf: () => 'csrf-token',
    onSignedOut: () => {
      signedOut += 1;
    },
    wait,
    newKey: () => 'key-1',
  });
  return { s, calls: fake.calls, signedOut: () => signedOut };
}

describe('Curriculum data store (T2)', () => {
  it('loads the newest job and version', async () => {
    const { s } = store({ [LATEST]: [json(200, data())] });
    expect(s.getState().loading).toBe(true);
    await s.load();
    expect(s.getState()).toMatchObject({ loading: false, problem: null });
    expect(s.getState().data?.version?.groups).toHaveLength(3);
  });

  it('T2-F1, F2: uploads with the CSRF token and follows each step without a reload', async () => {
    const seen: string[][] = [];
    const queued = job({
      status: 'queued',
      steps: steps(0).map((x) => ({ ...x, status: 'pending' })),
      version: null,
      finished_at: null,
    });
    const { s, calls } = store({
      [LATEST]: [json(200, data({ job: null, version: null })), json(200, data())],
      [UPLOAD]: [json(202, { job: queued })],
      [POLL]: [
        json(200, { job: job({ status: 'running', steps: steps(1), version: null }) }),
        json(200, { job: job({ status: 'running', steps: steps(4), version: null }) }),
        json(200, { job: job() }),
      ],
    });
    s.subscribe(() => {
      const j = s.getState().data?.job;
      if (j) seen.push(j.steps.map((x) => x.status));
    });
    await s.load();
    await s.upload(new File(['x'], 'Water cycle (v2).xlsx'));

    const post = calls.find((c) => c.init?.method === 'POST')!;
    const headers = post.init!.headers as Record<string, string>;
    expect(headers[CSRF_HEADER]).toBe('csrf-token');
    expect(headers['content-type']).toBe('application/octet-stream');
    expect(headers['x-file-name']).toBe('Water%20cycle%20(v2).xlsx');
    expect(headers['idempotency-key']).toBe('key-1');
    expect(post.init!.credentials).toBe('same-origin');

    // Queued, then each poll's steps, then the finished job with its draft.
    expect(seen).toContainEqual(['pending', 'pending', 'pending', 'pending', 'pending', 'pending']);
    expect(seen).toContainEqual(['done', 'running', 'pending', 'pending', 'pending', 'pending']);
    expect(seen).toContainEqual(['done', 'done', 'done', 'done', 'running', 'pending']);
    expect(s.getState().data?.job?.status).toBe('succeeded');
    expect(s.getState().data?.version?.number).toBe(1);
    expect(s.getState().announcement).toBe(
      "Import finished. Draft version 1 can't be published yet: 1 error, 1 warning, 1 info.",
    );
  });

  it('follows a job that was already running when the section opened', async () => {
    const { s } = store({
      [LATEST]: [
        json(200, data({ job: job({ status: 'running', steps: steps(2), version: null }) })),
        json(200, data()),
      ],
      [POLL]: [json(200, { job: job() })],
    });
    await s.load();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(s.getState().data?.job?.status).toBe('succeeded');
  });

  it('shows an upload refusal as text and starts no job', async () => {
    const { s } = store({
      [LATEST]: [json(200, data({ job: null, version: null }))],
      [UPLOAD]: [json(422, { error: 'notes.txt is not a spreadsheet. Nothing was imported.' })],
    });
    await s.load();
    await s.upload(new File(['hello'], 'notes.txt'));
    expect(s.getState()).toMatchObject({
      uploading: false,
      problem: 'notes.txt is not a spreadsheet. Nothing was imported.',
      data: { job: null },
    });
  });

  it('sends the teacher to sign in on a 401, and says 403 plainly', async () => {
    const out = store({ [LATEST]: [json(401, { error: 'Sign in required' })] });
    await out.s.load();
    expect(out.signedOut()).toBe(1);
    const forbidden = store({ [LATEST]: [json(403, { error: 'Forbidden' })] });
    await forbidden.s.load();
    expect(forbidden.s.getState().problem).toBe("You can't import into this curriculum.");
  });

  it('stops polling when the section goes away', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { s, calls } = store(
      {
        [LATEST]: [
          json(200, data({ job: job({ status: 'running', steps: steps(2), version: null }) })),
        ],
        [POLL]: [json(200, { job: job({ status: 'running', steps: steps(3), version: null }) })],
      },
      () => gate,
    );
    await s.load();
    s.stop();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.filter((c) => c.url.startsWith('/api/imports/'))).toHaveLength(0);
  });
});

describe('announcements (T2-U2)', () => {
  it('reads out only the steps that changed', () => {
    const before = job({ status: 'running', steps: steps(1) });
    const after = job({ status: 'running', steps: steps(2) });
    expect(describeProgress(before, after)).toBe('Check data: done, 3 notes. Rank links: running.');
  });

  it('says when an import failed and what to do next', () => {
    const failed = job({
      status: 'failed',
      steps: steps(0, 0),
      version: null,
      error: {
        message: "The file couldn't be imported: 1 problem must be fixed first.",
        next_action: 'Fix the sheet and upload again.',
        problems: [],
      },
    });
    expect(describeEnd(data({ job: failed }))).toBe(
      "Import failed. The file couldn't be imported: 1 problem must be fixed first. Fix the sheet and upload again.",
    );
  });
});
