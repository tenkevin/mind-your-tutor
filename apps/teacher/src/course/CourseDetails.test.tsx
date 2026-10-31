import type { CourseDetailsResponse } from '@ideamap/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSessionClient, type KeyValue } from '../auth/session';
import { CourseDetails } from './CourseDetails';
import { createCourseForm, type FormDeps } from './form';

// T3: the Course details section (docs/qa/T3.md F2, F4, F5, U1–U3).

const CLASS = '3f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f03';
const CURRICULUM = '4f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f04';

function details(over: Partial<Record<string, [string | null, 'class' | 'curriculum']>> = {}) {
  const base: Record<string, string | null> = {
    subject: 'Science',
    topic: 'The water cycle',
    grade: '6',
    framework: 'NGSS',
    map_objective: 'Explain the water cycle.',
  };
  return {
    classId: CLASS,
    curriculumId: CURRICULUM,
    canEditDefaults: false,
    fields: Object.entries(base).map(([field, curriculumValue]) => {
      const o = over[field];
      return {
        field,
        value: o ? o[0] : curriculumValue,
        origin: o ? o[1] : 'curriculum',
        curriculumValue,
      };
    }),
    readingLevel: {
      grade: '6',
      gradeLabel: 'Grade 6',
      level: 'Middle school',
      style: 's',
      length: 'l',
    },
  } as CourseDetailsResponse;
}

/** A fake API: records writes and answers like the server. */
function fakeApi() {
  let current = details();
  const writes: { method: string; url: string; body: unknown }[] = [];
  let refuse: { status: number; body: unknown } | null = null;
  const fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url === '/api/me') {
      return Response.json({
        user: { id: '1f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f01', role: 'teacher', name: 'Terry' },
        org: { id: '7f8b8f7e-9f7c-4a40-9a5e-0d3c2b1a0f00', name: 'District A' },
        csrfToken: 'x',
        session: { idleMinutes: 480, expiresAt: '2026-10-23T12:00:00.000Z' },
      });
    }
    writes.push({ method, url, body });
    if (refuse) return Response.json(refuse.body, { status: refuse.status });
    const field = url.split('/').pop()!;
    const value = (body as { value?: string | null } | undefined)?.value;
    current = {
      ...current,
      fields: current.fields.map((f) =>
        f.field !== field
          ? f
          : method === 'DELETE'
            ? { ...f, value: f.curriculumValue, origin: 'curriculum' }
            : { ...f, value: value ?? null, origin: 'class' },
      ),
    };
    return Response.json(current);
  }) as typeof globalThis.fetch;
  const store: KeyValue & { data: Map<string, string> } = {
    data: new Map(),
    getItem: (k) => store.data.get(k) ?? null,
    setItem: (k, v) => void store.data.set(k, v),
    removeItem: (k) => void store.data.delete(k),
  };
  const client = createSessionClient({ fetch, store, here: () => '/', go: () => {} });
  return {
    client,
    writes,
    current: () => current,
    refuseWith: (r: typeof refuse) => {
      refuse = r;
    },
  };
}

function setup(over: Partial<FormDeps> = {}) {
  const api = fakeApi();
  const timers: (() => void)[] = [];
  const form = createCourseForm({
    classId: CLASS,
    client: api.client,
    get: async () => api.current(),
    setTimer: (fn) => timers.push(fn) - 1,
    clearTimer: (h) => {
      timers[h as number] = () => {};
    },
    ...over,
  });
  const flushTimers = async () => {
    for (const fn of timers.splice(0)) fn();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { api, form, flushTimers };
}

describe('course form (T3)', () => {
  it('saves typed text once typing pauses, through the F5 client (T3-F5)', async () => {
    const { api, form, flushTimers } = setup();
    await api.client.load();
    await form.load();
    form.type('topic', 'Rain');
    form.type('topic', 'Rain and rivers');
    expect(api.writes).toEqual([]);
    expect(api.client.saveState()).toBe('saved');
    const done = flushTimers();
    expect(api.client.saveState()).toBe('saving');
    await done;
    await new Promise((r) => setTimeout(r, 0));
    expect(api.writes).toEqual([
      {
        method: 'PUT',
        url: `/api/classes/${CLASS}/course/topic`,
        body: { value: 'Rain and rivers' },
      },
    ]);
    expect(api.client.saveState()).toBe('saved');
    const topic = form.getState().details!.fields.find((f) => f.field === 'topic')!;
    expect(topic).toMatchObject({ value: 'Rain and rivers', origin: 'class' });
    expect(form.getState().drafts).toEqual({});
  });

  it('saves on blur at once, and not at all when nothing changed', async () => {
    const { api, form } = setup();
    await api.client.load();
    await form.load();
    form.type('subject', ' Science ');
    await form.commit('subject');
    expect(api.writes).toEqual([]);
    form.type('subject', 'Earth science');
    await form.commit('subject');
    expect(api.writes.map((w) => w.body)).toEqual([{ value: 'Earth science' }]);
  });

  it('saves an emptied optional field as none, and a choice at once', async () => {
    const { api, form } = setup();
    await api.client.load();
    await form.load();
    form.type('map_objective', '   ');
    await form.commit('map_objective');
    await form.choose('grade', '9');
    expect(api.writes.map((w) => [w.url.split('/').pop(), w.body])).toEqual([
      ['map_objective', { value: null }],
      ['grade', { value: '9' }],
    ]);
  });

  it('resets by deleting the override (T3-F4)', async () => {
    const { api, form } = setup();
    await api.client.load();
    await form.load();
    await form.choose('grade', '9');
    await form.reset('grade');
    expect(api.writes.at(-1)).toEqual({
      method: 'DELETE',
      url: `/api/classes/${CLASS}/course/grade`,
      body: undefined,
    });
    expect(form.getState().details!.fields.find((f) => f.field === 'grade')).toMatchObject({
      value: '6',
      origin: 'curriculum',
    });
  });

  it("shows the server's sentence next to the field and keeps the typed text (T3-U3)", async () => {
    const { api, form } = setup();
    await api.client.load();
    await form.load();
    api.refuseWith({
      status: 400,
      body: {
        error: 'Map title (topic) can have at most 200 characters (this has 201).',
        field: 'topic',
      },
    });
    form.type('topic', 'x'.repeat(201));
    await form.commit('topic');
    expect(form.getState().errors.topic).toBe(
      'Map title (topic) can have at most 200 characters (this has 201).',
    );
    expect(form.getState().drafts.topic).toBe('x'.repeat(201));
    expect(api.client.saveState()).toBe('unsaved');
  });

  it('writes curriculum defaults to the curriculum when an author chooses to (T3-F6)', async () => {
    const { api, form } = setup();
    await api.client.load();
    await form.load();
    await form.setTarget('curriculum');
    form.type('subject', 'Physical science');
    await form.commit('subject');
    expect(api.writes.at(-1)!.url).toBe(`/api/curricula/${CURRICULUM}/course/subject`);
  });

  it('keeps typed text in one field when a save of another answers', async () => {
    const { api, form } = setup();
    await api.client.load();
    await form.load();
    form.type('topic', 'Half typed');
    await form.choose('grade', '7');
    expect(form.getState().drafts.topic).toBe('Half typed');
  });
});

describe('CourseDetails view (T3-U1, T3-U2)', () => {
  const html = (
    over: Parameters<typeof details>[0] = {},
    extra: Partial<CourseDetailsResponse> = {},
  ) => {
    const { form } = setup({ get: async () => ({ ...details(over), ...extra }) });
    return form.load().then(() => renderToStaticMarkup(<CourseDetails form={form} />));
  };

  it("shows the design's fields, labels and order", async () => {
    const out = await html();
    const labels = [...out.matchAll(/<label for="[^"]+">([^<]+)<\/label>/g)].map((m) => m[1]);
    expect(labels).toEqual([
      'Subject',
      'Map title (topic)',
      'Grade level',
      'Standards framework',
      'Whole-map objective',
    ]);
    expect(out).toContain('Students see “Science · The water cycle” in the map header.');
    expect(out).toContain('Grade 6 is “Middle school”');
  });

  it('marks each field with its origin, and offers a named reset only for overrides', async () => {
    const out = await html({ topic: ['Rain', 'class'] });
    expect(out.match(/From curriculum/g)).toHaveLength(4);
    expect(out.match(/>This class</g)).toHaveLength(1);
    expect(out.match(/Reset to curriculum/g)).toHaveLength(1);
    expect(out).toContain(
      'aria-label="Reset Map title (topic) to the curriculum value, The water cycle"',
    );
  });

  it('labels every control and ties each to its origin badge', async () => {
    const out = await html();
    for (const m of out.matchAll(/<(input|select|textarea)[^>]*>/g)) {
      const id = /id="([^"]+)"/.exec(m[0])![1];
      expect(out).toContain(`for="${id}"`);
      const describedBy = /aria-describedby="([^"]+)"/.exec(m[0])![1]!;
      expect(out).toMatch(new RegExp(`id="${describedBy}"[^>]*>(From curriculum|This class)`));
    }
  });

  it('renders stored markup as text, never as HTML (T3-S2)', async () => {
    const out = await html({ map_objective: ['<img src=x onerror=alert(1)>', 'class'] });
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('offers the curriculum default only to those who may edit it', async () => {
    expect(await html()).not.toContain('Every class (curriculum default)');
    expect(await html({}, { canEditDefaults: true })).toContain('Every class (curriculum default)');
  });
});
