// A model provider, as the AI gateway sees it (ARCHITECTURE.md §9). Every model call
// in Idea Map goes through the gateway, and the gateway is the only code that holds a
// provider: browser packages never import one or know a provider's URL (A1-F1).
//
// A request carries only what the gateway filled and blurred: the server-filled system
// prompt, the blurred conversation and a pseudonymous user id. No names, emails or
// roster ids (§10).

export interface ModelTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ModelRequest {
  model: string;
  system: string;
  messages: ModelTurn[];
  /** A stable pseudonym for the caller, for the provider's abuse checks; never a real id. */
  user: string;
  maxTokens: number;
  /** Aborted when the gateway's timeout passes. */
  signal: AbortSignal;
}

export interface ModelReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** The model that answered, as the provider reports it. */
  model: string;
}

export interface ModelProvider {
  /** Short id, recorded with each transcript: `anthropic`, `mock`. */
  readonly name: string;
  complete(request: ModelRequest): Promise<ModelReply>;
}

/** Why a call failed; logged and stored, never shown to the client. */
export type ModelFailure = 'timeout' | 'provider_error' | 'malformed' | 'refused';

export class ModelError extends Error {
  constructor(
    readonly failure: ModelFailure,
    message: string = failure,
  ) {
    super(message);
  }
}

/** A reply the gateway can show: non-empty text and whole, non-negative token counts. */
export function checkReply(reply: unknown): ModelReply {
  const r = reply as Partial<ModelReply> | null;
  const count = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (
    !r ||
    typeof r.text !== 'string' ||
    r.text.trim() === '' ||
    !count(r.inputTokens) ||
    !count(r.outputTokens) ||
    typeof r.model !== 'string' ||
    r.model.length === 0 ||
    r.model.length > 100
  ) {
    throw new ModelError('malformed');
  }
  return {
    text: r.text,
    inputTokens: r.inputTokens!,
    outputTokens: r.outputTokens!,
    model: r.model,
  };
}
