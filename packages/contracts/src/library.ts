import { z } from 'zod';
import { USE_FOR } from './spec.js';

// The resource library (ARCHITECTURE.md D11, §5, §9). Shared documents belong to a
// curriculum; a class can change how each is used and upload its own. Who retrieves a
// passage is a document's `use_for`; `off` (class settings only) hides it.

export const CLASS_USE_FOR = [...USE_FOR, 'off'] as const;
export const ClassUseForSchema = z.enum(CLASS_USE_FOR);
export type ClassUseFor = z.infer<typeof ClassUseForSchema>;

/** Who is searching: Atlas, the teacher's helper (`agent`), or Ms. Ivy (`tutor`). */
export const LIBRARY_AUDIENCES = ['agent', 'tutor'] as const;
export const LibraryAudienceSchema = z.enum(LIBRARY_AUDIENCES);
export type LibraryAudience = z.infer<typeof LibraryAudienceSchema>;

/** One class's choice for one shared document, as ClassConfig lists them (D11). */
export const LibrarySettingSchema = z.strictObject({
  library_doc_id: z.uuid(),
  use_for: ClassUseForSchema,
});
export type LibrarySetting = z.infer<typeof LibrarySettingSchema>;

export const MAX_LIBRARY_SETTINGS = 500;

/** Search results per request: at least one, at most this many. */
export const MAX_SEARCH_RESULTS = 20;
export const DEFAULT_SEARCH_RESULTS = 5;

/** POST /api/classes/:classId/library/search. */
export const LibrarySearchRequestSchema = z.strictObject({
  query: z.string().trim().min(1).max(2000),
  /** Whose view of the library: Atlas (`agent`) or Ms. Ivy (`tutor`). */
  audience: LibraryAudienceSchema,
  k: z.number().int().min(1).max(MAX_SEARCH_RESULTS).default(DEFAULT_SEARCH_RESULTS),
});
export type LibrarySearchRequest = z.infer<typeof LibrarySearchRequestSchema>;

/** One ranked passage. `location` is the page or section it came from, when known. */
export const LibraryPassageSchema = z.object({
  chunkId: z.uuid(),
  documentId: z.uuid(),
  documentTitle: z.string(),
  source: z.enum(['shared', 'class']),
  page: z.number().int().nullable(),
  section: z.string().nullable(),
  text: z.string(),
  /** Cosine distance: 0 is identical, larger is further. Results are ascending. */
  distance: z.number(),
});
export type LibraryPassage = z.infer<typeof LibraryPassageSchema>;

/** Plain words for a `use_for` value (A3-U1). */
export const USE_FOR_WORDS: Record<ClassUseFor, string> = {
  agent: 'Atlas only',
  tutor: 'Ms. Ivy only',
  both: 'Atlas and Ms. Ivy',
  off: 'Hidden from both',
};

/** One row of the Atlas panel's knowledge sources (A3-U1). */
export const LibrarySourceSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  source: z.enum(['shared', 'class']),
  /** "Shared library" or "Uploaded for this class". */
  sourceLabel: z.string(),
  /** The curriculum's default (shared documents); null for a class upload. */
  defaultUseFor: z.enum(USE_FOR).nullable(),
  useFor: ClassUseForSchema,
  useForLabel: z.string(),
  indexStatus: z.enum(['pending', 'indexing', 'indexed', 'failed']),
});
export type LibrarySource = z.infer<typeof LibrarySourceSchema>;

/**
 * Library jobs queue ids only (0003). A class upload names its class and document;
 * the shared library job (queued by an import) is `LibraryIndexPayloadSchema`.
 */
export const ClassLibraryIndexPayloadSchema = z.object({
  org_id: z.uuid(),
  class_id: z.uuid(),
  class_library_doc_id: z.uuid(),
});
export type ClassLibraryIndexPayload = z.infer<typeof ClassLibraryIndexPayloadSchema>;

/** A shared document's indexing job, for an upload to the shared library. */
export const SharedLibraryIndexPayloadSchema = z.object({
  org_id: z.uuid(),
  curriculum_id: z.uuid(),
  library_doc_id: z.uuid(),
});
export type SharedLibraryIndexPayload = z.infer<typeof SharedLibraryIndexPayloadSchema>;

/** Library document ids a class config names that its curriculum doesn't have. */
export function unknownLibraryDocs(
  settings: readonly LibrarySetting[] | undefined,
  knownDocIds: ReadonlySet<string>,
): string[] {
  return (settings ?? []).map((s) => s.library_doc_id).filter((id) => !knownDocIds.has(id));
}
