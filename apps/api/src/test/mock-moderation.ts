import type { ModerationCategory } from '@ideamap/ai';
import type { ModerationProvider, ModerationRequest, ModerationVerdict } from '../ai/moderation.js';

// A moderation provider for tests (A2): labels text by marker words, records every
// request, and can hang or fail. Synthetic text only; no key and no network.

export type ModerationBehaviour = { kind: 'labels' } | { kind: 'hang' } | { kind: 'error' };

export interface MockModeration extends ModerationProvider {
  requests: ModerationRequest[];
  behaviour: ModerationBehaviour;
}

/** Marker words the mock labels, e.g. `~self_harm~` in a message. */
export function mockModeration(): MockModeration {
  const moderation: MockModeration = {
    name: 'mock',
    requests: [],
    behaviour: { kind: 'labels' },
    async moderate(request): Promise<ModerationVerdict> {
      moderation.requests.push(request);
      switch (moderation.behaviour.kind) {
        case 'hang':
          return new Promise<never>(() => {});
        case 'error':
          throw new Error('moderation upstream: sk-test-secret-key');
        case 'labels': {
          return {
            categories: [...request.text.matchAll(/~(\w+)~/g)].map(
              (m) => m[1] as ModerationCategory,
            ),
          };
        }
      }
    },
  };
  return moderation;
}
