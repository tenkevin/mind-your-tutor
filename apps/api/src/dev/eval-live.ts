import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  formatReport,
  runEvals,
  sha256,
  type EvalModel,
  type EvalSet,
  type Recording,
  type Thresholds,
} from '@ideamap/ai';
import { anthropicProvider } from '../ai/anthropic.js';
import { loadAiConfig } from '../ai/config.js';

// Opt-in persona evals against a real model (A5, docs/EVALS.md). CI never runs this: it
// scores the recorded replies instead. The key comes from IDEAMAP_AI_API_KEY and is
// never printed. `--record` also rewrites packages/ai/evals/recordings.json.

const dir = new URL('../../../../packages/ai/evals/', import.meta.url);
const path = (name: string) => fileURLToPath(new URL(name, dir));
const read = <T>(name: string) => JSON.parse(readFileSync(path(name), 'utf8')) as T;

const config = loadAiConfig();
if (!config.apiKey) {
  console.error('Set IDEAMAP_AI_API_KEY to run the evals against a real model.');
  process.exit(2);
}
const provider = anthropicProvider({ apiKey: config.apiKey, fallbacks: config.fallbacks });
const recordings: Record<string, Recording> = {};

const model: EvalModel = async ({ caseId, system, message }) => {
  const reply = await provider.complete({
    model: config.model,
    system,
    messages: [{ role: 'user', content: message }],
    user: 'eval',
    maxTokens: config.maxTokens,
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  recordings[caseId] = { promptSha: sha256(system), text: reply.text };
  return { text: reply.text };
};

const report = await runEvals({
  set: read<EvalSet>('cases.json'),
  thresholds: read<Thresholds>('thresholds.json'),
  model,
});
console.log(formatReport(report));
if (process.argv.includes('--record')) {
  writeFileSync(path('recordings.json'), `${JSON.stringify(recordings, null, 2)}\n`);
  console.log('Wrote recordings.json.');
}
process.exit(report.pass ? 0 : 1);
