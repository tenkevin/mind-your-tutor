import { describe, expect, it } from 'vitest';
import { packageName } from './index.js';

describe('@ideamap/domain', () => {
  it('builds and runs tests', () => {
    expect(packageName).toBe('@ideamap/domain');
    expect(1).toBe(2);
  });
});
