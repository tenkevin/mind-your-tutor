import { json } from '@ideamap/db';
import {
  DRAFT_PERSONA,
  draftPrompt,
  fill,
  patternBackstop,
  resolveEffectivePersonas,
} from '@ideamap/ai';
import type { DraftWriter, OrgScope } from '@ideamap/worker';
import { callWithTimeout, type AiGatewayOptions } from './gateway.js';
import { ModelError, type ModelReply } from './provider.js';

// The AI gateway's side of drafting (ARCHITECTURE.md D9, D12, D13; task A6): the
// writer the draft job calls for each empty cell. Like a chat call it resolves the
// built-in persona from packages/ai (Ms. Ivy for explanations, Atlas for objectives
// and questions, with the pack's overrides), fills its prompt, runs the identifier
// backstop, calls the provider with a timeout and stores the redacted transcript in
// ai_interaction. The prompt holds the curriculum's own words about one row and no
// student: there is no student or class on a drafting call.

/** A constant pseudonym for the provider: drafting acts for no user. */
const DRAFTING_USER = 'u_curriculum-drafts';

export function gatewayDraftWriter(
  options: AiGatewayOptions,
  scope: OrgScope,
  now: () => Date = () => new Date(),
): DraftWriter {
  const { provider, config } = options;
  const backstop = options.backstop ?? patternBackstop;
  return async (request) => {
    const persona = resolveEffectivePersonas(
      [...request.pack.personas, ...request.personas],
      [],
    ).find((p) => p.persona_id === DRAFT_PERSONA[request.kind])!;
    const { subject, topic, grade } = request.pack.course;
    const { instruction, message } = draftPrompt(request.kind, request.context);
    const blurred = backstop.blur(
      [`${fill({ subject, topic, grade }, persona)}\n\n${instruction}`, message],
      { names: [], identifiers: [] },
    );
    const [system, content] = blurred.texts as [string, string];
    const messages = [{ role: 'user' as const, content }];

    let reply: ModelReply | undefined;
    try {
      reply = await callWithTimeout(
        provider,
        { model: config.model, system, messages, user: DRAFTING_USER, maxTokens: config.maxTokens },
        config.timeoutMs,
      );
    } catch (error) {
      await record(null, error instanceof ModelError ? error.failure : 'provider_error');
      throw error;
    }
    const text = backstop.blur([reply.text], { names: [], identifiers: [] }).texts[0]!;
    await record(text);
    return { text, model: reply.model };

    async function record(stored: string | null, failure?: string) {
      await scope(request.orgId, (trx) =>
        trx
          .insertInto('ai_interaction')
          .values({
            org_id: request.orgId,
            class_id: null,
            user_id: null,
            persona: persona.persona_id,
            model: reply?.model ?? config.model,
            request: json({ provider: provider.name, purpose: 'draft', system, messages }),
            response: json(stored === null ? { error: failure } : { text: stored }),
            input_tokens: reply?.inputTokens ?? null,
            output_tokens: reply?.outputTokens ?? null,
            redacted_at: now(),
          })
          .execute(),
      );
    }
  };
}
