import { z } from 'zod';

// Which item banks and licences a Practice row may name (ARCHITECTURE.md D40). This is
// configuration, not logic: the data check (packages/domain) reads a policy, and a
// deployment can supply its own with `parsePracticeSourcePolicy`. Tests that need a
// bank of their own pass `TEST_PRACTICE_SOURCES`, which production never uses.

export const PracticeSourcePolicySchema = z.object({
  /** Vetted item banks, by `source_bank_id`. */
  banks: z.array(z.string().min(1).max(100)).max(200),
  /** Licences, by `license_type`, and whether an item under one needs an `attribution_string`. */
  licenses: z
    .array(z.object({ id: z.string().min(1).max(100), attribution_required: z.boolean() }))
    .max(200),
});
export type PracticeSourcePolicy = z.infer<typeof PracticeSourcePolicySchema>;

/** What production allows to start with (D40). */
export const DEFAULT_PRACTICE_SOURCES: PracticeSourcePolicy = {
  banks: ['OpenStax', 'PhET', 'NASA', 'NOAA'],
  licenses: [
    { id: 'Public Domain', attribution_required: false },
    { id: 'CC-BY-4.0', attribution_required: true },
  ],
};

/** The bank the test fixtures use. Production configuration does not contain it. */
export const TEST_PRACTICE_BANK = 'fixture';

/** The default policy plus the test-only `fixture` bank. For tests and fixtures only. */
export const TEST_PRACTICE_SOURCES: PracticeSourcePolicy = {
  ...DEFAULT_PRACTICE_SOURCES,
  banks: [...DEFAULT_PRACTICE_SOURCES.banks, TEST_PRACTICE_BANK],
};

/** Reads a policy from JSON (a configuration file), or throws a plain-words error. */
export function parsePracticeSourcePolicy(input: unknown): PracticeSourcePolicy {
  const result = PracticeSourcePolicySchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `The Practice source allow-list is not valid: ${result.error.issues
        .map((i) => `${i.path.join('.') || 'policy'}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return result.data;
}
