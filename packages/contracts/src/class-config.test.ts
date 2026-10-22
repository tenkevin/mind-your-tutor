import { describe, expect, it } from 'vitest';
import {
  ClassConfigSchema,
  CourseOverridesSchema,
  IdeaOverrideSchema,
  PACK_SPEC,
  PersonaOverrideSchema,
  UnitOverrideSchema,
} from './index.js';

const editable = (tab: string) =>
  PACK_SPEC.find((t) => t.tab === tab)!
    .cols.filter((c) => c.edit === 'app' || c.edit === 'both')
    .map((c) => c.name);

describe('ClassConfig follows §6 and the spec edit column (F3-F8)', () => {
  it('has exactly the app/both columns, keyed per unit, idea and persona', () => {
    expect(Object.keys(ClassConfigSchema.shape)).toEqual(['course', 'units', 'ideas', 'personas']);
    expect(Object.keys(CourseOverridesSchema.shape)).toEqual(editable('Course'));
    expect(Object.keys(UnitOverrideSchema.shape)).toEqual(['unit', ...editable('Units')]);
    expect(Object.keys(IdeaOverrideSchema.shape)).toEqual(['idea_id', ...editable('Ideas')]);
    expect(Object.keys(PersonaOverrideSchema.shape)).toEqual(editable('Personas'));
    expect(editable('Units')).toEqual(['due_date']);
    expect(editable('Ideas')).toEqual(['rarity']);
  });

  it('leaves out Library, which §6 keeps as curriculum data', () => {
    expect(editable('Library')).toEqual(['title', 'file_url', 'use_for']);
    expect(Object.keys(ClassConfigSchema.shape)).not.toContain('library');
  });

  it('makes every field optional', () => {
    expect(ClassConfigSchema.parse({})).toEqual({});
    expect(ClassConfigSchema.parse({ course: {} })).toEqual({ course: {} });
    expect(ClassConfigSchema.parse({ personas: [{ persona_id: 'peer' }] })).toEqual({
      personas: [{ persona_id: 'peer' }],
    });
    for (const [name, field] of Object.entries(CourseOverridesSchema.shape)) {
      expect(field.safeParse(undefined).success, name).toBe(true);
    }
  });

  it('parses a full set of overrides', () => {
    const config = {
      course: {
        subject: 'Earth science',
        topic: 'Water on the move',
        grade: '7',
        framework: null,
        map_objective: 'Follow a drop of water.',
        pass_mark: 80,
      },
      units: [
        { unit: 1, due_date: '2026-11-02' },
        { unit: 2, due_date: null },
      ],
      ideas: [{ idea_id: 'evap', rarity: 'Legendary' }],
      personas: [
        {
          persona_id: 'tutor',
          name: 'Mr. Oak',
          role: null,
          audience: 'Students',
          tone: 'socratic',
          prompt_template: 'You are {name}.',
        },
      ],
    };
    expect(ClassConfigSchema.parse(config)).toEqual(config);
  });

  it('rejects bad values and duplicate keys, and strips unknown keys', () => {
    const bad = [
      { course: { pass_mark: 120 } },
      { course: { grade: '13' } },
      { units: [{ unit: 1, due_date: '2026-02-30' }] },
      { units: [{ due_date: '2026-11-02' }] },
      { ideas: [{ idea_id: 'Evap', rarity: 'Rare' }] },
      { ideas: [{ idea_id: 'evap', rarity: 'Epic' }] },
      { personas: [{ persona_id: 'teacher' }] },
      { personas: [{ persona_id: 'tutor', prompt_template: 'x'.repeat(8001) }] },
      { units: [{ unit: 1 }, { unit: 1, due_date: null }] },
      { ideas: [{ idea_id: 'evap' }, { idea_id: 'evap' }] },
      { personas: [{ persona_id: 'tutor' }, { persona_id: 'tutor' }] },
    ];
    for (const config of bad) {
      expect(ClassConfigSchema.safeParse(config).success, JSON.stringify(config)).toBe(false);
    }
    const parsed = ClassConfigSchema.parse(
      JSON.parse('{"__proto__":{"polluted":true},"column_mapping":[],"course":{"x":1}}'),
    );
    expect(parsed).toEqual({ course: {} });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('describes fields with the spec notes', () => {
    expect(CourseOverridesSchema.shape.pass_mark.description).toBe('Quiz and teach-back threshold');
  });
});
