export type PersonaId = 'tutor' | 'peer' | 'agent' | 'custom';
export type PersonaTone = 'warm' | 'calm' | 'playful' | 'socratic';
export type PersonaAudience = 'Students' | 'Teachers';

export interface PersonaDefinition {
  persona_id: PersonaId;
  name: string;
  role: string | null;
  audience: PersonaAudience;
  tone: PersonaTone;
  prompt_template: string | null;
}

/** A persona row may supply the full pack values or a partial class override. */
export type PersonaOverride = Partial<Omit<PersonaDefinition, 'persona_id' | 'name'>> & {
  persona_id: PersonaId | string;
  name?: string | null;
};

/** Canonical built-ins. Keep prompt text synchronized with project/curriculum.js. */
export const BUILT_IN_PERSONAS: readonly PersonaDefinition[] = Object.freeze([
  Object.freeze({
    persona_id: 'tutor',
    name: 'Ms. Ivy',
    role: 'AI tutor',
    audience: 'Students',
    tone: 'warm',
    prompt_template:
      'You are {name}, a {tone} {subject} tutor for {grade} students (ages {age}) studying "{topic}". {style} Praise effort and never make the student feel bad. Answer in {length}. No markdown, no lists, no headings.',
  }),
  Object.freeze({
    persona_id: 'peer',
    name: 'Milo',
    role: 'Virtual classmate',
    audience: 'Students',
    tone: 'playful',
    prompt_template:
      'You are {name}, a {peerAge}-year-old {grade} classmate who is curious, friendly and still learning {subject}. You talk like a real {peerAge}-year-old, never like a teacher. Ask simple questions, react with enthusiasm, and now and then repeat an idea back with a small, believable mistake so the student can correct you. Reply in 1 to 3 short sentences. No markdown. Never say you are an AI.',
  }),
  Object.freeze({
    persona_id: 'agent',
    name: 'Atlas',
    role: 'Logistics agent',
    audience: 'Teachers',
    tone: 'calm',
    prompt_template:
      'You are {name}, the logistics agent for Idea Map. You talk with a {subject} teacher setting up "{topic}" for {grade}. You build and maintain the mind map from the curriculum spreadsheet and the shared resource library, and you answer questions about how the application works. Be {tone}. Keep answers short and practical. When a fix belongs in the spreadsheet, name the tab and column.',
  }),
]);

const VALID_PERSONA_IDS = new Set<string>(['tutor', 'peer', 'agent', 'custom']);
const OVERRIDE_FIELDS = ['name', 'role', 'audience', 'tone', 'prompt_template'] as const;

/**
 * Resolve built-ins, then curriculum overrides, then class overrides.
 * Unknown ids are ignored defensively; contracts reject them before this layer.
 */
export function resolveEffectivePersonas(
  packPersonas: readonly PersonaOverride[] = [],
  classOverrides: readonly PersonaOverride[] = [],
): PersonaDefinition[] {
  const effective = new Map<string, PersonaDefinition>(
    BUILT_IN_PERSONAS.map((persona) => [persona.persona_id, { ...persona }]),
  );

  for (const overrides of [packPersonas, classOverrides]) {
    for (const override of overrides) {
      const id = override.persona_id;
      if (typeof id !== 'string' || !VALID_PERSONA_IDS.has(id)) continue;

      const current = effective.get(id) ?? {
        persona_id: id as PersonaId,
        name: 'Custom persona',
        role: null,
        audience: 'Students' as const,
        tone: 'warm' as const,
        prompt_template: null,
      };
      const next = { ...current };
      for (const field of OVERRIDE_FIELDS) {
        const value = override[field];
        if (value !== undefined && value !== null) Object.assign(next, { [field]: value });
      }
      effective.set(id, next);
    }
  }

  return [...effective.values()];
}
