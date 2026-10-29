import {
  LockedIdeaResponseSchema,
  StudentIdeaResponseSchema,
  StudentMapResponseSchema,
  type Pack,
  type VersionDerived,
  type VersionSource,
} from '@ideamap/contracts';
import { json } from '@ideamap/db';
import { hasDatabase } from '@ideamap/db/testing';
import { derive } from '@ideamap/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, signIn, startApi, type Signed, type TestApi } from './test/harness.js';

// S10: the student map for a class's pinned published version, with lock state from
// the server, and the read-only idea page.

describe.skipIf(!hasDatabase)('student map (S10)', () => {
  let api: TestApi;
  let sam: Signed;
  let terry: Signed;
  let derived: VersionDerived;
  let v1: string;
  let baseVersion: { org_id: string; curriculum_id: string; source: VersionSource; pack: Pack };
  const classId = () => api.sample.classes.a1;
  const mapUrl = (q = '') => `/api/classes/${classId()}/map${q}`;

  const addVersion = async (number: number, status: 'draft' | 'published', pack: Pack) =>
    (
      await api.t.db
        .insertInto('curriculum_version')
        .values({
          org_id: baseVersion.org_id,
          curriculum_id: baseVersion.curriculum_id,
          number,
          status,
          pack: json(pack),
          derived: json(derived),
          source: json(baseVersion.source),
          published_at: status === 'published' ? new Date() : null,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;

  beforeAll(async () => {
    api = await startApi();
    const base = await api.t.db
      .selectFrom('curriculum_version')
      .selectAll()
      .where('curriculum_id', '=', api.sample.curricula.a)
      .executeTakeFirstOrThrow();
    baseVersion = base;
    derived = derive(base.pack, { seed: 1 });
    // Published versions are immutable, so each case inserts its own.
    v1 = await addVersion(2, 'published', base.pack);
    sam = await signIn(api, 'google', 'student-a1');
    terry = await signIn(api, 'google', 'teacher-a1');
  });
  afterAll(async () => {
    await api?.close();
  });

  const pin = (id: string | null) =>
    api.t.db
      .updateTable('class')
      .set({ pinned_version_id: id })
      .where('id', '=', classId())
      .execute();

  it('says so plainly when the class has no pinned version (S10-F2)', async () => {
    await pin(null);
    const res = await as(api, sam)('GET', mapUrl());
    expect(res.statusCode, res.body).toBe(200);
    expect(StudentMapResponseSchema.parse(res.json()).map).toBeNull();
  });

  it('draws the pinned version from its stored layout and kept links (S10-F3, S10-F5)', async () => {
    await pin(v1);
    const res = await as(api, sam)('GET', mapUrl());
    const body = StudentMapResponseSchema.parse(res.json());
    const map = body.map!;
    expect(body.preview).toBe(false);
    expect(map.centre).toBe(derived.layout.centre);
    expect(map.ideas).toHaveLength(derived.layout.positions.length);
    for (const idea of map.ideas) {
      const pos = derived.layout.positions.find((p) => p.idea_id === idea.id)!;
      expect([idea.ring, idea.x, idea.y]).toEqual([pos.ring, pos.x, pos.y]);
    }
    // Reading order: the centre first, then ring 1, then ring 2.
    expect(map.ideas.map((i) => i.ring)).toEqual([...map.ideas.map((i) => i.ring)].sort());
    expect(map.links).toHaveLength(derived.ranked_links.kept.length);
    const open = map.ideas.filter((i) => i.state === 'open');
    expect(open.length).toBeGreaterThan(0);
    const locked = map.ideas.filter((i) => i.state === 'locked');
    expect(locked.length).toBeGreaterThan(0);
    for (const idea of locked) expect(idea.unlocksAfter.length).toBeGreaterThan(0);
    // One request, small (S10-P2).
    expect(res.body.length).toBeLessThan(100_000);
  });

  it('sends nothing a student should not see (S10-S3)', async () => {
    const res = await as(api, sam)('GET', mapUrl());
    for (const word of ['notes', 'issues', 'hidden', 'quizzes', 'explanation', 'answer']) {
      expect(res.body).not.toContain(`"${word}"`);
    }
  });

  it('shows the pinned version only, never a draft (S10-F1)', async () => {
    await addVersion(3, 'draft', {
      ...baseVersion.pack,
      course: { ...baseVersion.pack.course, topic: 'DRAFT TOPIC' },
    });
    const res = await as(api, sam)('GET', mapUrl());
    expect(res.body).not.toContain('DRAFT TOPIC');
    expect(res.json().map.versionNumber).toBe(2);
    await pin(v1);
  });

  it('refuses a locked idea by URL, but opens an open one (S10-F5, S10-F6)', async () => {
    const map = (await as(api, sam)('GET', mapUrl())).json().map;
    const locked = map.ideas.find((i: { state: string }) => i.state === 'locked');
    const open = map.ideas.find((i: { state: string }) => i.state === 'open');
    const no = await as(api, sam)('GET', `/api/classes/${classId()}/ideas/${locked.id}`);
    expect(no.statusCode).toBe(403);
    expect(no.body).not.toContain('explanation');
    // It says what unlocks the idea, as the map card does (S10-F5).
    expect(LockedIdeaResponseSchema.parse(no.json())).toMatchObject({
      title: locked.title,
      unlocksAfter: locked.unlocksAfter,
    });
    const yes = await as(api, sam)('GET', `/api/classes/${classId()}/ideas/${open.id}`);
    expect(yes.statusCode, yes.body).toBe(200);
    const page = StudentIdeaResponseSchema.parse(yes.json());
    expect(page.title).toBe(open.title);
    expect(page.explanation).toBeTruthy();
    expect(page.objective).toBeTruthy();
    const missing = await as(api, sam)('GET', `/api/classes/${classId()}/ideas/nope`);
    expect(missing.statusCode).toBe(404);
  });

  it('opens every idea in a teacher preview, and ignores preview for a student (S10-F7, S10-S2)', async () => {
    const preview = StudentMapResponseSchema.parse(
      (await as(api, terry)('GET', mapUrl('?preview=1'))).json(),
    );
    expect(preview.preview).toBe(true);
    expect(preview.map!.ideas.every((i) => i.state === 'open')).toBe(true);
    const normalTeacher = StudentMapResponseSchema.parse(
      (await as(api, terry)('GET', mapUrl())).json(),
    );
    expect(normalTeacher.preview).toBe(false);
    const locked = normalTeacher.map!.ideas.find((i) => i.state === 'locked')!;
    const page = await as(api, terry)(
      'GET',
      `/api/classes/${classId()}/ideas/${locked.id}?preview=1`,
    );
    expect(page.statusCode).toBe(200);

    const sneaky = StudentMapResponseSchema.parse(
      (await as(api, sam)('GET', mapUrl('?preview=1'))).json(),
    );
    expect(sneaky.preview).toBe(false);
    expect(sneaky.map!.ideas.some((i) => i.state === 'locked')).toBe(true);
    const sneakyPage = await as(api, sam)(
      'GET',
      `/api/classes/${classId()}/ideas/${locked.id}?preview=1`,
    );
    expect(sneakyPage.statusCode).toBe(403);
  });

  it('uses an approved AI draft only once approved (S10-F6)', async () => {
    const idea = baseVersion.pack.ideas.find((i) => i.requires.length === 0)!;
    const pack = {
      ...baseVersion.pack,
      ideas: baseVersion.pack.ideas.map((i) =>
        i.idea_id === idea.idea_id ? { ...i, explanation: null } : i,
      ),
    };
    await pin(await addVersion(4, 'published', pack));
    const url = `/api/classes/${classId()}/ideas/${idea.idea_id}`;
    expect((await as(api, sam)('GET', url)).json().explanation).toBeNull();
    await api.t.db
      .insertInto('approved_explanation')
      .values({
        curriculum_id: api.sample.curricula.a,
        idea_id: idea.idea_id,
        org_id: api.sample.orgs.a,
        text: 'An approved draft.',
        source: 'ai',
        approved_by: api.sample.users['teacher-a1'],
      })
      .execute();
    expect((await as(api, sam)('GET', url)).json().explanation).toBe('An approved draft.');
  });

  it('is scoped: another class, another org and signed out (S10-S1)', async () => {
    const otherClass = await signIn(api, 'classlink', 'student-a2');
    expect((await as(api, otherClass)('GET', mapUrl())).statusCode).toBe(403);
    const otherOrg = await signIn(api, 'google', 'student-b1');
    expect((await as(api, otherOrg)('GET', mapUrl())).statusCode).toBe(403);
    expect((await as(api, null)('GET', mapUrl())).statusCode).toBe(401);
  });
});
