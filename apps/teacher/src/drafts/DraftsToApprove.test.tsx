import { CSRF_HEADER, type DraftItem, type DraftList } from '@ideamap/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DraftsView } from './DraftsToApprove';
import { createDraftsStore, type DraftsState } from './store';

const item = (over: Partial<DraftItem> & Pick<DraftItem, 'id' | 'kind' | 'tab'>): DraftItem => ({
  key: 'k',
  status: 'pending',
  draft: 'A drafted line.',
  approved: null,
  context: { title: 'Evaporation', detail: [{ label: 'Unit', value: '1: Water goes up' }] },
  ...over,
});
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const list = (items: DraftItem[], waiting = 0): DraftList => ({ items, waiting });
const state = (l: DraftList | null, over: Partial<DraftsState> = {}): DraftsState => ({
  list: l,
  loading: false,
  busy: new Set(),
  problem: null,
  announcement: '',
  ...over,
});
const render = (s: DraftsState) =>
  renderToStaticMarkup(
    <DraftsView state={s} onApprove={() => {}} onReject={() => {}} onRedraft={() => {}} />,
  );

describe('Drafts to approve (A6-U1)', () => {
  it('groups pending drafts by tab with the row context beside each', () => {
    const html = render(
      state(
        list([
          item({ id: ID(1), kind: 'assessment_question', tab: 'Assessment' }),
          item({ id: ID(2), kind: 'idea_explanation', tab: 'Ideas' }),
          item({ id: ID(3), kind: 'unit_objective', tab: 'Units' }),
        ]),
      ),
    );
    const order = ['Idea explanations', 'Unit objectives', 'Assessment questions'].map((h) =>
      html.indexOf(h),
    );
    expect(order.every((n) => n >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('1: Water goes up');
    expect(html).toContain('Approve');
    expect(html).toContain('Reject');
    expect(html).toContain('students don’t see it until you approve');
  });

  it('renders AI text as text, never markup', () => {
    const html = render(
      state(
        list([
          item({
            id: ID(1),
            kind: 'idea_explanation',
            tab: 'Ideas',
            draft: '<img src=x onerror=alert(1)>',
          }),
        ]),
      ),
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('says when drafts are still being written, and when nothing is waiting', () => {
    expect(render(state(list([], 3)))).toContain('3 drafts are being written');
    expect(render(state(list([])))).toContain('Nothing is waiting for your approval');
  });

  it('offers a redraft for a rejected draft and to withdraw an approved one', () => {
    const html = render(
      state(
        list([
          item({ id: ID(1), kind: 'idea_explanation', tab: 'Ideas', status: 'rejected' }),
          item({
            id: ID(2),
            kind: 'unit_objective',
            tab: 'Units',
            status: 'approved',
            approved: 'Final.',
          }),
        ]),
      ),
    );
    expect(html).toContain('Draft again');
    expect(html).toContain('Withdraw approval');
    expect(html).toContain('Final.');
  });
});

describe('the drafts store', () => {
  const setup = (respond: (url: string, init?: RequestInit) => Response) => {
    const calls: { url: string; init?: RequestInit }[] = [];
    let signedOut = 0;
    const store = createDraftsStore({
      fetch: async (url, init) => {
        calls.push({ url, init });
        return respond(url, init);
      },
      curriculumId: 'cur 1',
      csrf: () => 'csrf-token',
      onSignedOut: () => (signedOut += 1),
    });
    return { store, calls, signedOut: () => signedOut };
  };
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('approves with the teacher’s edit, then reloads the queue', async () => {
    const { store, calls } = setup((url) => (url.endsWith('/drafts') ? ok(list([])) : ok({})));
    await store.load();
    await store.approve(ID(1), 'My words.');
    const post = calls.find((c) => c.init?.method === 'POST')!;
    expect(post.url).toBe(`/api/curricula/cur%201/drafts/${ID(1)}/approve`);
    expect(JSON.parse(post.init!.body as string)).toEqual({ text: 'My words.' });
    expect((post.init!.headers as Record<string, string>)[CSRF_HEADER]).toBe('csrf-token');
    expect(calls.at(-1)!.url).toBe('/api/curricula/cur%201/drafts');
    expect(store.getState().announcement).toBe('Draft approved.');
  });

  it('explains a refusal and signs out on a 401', async () => {
    const refused = setup(() => new Response('{}', { status: 403 }));
    await refused.store.load();
    expect(refused.store.getState().problem).toContain("can't review");
    const out = setup(() => new Response('{}', { status: 401 }));
    await out.store.load();
    expect(out.signedOut()).toBe(1);
  });
});
