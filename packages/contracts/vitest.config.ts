import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Timing tests assert latency budgets, so test files never share the CPU (F1e).
    fileParallelism: false,
  },
});
