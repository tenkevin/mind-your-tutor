import { LibraryIndexPayloadSchema } from '@ideamap/contracts';

// Library indexing (chunk, embed) runs as its own job (ARCHITECTURE.md §7), so an
// import never waits for it (C4-F8). The import queues one per new version; A3
// builds the indexing itself. Until then the job only checks its payload.

export interface IndexResult {
  indexed: number;
}

export function indexLibrary(data: unknown): Promise<IndexResult> {
  LibraryIndexPayloadSchema.parse(data);
  return Promise.resolve({ indexed: 0 });
}
