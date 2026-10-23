import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Object storage for uploads (ARCHITECTURE.md §3, C4-S3). Every upload is stored
// under a random key in its organization's prefix, never under the name the user
// gave it: the name is only kept as data on the import job. A deployment uses an
// S3-compatible bucket behind the same interface; the file store serves one server
// and tests.

export interface ObjectStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** The object's bytes, or null if there is none. */
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UPLOAD_KEY = new RegExp(`^orgs/${UUID}/uploads/${UUID}$`);

/** A new random key for one organization's upload: `orgs/<org>/uploads/<random>`. */
export function uploadKey(orgId: string): string {
  const key = `orgs/${orgId.toLowerCase()}/uploads/${randomUUID()}`;
  if (!UPLOAD_KEY.test(key)) throw new RangeError('orgId must be a UUID.');
  return key;
}

/** True when `key` is an upload key in `orgId`'s prefix. */
export function isUploadKeyFor(orgId: string, key: string): boolean {
  return UPLOAD_KEY.test(key) && key.startsWith(`orgs/${orgId.toLowerCase()}/`);
}

function checkKey(key: string): string {
  if (!UPLOAD_KEY.test(key)) throw new RangeError('Not an upload key.');
  return key;
}

/**
 * Objects as files under one directory, readable and writable by the server's own
 * user only (directories 0700, files 0600). Keys are checked against the upload
 * pattern, so they can't name a path outside the directory.
 */
export class FileObjectStore implements ObjectStore {
  constructor(private readonly root: string) {}

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const path = join(this.root, checkKey(key));
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(join(this.root, checkKey(key))));
    } catch (cause) {
      if ((cause as { code?: string }).code === 'ENOENT') return null;
      throw cause;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(join(this.root, checkKey(key)), { force: true });
  }
}

/** Objects in memory, for tests. */
export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, Uint8Array>();

  async put(key: string, bytes: Uint8Array): Promise<void> {
    if (this.objects.has(checkKey(key))) throw new Error('Key exists.');
    this.objects.set(key, new Uint8Array(bytes));
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(checkKey(key)) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(checkKey(key));
  }
}
