import { expect } from 'vitest';

/**
 * Timing helpers for tests that assert a latency budget (F1e).
 *
 * A budget is about what the code costs, not about a noisy machine, so a single
 * `performance.now()` span is the wrong measure. These helpers run the operation
 * `runs` times and judge the *best* run (the one least disturbed by GC, JIT and
 * neighbours), or the median for tests whose budget is a median. Budgets are never
 * scaled here: a real slowdown moves every run, so the best run moves with it.
 * Failures name the label, the budget and every sample.
 */
export type Timing = { best: number; median: number; samples: number[] };

const fmt = (ms: number) => `${ms.toFixed(2)} ms`;

export const summarize = (samples: number[]): Timing => {
  const sorted = [...samples].sort((a, b) => a - b);
  return { best: sorted[0]!, median: sorted[Math.floor(sorted.length / 2)]!, samples };
};

/** Run `op` `runs` times; returns the timing and the last result. No assertions. */
export async function timeRuns<T>(
  op: () => T | Promise<T>,
  { runs = 3 }: { runs?: number } = {},
): Promise<Timing & { result: T }> {
  const samples: number[] = [];
  let result!: T;
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    result = await op();
    samples.push(performance.now() - started);
  }
  return { ...summarize(samples), result };
}

/** Assert the best of `runs` runs of `op` is under `budgetMs`. Returns the last result. */
export async function expectBestUnder<T>(
  label: string,
  budgetMs: number,
  op: () => T | Promise<T>,
  opts: { runs?: number } = {},
): Promise<T> {
  const t = await timeRuns(op, opts);
  expectTimingUnder(label, budgetMs, t.best, t, 'best');
  return t.result;
}

/** Assert an already-measured figure is under `budgetMs`, printing the samples if not. */
export function expectTimingUnder(
  label: string,
  budgetMs: number,
  measuredMs: number,
  timing: Timing,
  what = 'measured',
): void {
  expect(
    measuredMs,
    `${label}: ${what} ${fmt(measuredMs)} is over the ${fmt(budgetMs)} budget ` +
      `(samples: ${timing.samples.map(fmt).join(', ')})`,
  ).toBeLessThan(budgetMs);
}
