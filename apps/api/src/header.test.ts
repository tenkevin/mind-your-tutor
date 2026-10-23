import { ClassHeaderResponseSchema } from '@ideamap/contracts';
import { hasDatabase } from '@ideamap/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, signIn, startApi, type Signed, type TestApi } from './test/harness.js';

// T1: the teacher console header's class, subject and topic, for staff only.

describe.skipIf(!hasDatabase)('class header (T1-F2, T1-S2)', () => {
  let api: TestApi;
  let terry: Signed;
  beforeAll(async () => {
    api = await startApi();
    terry = await signIn(api, 'google', 'teacher-a1');
  });
  afterAll(async () => {
    await api?.close();
  });

  const url = () => `/api/classes/${api.sample.classes.a1}/header`;

  it("gives the class's subject and topic, from the published version by default", async () => {
    const res = await as(api, terry)('GET', url());
    expect(res.statusCode, res.body).toBe(200);
    expect(ClassHeaderResponseSchema.parse(res.json())).toEqual({
      classId: api.sample.classes.a1,
      className: 'Science 6A',
      subject: 'Science',
      topic: 'The water cycle',
    });
  });

  it("shows the class's own topic once the class overrides it", async () => {
    const put = await as(api, terry)('PUT', `/api/classes/${api.sample.classes.a1}/config`, {
      course: { topic: 'Where rain comes from' },
    });
    expect(put.statusCode, put.body).toBe(200);
    const res = await as(api, terry)('GET', url());
    expect(res.json()).toMatchObject({ subject: 'Science', topic: 'Where rain comes from' });
  });

  it('refuses a student, and a teacher of another class, with no class data', async () => {
    for (const [provider, key] of [
      ['google', 'student-a1'],
      ['clever', 'teacher-a2'],
    ] as const) {
      const who = await signIn(api, provider, key);
      const res = await as(api, who)('GET', url());
      expect(res.statusCode, key).toBe(403);
      expect(res.body).not.toContain('Science');
    }
  });

  it('refuses a signed-out caller', async () => {
    const res = await as(api, null)('GET', url());
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('Science');
  });
});
