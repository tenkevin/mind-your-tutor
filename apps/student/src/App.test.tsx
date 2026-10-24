import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('@ideamap/student', () => {
  it('renders the app shell', () => {
    expect(renderToStaticMarkup(<App />)).toContain('Idea Map · Student');
  });
});

describe('signed in (M2)', () => {
  it('renders inside the tracker without sending anything during render', () => {
    const me = {
      user: { id: '11111111-1111-4111-8111-111111111111', role: 'student' as const, name: 'Sam' },
      org: { id: '22222222-2222-4222-8222-222222222222', name: 'District' },
      csrfToken: 'token',
      session: { idleMinutes: 30, expiresAt: '2026-10-24T12:00:00.000Z' },
    };
    expect(renderToStaticMarkup(<App initial={{ kind: 'signed-in', me }} />)).toContain('Hi, Sam.');
  });
});
