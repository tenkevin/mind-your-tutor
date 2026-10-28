import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { NAMES_STAY_NOTE } from './privacy';

describe('@ideamap/student', () => {
  it('renders the app shell', () => {
    expect(renderToStaticMarkup(<App />)).toContain('Idea Map · Student');
  });

  it('has a short note that names stay on the device (A7-U1)', () => {
    const view = { kind: 'signed-in' as const, me: { user: { name: 'Student' } } };
    const html = renderToStaticMarkup(<App initial={view as never} />);
    expect(html).toContain('Names stay on your device');
    expect(NAMES_STAY_NOTE.split('.')[0]).toBe('Names stay on your device');
  });
});
