import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { NAMES_STAY_NOTE } from './privacy';

describe('@ideamap/student', () => {
  it('renders the app shell', () => {
    expect(renderToStaticMarkup(<App />)).toContain('Idea Map · Student');
  });

  // The note is tested under 'signed in' below: it needs the same stubbed window.
});

describe('signed in (M2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders inside the tracker without sending anything during render', () => {
    const me = {
      user: { id: '11111111-1111-4111-8111-111111111111', role: 'student' as const, name: 'Sam' },
      org: { id: '22222222-2222-4222-8222-222222222222', name: 'District' },
      csrfToken: 'token',
      session: { idleMinutes: 30, expiresAt: '2026-10-24T12:00:00.000Z' },
    };
    // The map screen reads the URL while rendering; the server-side test has no window.
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    vi.stubGlobal('location', { pathname: '/', search: '', hash: '' });
    expect(renderToStaticMarkup(<App initial={{ kind: 'signed-in', me }} />)).toContain('Sam');
    expect(fetched).not.toHaveBeenCalled();
  });

  it('has a short note that names stay on the device (A7-U1)', () => {
    const me = {
      user: { id: '11111111-1111-4111-8111-111111111111', role: 'student' as const, name: 'Sam' },
      org: { id: '22222222-2222-4222-8222-222222222222', name: 'District' },
      csrfToken: 'token',
      session: { idleMinutes: 30, expiresAt: '2026-10-24T12:00:00.000Z' },
    };
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('location', { pathname: '/', search: '', hash: '' });
    const html = renderToStaticMarkup(<App initial={{ kind: 'signed-in', me }} />);
    expect(html).toContain('Names stay on your device');
    expect(NAMES_STAY_NOTE.split('.')[0]).toBe('Names stay on your device');
  });
});
