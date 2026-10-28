import { ConfigError } from '../config.js';
import type { AiLimits } from './limits.js';

// AI gateway settings, from environment variables only (§9, A1-S1). `.env.example`
// lists every name. The provider key is never defaulted, logged or sent to a browser;
// without one, the gateway's routes aren't registered.

export interface AiConfig {
  /** The provider key; null leaves the gateway off. */
  apiKey: string | null;
  model: string;
  /** Server-side refusal fallback; turn off for a model that doesn't support it. */
  fallbacks: boolean;
  maxTokens: number;
  timeoutMs: number;
  /** How long a moderation check may take before the turn fails closed (A2). */
  moderationTimeoutMs: number;
  limits: AiLimits;
}

type Env = Record<string, string | undefined>;

function whole(env: Env, name: string, fallback: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > max) {
    throw new ConfigError(`${name} must be a whole number from 1 to ${max}.`);
  }
  return n;
}

export function loadAiConfig(env: Env = process.env): AiConfig {
  const model = env.IDEAMAP_AI_MODEL || 'claude-opus-5-5';
  if (!/^[\w.:@/-]{1,100}$/.test(model)) {
    throw new ConfigError('IDEAMAP_AI_MODEL is not a model id.');
  }
  return {
    apiKey: env.IDEAMAP_AI_API_KEY || null,
    model,
    fallbacks: env.IDEAMAP_AI_FALLBACKS !== 'off',
    maxTokens: whole(env, 'IDEAMAP_AI_MAX_TOKENS', 2000, 64_000),
    timeoutMs: whole(env, 'IDEAMAP_AI_TIMEOUT_MS', 30_000, 600_000),
    moderationTimeoutMs: whole(env, 'IDEAMAP_AI_MODERATION_TIMEOUT_MS', 5_000, 60_000),
    limits: {
      perStudent: whole(env, 'IDEAMAP_AI_STUDENT_PER_MINUTE', 10, 10_000),
      perClass: whole(env, 'IDEAMAP_AI_CLASS_PER_MINUTE', 120, 100_000),
      windowMs: 60_000,
    },
  };
}
