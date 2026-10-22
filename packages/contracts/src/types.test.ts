import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import type {
  AssessmentItem,
  AssessmentItemSchema,
  Category,
  CategorySchema,
  ClassConfig,
  ClassConfigSchema,
  Course,
  CourseSchema,
  CurriculumVersion,
  CurriculumVersionSchema,
  ExplanationOverride,
  ExplanationOverrideSchema,
  Idea,
  IdeaRowSchema,
  IdeaSchema,
  LibraryDoc,
  LibraryDocSchema,
  Link,
  LinkSchema,
  Pack,
  PackSchema,
  Persona,
  PersonaSchema,
  Unit,
  UnitSchema,
} from './index.js';

describe('types are inferred from the schemas (F3-F10)', () => {
  it('matches z.infer for every exported type', () => {
    expectTypeOf<Course>().toEqualTypeOf<z.infer<typeof CourseSchema>>();
    expectTypeOf<Unit>().toEqualTypeOf<z.infer<typeof UnitSchema>>();
    expectTypeOf<Idea>().toEqualTypeOf<z.infer<typeof IdeaSchema>>();
    expectTypeOf<Idea>().toEqualTypeOf<z.infer<typeof IdeaRowSchema>>();
    expectTypeOf<Link>().toEqualTypeOf<z.infer<typeof LinkSchema>>();
    expectTypeOf<Category>().toEqualTypeOf<z.infer<typeof CategorySchema>>();
    expectTypeOf<AssessmentItem>().toEqualTypeOf<z.infer<typeof AssessmentItemSchema>>();
    expectTypeOf<Persona>().toEqualTypeOf<z.infer<typeof PersonaSchema>>();
    expectTypeOf<LibraryDoc>().toEqualTypeOf<z.infer<typeof LibraryDocSchema>>();
    expectTypeOf<Pack>().toEqualTypeOf<z.infer<typeof PackSchema>>();
    expectTypeOf<ClassConfig>().toEqualTypeOf<z.infer<typeof ClassConfigSchema>>();
    expectTypeOf<CurriculumVersion>().toEqualTypeOf<z.infer<typeof CurriculumVersionSchema>>();
    expectTypeOf<ExplanationOverride>().toEqualTypeOf<z.infer<typeof ExplanationOverrideSchema>>();
    expectTypeOf<ExplanationOverride['source']>().toEqualTypeOf<'sheet' | 'ai'>();
  });

  it('gives the spec types', () => {
    expectTypeOf<Idea['rarity']>().toEqualTypeOf<'auto' | 'Common' | 'Rare' | 'Legendary'>();
    expectTypeOf<Idea['unit']>().toEqualTypeOf<number>();
    expectTypeOf<Idea['requires']>().toEqualTypeOf<string[]>();
    expectTypeOf<Idea['media_url']>().toEqualTypeOf<string | null>();
    expectTypeOf<Course['pass_mark']>().toEqualTypeOf<number>();
    expectTypeOf<Pack['course']>().toEqualTypeOf<Course>();
    expectTypeOf<Pack['units']>().toEqualTypeOf<Unit[]>();
    expectTypeOf<Pack['ideas']>().toEqualTypeOf<Idea[]>();
    expectTypeOf<Pack['links']>().toEqualTypeOf<Link[]>();
    expectTypeOf<Pack['categories']>().toEqualTypeOf<Category[]>();
    expectTypeOf<Pack['assessment']>().toEqualTypeOf<AssessmentItem[]>();
    expectTypeOf<Pack['personas']>().toEqualTypeOf<Persona[]>();
    expectTypeOf<Pack['library']>().toEqualTypeOf<LibraryDoc[]>();
    expectTypeOf<CurriculumVersion['pack']>().toEqualTypeOf<Pack>();
    expectTypeOf<Persona['tone']>().toEqualTypeOf<'warm' | 'calm' | 'playful' | 'socratic'>();
  });
});
