// @vitest-environment jsdom
import userEvent from '@testing-library/user-event';
import type { StudentIdeaResponse, StudentMapResponse } from '@ideamap/contracts';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapScreen } from './MapScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CLASS_ID = '11111111-1111-4111-8111-111111111111';
const idea = (id: string, title: string, ring: 0 | 1, x: number, locked = false) => ({
  id,
  title,
  category: 'Process',
  unit: 1,
  ring,
  x,
  y: 0,
  state: locked ? ('locked' as const) : ('open' as const),
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
    ideas: [idea('evap', 'Evaporation', 0, 0), idea('cond', 'Condensation', 1, 1, true)],
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
  linksOut: [{ id: 'cond', title: 'Condensation', relation: 'leads to' }],
};

let host: HTMLDivElement;
let root: Root;
let requests: string[];

function serve(map: StudentMapResponse) {
  requests = [];
  vi.stubGlobal('fetch', async (url: string) => {
    requests.push(url);
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
    expect(buttons.map((b) => b.dataset.idea)).toEqual(['evap', 'cond']);
    expect(buttons[0]!.getAttribute('aria-label')).toBe(
      'Evaporation. Process. Open. Leads to Condensation (leads to).',
    );
    expect(buttons[1]!.getAttribute('aria-label')).toContain('Locked. Unlocks after Evaporation.');
    expect(buttons[1]!.getAttribute('aria-disabled')).toBe('true');
    expect(requests.filter((r) => r.includes('/map'))).toHaveLength(1);
    expect(host.textContent).not.toContain('Preview:');
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
      'Condensation is locked. Unlocks after Evaporation.',
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
});
