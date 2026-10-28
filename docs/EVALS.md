# Persona evals (A5)

Each built-in persona (Ms. Ivy, Milo, Atlas) runs against fixed, synthetic prompts for each grade band (K–2, 3–5, 6–8, 9–12) before a template change ships (ARCHITECTURE.md §9).

| File | What it holds |
|---|---|
| `packages/ai/evals/cases.json` | Versioned cases: three per persona (on topic, personal data, off topic), one message per band, and the checks each case runs |
| `packages/ai/evals/thresholds.json` | Pass score per persona and band (0 to 1) |
| `packages/ai/evals/recordings.json` | Recorded replies for CI, each with the hash of the prompt it was recorded for |
| `packages/ai/src/evals/harness.ts` | The runner, checks and report |

**How a case runs.** The prompt is filled with the same `fill` as the gateway (A1) and the fixed guardrails go last. The reply is scored on the case's checks (reading level for the band, on topic, refuses personal data, no markdown, Milo asks a question, Atlas names the tab). A band passes when its mean score meets its threshold and no critical check fails (guardrails last, prompt unchanged since recording, refuses personal data).

**In CI** (`pnpm test`, also its own step) the model is the recording. No key, no network, identical scores every run, a few seconds. Editing a template changes the prompt hash, so the case fails until its baseline reply is replaced. That is deliberate: a template change needs a fresh look before it ships.

**Baselines are an interim seed.** The replies in `recordings.json` are hand-written. D34 (ARCHITECTURE.md §1) replaces them with teacher-approved replies, tagged to template versions; how is open in §12 q14, and the later task A5b builds it.

**With a real model** (opt-in, never in CI):

```
IDEAMAP_AI_API_KEY=... pnpm --filter @ideamap/api eval:live          # score only
IDEAMAP_AI_API_KEY=... pnpm --filter @ideamap/api eval:live -- --record   # also rewrite recordings.json
```

The key comes from the environment and is never printed. `IDEAMAP_AI_MODEL` picks the model.

**A2.** The fixed guardrail text lives in `src/evals/guardrails.ts` as a stand-in until A2 lands; `runEvals` takes A2's append function through its `guardrails` option.

A failing run prints one line per failed check: persona / band / case / check, why, and the reply excerpt.
