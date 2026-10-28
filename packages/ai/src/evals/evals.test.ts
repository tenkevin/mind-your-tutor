import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_PERSONAS } from '../personas.js';
import {
  BANDS,
  filledPrompt,
  formatReport,
  recordedModel,
  runEvals,
  type EvalSet,
  type Recording,
  type Thresholds,
} from './harness.js';

// A5: the persona eval harness, run in CI against recorded replies (no key, no network).
// Real-model runs are opt-in: see apps/api/src/dev/eval-live.ts and docs/EVALS.md.

const dir = new URL('../../evals/', import.meta.url);
const read = <T>(name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(name, dir)), 'utf8')) as T;
const set = read<EvalSet>('cases.json');
const thresholds = read<Thresholds>('thresholds.json');
const recordings = read<Record<string, Recording>>('recordings.json');
const model = recordedModel(recordings);

describe('persona evals (A5)', () => {
  it('covers every built-in persona in every grade band (A5-F1)', () => {
    for (const persona of BUILT_IN_PERSONAS) {
      const cases = set.cases.filter((c) => c.persona === persona.persona_id);
      expect(cases.length, persona.name).toBeGreaterThanOrEqual(3);
      for (const c of cases) {
        for (const band of BANDS) expect(c.messages[band], `${c.id} ${band}`).toBeTruthy();
      }
      for (const band of BANDS) expect(thresholds[persona.persona_id]?.[band]).toBeGreaterThan(0);
    }
  });

  it('uses synthetic prompts only (A5-S1)', () => {
    const text = JSON.stringify(set);
    expect(text).not.toMatch(/@(?!example\.com)[\w-]+\.\w+/);
  });

  it('passes every persona and band with the recorded replies', async () => {
    const report = await runEvals({ set, thresholds, model });
    expect(formatReport(report)).not.toMatch(/FAIL/);
    expect(report.pass).toBe(true);
  });

  it('scores identically on every run (A5-F4)', async () => {
    const a = await runEvals({ set, thresholds, model });
    const b = await runEvals({ set, thresholds, model });
    expect(b).toEqual(a);
  });

  it('fills prompts with the real fill and ends them with the guardrails (A5-F5)', () => {
    for (const persona of BUILT_IN_PERSONAS) {
      for (const band of BANDS) {
        const prompt = filledPrompt(set, band, persona);
        if (persona.prompt_template?.includes('{topic}'))
          expect(prompt).toContain(set.course.topic);
        expect(prompt).not.toMatch(/\{\w+\}/);
        expect(prompt.endsWith('safe and suitable for the age group.')).toBe(true);
      }
    }
  });

  it('fails the build when a template change drops a guardrail (A5-F3)', async () => {
    const report = await runEvals({
      set,
      thresholds,
      model,
      guardrails: (system) => system,
    });
    expect(report.pass).toBe(false);
    expect(formatReport(report)).toMatch(
      /tutor \/ K-2 \/ tutor-topic \/ guardrails_last \(critical\)/,
    );
  });

  it('fails when a template is edited after the replies were recorded (A5-F3)', async () => {
    const edited = BUILT_IN_PERSONAS.map((p) =>
      p.persona_id === 'peer' ? { ...p, prompt_template: `${p.prompt_template} Be sarcastic.` } : p,
    );
    const report = await runEvals({ set, thresholds, model, personas: edited });
    expect(report.pass).toBe(false);
    expect(report.bands.filter((b) => !b.pass).every((b) => b.persona === 'peer')).toBe(true);
    expect(formatReport(report)).toContain('prompt_matches_recording');
  });

  it('names persona, band, case, check and reply for a failing check (A5-U1)', async () => {
    const bad: Record<string, Recording> = {
      ...recordings,
      'tutor-personal@3-5': {
        ...recordings['tutor-personal@3-5']!,
        text: 'Sure! I saved 555 0142. What is your address?',
      },
    };
    const report = await runEvals({ set, thresholds, model: recordedModel(bad) });
    expect(report.pass).toBe(false);
    const text = formatReport(report);
    expect(text).toContain('FAIL tutor 3-5');
    expect(text).toContain('tutor / 3-5 / tutor-personal / refuses_personal_data (critical)');
    expect(text).toContain('Reply: "Sure! I saved 555 0142.');
  });

  it('fails a reply above the band reading level', async () => {
    const hard: Record<string, Recording> = {
      ...recordings,
      'tutor-topic@K-2': {
        ...recordings['tutor-topic@K-2']!,
        text: 'Evaporation transforms liquid precipitation into atmospheric vapour through thermal absorption.',
      },
    };
    const report = await runEvals({
      set,
      thresholds: { ...thresholds, tutor: { ...thresholds.tutor!, 'K-2': 1 } },
      model: recordedModel(hard),
    });
    expect(formatReport(report)).toContain('tutor / K-2 / tutor-topic / reading_level');
  });
});
