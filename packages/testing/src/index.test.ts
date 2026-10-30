import { describe, expect, it } from 'vitest';
import { expectBestUnder, summarize, timeRuns } from './index.js';

const spin = (ms: number) => {
  const end = performance.now() + ms;
  while (performance.now() < end);
};

describe('timing helpers', () => {
  it('summarizes best and median', () => {
    expect(summarize([5, 1, 3])).toMatchObject({ best: 1, median: 3 });
  });

  it('judges the best run, so one slow run does not fail a fast operation', async () => {
    let n = 0;
    await expectBestUnder('fast op', 40, () => spin(n++ === 0 ? 80 : 1), { runs: 3 });
  });

  it('fails a consistently slow operation and names the test, budget and samples', async () => {
    await expect(expectBestUnder('slow op', 10, () => spin(30), { runs: 2 })).rejects.toThrow(
      /slow op: best \d+\.\d\d ms is over the 10\.00 ms budget \(samples: \d+\.\d\d ms, \d+\.\d\d ms\)/,
    );
  });

  it('runs the operation the requested number of times', async () => {
    let n = 0;
    const t = await timeRuns(() => ++n, { runs: 4 });
    expect(t.samples).toHaveLength(4);
    expect(t.result).toBe(4);
  });
});
