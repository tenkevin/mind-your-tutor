import { CSRF_HEADER } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { CURRICULUM, data } from '../curriculum/fixtures';
import {
  CLASS1,
  CLASS2,
  DIFF_RESPONSE,
  OPTIONS,
  V1,
  V2,
  draftData,
  previewFor,
  publishResult,
} from './fixtures';
import { createPublishStore, type Fetch } from './store';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that answers from a queue of responses per URL, and records each call. */
function fakeFetch(routes: Record<string, (Response | Promise<Response> | Error)[]>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init });
    const next = routes[`${init?.method ?? 'GET'} ${url}`]?.shift();
    if (!next) throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch, calls };
}

const LATEST = `GET /api/curricula/${CURRICULUM}/imports/latest`;
const OPTS = `GET /api/curricula/${CURRICULUM}/publishing`;
const DIFF = `GET /api/versions/${V2}/diff`;
const PREVIEW = `POST /api/versions/${V2}/preview`;
const PUBLISH = `POST /api/versions/${V2}/publish`;
const PIN = (id: string) => `POST /api/classes/${id}/pin`;

const loaded = () => ({
  [LATEST]: [json(200, draftData())],
  [OPTS]: [json(200, OPTIONS)],
  [DIFF]: [json(200, DIFF_RESPONSE)],
});

function store(routes: Record<string, (Response | Promise<Response> | Error)[]>) {
  const fake = fakeFetch(routes);
  let signedOut = 0;
  const s = createPublishStore({
    fetch: fake.fetch,
    curriculumId: CURRICULUM,
    csrf: () => 'csrf-token',
    onSignedOut: () => {
      signedOut += 1;
    },
    newKey: (() => {
      let n = 0;
      return () => `key-${++n}`;
    })(),
  });
  return { s, calls: fake.calls, signedOut: () => signedOut };
}

describe('Publish store (T8)', () => {
  it('T8-F1, F3: loads the draft, its diff and the classes; none is picked', async () => {
    const { s } = store(loaded());
    expect(s.getState().loading).toBe(true);
    await s.load();
    const state = s.getState();
    expect(state).toMatchObject({ loading: false, selected: [], preview: null, problem: null });
    expect(state.diff?.diff.ideas_added[0]?.title).toBe('Snow');
    expect(state.options?.classes.map((c) => c.pinned_version?.number)).toEqual([1, 1]);
  });

  it('asks for no diff when the newest version is already published', async () => {
    const published = draftData();
    published.version = { ...published.version, status: 'published' };
    const { s, calls } = store({ ...loaded(), [LATEST]: [json(200, published)] });
    await s.load();
    expect(s.getState().diff).toBeNull();
    expect(calls.map((c) => c.url)).not.toContain(`/api/versions/${V2}/diff`);
  });

  it('T8-F4: the audience follows the selection: 4, then 2, then none', async () => {
    const { s, calls } = store({
      ...loaded(),
      [PREVIEW]: [
        json(200, { preview: previewFor([CLASS1], 3) }),
        json(200, { preview: previewFor([CLASS1, CLASS2], 4) }),
        json(200, { preview: previewFor([CLASS2], 2) }),
      ],
    });
    await s.load();
    s.toggleClass(CLASS1);
    s.toggleClass(CLASS2);
    await new Promise((r) => setTimeout(r, 0));
    expect(s.getState().preview?.students_receiving_this_update.count).toBe(4);
    s.toggleClass(CLASS1);
    await new Promise((r) => setTimeout(r, 0));
    expect(s.getState().preview?.students_receiving_this_update.count).toBe(2);
    s.toggleClass(CLASS2);
    expect(s.getState()).toMatchObject({ selected: [], preview: null });
    const previews = calls.filter((c) => c.url === `/api/versions/${V2}/preview`);
    expect(previews).toHaveLength(3);
    expect(JSON.parse(previews[1]!.init!.body as string)).toEqual({ class_ids: [CLASS1, CLASS2] });
  });

  it('a slow preview for an older selection never overwrites the newer one', async () => {
    let release!: (r: Response) => void;
    const slow = new Promise<Response>((r) => (release = r));
    const { s } = store({
      ...loaded(),
      [PREVIEW]: [slow, json(200, { preview: previewFor([CLASS1, CLASS2], 4) })],
    });
    await s.load();
    s.toggleClass(CLASS1);
    s.toggleClass(CLASS2);
    await new Promise((r) => setTimeout(r, 0));
    release(json(200, { preview: previewFor([CLASS1], 3) }));
    await new Promise((r) => setTimeout(r, 0));
    expect(s.getState().preview?.students_receiving_this_update.count).toBe(4);
  });

  it('ignores a class the teacher was not offered', async () => {
    const { s, calls } = store(loaded());
    await s.load();
    s.toggleClass('c9999999-9999-4999-8999-999999999999');
    expect(s.getState().selected).toEqual([]);
    expect(calls.some((c) => c.url.endsWith('/preview'))).toBe(false);
  });

  it('T8-F5, S2: publishing needs the confirm step, sends one request with the CSRF token and a key, then reloads', async () => {
    const after = draftData();
    after.version = { ...after.version, status: 'published' };
    const { s, calls } = store({
      [LATEST]: [json(200, draftData()), json(200, after)],
      [OPTS]: [
        json(200, OPTIONS),
        json(200, {
          ...OPTIONS,
          classes: [
            { ...OPTIONS.classes[0]!, pinned_version: { id: V2, number: 2 } },
            OPTIONS.classes[1]!,
          ],
          published_versions: [
            { id: V2, number: 2, published_at: '2026-10-28T10:00:00.000Z' },
            ...OPTIONS.published_versions,
          ],
        }),
      ],
      [DIFF]: [json(200, DIFF_RESPONSE)],
      [PREVIEW]: [json(200, { preview: previewFor([CLASS1], 3) })],
      [PUBLISH]: [json(201, { publish: publishResult([CLASS1], 3) })],
    });
    await s.load();
    s.toggleClass(CLASS1);
    await new Promise((r) => setTimeout(r, 0));
    // Without the confirm step nothing is sent.
    await s.confirmPublish();
    expect(calls.some((c) => c.url.endsWith('/publish'))).toBe(false);
    s.openConfirm();
    // A double click publishes once.
    await Promise.all([s.confirmPublish(), s.confirmPublish()]);
    const publishes = calls.filter((c) => c.url.endsWith('/publish'));
    expect(publishes).toHaveLength(1);
    const init = publishes[0]!.init!;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ class_ids: [CLASS1] });
    const headers = init.headers as Record<string, string>;
    expect(headers[CSRF_HEADER]).toBe('csrf-token');
    expect(headers['idempotency-key']).toBe('key-1');
    const state = s.getState();
    expect(state.result?.version.number).toBe(2);
    expect(state.result?.classes.map((c) => c.class_id)).toEqual([CLASS1]);
    expect(state.announcement).toBe('Version 2 is published to Period 1.');
    expect(state.confirming).toBe(false);
    expect(state.options?.classes[0]?.pinned_version?.number).toBe(2);
    expect(state.options?.classes[1]?.pinned_version?.number).toBe(1);
    expect(state.latest?.version?.status).toBe('published');
  });

  it('a refused publish keeps the confirm step, shows the reason and retries with the same key', async () => {
    const { s, calls } = store({
      ...loaded(),
      [PREVIEW]: [json(200, { preview: previewFor([CLASS1], 3) })],
      [PUBLISH]: [
        json(422, {
          error: 'Version 2 can’t be published until this error is fixed in the sheet.',
        }),
        new Error('offline'),
      ],
    });
    await s.load();
    s.toggleClass(CLASS1);
    await new Promise((r) => setTimeout(r, 0));
    s.openConfirm();
    await s.confirmPublish();
    expect(s.getState()).toMatchObject({
      confirming: true,
      publishing: false,
      result: null,
      problem: 'Version 2 can’t be published until this error is fixed in the sheet.',
    });
    await s.confirmPublish();
    expect(s.getState().problem).toMatch(/Couldn't reach Idea Map/);
    const keys = calls
      .filter((c) => c.url.endsWith('/publish'))
      .map((c) => (c.init!.headers as Record<string, string>)['idempotency-key']);
    expect(keys).toEqual(['key-1', 'key-1']);
  });

  it('T8-S1: another teacher’s class is refused by the server and nothing is shown as published', async () => {
    const { s } = store({
      ...loaded(),
      [PREVIEW]: [json(200, { preview: previewFor([CLASS1], 3) })],
      [PUBLISH]: [
        json(403, { error: 'You can only publish to classes you teach. Nothing was published.' }),
      ],
    });
    await s.load();
    s.toggleClass(CLASS1);
    await new Promise((r) => setTimeout(r, 0));
    s.openConfirm();
    await s.confirmPublish();
    expect(s.getState().result).toBeNull();
    expect(s.getState().problem).toBe(
      'You can only publish to classes you teach. Nothing was published.',
    );
  });

  it('cannot open the confirm step when the preview says the draft can’t be published', async () => {
    const { s } = store({
      ...loaded(),
      [PREVIEW]: [json(200, { preview: previewFor([CLASS1], 3, false) })],
    });
    await s.load();
    s.toggleClass(CLASS1);
    await new Promise((r) => setTimeout(r, 0));
    s.openConfirm();
    expect(s.getState().confirming).toBe(false);
  });

  it('T8-F6: rollback asks first, then re-pins with the CSRF token and reloads', async () => {
    const two = {
      ...OPTIONS,
      classes: [
        { ...OPTIONS.classes[0]!, pinned_version: { id: V2, number: 2 } },
        OPTIONS.classes[1]!,
      ],
      published_versions: [
        { id: V2, number: 2, published_at: '2026-10-28T10:00:00.000Z' },
        ...OPTIONS.published_versions,
      ],
    };
    const { s, calls } = store({
      [LATEST]: [json(200, data()), json(200, data())],
      [OPTS]: [json(200, two), json(200, OPTIONS)],
      [PIN(CLASS1)]: [
        json(200, {
          pin: {
            version: {
              id: V1,
              number: 1,
              status: 'published',
              published_at: '2026-10-20T10:00:00.000Z',
            },
            class: { class_id: CLASS1, from_version_id: V2, to_version_id: V1 },
          },
        }),
      ],
    });
    await s.load();
    s.askRepin(CLASS1, V1);
    expect(calls.some((c) => c.url.endsWith('/pin'))).toBe(false);
    await s.confirmRepin();
    const pin = calls.find((c) => c.url.endsWith('/pin'))!;
    expect(JSON.parse(pin.init!.body as string)).toEqual({ version_id: V1 });
    expect((pin.init!.headers as Record<string, string>)[CSRF_HEADER]).toBe('csrf-token');
    expect(s.getState().repinned?.version.number).toBe(1);
    expect(s.getState().announcement).toBe('Period 1 is back on version 1.');
    expect(s.getState().options?.classes[0]?.pinned_version?.number).toBe(1);
  });

  it('reloading clears the earlier version’s checks first, so they never show beside the new ones', async () => {
    let release!: (r: Response) => void;
    const slow = new Promise<Response>((r) => (release = r));
    const { s } = store({
      ...loaded(),
      [LATEST]: [json(200, draftData()), slow],
      [OPTS]: [json(200, OPTIONS), json(200, OPTIONS)],
    });
    await s.load();
    expect(s.getState().latest?.version?.number).toBe(2);
    const reload = s.load();
    expect(s.getState()).toMatchObject({ loading: true, latest: null, diff: null, options: null });
    release(json(200, data({ version: null, job: null })));
    await reload;
    expect(s.getState().loading).toBe(false);
  });

  it('a 401 signs the teacher out', async () => {
    const { s, signedOut } = store({
      [LATEST]: [json(401, { error: 'Sign in to continue.' })],
      [OPTS]: [json(401, { error: 'Sign in to continue.' })],
    });
    await s.load();
    expect(signedOut()).toBeGreaterThan(0);
  });
});
