import { readFileSync } from 'node:fs';
import {
  DEFAULT_PRACTICE_SOURCES,
  parsePracticeSourcePolicy,
  type PracticeSourcePolicy,
} from '@ideamap/contracts';

/**
 * The item banks and licences Practice rows may name (D40): the JSON file named by
 * `PRACTICE_SOURCES_FILE` (`{ "banks": [...], "licenses": [{ "id", "attribution_required" }] }`),
 * or OpenStax, PhET, NASA and NOAA under Public Domain and CC-BY-4.0 when it isn't set.
 * A file that can't be read or isn't valid stops the worker rather than allowing everything.
 */
export function loadPracticeSources(
  env: Record<string, string | undefined> = process.env,
): PracticeSourcePolicy {
  const path = env.PRACTICE_SOURCES_FILE;
  if (!path) return DEFAULT_PRACTICE_SOURCES;
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    throw new Error(
      `PRACTICE_SOURCES_FILE (${path}) couldn't be read as JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  return parsePracticeSourcePolicy(json);
}
