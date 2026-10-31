import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  FileObjectStore,
  MemoryObjectStore,
  isUploadKeyFor,
  screenUpload,
  sha256,
  uploadKey,
} from './index.js';
import { TABS, file, fixtureBytes, fixtureText, zip } from './testing/build.js';

const ORG = '6f1c2a40-1b2c-4d3e-8f90-123456789abc';
const OTHER = '0a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

describe('upload keys (C4-S3)', () => {
  it('are random, in the organization prefix, and never carry a file name', () => {
    const one = uploadKey(ORG);
    const two = uploadKey(ORG);
    expect(one).toMatch(new RegExp(`^orgs/${ORG}/uploads/[0-9a-f-]{36}$`));
    expect(one).not.toBe(two);
    expect(isUploadKeyFor(ORG, one)).toBe(true);
    expect(isUploadKeyFor(OTHER, one)).toBe(false);
    expect(() => uploadKey('../../etc')).toThrow(RangeError);
  });
});

describe('FileObjectStore (C4-S3)', () => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  });

  it('stores objects readable by the server user only, and refuses other keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ideamap-store-'));
    dirs.push(root);
    const store = new FileObjectStore(root);
    const key = uploadKey(ORG);
    await store.put(key, new Uint8Array([1, 2, 3]));
    expect(await store.get(key)).toEqual(new Uint8Array([1, 2, 3]));
    expect((await stat(join(root, key))).mode & 0o777).toBe(0o600);
    expect((await stat(join(root, 'orgs', ORG, 'uploads'))).mode & 0o777).toBe(0o700);
    // A key is written once.
    await expect(store.put(key, new Uint8Array([9]))).rejects.toThrow();
    await expect(store.get('../../etc/passwd')).rejects.toThrow(RangeError);
    await expect(store.put(`orgs/${ORG}/uploads/../../x`, new Uint8Array())).rejects.toThrow(
      RangeError,
    );
    expect(await store.get(uploadKey(ORG))).toBeNull();
    await store.delete(key);
    expect(await store.get(key)).toBeNull();
    expect(await readdir(join(root, 'orgs', ORG, 'uploads'))).toEqual([]);
  });

  it('MemoryObjectStore checks keys the same way', async () => {
    const store = new MemoryObjectStore();
    await expect(store.put('water-cycle.xlsx', new Uint8Array())).rejects.toThrow(RangeError);
  });
});

describe('screenUpload (C4-S2)', () => {
  it('accepts the sample in each form, with its kind and checksum', async () => {
    const xlsx = fixtureBytes('water-cycle.xlsx');
    const forms = [
      [file('water-cycle.xlsx', xlsx), 'xlsx'],
      [
        file(
          'pack.zip',
          zip(TABS.map((t) => ({ name: `${t}.csv`, data: fixtureText(`${t}.csv`) }))),
        ),
        'csv',
      ],
      [file('pack.json', fixtureText('pack.json')), 'json'],
      [file('Ideas.csv', fixtureText('Ideas.csv')), 'csv'],
    ] as const;
    for (const [f, kind] of forms) {
      const screened = await screenUpload(f);
      expect(screened).toMatchObject({ ok: true, kind });
    }
    expect(await screenUpload(file('water-cycle.xlsx', xlsx))).toMatchObject({
      checksum: sha256(xlsx),
      name: 'water-cycle.xlsx',
    });
  });

  it('refuses a file over the size limit without reading it', async () => {
    const big = new File([Buffer.alloc(60 * 1024 * 1024, 'a')], 'Ideas.csv');
    expect(await screenUpload(big)).toEqual({
      ok: false,
      message: 'Ideas.csv is 60 MB; the most an import accepts is 10 MB per file.',
    });
  });

  it('refuses a zip bomb whatever sizes its headers claim', async () => {
    const zeros = Buffer.alloc(120 * 1024 * 1024);
    for (const claimedSize of [undefined, 1000]) {
      const bomb = zip([{ name: 'Ideas.csv', data: zeros, claimedSize }]);
      const screened = await screenUpload(file('bomb.zip', bomb));
      expect(screened.ok).toBe(false);
      expect(!screened.ok && screened.message).toMatch(/unpacks to more than 100 MB/);
    }
    // No time budget here. It deflates two 120 MB buffers, about 2 s alone and 7 s on
    // a loaded 2-CPU runner, so it gets room beyond Vitest's default 5 s (F1e-F8).
  }, 60_000);

  it('refuses files that are not a pack', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    expect(await screenUpload(file('photo.xlsx', png))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/PNG image/),
    });
  });
});
