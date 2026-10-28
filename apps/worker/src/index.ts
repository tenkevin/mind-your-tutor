import { pathToFileURL } from 'node:url';
import { QUEUES } from '@ideamap/contracts';
import {
  FileObjectStore,
  type ImportLimits,
  type LibraryLimits,
  type ObjectStore,
} from '@ideamap/connectors';
import { createDb, withOrg, type Db } from '@ideamap/db';
import type { PgBoss } from 'pg-boss';
import { abandonImport, runImport, type OrgScope, type RunDeps } from './imports.js';
import { abandonLibraryIndex, indexLibrary } from './library.js';
import type { Embedder } from '@ideamap/ai';
import { hashEmbedder } from '@ideamap/ai';
import { QUEUE_OPTIONS, createBoss, ensureQueues } from './queue.js';

export const packageName = '@ideamap/worker';
export {
  ImportRequestError,
  abandonImport,
  getCurriculumData,
  getImportJob,
  importFailure,
  packSeed,
  runImport,
  startImport,
  type Caller,
  type ImportDeps,
  type OrgScope,
  type RunDeps,
  type RunOutcome,
  type UploadRequest,
} from './imports.js';
export { abandonLibraryIndex, indexLibrary, type IndexDeps, type IndexResult } from './library.js';
export { QUEUE_OPTIONS, createBoss, ensureQueues, inTransaction, type Sender } from './queue.js';

/** The production scope: the app role's connection, acting for one organization. */
export const orgScope =
  (db: Db): OrgScope =>
  (orgId, fn) =>
    withOrg(db, orgId, fn);

export interface WorkerOptions {
  boss: PgBoss;
  scope: OrgScope;
  store: ObjectStore;
  /** Turns library passages into vectors (A3). The vendor is open (§12 q6). */
  embedder: Embedder;
  limits?: Partial<ImportLimits>;
  libraryLimits?: Partial<LibraryLimits>;
  /** Seconds between polls when idle. Default 2. */
  pollingIntervalSeconds?: number;
  afterStep?: RunDeps['afterStep'];
}

/** Registers the job handlers on a started pg-boss. */
export async function registerWorkers(options: WorkerOptions): Promise<void> {
  const { boss } = options;
  await ensureQueues(boss);
  const deps: RunDeps = options;
  const pollingIntervalSeconds = options.pollingIntervalSeconds ?? 2;
  await boss.work<unknown>(
    QUEUES.import,
    { pollingIntervalSeconds, batchSize: 1 },
    async ([job]) => {
      if (!job) return;
      try {
        return { outcome: await runImport(deps, job.data) };
      } catch (cause) {
        if (job.retryCount >= QUEUE_OPTIONS[QUEUES.import].retryLimit) {
          await abandonImport(deps, job.data);
        }
        throw cause;
      }
    },
  );
  const library = {
    scope: options.scope,
    store: options.store,
    embedder: options.embedder,
    limits: options.libraryLimits,
  };
  await boss.work<unknown>(
    QUEUES.indexLibrary,
    { pollingIntervalSeconds, batchSize: 1 },
    async ([job]) => {
      if (!job) return;
      try {
        return await indexLibrary(library, job.data);
      } catch (cause) {
        if (job.retryCount >= QUEUE_OPTIONS[QUEUES.indexLibrary].retryLimit) {
          await abandonLibraryIndex(library, job.data);
        }
        throw cause;
      }
    },
  );
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const uploads = process.env.UPLOAD_DIR;
  if (!url || !uploads) throw new Error('Set DATABASE_URL and UPLOAD_DIR.');
  const db = createDb(url);
  const boss = createBoss(url);
  boss.on('error', (error) => console.error(error));
  await boss.start();
  // The embedding vendor is an open question (ARCHITECTURE.md §12 q6). Until it is
  // settled the worker uses the deterministic development embedder, which matches words,
  // not meaning; a real model plugs in here behind `Embedder`.
  console.warn('Library indexing uses the development embedder (word matching only).');
  await registerWorkers({
    boss,
    scope: orgScope(db),
    store: new FileObjectStore(uploads),
    embedder: hashEmbedder(),
  });
  const stop = async () => {
    await boss.stop({ graceful: true });
    await db.destroy();
  };
  process.once('SIGTERM', () => void stop());
  process.once('SIGINT', () => void stop());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
export * from './retention.js';
