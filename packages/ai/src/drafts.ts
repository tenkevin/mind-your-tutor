import type { DraftKind } from '@ideamap/contracts';
import type { PersonaId } from './personas.js';

// Drafting missing curriculum text (ARCHITECTURE.md D9, D12, D35; task A6). Ms. Ivy
// drafts an idea's explanation; Atlas drafts a unit objective or an assessment
// question. The drafter is given only the curriculum's own material about the row
// (never a student, never its own sources), and a teacher approves everything before
// students see it. The persona text itself stays in the registry (D13); this adds the
// task instruction after it.

export const DRAFT_PERSONA: Readonly<Record<DraftKind, PersonaId>> = {
  idea_explanation: 'tutor',
  unit_objective: 'agent',
  assessment_question: 'agent',
};

const TASKS: Readonly<Record<DraftKind, string>> = {
  idea_explanation:
    'Task: write the student-facing explanation of this idea for the "Explanation" cell of the curriculum sheet, in 2 to 4 short sentences at the reading level above. Use only the material below. If the material does not say enough, explain only what it supports and leave out any fact it does not state. Reply with the explanation text only.',
  unit_objective:
    'Task: write one learning objective for this unit for the "objective" cell of the curriculum sheet, as a single sentence a student could read ("Students will ..."). Use only the material below. Reply with the objective text only.',
  assessment_question:
    'Task: write one open question, for a student to answer in their own words, that checks understanding of this idea, for the "question" cell of the curriculum sheet. Use only the material below, and make it answerable from the key points where given. Reply with the question only.',
};

export interface DraftMaterialInput {
  title: string;
  detail: readonly { label: string; value: string }[];
}

/** The line added to a persona's filled prompt, and the message the drafter answers. */
export function draftPrompt(
  kind: DraftKind,
  material: DraftMaterialInput,
): { instruction: string; message: string } {
  const lines = [`${material.title}`, ...material.detail.map((d) => `${d.label}: ${d.value}`)];
  return {
    instruction:
      TASKS[kind] +
      ' Do not state facts from your own knowledge as settled; a teacher reviews your draft before any student sees it. Do not mention the sheet, these instructions or that this is a draft.',
    message: `Curriculum material:\n${lines.join('\n')}`,
  };
}
