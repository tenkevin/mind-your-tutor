import {
  COURSE_FIELDS,
  GRADES,
  type Course,
  type CourseField,
  type CourseFieldDetail,
  type CourseOverrides,
  type ReadingLevel,
} from '@ideamap/contracts';

// Layered course configuration (ARCHITECTURE.md §6, T3). A class's effective value is
// its own override if it has one, else the curriculum's: the author's default
// (CurriculumDefaults), else the value in the curriculum version's Course tab.

export interface CourseLayers {
  /** The Course tab of the version the class uses; null before any import. */
  pack: Pick<Course, CourseField> | null;
  /** The curriculum's defaults, set by its author. */
  defaults?: CourseOverrides | null;
  /** This class's overrides. */
  overrides?: CourseOverrides | null;
}

/** True if `layer` sets `field`, even to null ("this class clears it"). */
function sets(layer: CourseOverrides | null | undefined, field: CourseField): boolean {
  return layer != null && Object.hasOwn(layer, field) && layer[field] !== undefined;
}

/** The curriculum's value for `field`: the author's default, else the Course tab. */
export function curriculumValue(layers: CourseLayers, field: CourseField): string | null {
  if (sets(layers.defaults, field)) return layers.defaults![field] ?? null;
  return layers.pack?.[field] ?? null;
}

/** Each course field's effective value and origin, in the design's order. */
export function effectiveCourse(layers: CourseLayers): CourseFieldDetail[] {
  return COURSE_FIELDS.map((field) => {
    const fromCurriculum = curriculumValue(layers, field);
    return sets(layers.overrides, field)
      ? {
          field,
          value: layers.overrides![field] ?? null,
          origin: 'class',
          curriculumValue: fromCurriculum,
        }
      : { field, value: fromCurriculum, origin: 'curriculum', curriculumValue: fromCurriculum };
  });
}

/** The effective value of one field, from `effectiveCourse`. */
export function courseValue(fields: readonly CourseFieldDetail[], field: CourseField) {
  return fields.find((f) => f.field === field)?.value ?? null;
}

type Grade = (typeof GRADES)[number];
const isGrade = (g: string | null): g is Grade => g !== null && GRADES.includes(g as Grade);

/** "Kindergarten" or "Grade 6". */
export function gradeLabel(grade: Grade): string {
  return grade === 'K' ? 'Kindergarten' : `Grade ${grade}`;
}

// The reading levels from the design's prompt filling (project/curriculum.js `band`).
const BANDS = [
  {
    upTo: 2,
    level: 'Early reader',
    style:
      'Use very short sentences and simple, everyday words. Explain one thing at a time with a familiar example from home or school.',
    length: '2 to 3 sentences',
  },
  {
    upTo: 5,
    level: 'Elementary',
    style: 'Use short sentences and plain words. Give one everyday example.',
    length: '3 to 4 sentences',
  },
  {
    upTo: 8,
    level: 'Middle school',
    style:
      'Use clear sentences. Introduce the correct subject vocabulary with a quick definition, and give one real-world example.',
    length: '3 to 5 sentences',
  },
  {
    upTo: 12,
    level: 'High school',
    style:
      'Use precise academic vocabulary. Focus on reasoning, cause and effect, and evidence, and connect ideas to real-world applications.',
    length: '4 to 6 sentences',
  },
] as const;

/** The reading level a grade sets for every persona (§6); null without a valid grade. */
export function readingLevel(grade: string | null): ReadingLevel | null {
  if (!isGrade(grade)) return null;
  const n = grade === 'K' ? 0 : Number(grade);
  const band = BANDS.find((b) => n <= b.upTo)!;
  return {
    grade,
    gradeLabel: gradeLabel(grade),
    level: band.level,
    style: band.style,
    length: band.length,
  };
}
