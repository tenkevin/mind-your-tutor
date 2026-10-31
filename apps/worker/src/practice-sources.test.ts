import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PRACTICE_SOURCES } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { loadPracticeSources } from './practice-sources.js';

describe('loadPracticeSources (C10-F4)', () => {
  const write = (content: string) => {
    const path = join(mkdtempSync(join(tmpdir(), 'practice-')), 'sources.json');
    writeFileSync(path, content);
    return path;
  };

  it('defaults to production banks and licences, without the test-only fixture bank', () => {
    const policy = loadPracticeSources({});
    expect(policy).toEqual(DEFAULT_PRACTICE_SOURCES);
    expect(policy.banks).toEqual(['OpenStax', 'PhET', 'NASA', 'NOAA']);
    expect(policy.banks).not.toContain('fixture');
    expect(policy.licenses.map((l) => l.id)).toEqual(['Public Domain', 'CC-BY-4.0']);
  });

  it('reads the allow-list from the configured file', () => {
    const path = write(
      JSON.stringify({ banks: ['CK-12'], licenses: [{ id: 'CC0', attribution_required: false }] }),
    );
    expect(loadPracticeSources({ PRACTICE_SOURCES_FILE: path }).banks).toEqual(['CK-12']);
  });

  it('refuses an unreadable or invalid file rather than allowing everything', () => {
    expect(() => loadPracticeSources({ PRACTICE_SOURCES_FILE: '/nope/sources.json' })).toThrow(
      /couldn't be read/,
    );
    expect(() => loadPracticeSources({ PRACTICE_SOURCES_FILE: write('{"banks": 3}') })).toThrow(
      /allow-list is not valid/,
    );
  });
});
