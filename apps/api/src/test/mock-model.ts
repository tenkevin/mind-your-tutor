import type { ModelProvider, ModelReply, ModelRequest } from '../ai/provider.js';

// A model provider for tests (A1): records every request it receives and answers as
// told. No key and no network.

export type MockBehaviour =
  { kind: 'reply'; text?: string } | { kind: 'hang' } | { kind: 'error' } | { kind: 'malformed' };

export interface MockModel extends ModelProvider {
  requests: ModelRequest[];
  behaviour: MockBehaviour;
}

export function mockModel(): MockModel {
  const model: MockModel = {
    name: 'mock',
    requests: [],
    behaviour: { kind: 'reply' },
    async complete(request): Promise<ModelReply> {
      model.requests.push(request);
      const b = model.behaviour;
      switch (b.kind) {
        case 'reply':
          return {
            text: b.text ?? 'Evaporation is when water turns into vapour.',
            inputTokens: 120,
            outputTokens: 12,
            model: 'mock-model-1',
          };
        case 'hang':
          return new Promise<never>(() => {});
        case 'error':
          // As an SDK error might read; the gateway must not pass any of it on.
          throw new Error('500 upstream: sk-test-secret-key at https://api.provider.test/v1');
        case 'malformed':
          return { text: 42, inputTokens: -1 } as unknown as ModelReply;
      }
    },
  };
  return model;
}
