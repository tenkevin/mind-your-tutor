import { describe, expect, it } from 'vitest';
import { PROMPT_VARIABLES as CONTRACT_VARIABLES } from '@ideamap/contracts';
import {
  BUILT_IN_PERSONAS,
  PROMPT_VARIABLES,
  fill,
  patternBackstop,
  promptVariables,
  resolveEffectivePersonas,
} from './index.js';

const cfg = { subject: 'Science', topic: 'The water cycle', grade: '6' as const };
const tutor = BUILT_IN_PERSONAS.find((p) => p.persona_id === 'tutor')!;

describe('prompt filling (§6, §9)', () => {
  it('shares one variable list with the import checks', () => {
    expect(PROMPT_VARIABLES).toBe(CONTRACT_VARIABLES);
    expect(Object.keys(promptVariables(cfg, tutor)).sort()).toEqual([...PROMPT_VARIABLES].sort());
  });

  it('fills every built-in with no braces left', () => {
    for (const persona of BUILT_IN_PERSONAS) {
      expect(fill(cfg, persona), persona.persona_id).not.toMatch(/[{}]/);
    }
  });

  it('matches the prototype for Ms. Ivy in grade 6', () => {
    expect(fill(cfg, tutor)).toBe(
      'You are Ms. Ivy, a warm, friendly and encouraging science tutor for Grade 6 students (ages 11 to 12) studying "The water cycle". Use clear sentences. Introduce the correct subject vocabulary with a quick definition, and give one real-world example. Praise effort and never make the student feel bad. Answer in 3 to 5 sentences. No markdown, no lists, no headings.',
    );
  });

  it('leaves unknown variables visible, as written', () => {
    const [custom] = resolveEffectivePersonas(
      [],
      [{ persona_id: 'tutor', prompt_template: 'Hi {name}, {unknown} and {Topic} {topic}' }],
    );
    expect(fill(cfg, custom!)).toBe('Hi Ms. Ivy, {unknown} and {Topic} The water cycle');
  });

  it('reads kindergarten and high school bands', () => {
    expect(promptVariables({ ...cfg, grade: 'K' }, tutor)).toMatchObject({
      grade: 'Kindergarten',
      age: '5 to 6',
      peerAge: '6',
      length: '2 to 3 sentences',
    });
    expect(promptVariables({ ...cfg, grade: '11' }, tutor).length).toBe('4 to 6 sentences');
  });

  it('fills a persona with no template to an empty prompt', () => {
    expect(fill(cfg, { ...tutor, prompt_template: null })).toBe('');
  });
});

describe('identifier backstop (D26)', () => {
  const context = {
    names: ['Sam Student', 'Tara Teacher'],
    identifiers: ['roster-student-a1', 'sam.student@district-a.example.org'],
  };

  it('blurs emails, phones, roster ids and roster names, counting each as a miss', () => {
    const { texts, misses } = patternBackstop.blur(
      [
        'I am Sam Student, email sam.student@district-a.example.org or call 555-123-4567.',
        'Ms. Tara said SAM should ask. My id is roster-student-a1.',
      ],
      context,
    );
    expect(texts).toEqual([
      'I am Person A, email [email] or call [phone].',
      'Ms. Person B said Person A should ask. My id is [id].',
    ]);
    expect(misses).toBe(6);
  });

  it('blurs a full name in any case, but a lower-case name part only as a word', () => {
    const { texts } = patternBackstop.blur(['sam student is a student, tara'], context);
    expect(texts).toEqual(['Person A is a student, tara']);
  });

  it('leaves ordinary text, numbers and device labels alone', () => {
    const text = 'Person A said water boils at 100 degrees, in 1 to 3 steps, in 2026.';
    expect(patternBackstop.blur([text], context)).toMatchObject({ texts: [text], misses: 0 });
  });

  it('matches whole words only, and international numbers', () => {
    const { texts } = patternBackstop.blur(['Samantha +44 20 7946 0958'], context);
    expect(texts).toEqual(['Samantha [phone]']);
  });
});
