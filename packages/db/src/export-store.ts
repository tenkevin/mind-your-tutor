import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

// Where export files live (ARCHITECTURE.md §3 object storage). `export_job.result_ref`
// holds a file's key. Deleting a student (FERPA) and the retention job remove files
// through this interface, so S3-compatible storage can replace the directory later.

export interface ExportStore {
  put(key: string, body: string): Promise<void>;
  /** Remove a file. Removing one that isn't there is not an error. */
  remove(key: string): Promise<void>;
}

/** Keys are short relative paths of safe segments, so none can escape the root. */
const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}(\/[A-Za-z0-9][A-Za-z0-9_-]{0,99}){0,4}\.json$/;

export function assertExportKey(key: string): void {
  if (!KEY.test(key)) throw new RangeError(`Not a valid export key: ${JSON.stringify(key)}`);
}

/** Export files in a local directory: development, tests and single-server installs. */
export class DirectoryExportStore implements ExportStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  path(key: string): string {
    assertExportKey(key);
    const path = join(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new RangeError(`Export key escapes the store`);
    return path;
  }

  async put(key: string, body: string): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    // Owner-only: these files hold student records.
    await writeFile(path, body, { mode: 0o600 });
  }

  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}
