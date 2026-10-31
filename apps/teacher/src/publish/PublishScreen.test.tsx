import type { CurriculumDiff } from '@ideamap/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CURRICULUM } from '../curriculum/fixtures';
import { DiffView, PublishView } from './PublishScreen';
import {
  CLASS1,
  CLASS2,
  DIFF,
  DIFF_RESPONSE,
  OPTIONS,
  V1,
  draftData,
  previewFor,
} from './fixtures';
import { createPublishStore, type PublishState } from './store';

const idle = createPublishStore({
  fetch: async () => new Response('{}'),
  curriculumId: CURRICULUM,
  csrf: () => '',
  onSignedOut: () => {},
});

const state = (overrides: Partial<PublishState> = {}): PublishState => ({
  loading: false,
  latest: draftData(),
  diff: DIFF_RESPONSE,
  options: OPTIONS,
  selected: [],
  preview: null,
  previewing: false,
  confirming: false,
  publishing: false,
  result: null,
  repinning: null,
  repinBusy: false,
  repinned: null,
  problem: null,
  announcement: '',
  ...overrides,
});

const render = (s: PublishState) =>
  renderToStaticMarkup(<PublishView state={s} store={idle} formatTime={() => 'Oct 20, 2026'} />);

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;])/g, '$1');

describe('Publish screen (T8)', () => {
  it('T8-F1: the diff reads in teacher language, by display name', () => {
    const t = text(render(state()));
    expect(t).toContain('Changes from version 1 to version 2');
    expect(t).toContain('Added Snow · Unit 2: Water falls');
    expect(t).toContain('Removed Fog · Unit 1: Water goes up');
    expect(t).toContain('Rain → Rainfall');
    expect(t).toContain('Runoff now needs Ground');
    expect(t).toContain('Cloud: Unit 1: Water goes up → Unit 2: Water falls');
    expect(t).toContain('Removed Why does it rain?');
    expect(t).toContain('Added What makes rain fall?');
    // T8-U1: no raw ids where a name exists.
    const diffText = t.slice(t.indexOf('Changes from version'));
    for (const id of ['snow', 'fog', 'runoff', 'cloud'])
      expect(diffText).not.toMatch(new RegExp(`\\b${id}\\b`));
    expect(render(state())).not.toContain('idea_id');
  });

  it('a first publish and an empty diff say so', () => {
    const none: CurriculumDiff = { ...DIFF, empty: true, ideas_added: [], ideas_removed: [] };
    const first = renderToStaticMarkup(
      <DiffView diff={{ ...DIFF, first_publish: true }} fromNumber={null} toNumber={1} />,
    );
    expect(text(first)).toContain('Version 1 would be the first published version');
    const empty = renderToStaticMarkup(
      <DiffView
        diff={{
          ...none,
          ideas_renamed: [],
          prerequisites_changed: [],
          units_changed: [],
          assessment_changed: [],
        }}
        fromNumber={1}
        toNumber={2}
      />,
    );
    expect(text(empty)).toContain('Nothing changed from version 1.');
  });

  it('T8-F2: the blocking error is shown with its fix, and Publish is disabled with the reason', () => {
    const html = render(state({ latest: draftData(false), selected: [CLASS1] }));
    const t = text(html);
    expect(t).toContain("Can't publish yet. Draft version 2 has 1 error");
    expect(t).toContain('Error Unknown prerequisite Fix in Ideas → requires');
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*aria-describedby="[^"]+"[^>]*>Publish to 1 class</,
    );
    expect(t).toContain('Version 2 has errors that block publishing. Fix them in the sheet');
    // The checks come before the diff.
    expect(html.indexOf('Data checks')).toBeLessThan(html.indexOf('Changes from version'));
  });

  it('T8-F3, U2: lists the classes with their pinned versions as labelled checkboxes, none ticked', () => {
    const html = render(state());
    const boxes = [
      ...html.matchAll(/<label class="pub-class"><input type="checkbox"([^>]*)\/>(.*?)<\/label>/g),
    ];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => !b[1]!.includes('checked'))).toBe(true);
    expect(text(boxes[0]![2]!)).toBe(' Period 1 now on version 1 ');
    expect(html).toContain('<legend');
    expect(text(html)).toContain('Publish to 0 classes');
    expect(text(html)).toContain('Pick at least one class to publish to.');
  });

  it('T8-F4, U1: shows Students receiving this update and a button that says what will happen', () => {
    const none = text(render(state()));
    expect(none).toMatch(/Students receiving this update 0/);
    const html = render(
      state({ selected: [CLASS1, CLASS2], preview: previewFor([CLASS1, CLASS2], 4) }),
    );
    expect(text(html)).toMatch(/Students receiving this update 4/);
    expect(html).toMatch(
      /<button type="button" class="btn btn-primary"[^>]*>Publish to 2 classes</,
    );
    expect(html).not.toMatch(/Publish to 2 classes<\/button>[^]*disabled/);
    const one = render(state({ selected: [CLASS1], preview: previewFor([CLASS1], 3) }));
    expect(one).toContain('Publish to 1 class<');
  });

  it('T8-S2: the confirm step names the classes and the student count', () => {
    const html = render(
      state({
        selected: [CLASS1, CLASS2],
        preview: previewFor([CLASS1, CLASS2], 4),
        confirming: true,
      }),
    );
    const t = text(html);
    expect(t).toContain('Publish version 2?');
    expect(t).toContain('2 classes will move to version 2: Period 1, Period 2.');
    expect(t).toContain('4 students will see the new map.');
    expect(t).toContain('Yes, publish to 2 classes');
    expect(t).toContain('Cancel');
    // The primary button is replaced by the confirm step, not shown beside it.
    expect(html).not.toMatch(/>Publish to 2 classes</);
  });

  it('T8-F5: the success state names the classes and the version, and says the others are unchanged', () => {
    const html = render(
      state({
        latest: { ...draftData(), version: { ...draftData().version, status: 'published' } },
        diff: null,
        result: {
          version: { id: V1, number: 2, status: 'published', published_at: null },
          classes: [{ class_id: CLASS1, from_version_id: V1, to_version_id: V1 }],
          students_receiving_this_update: {
            label: 'Students receiving this update',
            count: 3,
            class_ids: [CLASS1],
          },
        },
        announcement: 'Version 2 is published to Period 1.',
      }),
    );
    const t = text(html);
    expect(t).toContain('Version 2 is published to Period 1.');
    expect(t).toContain('Students receiving this update: 3');
    expect(t).toContain('Your other classes are unchanged.');
    expect(html).toContain('role="status" aria-live="polite">Version 2 is published to Period 1.');
    expect(t).not.toContain('Changes from version');
  });

  it('T8-F6: offers only earlier published versions, and asks before re-pinning', () => {
    const options = {
      classes: [{ id: CLASS1, name: 'Period 1', pinned_version: { id: V2P, number: 2 } }],
      published_versions: [
        { id: V3P, number: 3, published_at: '2026-10-29T10:00:00.000Z' },
        { id: V2P, number: 2, published_at: '2026-10-28T10:00:00.000Z' },
        { id: V1, number: 1, published_at: '2026-10-20T10:00:00.000Z' },
      ],
    };
    const html = render(state({ options, latest: null, diff: null }));
    const t = text(html);
    expect(t).toContain('Period 1 is on version 2');
    expect(t).toContain('Version 1 · published Oct 20, 2026');
    // Class on v2 with v1 and v3 published: only v1 is offered.
    expect(t).not.toContain('Version 3 · published');
    expect(t).not.toContain('Version 2 · published');
    expect(html).not.toContain('aria-label="Put Period 1 on version 3"');
    expect(html).toContain('aria-label="Put Period 1 on version 1"');
    // A class already on the oldest version has nothing to go back to.
    const oldest = render(
      state({
        options: {
          ...options,
          classes: [{ ...options.classes[0]!, pinned_version: { id: V1, number: 1 } }],
        },
        latest: null,
        diff: null,
      }),
    );
    expect(text(oldest)).toContain('No earlier version to roll back to.');
    expect(oldest).not.toContain('Put Period 1 on version');
    const asking = render(
      state({ options, latest: null, diff: null, repinning: { classId: CLASS1, versionId: V1 } }),
    );
    expect(text(asking)).toContain('Put Period 1 on version 1? Its students will see that version');
    expect(text(asking)).toContain('Yes, use version 1');
  });

  it('shows nothing from the previous version while the new checks load', () => {
    const html = render(state({ loading: true, latest: null, diff: null, options: null }));
    expect(html).not.toContain('cdata-group');
    expect(html).not.toContain('cdata-tabs');
    expect(text(html)).toContain('Loading the draft and your classes…');
  });

  it('a teacher with no classes on this curriculum is told so', () => {
    const t = text(render(state({ options: { classes: [], published_versions: [] } })));
    expect(t).toContain("You don't teach any class on this curriculum.");
  });

  it('T8-P1: 2,000 ideas of changes render in well under a second, folded', () => {
    const ideas = Array.from({ length: 2000 }, (_, i) => ({
      idea_id: `idea-${i}`,
      title: `Idea ${i}`,
      unit: { unit: 1 + (i % 5), name: `Unit name ${i % 5}` },
    }));
    const big: CurriculumDiff = { ...DIFF, ideas_added: ideas, ideas_removed: ideas };
    const started = performance.now();
    const html = renderToStaticMarkup(<DiffView diff={big} fromNumber={1} toNumber={2} />);
    const took = performance.now() - started;
    expect(took).toBeLessThan(1000);
    expect((html.match(/<li>/g) ?? []).length).toBeLessThan(200);
    expect(text(html)).toContain('Show 1,975 more');
    expect(text(html)).toContain('Ideas added · 2,000');
  });
});

const V3P = '33333333-3333-4333-8333-333333333333';
const V2P = '22222222-2222-4222-8222-222222222222';
