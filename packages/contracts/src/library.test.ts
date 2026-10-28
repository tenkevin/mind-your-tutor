import { describe, expect, it } from 'vitest';
import { ClassConfigSchema } from './class-config.js';
import {
  LibrarySearchRequestSchema,
  USE_FOR_WORDS,
  CLASS_USE_FOR,
  unknownLibraryDocs,
} from './library.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('ClassConfig library settings (A3-F6, D11)', () => {
  it('accepts agent, tutor, both and off', () => {
    const library = (['agent', 'tutor', 'both', 'off'] as const).map((use_for, i) => ({
      library_doc_id: `${i}0000000-0000-4000-8000-000000000000`,
      use_for,
    }));
    expect(ClassConfigSchema.parse({ library }).library).toEqual(library);
  });

  it('rejects an unknown use_for, a bad id and unknown keys', () => {
    for (const bad of [
      { library_doc_id: A, use_for: 'everyone' },
      { library_doc_id: 'not-a-uuid', use_for: 'both' },
      { library_doc_id: A, use_for: 'both', extra: 1 },
    ]) {
      expect(ClassConfigSchema.safeParse({ library: [bad] }).success).toBe(false);
    }
  });

  it('rejects two settings for one document', () => {
    const result = ClassConfigSchema.safeParse({
      library: [
        { library_doc_id: A, use_for: 'tutor' },
        { library_doc_id: A, use_for: 'off' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('names documents the library does not have', () => {
    const settings = [
      { library_doc_id: A, use_for: 'both' as const },
      { library_doc_id: B, use_for: 'off' as const },
    ];
    expect(unknownLibraryDocs(settings, new Set([A]))).toEqual([B]);
    expect(unknownLibraryDocs(undefined, new Set())).toEqual([]);
  });

  it('describes every setting in plain words', () => {
    for (const use of CLASS_USE_FOR) expect(USE_FOR_WORDS[use].length).toBeGreaterThan(3);
  });
});

describe('library search request', () => {
  it('defaults k and bounds it', () => {
    expect(LibrarySearchRequestSchema.parse({ query: 'why', audience: 'tutor' }).k).toBe(5);
    for (const k of [0, 21, 1.5]) {
      expect(
        LibrarySearchRequestSchema.safeParse({ query: 'why', audience: 'agent', k }).success,
      ).toBe(false);
    }
    expect(LibrarySearchRequestSchema.safeParse({ query: ' ', audience: 'agent' }).success).toBe(
      false,
    );
    expect(LibrarySearchRequestSchema.safeParse({ query: 'x', audience: 'milo' }).success).toBe(
      false,
    );
  });
});
