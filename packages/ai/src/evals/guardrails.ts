// The fixed guardrails appended after every persona template (ARCHITECTURE.md §9). The
// text and the append step belong to A2 (A2-F3). Until A2 lands, the eval harness uses
// this stand-in so the real fill path (`fill`, then guardrails last) is what is scored;
// when A2 exports its own, `runEvals` takes it through the `guardrails` option and this
// file goes.

export const EVAL_GUARDRAILS =
  'Stay on the lesson topic and gently steer back if the conversation drifts. Never ask for or repeat personal information such as names, addresses, phone numbers or emails; if a student shares some, tell them kindly to keep it private. Use language that is safe and suitable for the age group.';

export function appendGuardrails(system: string): string {
  return `${system}\n\n${EVAL_GUARDRAILS}`;
}
