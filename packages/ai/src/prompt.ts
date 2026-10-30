import { PROMPT_VARIABLES, type Grade } from '@ideamap/contracts';
import type { PersonaDefinition, PersonaTone } from './personas.js';

// Prompt filling (ARCHITECTURE.md §6, §9): `fill(cfg, persona)`. It runs on the server,
// in the AI gateway, so students can't alter the prompts sent on their behalf. The
// settings page uses the same variable list and the same fill for its preview. Behaviour
// follows `vars` and `fill` in project/curriculum.js.

export { PROMPT_VARIABLES };
export type PromptVariable = (typeof PROMPT_VARIABLES)[number];

/** What a template is filled from: the class's effective course settings. */
export interface PromptConfig {
  subject: string;
  topic: string;
  grade: Grade;
}

/** How each tone reads inside a sentence ("a {tone} science tutor"). */
export const TONE_PHRASES: Readonly<Record<PersonaTone, string>> = Object.freeze({
  warm: 'warm, friendly and encouraging',
  calm: 'calm, clear and precise',
  playful: 'playful, upbeat and funny',
  socratic: 'patient and Socratic, guiding with questions',
});

export interface ReadingBand {
  level: string;
  style: string;
  length: string;
}

function gradeNumber(grade: Grade): number {
  return grade === 'K' ? 0 : Number(grade);
}

/** Grade drives reading level (§6): the {style} and {length} of a reply. */
export function readingBand(grade: Grade): ReadingBand {
  const g = gradeNumber(grade);
  if (g <= 2) {
    return {
      level: 'Early reader',
      style:
        'Use very short sentences and simple, everyday words. Explain one thing at a time with a familiar example from home or school.',
      length: '2 to 3 sentences',
    };
  }
  if (g <= 5) {
    return {
      level: 'Elementary',
      style: 'Use short sentences and plain words. Give one everyday example.',
      length: '3 to 4 sentences',
    };
  }
  if (g <= 8) {
    return {
      level: 'Middle school',
      style:
        'Use clear sentences. Introduce the correct subject vocabulary with a quick definition, and give one real-world example.',
      length: '3 to 5 sentences',
    };
  }
  return {
    level: 'High school',
    style:
      'Use precise academic vocabulary. Focus on reasoning, cause and effect, and evidence, and connect ideas to real-world applications.',
    length: '4 to 6 sentences',
  };
}

export function gradeLabel(grade: Grade): string {
  return grade === 'K' ? 'Kindergarten' : `Grade ${grade}`;
}

/** The value of every template variable for one persona in one class. */
export function promptVariables(
  cfg: PromptConfig,
  persona: Pick<PersonaDefinition, 'name' | 'tone'>,
): Record<PromptVariable, string> {
  const g = gradeNumber(cfg.grade);
  const band = readingBand(cfg.grade);
  const age = g + 5;
  return {
    name: persona.name,
    tone: TONE_PHRASES[persona.tone] ?? persona.tone,
    subject: cfg.subject.toLowerCase(),
    topic: cfg.topic,
    grade: gradeLabel(cfg.grade),
    age: `${age} to ${age + 1}`,
    peerAge: String(g + 6),
    style: band.style,
    length: band.length,
  };
}

const KNOWN = new Set<string>(PROMPT_VARIABLES);

/**
 * Fill a persona's template. Known `{variables}` are substituted; anything else in
 * braces is left as written, so a typo stays visible instead of silently vanishing
 * (the import warns about these, C2). A persona without a template fills to "".
 */
export function fill(cfg: PromptConfig, persona: PersonaDefinition): string {
  const vars = promptVariables(cfg, persona);
  return (persona.prompt_template ?? '').replace(/\{(\w+)\}/g, (match, key: string) =>
    KNOWN.has(key) ? vars[key as PromptVariable] : match,
  );
}
