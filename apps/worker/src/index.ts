import { pathToFileURL } from 'node:url';
import { QUEUES } from '@ideamap/contracts';
import { FileObjectStore, type ImportLimits, type ObjectStore } from '@ideamap/connectors';
import { createDb, withOrg, type Db } from '@ideamap/db';
import type { PgBoss } from 'pg-boss';
import { abandonImport, runImport, type OrgScope, type RunDeps } from './imports.js';
import { runDrafting, type DraftWriter } from './drafts.js';
import { indexLibrary } from './library.js';
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
export { indexLibrary } from './library.js';
export {
  runDrafting,
  type DraftDeps,
  type DraftOutcome,
  type DraftReply,
  type DraftRequest,
  type DraftWriter,
} from './drafts.js';
export { QUEUE_OPTIONS, createBoss, ensureQueues, inTransaction, type Sender } from './queue.js';

/** The production scope: the app role's connection, acting for one organization. */
export const orgScope =
  (db: Db): OrgScope =>
  (orgId, fn, options) =>
    withOrg(db, orgId, fn, options);

export interface WorkerOptions {
  boss: PgBoss;
  scope: OrgScope;
  store: ObjectStore;
  limits?: Partial<ImportLimits>;
  /** Seconds between polls when idle. Default 2. */
  pollingIntervalSeconds?: number;
  afterStep?: RunDeps['afterStep'];
  /** Writes drafts for empty cells (A6). Left out, the draft queue isn't worked here. */
  draftWriter?: DraftWriter;
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
  await boss.work<unknown>(QUEUES.indexLibrary, { pollingIntervalSeconds }, async ([job]) =>
    job ? indexLibrary(job.data) : undefined,
  );
  if (options.draftWriter) {
    await registerDraftWorker({ boss, scope: options.scope, write: options.draftWriter });
  }
}

/**
 * Works the draft queue (A6). The API process runs this when it holds the model key, so
 * the key stays in the one place that has it; a worker given a writer does the same.
 */
export async function registerDraftWorker(options: {
  boss: PgBoss;
  scope: OrgScope;
  write: DraftWriter;
  pollingIntervalSeconds?: number;
}): Promise<void> {
  const { boss, scope, write } = options;
  await boss.work<unknown>(
    QUEUES.draftMissing,
    { pollingIntervalSeconds: options.pollingIntervalSeconds ?? 2, batchSize: 1 },
    async ([job]) => (job ? runDrafting({ scope, write }, job.data) : undefined),
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
  await registerWorkers({ boss, scope: orgScope(db), store: new FileObjectStore(uploads) });
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
