import type { CurriculumDataResponse, IssueGroup } from '@ideamap/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Shell } from '../App';
import { CurriculumDataView } from './CurriculumData';
import { data, job, steps } from './fixtures';
import type { CurriculumDataState } from './store';

const state = (overrides: Partial<CurriculumDataState> = {}): CurriculumDataState => ({
  data: data(),
  loading: false,
  uploading: false,
  problem: null,
  announcement: '',
  ...overrides,
});

const render = (s: CurriculumDataState) =>
  renderToStaticMarkup(
    <CurriculumDataView state={s} onChoose={() => {}} formatTime={() => 'Oct 24, 10:00 AM'} />,
  );

/** The visible text of some markup, tags stripped and entities decoded. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('Curriculum data section (T2)', () => {
  it('T2-F1: offers Import new version, not Re-sync', () => {
    const html = render(state());
    expect(html).toMatch(
      /<button type="button" class="btn btn-primary[^"]*">.*Import new version<\/button>/,
    );
    expect(html).not.toMatch(/re-?sync/i);
    expect(html).toContain('accept=".xlsx,.csv,.json,.zip"');
  });

  it('T2-F2: shows the six steps from the job, with words and icons for status', () => {
    const html = render(
      state({ data: data({ job: job({ status: 'running', steps: steps(2), version: null }) }) }),
    );
    const items = [...html.matchAll(/<li class="cdata-step" data-status="(\w+)">(.*?)<\/li>/g)];
    expect(items.map((m) => m[1])).toEqual([
      'done',
      'done',
      'running',
      'pending',
      'pending',
      'pending',
    ]);
    expect(text(items[0]![2]!)).toContain('Read sheet Done · 18 ideas, 31 links');
    expect(text(items[2]![2]!)).toContain('Rank links Running…');
    expect(text(items[3]![2]!)).toContain('Lay out map Queued');
    // The button is locked while the job runs, and data checks wait for the end.
    expect(html).toContain('disabled=""');
    expect(html).toContain('Importing…');
    expect(html).toContain('Data checks appear here when the import finishes.');
    expect(html).not.toContain('cdata-group');
  });

  it('T2-F3: groups the sample’s checks by cause, errors first, with the fix tab and column', () => {
    const html = render(state());
    expect(text(html)).toContain('Data checks · 1 error, 1 warning, 1 info');
    const groups = [...html.matchAll(/<li class="cdata-group" data-level="(\w+)">(.*?)<\/li>/g)];
    expect(groups.map((g) => g[1])).toEqual(['error', 'warning', 'info']);
    expect(text(groups[0]![2]!)).toContain('Error Unknown prerequisite Fix in Ideas → requires');
    // T2-U3: each id names its sheet row.
    expect(text(groups[0]![2]!)).toContain('Ideas: ground (row 19)');
    expect(text(groups[1]![2]!)).toContain(
      'Warning Missing standard codes Fix in Ideas → standard_codes',
    );
    expect(text(groups[1]![2]!)).toContain('Ideas: rain (row 14)');
    expect(text(groups[2]![2]!)).toContain('Info Missing media Fix in Ideas → media_url');
  });

  it('T2-F4: marks the draft as can’t publish yet, naming the blocker, and offers no Publish', () => {
    const html = render(state());
    expect(html).toContain('data-state="blocked"');
    expect(text(html)).toContain(
      "Can't publish yet. Draft version 1 has 1 error that blocks publishing: Unknown prerequisite.",
    );
    expect(html).not.toMatch(/>\s*Publish\s*</);
  });

  it('T2-F5: a draftable gap is a warning offering an Atlas draft, and doesn’t block', () => {
    const unit: IssueGroup = {
      level: 'warning',
      origin: 'data_check',
      cause: 'unit_objective',
      label: 'Unit without an objective',
      fix: { tab: 'Units', column: 'objective' },
      blocks_publish: false,
      draftable: true,
      issues: [
        {
          message: 'Unit 1 (Water goes up) has no objective; Atlas can draft one.',
          items: ['1'],
          item_rows: [],
          at: null,
        },
      ],
    };
    const base = data();
    const html = render(
      state({
        data: { ...base, version: { ...base.version!, can_publish: true, groups: [unit] } },
      }),
    );
    expect(html).toContain('data-state="ready"');
    expect(text(html)).toContain('Draft version 1 can be published.');
    expect(text(html)).toContain('Warning Unit without an objective Fix in Units → objective');
    expect(text(html)).toContain('Atlas can draft this');
    expect(text(html)).toContain('Units: 1');
  });

  it('T2-F6: a failed import shows C1’s located problems and lists no draft', () => {
    const failed = job({
      status: 'failed',
      steps: steps(0, 0),
      version: null,
      error: {
        message: "The file couldn't be imported: 1 problem must be fixed first.",
        next_action: 'Fix the sheet and upload again.',
        problems: [
          {
            severity: 'error',
            effect: 'blocks_import',
            code: 'column_missing',
            tab: 'Ideas',
            row: null,
            column: 'title',
            value: null,
            fallback: null,
            source: 'Ideas.csv',
            suggestion: null,
            message: 'The Ideas tab has no title column.',
          },
        ],
      },
    });
    const html = render(state({ data: data({ job: failed, version: null }) }));
    expect(text(html)).toContain('Import failed: no draft was made.');
    expect(text(html)).toContain('Ideas, title: The Ideas tab has no title column.');
    expect(text(html)).toContain('Fix the sheet and upload again.');
    expect(text(html)).toContain('Read sheet Failed · 2 problems');
    expect(text(html)).toContain('Check data Not run');
    expect(html).not.toContain('cdata-group');
    expect(html).not.toContain('Draft version');
    // With an earlier version, it says that one is unchanged, without listing it.
    const earlier = render(state({ data: data({ job: failed }) }));
    expect(text(earlier)).toContain('Version 1, from an earlier import, is unchanged.');
    expect(earlier).not.toContain('cdata-group');
    // The card names the failed file as failed, without the earlier version's tabs.
    expect(text(earlier)).toContain('Excel workbook · import failed Oct 24, 10:00 AM');
    expect(text(earlier)).not.toContain(' imported ');
    expect(earlier).not.toContain('cdata-tabs');
  });

  it('T2-F6: an upload refused at the door is shown as an alert', () => {
    const html = render(
      state({
        problem: 'notes.txt is not a spreadsheet. Nothing was imported.',
        data: data({ job: null, version: null }),
      }),
    );
    expect(html).toMatch(/<p class="cdata-problem" role="alert">.*notes.txt is not a spreadsheet/);
    expect(text(html)).toContain('No curriculum imported yet');
    expect(text(html)).toContain('Read sheet Not run yet');
  });

  it('T2-F7: shows the source file, its kind, the import time and an unchanged note', () => {
    const html = render(state({ data: data({ unchanged: true }) }));
    expect(text(html)).toContain('water-cycle.xlsx Excel workbook · imported Oct 24, 10:00 AM');
    expect(text(html)).toContain('Unchanged since last import');
    expect(render(state())).not.toContain('Unchanged since last import');
    expect(text(html)).toContain('Ideas 18');
  });

  it('shows no checks from the previous draft while the new one loads', () => {
    const next = job({
      version: {
        id: '8f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f08',
        number: 2,
        status: 'draft',
        can_publish: false,
      },
    });
    const html = render(state({ data: data({ job: next }) }));
    expect(html).not.toContain('cdata-group');
    expect(html).not.toContain('cdata-publish');
    expect(text(html)).toContain("Loading the new draft's data checks…");
  });

  it('T2-S2: sheet text is shown as text, never as markup', () => {
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const base = data();
    const group: IssueGroup = {
      ...base.version!.groups[0]!,
      issues: [{ message: `${evil} requires "aquifer".`, items: [evil], item_rows: [], at: null }],
    };
    const html = render(
      state({
        data: {
          ...base,
          job: job({ source: { ...base.job!.source, file_name: evil } }),
          version: { ...base.version!, groups: [group] },
        },
        problem: evil,
      }),
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
  });

  it('T2-U2: has a polite live region for progress', () => {
    const html = render(state({ announcement: 'Check data: done, 3 notes.' }));
    expect(html).toContain(
      '<p class="visually-hidden" role="status" aria-live="polite">Check data: done, 3 notes.</p>',
    );
  });

  it('T2-P1: renders a 2,000-idea draft with 300 issues in under a second, folding long groups', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `idea-${i}`);
    const groups: IssueGroup[] = [
      {
        level: 'warning',
        origin: 'data_check',
        cause: 'no_links',
        label: 'Idea with no links',
        fix: { tab: 'Links', column: 'from_id' },
        blocks_publish: false,
        draftable: false,
        issues: ids.slice(0, 298).map((id) => ({
          message: `${id} has no links in the Links tab.`,
          items: [id],
          item_rows: [],
          at: null,
        })),
      },
      {
        level: 'info',
        origin: 'data_check',
        cause: 'media',
        label: 'Missing media',
        fix: { tab: 'Ideas', column: 'media_url' },
        blocks_publish: false,
        draftable: false,
        issues: [{ message: '2000 ideas have no media_url.', items: ids, item_rows: [], at: null }],
      },
      data().version!.groups[0]!,
    ];
    const base = data();
    const big: CurriculumDataResponse = { ...base, version: { ...base.version!, groups } };
    const start = performance.now();
    const html = render(state({ data: big }));
    expect(performance.now() - start).toBeLessThan(1000);
    expect(text(html)).toContain('Data checks · 1 error, 298 warnings, 1 info');
    expect(text(html)).toContain('Show 295 more ');
    expect(html).not.toContain('mores');
    expect(text(html)).toContain('Show all 2,000');
  });

  it('fills the Curriculum data section of the shell', () => {
    const me = {
      user: { id: '1f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f01', role: 'teacher' as const, name: 'Terry' },
      org: { id: '7f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f00', name: 'Example District A' },
      csrfToken: 'x',
      session: { idleMinutes: 480, expiresAt: '2026-10-23T12:00:00.000Z' },
    };
    const html = renderToStaticMarkup(
      <Shell me={me} onSignOut={() => {}} content={{ 'sec-source': <p>curriculum here</p> }} />,
    );
    expect(html).toMatch(/<section id="sec-source"[^>]*>.*<p>curriculum here<\/p><\/section>/);
  });
});
