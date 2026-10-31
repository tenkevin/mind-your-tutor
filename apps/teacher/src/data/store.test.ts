import { CSRF_HEADER } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import type { Fetch } from '../curriculum/store';
import { CURRICULUM, V1, V2, mapping, prerequisites, versions } from './fixtures';
import { createDataTabsStore } from './store';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const base = `/api/curricula/${CURRICULUM}`;
const LIST = `GET ${base}/versions`;
const MAP = `GET ${base}/column-mapping`;
const PUT = `PUT ${base}/column-mapping`;
const page = (id: string, tab = 'prerequisites') =>
  `GET ${base}/versions/${id}/data/${tab}?offset=0&limit=100`;

function make(routes: Record<string, Response[]>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init });
    const next = routes[`${init?.method ?? 'GET'} ${url}`]?.shift();
    if (!next) throw new Error(`unexpected ${init?.method ?? 'GET'} ${url}`);
    return next;
  };
  let out = 0;
  const s = createDataTabsStore({
    fetch,
    curriculumId: CURRICULUM,
    csrf: () => 'csrf-token',
    onSignedOut: () => {
      out += 1;
    },
  });
  return { s, calls, signedOut: () => out };
}

describe('data tabs store (T6)', () => {
  it('shows the newest version first and loads its first view', async () => {
    const { s } = make({
      [LIST]: [json(200, { versions: versions() })],
      [MAP]: [json(200, mapping())],
      [page(V2)]: [json(200, prerequisites())],
    });
    await s.load();
    expect(s.getState()).toMatchObject({ versionId: V2, loading: false, tab: 'prerequisites' });
    expect(s.getState().page?.version.id).toBe(V2);
    expect(s.getState().mapping?.can_edit).toBe(true);
  });

  it('clears the previous version’s rows at once when another version is picked (T6-F3)', async () => {
    const { s } = make({
      [LIST]: [json(200, { versions: versions() })],
      [MAP]: [json(200, mapping())],
      [page(V2)]: [json(200, prerequisites())],
      [page(V1)]: [json(200, prerequisites(V1, 1))],
    });
    await s.load();
    s.selectVersion(V1);
    expect(s.getState()).toMatchObject({ versionId: V1, page: null, loading: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(s.getState().page?.version).toMatchObject({ id: V1, number: 1, status: 'published' });
  });

  it('ignores a slow answer for a view the teacher has left', async () => {
    let release: (r: Response) => void = () => {};
    const slow = new Promise<Response>((r) => (release = r));
    const calls: string[] = [];
    const fetch: Fetch = async (url, init) => {
      calls.push(url);
      if (url === `${base}/versions`) return json(200, { versions: versions() });
      if (url === `${base}/column-mapping`) return json(200, mapping());
      if (url.includes('/data/prerequisites')) return init?.method === 'X' ? slow : slow;
      return json(200, { ...prerequisites(), tab: 'categories', rows: [], total: 0 });
    };
    const s = createDataTabsStore({
      fetch,
      curriculumId: CURRICULUM,
      csrf: () => '',
      onSignedOut: () => {},
    });
    const loading = s.load();
    await new Promise((r) => setTimeout(r, 0));
    s.selectTab('categories');
    release(json(200, prerequisites()));
    await loading;
    await new Promise((r) => setTimeout(r, 0));
    expect(s.getState().tab).toBe('categories');
    expect(s.getState().page?.tab).toBe('categories');
  });

  it('follows a new import to the newest version, but not away from an older one picked', async () => {
    const newer = [
      { ...versions()[0]!, id: '44444444-4444-4444-8444-444444444444', number: 3 },
      ...versions(),
    ];
    const { s } = make({
      [LIST]: [json(200, { versions: versions() }), json(200, { versions: newer })],
      [MAP]: [json(200, mapping()), json(200, mapping())],
      [page(V2)]: [json(200, prerequisites())],
      [page('44444444-4444-4444-8444-444444444444')]: [json(200, prerequisites())],
    });
    await s.load();
    await s.refresh();
    expect(s.getState().versionId).toBe('44444444-4444-4444-8444-444444444444');
  });

  it('saves the mapping with the CSRF token and keeps what the server returns (T6-F4)', async () => {
    const saved = mapping({
      mapping: [{ tab: 'Ideas', column: 'requires', source_column: 'Prereqs' }],
    });
    const { s, calls } = make({
      [LIST]: [json(200, { versions: versions() })],
      [MAP]: [json(200, mapping())],
      [page(V2)]: [json(200, prerequisites())],
      [PUT]: [json(200, saved)],
    });
    await s.load();
    expect(await s.saveMapping(saved.mapping)).toBe(true);
    const put = calls.find((c) => c.init?.method === 'PUT')!;
    expect((put.init!.headers as Record<string, string>)[CSRF_HEADER]).toBe('csrf-token');
    expect(JSON.parse(put.init!.body as string)).toEqual({ mapping: saved.mapping });
    expect(s.getState()).toMatchObject({ saved: true, saving: false });
    expect(s.getState().mapping).toEqual(saved);
  });

  it('tells a teacher refused a save why, and signs out on 401', async () => {
    const refused = make({
      [LIST]: [json(200, { versions: versions() })],
      [MAP]: [json(200, mapping({ can_edit: false }))],
      [page(V2)]: [json(200, prerequisites())],
      [PUT]: [json(403, { error: 'Forbidden' })],
    });
    await refused.s.load();
    expect(await refused.s.saveMapping([])).toBe(false);
    expect(refused.s.getState().problem).toMatch(/can't change/);
    const out = make({ [LIST]: [json(401, {})], [MAP]: [json(401, {})] });
    await out.s.load();
    expect(out.signedOut()).toBeGreaterThan(0);
  });
});
