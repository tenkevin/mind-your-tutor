// @vitest-environment jsdom
import userEvent from '@testing-library/user-event';
import type { MeResponse, StudentIdeaResponse, StudentMapResponse } from '@ideamap/contracts';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { MapScreen } from './MapScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const idea = (
  id: string,
  title: string,
  ring: 0 | 1,
  x: number,
  locked: 'next' | 'far' | false = false,
) => ({
  id,
  title,
  category: 'Process',
  unit: 1,
  ring,
  x,
  y: 0,
  state: locked || ('open' as const),
  unlocksAfter: locked ? [{ id: 'evap', title: 'Evaporation' }] : [],
});
const response = (over: Partial<StudentMapResponse> = {}): StudentMapResponse => ({
  classId: CLASS_ID,
  className: 'Science 6A',
  preview: false,
  map: {
    versionNumber: 1,
    subject: 'Science',
    topic: 'The water cycle',
    centre: 'evap',
    ideas: [
      idea('evap', 'Evaporation', 0, 0),
      idea('cond', 'Condensation', 1, 1, 'next'),
      {
        ...idea('hidden-1', 'x', 1, 2, 'far'),
        title: null,
        category: null,
        unit: null,
        unlocksAfter: [],
      },
    ],
    links: [{ from: 'evap', to: 'cond', relation: 'leads to', importance: 3 }],
    units: [{ unit: 1, name: 'Water' }],
    categories: [{ category: 'Process', icon: 'arrows-clockwise' }],
  },
  ...over,
});
const page: StudentIdeaResponse = {
  id: 'evap',
  title: 'Evaporation',
  category: 'Process',
  unit: 1,
  unitName: 'Water',
  objective: 'Explain evaporation.',
  explanation: 'Water becomes vapour.',
  keyTerms: [],
  linksIn: [],
  linksOut: [
    { id: 'cond', title: 'Condensation', relation: 'leads to' },
    // A far idea stays hidden on the idea page (D47, S10c).
    { id: null, title: null, relation: 'is a stage of' },
  ],
};

let host: HTMLDivElement;
let root: Root;
let requests: string[];

function serve(map: StudentMapResponse, locked?: unknown) {
  requests = [];
  vi.stubGlobal('fetch', async (url: string) => {
    requests.push(url);
    // The app's own sign-in check never settles, so the signed-in view stays as given.
    if (url === '/api/me') return new Promise<Response>(() => {});
    if (locked && url.includes('/ideas/'))
      return new Response(JSON.stringify(locked), { status: 403 });
    const body =
      url.startsWith('/api/classes/') && url.includes('/ideas/')
        ? page
        : url.includes('/map')
          ? map
          : {
              classes: [
                { id: CLASS_ID, name: 'Science 6A', curriculumId: CLASS_ID, teacherId: CLASS_ID },
              ],
            };
    return new Response(JSON.stringify(body), { status: 200 });
  });
}
async function show() {
  await act(async () => {
    root.render(<MapScreen onSignedOut={() => {}} />);
  });
  await act(async () => {});
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
  history.replaceState(null, '', '/');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

/** A touch or mouse event with a pointer id, which jsdom's plain events lack. */
function pointer(target: Element, type: string, id: number, x: number, y: number) {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(e, 'pointerId', { value: id });
  act(() => {
    target.dispatchEvent(e);
  });
}
const visibleH1 = () =>
  [...host.querySelectorAll('h1')].find((h) => !h.closest('[hidden]'))?.textContent;
const worldTransform = () => host.querySelector<HTMLElement>('.imap-world')!.style.transform;
const scaleOf = () => Number(/scale\(([\d.]+)\)/.exec(worldTransform())![1]);

describe('student map screen (S10)', () => {
  it("says the map isn't published, plainly (F2)", async () => {
    serve(response({ map: null }));
    await show();
    expect(host.textContent).toContain('Your teacher hasn’t published this map yet.');
    expect(host.querySelector('.imap')).toBeNull();
  });

  it('draws each idea as a button that says its title, category, state and links (U2)', async () => {
    serve(response());
    await show();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button[data-idea]')];
    expect(buttons.map((b) => b.dataset.idea)).toEqual(['evap', 'cond', 'hidden-1']);
    expect(buttons[0]!.getAttribute('aria-label')).toBe(
      'Evaporation. Process. Open. Leads to Condensation (leads to).',
    );
    expect(buttons[1]!.getAttribute('aria-label')).toContain('Next up. Unlocks after Evaporation.');
    expect(buttons[1]!.getAttribute('aria-disabled')).toBe('true');
    expect(buttons[2]!.getAttribute('aria-label')).toBe('Hidden idea. Explore nearby to reveal');
    expect(buttons[2]!.textContent).toBe('Hidden ideaExplore nearby to reveal');
    // Different shapes as well as colours (S10b-F4, D17): an arrow, a lock, dashed or dotted.
    expect([...buttons].map((b) => b.className)).toEqual([
      'imap-node imap-centre',
      'imap-node imap-next',
      'imap-node imap-far',
    ]);
    expect(buttons[1]!.querySelector('svg path')?.getAttribute('d')).not.toBe(
      buttons[2]!.querySelector('svg path')?.getAttribute('d'),
    );
    expect(requests.filter((r) => r.includes('/map'))).toHaveLength(1);
    expect(host.textContent).not.toContain('Preview:');
  });

  it("quiets links between locked ideas and lights up a focused idea's neighbours", async () => {
    const base = response().map!;
    const ideas = [
      ...base.ideas,
      idea('prec', 'Precipitation', 1, -1, 'next'),
      idea('rain', 'Rain', 1, 0.5, 'next'),
    ];
    const r = ideas.findIndex((i) => i.id === 'rain');
    ideas[r] = {
      ...ideas[r]!,
      unlocksAfter: ['Condensation', 'Precipitation', 'Clouds', 'Sleet'].map((t) => ({
        id: t,
        title: t,
      })),
    };
    const links = [
      ...base.links,
      { from: 'cond', to: 'prec', relation: 'leads to', importance: 3 },
      { from: 'prec', to: 'rain', relation: 'falls as', importance: 3 },
    ];
    serve(response({ map: { ...base, ideas, links } }));
    await show();
    const edge = (key: string) => host.querySelector(`.imap-edge[data-link="${key}"]`)!;
    expect(edge('evap>cond').classList.contains('imap-edge-quiet')).toBe(false);
    expect(edge('cond>prec').classList.contains('imap-edge-quiet')).toBe(true);

    const prec = host.querySelector<HTMLButtonElement>('[data-idea="prec"]')!;
    act(() => prec.focus());
    expect(edge('cond>prec').classList.contains('imap-edge-hot')).toBe(true);
    expect(edge('evap>cond').classList.contains('imap-edge-faded')).toBe(true);
    const near = [...host.querySelectorAll('.imap-near')].map(
      (n) => (n as HTMLElement).dataset.idea,
    );
    expect(near.sort()).toEqual(['cond', 'rain']);

    // A long "Unlocks after" list is shortened on the card; the label keeps all of it.
    const rain = host.querySelector<HTMLButtonElement>('[data-idea="rain"]')!;
    expect(rain.querySelector('.imap-req-short')!.textContent).toBe(
      'Unlocks after Condensation, Precipitation +2 more',
    );
    expect(rain.getAttribute('aria-label')).toContain(
      'Unlocks after Condensation, Precipitation, Clouds, Sleet.',
    );
  });

  it('opens an open idea with Enter, and Back returns to the map (F6, U1)', async () => {
    serve(response());
    await show();
    const user = userEvent.setup();
    host.querySelector<HTMLButtonElement>('[data-idea="evap"]')!.focus();
    await act(async () => {
      await user.keyboard('{Enter}');
    });
    await act(async () => {});
    expect(location.hash).toBe('#idea=evap');
    expect(host.querySelector('.ipage-title')?.textContent).toBe('Evaporation');
    expect(host.textContent).toContain('Water becomes vapour.');
    expect(host.textContent).toContain('A picture or video for this idea will appear here.');
    expect(host.textContent).toContain('leads to');
    expect(host.textContent).toContain('This idea is a stage of a hidden idea');
    // The map stays mounted behind the page, so its view survives.
    expect(host.querySelector('.imap')).not.toBeNull();
  });

  it('a locked idea does not open, and says why (F5, U1)', async () => {
    serve(response());
    await show();
    const user = userEvent.setup();
    await act(async () => {
      await user.click(host.querySelector('[data-idea="cond"]')!);
    });
    expect(location.hash).toBe('');
    expect(host.querySelector('[role="status"].imap-status')?.textContent).toBe(
      'Condensation is next up. Unlocks after Evaporation.',
    );
    await act(async () => {
      await user.click(host.querySelector('[data-idea="hidden-1"]')!);
    });
    expect(host.querySelector('[role="status"].imap-status')?.textContent).toBe(
      'Hidden idea. Explore nearby to reveal.',
    );
    expect(requests.some((r) => r.includes('/ideas/'))).toBe(false);
  });

  it('shows the preview banner and asks the server for a preview (F7)', async () => {
    history.replaceState(null, '', `/?class=${CLASS_ID}&preview=1`);
    serve(response({ preview: true }));
    await show();
    expect(host.textContent).toContain('Preview: students see locked ideas until they unlock them');
    expect(requests.some((r) => r.endsWith('/map?preview=1'))).toBe(true);
  });

  it('sends no analytics or event calls (S4)', async () => {
    serve(response());
    await show();
    expect(requests.every((r) => r.startsWith('/api/classes'))).toBe(true);
    expect(requests.some((r) => /event|track|analytics/i.test(r))).toBe(false);
  });

  // An idea on the outer ring, near the right edge of the box.
  const edgeMap = () => {
    const base = response();
    base.map!.ideas.push({ ...idea('edge', 'Rain', 1, 2), ring: 1 });
    return base;
  };

  it.each([
    [1280, 800],
    [400, 800],
  ])(
    'a pointer click on a card near the edge opens it the first time, at %i px (F6, U4)',
    async (w, h) => {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: w });
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        value: h,
      });
      serve(edgeMap());
      await show();
      const before = worldTransform();
      const card = host.querySelector<HTMLElement>('[data-idea="edge"]')!;
      const user = userEvent.setup();
      await act(async () => {
        await user.click(card);
      });
      // Pointer focus must not pan the card out from under the pointer.
      expect(worldTransform()).toBe(before);
      expect(location.hash).toBe('#idea=edge');
    },
  );

  it('the keyboard still pans a focused card into view (U1)', async () => {
    serve(edgeMap());
    await show();
    const before = worldTransform();
    await act(async () => {
      host.querySelector<HTMLElement>('[data-idea="edge"]')!.focus();
    });
    expect(worldTransform()).not.toBe(before);
  });

  it('spreading two fingers zooms in, pinching zooms out (U4)', async () => {
    serve(response());
    await show();
    const box = host.querySelector('.imap')!;
    const start = scaleOf();
    pointer(box, 'pointerdown', 1, 440, 300);
    pointer(box, 'pointerdown', 2, 460, 300);
    pointer(box, 'pointermove', 2, 520, 300);
    pointer(box, 'pointermove', 2, 560, 300);
    const spread = scaleOf();
    expect(spread).toBeGreaterThan(start);
    pointer(box, 'pointermove', 2, 480, 300);
    expect(scaleOf()).toBeLessThan(spread);
  });

  it('a locked idea opened by URL says what unlocks it (F5)', async () => {
    history.replaceState(null, '', '/#idea=cond');
    serve(response(), {
      error: 'Locked',
      title: 'Condensation',
      unlocksAfter: [{ id: 'evap', title: 'Evaporation' }],
    });
    await show();
    expect(visibleH1()).toBe('Condensation is locked. Unlocks after Evaporation.');
  });

  it('the idea page has an h1 (U2)', async () => {
    history.replaceState(null, '', '/#idea=evap');
    serve(response());
    await show();
    expect(visibleH1()).toBe('Evaporation');
  });

  it('offers Text size and Calm screen in the header once signed in (U3)', async () => {
    serve(response());
    const me = { user: { name: 'Sam Student' } } as unknown as MeResponse;
    await act(async () => {
      root.render(<App initial={{ kind: 'signed-in', me }} />);
    });
    expect(host.textContent).toContain('Words on the page');
    expect(host.textContent).toContain('Calm screen');
  });
});
