import { describe, expect, it } from 'vitest';
import { packageName } from './index.js';

describe('@ideamap/ui', () => {
  it('builds and runs tests', () => {
    expect(packageName).toBe('@ideamap/ui');
  });
});
