import {
  CourseDetailsResponseSchema,
  CurriculumCourseResponseSchema,
  type CourseDetailsResponse,
  type CourseField,
} from '@ideamap/contracts';
import { hasDatabase } from '@ideamap/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { as, sessionFor, startApi, type Signed, type TestApi } from './test/harness.js';

// T3: Course details with layered configuration (docs/qa/T3.md).

const field = (details: CourseDetailsResponse, name: CourseField) =>
  details.fields.find((f) => f.field === name)!;

describe.skipIf(!hasDatabase)('course details (T3)', () => {
  let api: TestApi;
  let who: Record<
    'teacherA' | 'teacherB' | 'author' | 'admin' | 'student' | 'otherOrgTeacher' | 'otherOrgAdmin',
    Signed
  >;
  let classA = '';
  let classB = '';
  let curriculum = '';

  beforeAll(async () => {
    api = await startApi();
    const { users, orgs, classes, curricula } = api.sample;
    classA = classes.a1;
    classB = classes.a2;
    curriculum = curricula.a;
    who = {
      teacherA: await sessionFor(api, users['teacher-a1'], orgs.a),
      teacherB: await sessionFor(api, users['teacher-a2'], orgs.a),
      author: await sessionFor(api, users['author-a'], orgs.a),
      admin: await sessionFor(api, users['admin-a'], orgs.a),
      student: await sessionFor(api, users['student-a1'], orgs.a),
      otherOrgTeacher: await sessionFor(api, users['teacher-b1'], orgs.b),
      otherOrgAdmin: await sessionFor(api, users['admin-b'], orgs.b),
    };
  });
  afterAll(async () => {
    await api?.close();
  });

  // Each test starts from the seeded state: no class overrides, defaults of grade 6.
  beforeEach(async () => {
    await api.t.db
      .updateTable('class_config')
      .set({ config: '{}' as never })
      .execute();
    await api.t.db
      .updateTable('curriculum_defaults')
      .set({ config: JSON.stringify({ course: { grade: '6' } }) as never })
      .execute();
  });

  const details = async (signed: Signed, classId = classA) => {
    const res = await as(api, signed)('GET', `/api/classes/${classId}/course`);
    expect(res.statusCode, res.body).toBe(200);
    return CourseDetailsResponseSchema.parse(res.json());
  };
  const put = (signed: Signed, name: string, value: unknown, classId = classA) =>
    as(api, signed)('PUT', `/api/classes/${classId}/course/${name}`, { value });
  const reset = (signed: Signed, name: string, classId = classA) =>
    as(api, signed)('DELETE', `/api/classes/${classId}/course/${name}`);
  const storedConfig = async (classId: string) =>
    (
      await api.t.db
        .selectFrom('class_config')
        .select('config')
        .where('class_id', '=', classId)
        .executeTakeFirstOrThrow()
    ).config;

  it('shows the five course fields in the design order, with effective values (T3-F1)', async () => {
    const d = await details(who.teacherA);
    expect(d.fields.map((f) => [f.field, f.value])).toEqual([
      ['subject', 'Science'],
      ['topic', 'The water cycle'],
      ['grade', '6'],
      ['framework', 'NGSS'],
      [
        'map_objective',
        'Explain how water moves around the Earth in a never-ending cycle, and what powers it.',
      ],
    ]);
    expect(d.classId).toBe(classA);
    expect(d.curriculumId).toBe(curriculum);
  });

  it('marks each field "curriculum" until the class overrides it (T3-F2)', async () => {
    expect((await details(who.teacherA)).fields.every((f) => f.origin === 'curriculum')).toBe(true);
    const res = await put(who.teacherA, 'topic', 'Rain and rivers');
    expect(res.statusCode, res.body).toBe(200);
    const after = await details(who.teacherA);
    expect(after.fields.filter((f) => f.origin === 'class').map((f) => f.field)).toEqual(['topic']);
    expect(field(after, 'topic')).toEqual({
      field: 'topic',
      value: 'Rain and rivers',
      origin: 'class',
      curriculumValue: 'The water cycle',
    });
    // The write answers with the same state a reload shows.
    expect(CourseDetailsResponseSchema.parse(res.json())).toEqual(after);
  });

  it('keeps an override to its class; the curriculum default is unchanged (T3-F3, D3)', async () => {
    expect((await put(who.teacherA, 'topic', 'Rain and rivers')).statusCode).toBe(200);
    expect(field(await details(who.teacherB, classB), 'topic')).toMatchObject({
      value: 'The water cycle',
      origin: 'curriculum',
    });
    const defaults = await as(api, who.author)('GET', `/api/curricula/${curriculum}/course`);
    expect(
      CurriculumCourseResponseSchema.parse(defaults.json()).fields.find((f) => f.field === 'topic'),
    ).toMatchObject({ value: 'The water cycle' });
  });

  it('resets to the curriculum by removing the override, not emptying it (T3-F4)', async () => {
    await put(who.teacherA, 'topic', 'Rain and rivers');
    await put(who.teacherA, 'subject', 'Earth science');
    const res = await reset(who.teacherA, 'topic');
    expect(res.statusCode, res.body).toBe(200);
    expect(field(CourseDetailsResponseSchema.parse(res.json()), 'topic')).toMatchObject({
      value: 'The water cycle',
      origin: 'curriculum',
    });
    expect(await storedConfig(classA)).toEqual({ course: { subject: 'Earth science' } });
    // Resetting the last override removes the course object too.
    await reset(who.teacherA, 'subject');
    expect(await storedConfig(classA)).toEqual({});
    // A reset with nothing to reset changes nothing.
    expect((await reset(who.teacherA, 'subject')).statusCode).toBe(200);
  });

  it('keeps an override that clears an optional field, as "this class" (§6)', async () => {
    expect((await put(who.teacherA, 'framework', null)).statusCode).toBe(200);
    expect(field(await details(who.teacherA), 'framework')).toEqual({
      field: 'framework',
      value: null,
      origin: 'class',
      curriculumValue: 'NGSS',
    });
  });

  it('saves a write for good: a fresh read shows it (T3-F5)', async () => {
    await put(who.teacherA, 'subject', 'Earth science');
    expect(field(await details(who.teacherA), 'subject').value).toBe('Earth science');
    expect(await storedConfig(classA)).toEqual({ course: { subject: 'Earth science' } });
  });

  it('saves two fields written together without losing either', async () => {
    await Promise.all([
      put(who.teacherA, 'subject', 'Earth science'),
      put(who.teacherA, 'topic', 'Rain'),
      put(who.teacherA, 'grade', '7'),
    ]);
    expect(await storedConfig(classA)).toEqual({
      course: { subject: 'Earth science', topic: 'Rain', grade: '7' },
    });
  });

  it('lets the author edit defaults; classes without an override follow (T3-F6)', async () => {
    await put(who.teacherA, 'subject', 'Earth science');
    const res = await as(api, who.author)('PUT', `/api/curricula/${curriculum}/course/subject`, {
      value: 'Physical science',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(field(await details(who.teacherB, classB), 'subject')).toMatchObject({
      value: 'Physical science',
      origin: 'curriculum',
    });
    expect(field(await details(who.teacherA), 'subject')).toMatchObject({
      value: 'Earth science',
      origin: 'class',
      curriculumValue: 'Physical science',
    });
    // A default reset goes back to the spreadsheet's value.
    await as(api, who.author)('DELETE', `/api/curricula/${curriculum}/course/subject`);
    expect(field(await details(who.teacherB, classB), 'subject').value).toBe('Science');
  });

  it("refuses a teacher the curriculum's defaults (T3-F6, D3)", async () => {
    for (const method of ['PUT', 'DELETE'] as const) {
      const res = await as(api, who.teacherA)(
        method,
        `/api/curricula/${curriculum}/course/subject`,
        method === 'PUT' ? { value: 'Nope' } : undefined,
      );
      expect(res.statusCode).toBe(403);
    }
    expect(field(await details(who.teacherA), 'subject').value).toBe('Science');
    expect((await details(who.teacherA)).canEditDefaults).toBe(false);
    expect((await details(who.admin)).canEditDefaults).toBe(true);
  });

  it("puts the class's grade into the reading level the gateway uses (T3-F7)", async () => {
    expect((await details(who.teacherA)).readingLevel).toMatchObject({
      grade: '6',
      gradeLabel: 'Grade 6',
      level: 'Middle school',
    });
    const res = await put(who.teacherA, 'grade', '10');
    expect(CourseDetailsResponseSchema.parse(res.json()).readingLevel).toMatchObject({
      grade: '10',
      gradeLabel: 'Grade 10',
      level: 'High school',
    });
    expect((await details(who.teacherB, classB)).readingLevel?.grade).toBe('6');
  });

  it('lets only the class teacher or an admin edit it (T3-S1)', async () => {
    const cases: [Signed | null, number][] = [
      [who.teacherB, 403],
      [who.student, 403],
      [null, 401],
      [who.otherOrgTeacher, 403],
      [who.otherOrgAdmin, 403],
    ];
    for (const [signed, status] of cases) {
      expect((await put(signed as Signed, 'topic', 'Hijacked')).statusCode).toBe(status);
      expect((await reset(signed as Signed, 'topic')).statusCode).toBe(status);
      const read = await as(api, signed)('GET', `/api/classes/${classA}/course`);
      expect(read.statusCode).toBe(status);
    }
    expect(await storedConfig(classA)).toEqual({});
    expect((await put(who.admin, 'topic', 'By the admin')).statusCode).toBe(200);
  });

  it('refuses bad input with a plain sentence naming the field (T3-S2)', async () => {
    const refused = async (name: string, body: unknown) => {
      const res = await as(api, who.teacherA)('PUT', `/api/classes/${classA}/course/${name}`, body);
      expect(res.statusCode, res.body).toBe(400);
      return res.json<{ error: string; field: string | null }>();
    };
    expect(await refused('pass_mark_bonus', { value: 'x' })).toEqual({
      error: expect.stringContaining('There is no course detail called "pass_mark_bonus"'),
      field: null,
    });
    expect(await refused('topic', { value: 'x', extra: 1 })).toEqual({
      error: expect.stringContaining('Only a value can be saved for Map title (topic)'),
      field: 'topic',
    });
    expect(await refused('topic', { value: 'x'.repeat(201) })).toEqual({
      error: 'Map title (topic) can have at most 200 characters (this has 201).',
      field: 'topic',
    });
    for (const grade of ['13', '-1', 'Pre-K', 6]) {
      expect(await refused('grade', { value: grade })).toEqual({
        error: 'Grade level must be K or a grade from 1 to 12.',
        field: 'grade',
      });
    }
    expect((await refused('subject', { value: '' })).error).toBe(
      "Subject can't be empty. To use the curriculum's value, reset it instead.",
    );
    expect((await refused('subject', {})).field).toBe('subject');
    expect((await refused('map_objective', { value: 42 })).error).toBe(
      'Whole-map objective must be text.',
    );
    expect(await storedConfig(classA)).toEqual({});

    // Markup is text like any other: stored as typed, for the page to show as text.
    const html = '<img src=x onerror=alert(1)> Explain <b>rain</b>';
    expect((await put(who.teacherA, 'map_objective', html)).statusCode).toBe(200);
    expect(field(await details(who.teacherA), 'map_objective').value).toBe(html);
  });

  it('writes one field-level audit row per save, with actor, target, before and after (T3-S3)', async () => {
    const since = new Date();
    await put(who.teacherA, 'topic', 'Rain and rivers');
    await reset(who.teacherA, 'topic');
    await as(api, who.author)('PUT', `/api/curricula/${curriculum}/course/subject`, {
      value: 'Physical science',
    });
    const rows = await api.t.db
      .selectFrom('audit_event')
      .select(['action', 'actor_id', 'class_id', 'curriculum_id', 'before', 'after', 'detail'])
      .where('at', '>=', since)
      .where('target_type', 'in', ['class_config', 'curriculum_defaults', 'class', 'curriculum'])
      .orderBy('at')
      .orderBy('id')
      .execute();
    // No summary rows: the trigger's row is the only one (docs/qa/CXB.md, agent-f6).
    expect(rows).toEqual([
      {
        action: 'class_config.updated',
        actor_id: who.teacherA.userId,
        class_id: classA,
        curriculum_id: null,
        before: { 'config.course.topic': null },
        after: { 'config.course.topic': 'Rain and rivers' },
        detail: { changed: ['config.course.topic'] },
      },
      {
        action: 'class_config.updated',
        actor_id: who.teacherA.userId,
        class_id: classA,
        curriculum_id: null,
        before: { 'config.course.topic': 'Rain and rivers' },
        after: { 'config.course.topic': null },
        detail: { changed: ['config.course.topic'] },
      },
      {
        action: 'curriculum_defaults.updated',
        actor_id: who.author.userId,
        class_id: null,
        curriculum_id: curriculum,
        before: { 'config.course.subject': null },
        after: { 'config.course.subject': 'Physical science' },
        detail: { changed: ['config.course.subject'] },
      },
    ]);
  });

  it('writes one row for the first save where no config row exists yet (QA run 1)', async () => {
    await api.t.db.deleteFrom('class_config').where('class_id', '=', classB).execute();
    await api.t.db
      .deleteFrom('curriculum_defaults')
      .where('curriculum_id', '=', curriculum)
      .execute();
    const since = new Date();
    expect((await put(who.teacherB, 'topic', 'First', classB)).statusCode).toBe(200);
    const res = await as(api, who.author)('PUT', `/api/curricula/${curriculum}/course/grade`, {
      value: '6',
    });
    expect(res.statusCode, res.body).toBe(200);
    const rows = await api.t.db
      .selectFrom('audit_event')
      .select(['action', 'actor_id', 'detail'])
      .where('at', '>=', since)
      .where('target_type', 'in', ['class_config', 'curriculum_defaults'])
      .orderBy('at')
      .execute();
    expect(rows).toEqual([
      {
        action: 'class_config.updated',
        actor_id: who.teacherB.userId,
        detail: { changed: ['config.course.topic'] },
      },
      {
        action: 'curriculum_defaults.updated',
        actor_id: who.author.userId,
        detail: { changed: ['config.course.grade'] },
      },
    ]);
  });

  it('loads the section in one request, under 200 ms server-side (T3-P1)', async () => {
    await details(who.teacherA);
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const started = performance.now();
      await details(who.teacherA);
      times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(200);
  });
});
