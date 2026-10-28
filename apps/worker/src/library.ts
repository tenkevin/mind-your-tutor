import {
  ClassLibraryIndexPayloadSchema,
  LibraryIndexPayloadSchema,
  SharedLibraryIndexPayloadSchema,
} from '@ideamap/contracts';
import type { Embedder } from '@ideamap/ai';
import {
  chunkSections,
  extractDocument,
  isUploadKeyFor,
  sha256,
  type LibraryLimits,
  type ObjectStore,
  type TextChunk,
} from '@ideamap/connectors';
import { CLASS_SETTING, toVector } from '@ideamap/db';
import { FileRefused } from '@ideamap/connectors';
import { sql } from 'kysely';
import type { OrgScope } from './imports.js';

// Library indexing (ARCHITECTURE.md §7, task A3): a job reads an uploaded document, cuts
// it into passages and stores each with its embedding. It runs apart from imports, so an
// import never waits for it (C4-F8), and a document's `index_status` shows where it is:
// pending → indexing → indexed, or failed when the file can't be read.
//
// Jobs carry ids only. Three shapes share the queue:
//   - a shared document (`library_doc_id`), queued when a curriculum author uploads one;
//   - a class upload (`class_library_doc_id`), queued when a teacher uploads one;
//   - a curriculum's new version (`version_id`, queued by an import): indexes the shared
//     documents of that curriculum still pending.
// Re-running a job replaces the document's passages, so retries are safe.

export interface IndexDeps {
  scope: OrgScope;
  store: ObjectStore;
  embedder: Embedder;
  limits?: Partial<LibraryLimits>;
}

export interface IndexResult {
  /** Documents indexed by this run. */
  indexed: number;
  /** Documents that could not be read and are now marked failed. */
  failed: number;
}

/** Passages embedded per call to the embedder. */
const EMBED_BATCH = 64;
/** Rows inserted per statement. */
const INSERT_BATCH = 100;

type Target =
  | { kind: 'shared'; orgId: string; curriculumId: string; docId: string }
  | { kind: 'class'; orgId: string; classId: string; docId: string };

interface DocRow {
  id: string;
  title: string;
  file_url: string;
}

const table = (target: Target) =>
  target.kind === 'shared' ? ('library_doc' as const) : ('class_library_doc' as const);

/** The document's row, claimed for indexing; null if it is gone or already indexed. */
async function claim(deps: IndexDeps, target: Target): Promise<DocRow | null> {
  return deps.scope(target.orgId, async (trx) => {
    if (target.kind === 'class') {
      await sql`SELECT set_config(${CLASS_SETTING}, ${target.classId}, true)`.execute(trx);
    }
    const name = table(target);
    const row = await trx
      .selectFrom(name)
      .select(['id', 'title', 'file_url'])
      .where('id', '=', target.docId)
      .where('index_status', 'in', ['pending', 'indexing', 'failed'])
      .executeTakeFirst();
    if (!row) return null;
    await trx
      .updateTable(name)
      .set({ index_status: 'indexing' })
      .where('id', '=', row.id)
      .execute();
    return row;
  });
}

async function markFailed(deps: IndexDeps, target: Target): Promise<void> {
  await deps.scope(target.orgId, async (trx) => {
    if (target.kind === 'class') {
      await sql`SELECT set_config(${CLASS_SETTING}, ${target.classId}, true)`.execute(trx);
    }
    await trx
      .updateTable(table(target))
      .set({ index_status: 'failed' })
      .where('id', '=', target.docId)
      .where('index_status', '!=', 'indexed')
      .execute();
  });
}

async function embedAll(embedder: Embedder, chunks: readonly TextChunk[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH).map((c) => c.content);
    const out = await embedder.embed(batch);
    if (out.length !== batch.length || out.some((v) => v.length !== embedder.dimensions)) {
      throw new Error('The embedder returned the wrong number or width of vectors.');
    }
    vectors.push(...out);
  }
  return vectors;
}

async function store(
  deps: IndexDeps,
  target: Target,
  checksum: string,
  chunks: readonly TextChunk[],
  vectors: readonly number[][],
): Promise<void> {
  await deps.scope(target.orgId, async (trx) => {
    const rows = chunks.map((chunk, i) => ({
      ordinal: chunk.ordinal,
      content: chunk.content,
      embedding: toVector(vectors[i]!),
      page: chunk.page,
      section: chunk.section,
    }));
    if (target.kind === 'shared') {
      await trx.deleteFrom('chunk').where('library_doc_id', '=', target.docId).execute();
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await trx
          .insertInto('chunk')
          .values(
            rows.slice(i, i + INSERT_BATCH).map((row) => ({
              ...row,
              org_id: target.orgId,
              curriculum_id: target.curriculumId,
              library_doc_id: target.docId,
            })),
          )
          .execute();
      }
    } else {
      await sql`SELECT set_config(${CLASS_SETTING}, ${target.classId}, true)`.execute(trx);
      await trx
        .deleteFrom('class_chunk')
        .where('class_library_doc_id', '=', target.docId)
        .execute();
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await trx
          .insertInto('class_chunk')
          .values(
            rows.slice(i, i + INSERT_BATCH).map((row) => ({
              ...row,
              org_id: target.orgId,
              class_id: target.classId,
              class_library_doc_id: target.docId,
            })),
          )
          .execute();
      }
    }
    const indexed = await trx
      .updateTable(table(target))
      .set({ index_status: 'indexed', checksum, indexed_at: sql<Date>`now()` })
      .where('id', '=', target.docId)
      .returning('replaces_id')
      .executeTakeFirstOrThrow();
    // A new version takes over from the one it replaces only now that it can be searched,
    // so search never has a gap. The old version and its passages are kept (D31).
    if (indexed.replaces_id) {
      await trx
        .updateTable(table(target))
        .set({ archived_at: sql<Date>`now()` })
        .where('id', '=', indexed.replaces_id)
        .where('archived_at', 'is', null)
        .execute();
    }
  });
}

/** Indexes one document. Returns true if it is now indexed, false if it can't be read. */
async function indexDocument(deps: IndexDeps, target: Target): Promise<boolean | null> {
  const doc = await claim(deps, target);
  if (!doc) return null;
  // Only files this app stored are read: a URL from a sheet is never fetched (D4).
  if (!isUploadKeyFor(target.orgId, doc.file_url)) {
    await markFailed(deps, target);
    return false;
  }
  const bytes = await deps.store.get(doc.file_url);
  if (!bytes) {
    await markFailed(deps, target);
    return false;
  }
  let chunks: TextChunk[];
  try {
    const extracted = extractDocument(null, bytes, deps.limits);
    chunks = chunkSections(extracted.sections, { maxChunks: deps.limits?.maxChunks });
  } catch (cause) {
    if (cause instanceof FileRefused) {
      // The original is kept (D31), so a corrected tool or vendor can try it again.
      await markFailed(deps, target);
      return false;
    }
    throw cause;
  }
  const vectors = await embedAll(deps.embedder, chunks);
  await store(deps, target, sha256(bytes), chunks, vectors);
  return true;
}

/** The shared documents of a curriculum that still need indexing. */
async function pendingShared(deps: IndexDeps, orgId: string, curriculumId: string) {
  return deps.scope(orgId, (trx) =>
    trx
      .selectFrom('library_doc')
      .select('id')
      .where('curriculum_id', '=', curriculumId)
      .where('index_status', 'in', ['pending', 'indexing'])
      .orderBy('created_at')
      .execute(),
  );
}

export async function indexLibrary(deps: IndexDeps, data: unknown): Promise<IndexResult> {
  const result: IndexResult = { indexed: 0, failed: 0 };
  const count = (outcome: boolean | null) => {
    if (outcome === true) result.indexed++;
    if (outcome === false) result.failed++;
  };

  const klass = ClassLibraryIndexPayloadSchema.safeParse(data);
  if (klass.success) {
    const { org_id: orgId, class_id: classId, class_library_doc_id: docId } = klass.data;
    count(await indexDocument(deps, { kind: 'class', orgId, classId, docId }));
    return result;
  }
  const shared = SharedLibraryIndexPayloadSchema.safeParse(data);
  if (shared.success) {
    const { org_id: orgId, curriculum_id: curriculumId, library_doc_id: docId } = shared.data;
    count(await indexDocument(deps, { kind: 'shared', orgId, curriculumId, docId }));
    return result;
  }
  const version = LibraryIndexPayloadSchema.parse(data);
  const pending = await pendingShared(deps, version.org_id, version.curriculum_id);
  for (const doc of pending) {
    count(
      await indexDocument(deps, {
        kind: 'shared',
        orgId: version.org_id,
        curriculumId: version.curriculum_id,
        docId: doc.id,
      }),
    );
  }
  return result;
}

/**
 * Marks a document failed after its last retry ran out on an unexpected error, so its
 * status doesn't read "indexing" forever.
 */
export async function abandonLibraryIndex(deps: Pick<IndexDeps, 'scope'>, data: unknown) {
  const forDeps = deps as IndexDeps;
  const klass = ClassLibraryIndexPayloadSchema.safeParse(data);
  if (klass.success) {
    const { org_id: orgId, class_id: classId, class_library_doc_id: docId } = klass.data;
    return markFailed(forDeps, { kind: 'class', orgId, classId, docId });
  }
  const shared = SharedLibraryIndexPayloadSchema.safeParse(data);
  if (shared.success) {
    const { org_id: orgId, curriculum_id: curriculumId, library_doc_id: docId } = shared.data;
    return markFailed(forDeps, { kind: 'shared', orgId, curriculumId, docId });
  }
  const version = LibraryIndexPayloadSchema.safeParse(data);
  if (!version.success) return;
  for (const doc of await pendingShared(forDeps, version.data.org_id, version.data.curriculum_id)) {
    await markFailed(forDeps, {
      kind: 'shared',
      orgId: version.data.org_id,
      curriculumId: version.data.curriculum_id,
      docId: doc.id,
    });
  }
}
