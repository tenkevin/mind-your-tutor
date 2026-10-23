import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App, Shell } from './App';

describe('@ideamap/teacher', () => {
  it('renders the app shell', () => {
    expect(renderToStaticMarkup(<App />)).toContain('Idea Map · Teacher');
  });
});

describe('Shell (F5-U3)', () => {
  const me = {
    user: { id: '1f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f01', role: 'teacher' as const, name: 'Terry' },
    org: { id: '7f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f00', name: 'Example District A' },
    csrfToken: 'x',
    session: { idleMinutes: 480, expiresAt: '2026-10-23T12:00:00.000Z' },
  };

  it('says when kept edits still need saving, and offers to try again', () => {
    const html = renderToStaticMarkup(<Shell me={me} pending={2} onSignOut={() => {}} />);
    expect(html).toContain('2 changes from before you signed in haven&#x27;t been saved yet.');
    expect(html).toContain('Try again');
  });

  it('says nothing when every edit is saved', () => {
    const html = renderToStaticMarkup(<Shell me={me} pending={0} onSignOut={() => {}} />);
    expect(html).not.toContain('role="alert"');
  });
});
