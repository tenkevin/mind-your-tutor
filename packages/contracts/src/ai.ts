import { z } from 'zod';

// The AI gateway's payloads (ARCHITECTURE.md §9; task A1). A request carries only the
// conversation: the persona comes from the route, and the prompt is filled on the
// server from the class's effective config (§6). Unknown keys (a `system`, a
// `prompt_template`, a persona override, extra variables) are refused with 400, so a
// client can never change what the model is told.

export const AI_LIMITS = {
  /** Characters in one turn. */
  message: 2000,
  /** Earlier turns sent back for context. */
  history: 20,
} as const;

export const AiTurnSchema = z.strictObject({
  role: z.enum(['student', 'assistant']),
  text: z.string().trim().min(1).max(AI_LIMITS.message),
});

export const AiChatRequestSchema = z.strictObject({
  message: z.string().trim().min(1).max(AI_LIMITS.message),
  history: z.array(AiTurnSchema).max(AI_LIMITS.history).default([]),
});

export const AiChatResponseSchema = z.strictObject({
  /** The stored transcript row (ai_interaction), for provenance. */
  interactionId: z.uuid(),
  persona: z.strictObject({ id: z.string(), name: z.string() }),
  reply: z.string(),
});

/** Error codes the gateway answers with; the apps map them to plain messages. */
export const AI_ERROR_CODES = ['rate_limited', 'unavailable', 'invalid_request'] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export const AiErrorSchema = z.strictObject({
  error: z.string(),
  code: z.enum(AI_ERROR_CODES),
});

/** What a student reads when they hit a rate limit (A1-U1). */
export const AI_RATE_LIMIT_MESSAGE = "You've asked a lot of questions. Try again in a minute.";
/** What a student reads when the model can't answer (A1-F7); no provider detail. */
export const AI_UNAVAILABLE_MESSAGE = "I can't answer right now. Please try again in a moment.";

export type AiTurn = z.infer<typeof AiTurnSchema>;
export type AiChatRequest = z.input<typeof AiChatRequestSchema>;
export type AiChatResponse = z.infer<typeof AiChatResponseSchema>;
export type AiError = z.infer<typeof AiErrorSchema>;
