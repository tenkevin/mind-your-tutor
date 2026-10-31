import { GRADES } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { courseValue, effectiveCourse, gradeLabel, readingLevel } from './course.js';

const pack = {
  subject: 'Science',
  topic: 'The water cycle',
  grade: '6',
  framework: 'NGSS',
  map_objective: 'Explain the water cycle.',
} as const;

describe('effectiveCourse (§6, T3)', () => {
  it('uses the Course tab when nothing overrides it', () => {
    const fields = effectiveCourse({ pack });
    expect(fields.map((f) => f.field)).toEqual([
      'subject',
      'topic',
      'grade',
      'framework',
      'map_objective',
    ]);
    expect(fields.every((f) => f.origin === 'curriculum' && f.value === f.curriculumValue)).toBe(
      true,
    );
  });

  it('puts the author default over the Course tab, and a class override over both', () => {
    const fields = effectiveCourse({
      pack,
      defaults: { grade: '5', topic: 'Clouds' },
      overrides: { topic: 'Rain' },
    });
    expect(fields.find((f) => f.field === 'grade')).toEqual({
      field: 'grade',
      value: '5',
      origin: 'curriculum',
      curriculumValue: '5',
    });
    expect(fields.find((f) => f.field === 'topic')).toEqual({
      field: 'topic',
      value: 'Rain',
      origin: 'class',
      curriculumValue: 'Clouds',
    });
  });

  it('treats null as "this class clears it", and a missing key as no override', () => {
    const fields = effectiveCourse({ pack, overrides: { framework: null } });
    expect(courseValue(fields, 'framework')).toBeNull();
    expect(fields.find((f) => f.field === 'framework')!.origin).toBe('class');
    expect(fields.find((f) => f.field === 'subject')!.origin).toBe('curriculum');
  });

  it('shows nulls before any import', () => {
    const fields = effectiveCourse({ pack: null });
    expect(fields.every((f) => f.value === null && f.origin === 'curriculum')).toBe(true);
  });

  it('never reads an inherited key as an override', () => {
    const overrides = Object.create({ topic: 'Inherited' }) as { topic?: string };
    expect(courseValue(effectiveCourse({ pack, overrides }), 'topic')).toBe('The water cycle');
  });
});

describe('readingLevel (§6: grade drives reading level)', () => {
  it('maps every grade to the design bands', () => {
    const levels = GRADES.map((g) => readingLevel(g)!.level);
    expect(levels).toEqual([
      'Early reader',
      'Early reader',
      'Early reader',
      'Elementary',
      'Elementary',
      'Elementary',
      'Middle school',
      'Middle school',
      'Middle school',
      'High school',
      'High school',
      'High school',
      'High school',
    ]);
    expect(gradeLabel('K')).toBe('Kindergarten');
    expect(readingLevel('7')).toMatchObject({ gradeLabel: 'Grade 7', length: '3 to 5 sentences' });
  });

  it('has none without a valid grade', () => {
    expect(readingLevel(null)).toBeNull();
    expect(readingLevel('13')).toBeNull();
  });
});
