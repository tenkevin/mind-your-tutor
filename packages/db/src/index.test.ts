import { describe, expect, it } from 'vitest';
import { packageName } from './index.js';

describe('@ideamap/db', () => {
  it('builds and runs tests', () => {
    expect(packageName).toBe('@ideamap/db');
  });
});
