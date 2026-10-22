import { describe, expect, it } from 'vitest';
import { packageName } from './index.js';

describe('@ideamap/connectors', () => {
  it('builds and runs tests', () => {
    expect(packageName).toBe('@ideamap/connectors');
  });
});
