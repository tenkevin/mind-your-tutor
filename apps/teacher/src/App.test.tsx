import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App, NotForStudents, Shell } from './App';
import { headerTitle } from './shell/Shell';
import { SECTIONS, sectionFor } from './shell/sections';

describe('@ideamap/teacher', () => {
  it('renders the app shell', () => {
    expect(renderToStaticMarkup(<App />)).toContain('Idea Map · Teacher');
  });

  it('shows no teacher shell before sign-in (T1-F1)', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toContain('Preview as student');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('<nav');
  });
});

const me = {
  user: { id: '1f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f01', role: 'teacher' as const, name: 'Terry' },
  org: { id: '7f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f00', name: 'Example District A' },
  csrfToken: 'x',
  session: { idleMinutes: 480, expiresAt: '2026-10-23T12:00:00.000Z' },
};
const header = {
  classId: '3f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f03',
  className: 'Science 6A',
  subject: 'Earth Science',
  topic: 'The Water Cycle',
};

describe('Shell (F5-U3)', () => {
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

describe('Shell header (T1-F2)', () => {
  const html = renderToStaticMarkup(
    <Shell me={me} header={header} studentUrl="https://student.test/" onSignOut={() => {}} />,
  );

  it('names Idea Map and the teacher surface, with subject · topic', () => {
    expect(html).toMatch(/<header[^>]*>.*Idea Map.*Teacher/);
    expect(html).toContain('Earth Science · The Water Cycle');
  });

  it('offers Preview as student, linking to the student app', () => {
    expect(html).toMatch(/<a class="btn btn-secondary[^"]*" href="https:\/\/student.test\/">/);
    expect(html).toContain('Preview as student');
  });

  it('titles the header from what the class has', () => {
    expect(headerTitle('loading')).toBe('');
    expect(headerTitle('none')).toBe('No class yet');
    expect(headerTitle({ ...header, topic: null })).toBe('Earth Science');
    expect(headerTitle({ ...header, subject: null, topic: null })).toBe('Science 6A');
  });

  it('has a page heading for screen readers', () => {
    expect(html).toContain('<h1 class="visually-hidden">Teacher settings: Science 6A</h1>');
  });
});

describe('Shell save state (T1-F4)', () => {
  const status = (saveState: 'saving' | 'saved' | 'unsaved') =>
    renderToStaticMarkup(<Shell me={me} saveState={saveState} onSignOut={() => {}} />).match(
      /<span class="tshell-save" role="status" aria-live="polite"[^>]*>.*?<\/span>/,
    )?.[0];

  it('reads Saving… while a save waits, Saved after, and Not saved on failure', () => {
    expect(status('saving')).toContain('Saving…');
    expect(status('saved')).toMatch(/Saved<\/span>$/);
    expect(status('unsaved')).toContain('Not saved');
    expect(status('saving')).not.toContain('Saved');
  });
});

describe('Shell section nav (T1-F3)', () => {
  const html = renderToStaticMarkup(
    <Shell me={me} header={header} current="sec-cards" onSignOut={() => {}} />,
  );

  it('links each nav item to its section, whose heading names it', () => {
    expect(html).toContain('<nav class="tshell-nav" aria-label="Sections">');
    for (const s of SECTIONS) {
      expect(html).toContain(`href="#${s.id}"`);
      expect(html).toMatch(
        new RegExp(`<section id="${s.id}"[^>]*aria-labelledby="${s.id}-h"><h2 id="${s.id}-h">`),
      );
      expect(html).toContain(`>${s.heading.replace('&', '&amp;')}</h2>`);
    }
  });

  it('marks the section in the URL as current', () => {
    expect(html).toContain('href="#sec-cards" aria-current="location"');
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(sectionFor('#sec-cards')?.label).toBe('Cards');
    expect(sectionFor('#nope')).toBeNull();
  });

  it('matches the design’s six sections, in order, with T8’s Publish after the data', () => {
    expect(SECTIONS.map((s) => s.label)).toEqual([
      'Curriculum data',
      'Publish',
      'Course details',
      'AI personas',
      'Schedule',
      'Cards',
      'From spreadsheet',
    ]);
  });
});

describe('NotForStudents (T1-S2)', () => {
  it('refuses without any teacher shell or data', () => {
    const html = renderToStaticMarkup(<NotForStudents onSignOut={() => {}} />);
    expect(html).toContain('The teacher console is only for teachers.');
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('Preview as student');
  });
});
