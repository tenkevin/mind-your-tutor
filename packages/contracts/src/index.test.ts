import { describe, expect, it } from 'vitest';
import { packageName } from './index.js';

describe('@ideamap/contracts', () => {
  it('builds and runs tests', () => {
    expect(packageName).toBe('@ideamap/contracts');
  });
});
