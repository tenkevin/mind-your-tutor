import type { DataTabPage } from '@ideamap/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTabsView } from './DataTabs';
import { V1, V2, mapping, prerequisites, versions } from './fixtures';
import type { DataTabsState } from './store';

const state = (over: Partial<DataTabsState> = {}): DataTabsState => ({
  versions: versions(),
  versionId: V2,
  tab: 'prerequisites',
  code: null,
  offset: 0,
  page: prerequisites(),
  loading: false,
  mapping: mapping(),
  saving: false,
  saved: false,
  problem: null,
  ...over,
});

const noop = () => {};
const render = (s: DataTabsState, mappingOpen = false) =>
  renderToStaticMarkup(
    <DataTabsView
      mappingOpen={mappingOpen}
      state={s}
      onVersion={noop}
      onTab={noop}
      onCode={noop}
      onGo={noop}
      onSaveMapping={noop}
    />,
  );

describe('data tabs (T6)', () => {
  it('T6-F1/U1: five view chips with their names, and a real table with headers', () => {
    const html = render(state());
    for (const name of [
      'Prerequisites',
      'Categories',
      'Standards codes',
      'Media',
      'Assessment questions',
    ]) {
      expect(html).toContain(name);
    }
    expect(html).toMatch(/<table[^>]*>.*<caption[^>]*>Prerequisites of each idea<\/caption>/s);
    expect(html).toMatch(/<th scope="col">Requires \(all must be mastered\)<\/th>/);
    expect(html).toMatch(/<th scope="row"[^>]*>Groundwater<\/th>/);
    expect(html).toContain('aquifer (unknown)');
    expect(html).toContain('None · unlocks from a mastered neighbour');
    expect(html).toContain('aria-pressed="true"');
  });

  it('T6-F2: read-only, pointing to export, edit and re-import; no inputs in the table', () => {
    const html = render(state());
    expect(html).toContain(
      'Read-only. To change this data, export the spreadsheet, edit it, then import a new version.',
    );
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    expect(table).not.toMatch(/<(input|textarea|select|button)/);
  });

  it('T6-F3: labels the version and lists both, published and draft', () => {
    const html = render(state());
    expect(html).toContain('Version 2 · draft · v2.xlsx');
    expect(html).toContain('Version 1 · published · v1.xlsx');
    expect(html).toContain('<label for="ddata-version-select">Version</label>');
    expect(html).toContain('Version 2 (draft)');
  });

  it('never shows the previous version’s rows under another version', () => {
    // Version 1 is selected but version 2's page is still held: no rows, a loading line.
    const html = render(state({ versionId: V1, page: prerequisites(V2, 2), loading: true }));
    expect(html).not.toContain('Groundwater');
    expect(html).toContain('Loading prerequisites…');
    expect(html).toContain('Version 1 (published)');
    // Same for a view the page isn't for.
    const other = render(state({ tab: 'media' }));
    expect(other).not.toContain('Groundwater');
  });

  it('T6-S2: pack text is shown as text, and unusable media says so', () => {
    const evil: DataTabPage = {
      tab: 'media',
      version: { id: V2, number: 2, status: 'draft' },
      total: 2,
      offset: 0,
      limit: 100,
      rows: [
        {
          tab: 'Ideas',
          label: '<img src=x onerror=alert(1)>',
          media_url: 'javascript:alert(1)',
          shows: 'Link',
          usable: false,
        },
        {
          tab: 'Ideas',
          label: '=HYPERLINK("x")',
          media_url: 'https://a.test/a.png',
          shows: 'Image',
          usable: true,
        },
      ],
    };
    const html = render(state({ tab: 'media', page: evil }));
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<(a|iframe|video|audio|script)\b/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Not used: only https links and file names work');
    expect(html).toContain('=HYPERLINK(&quot;x&quot;)');
  });

  it('T6-P1: pages a long view, 100 rows at a time', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      idea_id: `i${i}`,
      title: `Idea ${i}`,
      requires: [],
      status: 'none' as const,
    }));
    const html = render(
      state({
        page: { ...prerequisites(), tab: 'prerequisites', total: 2000, rows } as DataTabPage,
      }),
    );
    expect(html).toContain('Showing 1–100 of 2,000');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Previous<\/button>/);
    expect(html.match(/<tr>/g)?.length).toBe(101);
  });

  it('says so when nothing has been imported', () => {
    const html = render(state({ versions: [], versionId: null, page: null }));
    expect(html).toContain('Nothing has been imported yet');
    expect(html).not.toContain('<table');
  });
});

describe('column mapping editor (T6-F4/F5, T6-U2)', () => {
  it('is closed until opened, as a labelled disclosure button', () => {
    const html = render(state());
    expect(html).toMatch(/aria-expanded="false"[^>]*aria-controls="ddata-mapping-body"/);
    expect(html).not.toContain('<select id="map-');
  });

  it('labels every select, offers the headers the last import saw, and saves for the author', () => {
    const html = render(state(), true);
    expect(html).toMatch(/aria-expanded="true"/);
    const selects = [...html.matchAll(/<select id="(map-[^"]+)"/g)].map((m) => m[1]!);
    expect(selects).toContain('map-Ideas-requires');
    for (const id of selects) expect(html).toContain(`<label for="${id}">`);
    expect(html).toMatch(
      /<select id="map-Ideas-requires"[^>]*>.*?<option value="" selected="">Match by name<\/option><option value="Prereqs">Prereqs<\/option>/,
    );
    expect(html).toContain('Save mapping');
    expect(html).toContain('applies from the next import');
  });

  it('shows the saved source column, and is read-only for anyone but the author or an admin', () => {
    const saved = mapping({
      mapping: [{ tab: 'Ideas', column: 'requires', source_column: 'Prereqs' }],
      can_edit: false,
    });
    const html = render(state({ mapping: saved }), true);
    expect(html).toMatch(/<option value="Prereqs" selected="">Prereqs<\/option>/);
    expect(html).toContain('Only the curriculum&#x27;s author or an admin can change the mapping.');
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).not.toContain('Save mapping');
    // The source line names the mapped column.
    expect(html).toContain('Ideas tab · column Prereqs');
  });
});
