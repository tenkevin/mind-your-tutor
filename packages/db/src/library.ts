import { USE_FOR_WORDS, type LibraryAudience, type LibrarySource } from '@ideamap/contracts';
import { sql, type Transaction } from 'kysely';
import { toVector } from './client.js';
import { CLASS_SETTING } from './migrations/helpers.js';
import type { Database } from './schema.js';

// Library search for one class (ARCHITECTURE.md D11, §9). Atlas and Ms. Ivy search the
// shared library of the class's curriculum plus the class's own uploads, after the class's
// settings are applied:
//
//   - a shared document is used as the class set it (`agent`, `tutor`, `both` or `off`),
//     else as the curriculum's default; an upload is used as its own `use_for`;
//   - Atlas (`agent`) sees documents set to agent or both; Ms. Ivy (`tutor`), tutor or both;
//   - only indexed documents are searched, and never another class's uploads.
//
// Vector search never leaves the filter to the index alone. An HNSW scan returns its
// nearest candidates first and the filter then drops some, so a selective filter could
// return fewer than k rows even when k exist (F4 QA finding 3). Each query therefore
// (a) names the curriculum or class and the allowed documents in its WHERE, (b) turns on
// pgvector's iterative scan when the server has it (0.8+), so the index keeps scanning
// until it has k rows, and (c) falls back to an exact scan when it still returns fewer
// than k, which is correct by construction and cheap because the filter is selective.

type Trx = Transaction<Database>;

export interface PassageRow {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  source: 'shared' | 'class';
  page: number | null;
  section: string | null;
  text: string;
  distance: number;
}

export interface SearchInput {
  classId: string;
  audience: LibraryAudience;
  /** The query's embedding, as the library's embedder made it. */
  embedding: readonly number[];
  k: number;
}

/** Most index entries one scan may visit when iterating (pgvector's default is 20,000). */
const MAX_SCAN_TUPLES = 200_000;
let iterativeScan: boolean | undefined;

/** Turns on iterative HNSW scans for this transaction, if the server supports them. */
async function enableIterativeScan(trx: Trx): Promise<void> {
  if (iterativeScan === false) return;
  await sql`SAVEPOINT library_iterative`.execute(trx);
  try {
    await sql`SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true),
      set_config('hnsw.max_scan_tuples', ${String(MAX_SCAN_TUPLES)}, true),
      set_config('hnsw.ef_search', '100', true)`.execute(trx);
    await sql`RELEASE SAVEPOINT library_iterative`.execute(trx);
    iterativeScan = true;
  } catch {
    // pgvector before 0.8: no such setting. The exact fallback keeps results complete.
    await sql`ROLLBACK TO SAVEPOINT library_iterative`.execute(trx);
    iterativeScan = false;
  }
}

interface CandidateTable {
  table: 'chunk' | 'class_chunk';
  docColumn: 'library_doc_id' | 'class_library_doc_id';
  scopeColumn: 'curriculum_id' | 'class_id';
}

const SHARED: CandidateTable = {
  table: 'chunk',
  docColumn: 'library_doc_id',
  scopeColumn: 'curriculum_id',
};
const UPLOADS: CandidateTable = {
  table: 'class_chunk',
  docColumn: 'class_library_doc_id',
  scopeColumn: 'class_id',
};

interface Hit {
  id: string;
  doc_id: string;
  page: number | null;
  section: string | null;
  content: string;
  distance: number;
}

async function nearest(
  trx: Trx,
  from: CandidateTable,
  scopeId: string,
  docIds: readonly string[],
  vector: string,
  k: number,
): Promise<Hit[]> {
  if (docIds.length === 0) return [];
  const table = sql.table(from.table);
  const scope = sql.ref(from.scopeColumn);
  const doc = sql.ref(from.docColumn);
  const ids = sql`ARRAY[${sql.join(docIds.map((id) => sql`${id}::uuid`))}]`;
  // Results may arrive slightly out of order from a relaxed scan; sort them again.
  const indexed = await sql<Hit>`
    SELECT * FROM (
      SELECT id, ${doc} AS doc_id, page, section, content,
        embedding <=> ${vector}::vector AS distance
      FROM ${table}
      WHERE ${scope} = ${scopeId}::uuid AND ${doc} = ANY(${ids})
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${k}
    ) nearest
    ORDER BY distance, id
  `.execute(trx);
  if (indexed.rows.length >= k) return indexed.rows;
  // Fewer than k: either the scope has fewer, or the index missed some. An ORDER BY on
  // an expression the index can't serve scans the filtered rows exactly.
  const exact = await sql<Hit>`
    SELECT id, ${doc} AS doc_id, page, section, content,
      embedding <=> ${vector}::vector AS distance
    FROM ${table}
    WHERE ${scope} = ${scopeId}::uuid AND ${doc} = ANY(${ids})
    ORDER BY (embedding <=> ${vector}::vector) + 0, id
    LIMIT ${k}
  `.execute(trx);
  return exact.rows;
}

/** The documents of a class, with how the class uses each (D11). */
export async function librarySources(trx: Trx, classId: string): Promise<LibrarySource[]> {
  // Settings and uploads are class-scoped under row-level security (0010).
  await sql`SELECT set_config(${CLASS_SETTING}, ${classId}, true)`.execute(trx);
  const shared = await trx
    .selectFrom('library_doc as d')
    .innerJoin('class as c', 'c.curriculum_id', 'd.curriculum_id')
    .leftJoin('class_library_setting as s', (join) =>
      join.onRef('s.library_doc_id', '=', 'd.id').onRef('s.class_id', '=', 'c.id'),
    )
    .select(['d.id', 'd.title', 'd.use_for as default_use_for', 's.use_for', 'd.index_status'])
    .where('c.id', '=', classId)
    .orderBy('d.title')
    .orderBy('d.id')
    .execute();
  const uploads = await trx
    .selectFrom('class_library_doc')
    .select(['id', 'title', 'use_for', 'index_status'])
    .where('class_id', '=', classId)
    .orderBy('title')
    .orderBy('id')
    .execute();
  return [
    ...shared.map((d) => {
      const useFor = d.use_for ?? d.default_use_for;
      return {
        id: d.id,
        title: d.title,
        source: 'shared' as const,
        sourceLabel: 'Shared library',
        defaultUseFor: d.default_use_for,
        useFor,
        useForLabel: USE_FOR_WORDS[useFor],
        indexStatus: d.index_status,
      };
    }),
    ...uploads.map((u) => ({
      id: u.id,
      title: u.title,
      source: 'class' as const,
      sourceLabel: 'Uploaded for this class',
      defaultUseFor: null,
      useFor: u.use_for,
      useForLabel: USE_FOR_WORDS[u.use_for],
      indexStatus: u.index_status,
    })),
  ];
}

/** True if a document used as `useFor` is shown to `audience`. */
const reaches = (useFor: string, audience: LibraryAudience) =>
  useFor === 'both' || useFor === audience;

/**
 * The k passages nearest the query among the class's shared documents and uploads that
 * `audience` may use, nearest first. Call it inside a transaction for the class's
 * organization, after checking the caller may act for the class; it sets the class scope
 * itself. Returns fewer than k only when the class's library has fewer.
 */
export async function searchLibrary(trx: Trx, input: SearchInput): Promise<PassageRow[]> {
  const { classId, audience, k } = input;
  if (!Number.isInteger(k) || k < 1) throw new RangeError('k must be a positive integer.');
  const sources = await librarySources(trx, classId);
  const usable = sources.filter((s) => s.indexStatus === 'indexed' && reaches(s.useFor, audience));
  if (usable.length === 0) return [];
  const titles = new Map(usable.map((s) => [s.id, s.title]));
  const curriculum = await trx
    .selectFrom('class')
    .select('curriculum_id')
    .where('id', '=', classId)
    .executeTakeFirst();
  if (!curriculum) return [];

  const vector = toVector(input.embedding);
  await enableIterativeScan(trx);
  // One connection runs one statement at a time, so these go in turn.
  const shared = await nearest(
    trx,
    SHARED,
    curriculum.curriculum_id,
    usable.filter((s) => s.source === 'shared').map((s) => s.id),
    vector,
    k,
  );
  const uploaded = await nearest(
    trx,
    UPLOADS,
    classId,
    usable.filter((s) => s.source === 'class').map((s) => s.id),
    vector,
    k,
  );

  const passage = (source: 'shared' | 'class') => (hit: Hit) => ({
    chunkId: hit.id,
    documentId: hit.doc_id,
    documentTitle: titles.get(hit.doc_id) ?? '',
    source,
    page: hit.page,
    section: hit.section,
    text: hit.content,
    distance: Number(hit.distance),
  });
  return [...shared.map(passage('shared')), ...uploaded.map(passage('class'))]
    .sort((a, b) => a.distance - b.distance || a.chunkId.localeCompare(b.chunkId))
    .slice(0, k);
}
