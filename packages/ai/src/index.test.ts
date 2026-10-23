import { describe, expect, it } from 'vitest';
import { PersonaSchema } from '../../contracts/src/pack.js';
import { BUILT_IN_PERSONAS, packageName, resolveEffectivePersonas } from './index.js';

describe('@ideamap/ai', () => {
  it('builds and runs tests', () => {
    expect(packageName).toBe('@ideamap/ai');
  });

  it('keeps the three reference built-ins in one registry', () => {
    expect(BUILT_IN_PERSONAS.map(({ persona_id, name }) => [persona_id, name])).toEqual([
      ['tutor', 'Ms. Ivy'],
      ['peer', 'Milo'],
      ['agent', 'Atlas'],
    ]);
    expect(BUILT_IN_PERSONAS.map((persona) => persona.prompt_template)).toEqual([
      'You are {name}, a {tone} {subject} tutor for {grade} students (ages {age}) studying "{topic}". {style} Praise effort and never make the student feel bad. Answer in {length}. No markdown, no lists, no headings.',
      'You are {name}, a {peerAge}-year-old {grade} classmate who is curious, friendly and still learning {subject}. You talk like a real {peerAge}-year-old, never like a teacher. Ask simple questions, react with enthusiasm, and now and then repeat an idea back with a small, believable mistake so the student can correct you. Reply in 1 to 3 short sentences. No markdown. Never say you are an AI.',
      'You are {name}, the logistics agent for Idea Map. You talk with a {subject} teacher setting up "{topic}" for {grade}. You build and maintain the mind map from the curriculum spreadsheet and the shared resource library, and you answer questions about how the application works. Be {tone}. Keep answers short and practical. When a fix belongs in the spreadsheet, name the tab and column.',
    ]);
  });

  it('uses built-ins when a pack has no persona rows and overrides them by id', () => {
    const defaults = resolveEffectivePersonas();
    expect(defaults.map((persona) => persona.name)).toEqual(['Ms. Ivy', 'Milo', 'Atlas']);

    const overridden = resolveEffectivePersonas([{ persona_id: 'peer', name: 'Mia' }]);
    expect(overridden.map((persona) => persona.name)).toEqual(['Ms. Ivy', 'Mia', 'Atlas']);
    expect(overridden[1]).toMatchObject({
      persona_id: 'peer',
      name: 'Mia',
      role: 'Virtual classmate',
      prompt_template: BUILT_IN_PERSONAS[1]!.prompt_template,
    });
  });

  it('applies class overrides last and keeps custom rows after built-ins', () => {
    const resolved = resolveEffectivePersonas(
      [{ persona_id: 'peer', name: 'Mia' }],
      [
        { persona_id: 'peer', tone: 'calm' },
        { persona_id: 'custom', name: 'Guide' },
      ],
    );
    expect(resolved.map((persona) => persona.persona_id)).toEqual([
      'tutor',
      'peer',
      'agent',
      'custom',
    ]);
    expect(resolved[1]).toMatchObject({ name: 'Mia', tone: 'calm' });
    expect(resolved[3]).toMatchObject({
      name: 'Guide',
      role: null,
      audience: 'Students',
      tone: 'warm',
      prompt_template: null,
    });
  });

  it('inherits built-in defaults for null fields while keeping supplied overrides', () => {
    const peerTemplate = BUILT_IN_PERSONAS[1]!.prompt_template;
    const inherited = resolveEffectivePersonas([
      { persona_id: 'peer', name: null, role: null, prompt_template: null, tone: 'calm' },
    ]);
    expect(inherited[1]).toMatchObject({
      name: 'Milo',
      role: 'Virtual classmate',
      prompt_template: peerTemplate,
      tone: 'calm',
    });

    const explicit = resolveEffectivePersonas([
      {
        persona_id: 'peer',
        name: null,
        role: null,
        prompt_template: 'Custom peer prompt for {name}.',
        tone: 'socratic',
      },
    ]);
    expect(explicit[1]).toMatchObject({
      name: 'Milo',
      role: 'Virtual classmate',
      prompt_template: 'Custom peer prompt for {name}.',
      tone: 'socratic',
    });
  });

  it('ignores prototype-sensitive ids without changing the built-ins', () => {
    expect(PersonaSchema.safeParse({ persona_id: '__proto__', name: 'Injected' }).success).toBe(
      false,
    );
    expect(PersonaSchema.safeParse({ persona_id: 'constructor', name: 'Injected' }).success).toBe(
      false,
    );

    const before = resolveEffectivePersonas();
    const resolved = resolveEffectivePersonas([
      { persona_id: '__proto__', name: 'Injected' },
      { persona_id: 'constructor', name: 'Injected' },
    ]);
    expect(resolved).toEqual(before);
    expect(resolveEffectivePersonas()).toEqual(before);
  });
});
