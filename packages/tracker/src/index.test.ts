import { describe, expect, it } from 'vitest';
import { packageName } from './index.js';

describe('@ideamap/tracker', () => {
  it('builds and runs tests', () => {
    expect(packageName).toBe('@ideamap/tracker');
  });
});
