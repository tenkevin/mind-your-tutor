import Anthropic from '@anthropic-ai/sdk';
import { ModelError, type ModelProvider, type ModelReply, type ModelRequest } from './provider.js';

// The Claude provider, through the official SDK. The key comes from the server's
// environment only (IDEAMAP_AI_API_KEY, read in ai/config.ts); it is never logged,
// stored or sent to a browser (A1-S1). §10 requires a zero-retention, no-training
// agreement with the provider for the organization's account.

export interface AnthropicOptions {
  apiKey: string;
  /** Server-side refusal fallback (`fallbacks: "default"`); off for models without it. */
  fallbacks: boolean;
  /** Override the API base URL (a regional or proxy endpoint). */
  baseURL?: string;
}

export function anthropicProvider(options: AnthropicOptions): ModelProvider {
  // The gateway owns the timeout, and a failed turn is retried by the student, so the
  // SDK makes one attempt.
  const client = new Anthropic({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    maxRetries: 0,
  });
  return {
    name: 'anthropic',
    async complete(request: ModelRequest): Promise<ModelReply> {
      let message;
      try {
        message = await client.beta.messages.create(
          {
            model: request.model,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: request.messages,
            // Short, conversational turns: low effort keeps replies quick.
            output_config: { effort: 'low' },
            metadata: { user_id: request.user },
            ...(options.fallbacks
              ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
              : {}),
          },
          { signal: request.signal },
        );
      } catch (error) {
        if (request.signal.aborted || error instanceof Anthropic.APIConnectionTimeoutError) {
          throw new ModelError('timeout');
        }
        // The SDK error names the status only; its message is not passed on.
        const status = error instanceof Anthropic.APIError ? String(error.status) : 'network';
        throw new ModelError('provider_error', `provider status ${status}`);
      }
      if (message.stop_reason === 'refusal') throw new ModelError('refused');
      const text = message.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
      return {
        text,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        model: message.model,
      };
    },
  };
}
