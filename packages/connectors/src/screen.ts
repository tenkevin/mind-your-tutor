import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { detect, readUpload, sourceName } from './detect.js';
import { DEFAULT_LIMITS, FileRefused, megabytes, type ImportLimits } from './issues.js';
import type { SourceKind } from './types.js';
import { ZipReader } from './zip.js';

// The checks an upload must pass before an import job is queued (C4-S2): the C1 file
// size limit, a type the importer reads, and, for a zip or workbook, the unpacked-size
// and entry-count budgets. The job runs the full import later; this only refuses
// files that could never import, so they never reach the queue or storage.

export type Screened =
  | { ok: true; kind: SourceKind; name: string; bytes: Uint8Array; checksum: string }
  | { ok: false; message: string };

/** SHA-256 of the bytes, lowercase hex (VersionSource.checksum). */
export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Unpacks every entry of a zip, discarding the output, so a zip bomb is caught
 * whatever its headers claim. The budget is shared across entries as in C1.
 */
function screenZip(bytes: Uint8Array, label: string, limits: ImportLimits): void {
  const budget = { remaining: limits.maxUnpackedBytes, total: limits.maxUnpackedBytes };
  const zip = ZipReader.open(bytes, budget, limits.maxZipEntries);
  zip.preflightDeclared(zip.allEntries);
  const tooBig = () =>
    new FileRefused(
      `${label} unpacks to more than ${megabytes(budget.total)}, which is the most an import can unpack.`,
    );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const entry of zip.allEntries) {
    // The importer reports damaged, encrypted or unsupported entries itself.
    if (entry.method !== 8 || entry.encrypted) continue;
    const at = entry.localOffset;
    if (at + 30 > bytes.length || view.getUint32(at, true) !== 0x04034b50) continue;
    const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
    const packed = bytes.subarray(start, Math.min(bytes.length, start + entry.compressedSize));
    let size: number;
    try {
      size = inflateRawSync(packed, { maxOutputLength: Math.max(1, budget.remaining) }).length;
    } catch (cause) {
      if (
        cause instanceof RangeError ||
        (cause as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
      ) {
        throw tooBig();
      }
      continue;
    }
    if (size > budget.remaining) throw tooBig();
    budget.remaining -= size;
  }
}

/** Screens one uploaded file before it is stored and queued. */
export async function screenUpload(
  file: Blob,
  limits: Partial<ImportLimits> = {},
): Promise<Screened> {
  const all: ImportLimits = { ...DEFAULT_LIMITS, ...limits };
  try {
    const { name, bytes } = await readUpload(file, all);
    const found = detect(bytes, name);
    if (found.kind === 'refused') throw new FileRefused(found.message);
    if (found.kind === 'xlsx' || found.kind === 'csv-zip') screenZip(bytes, name, all);
    const kind: SourceKind = found.kind === 'csv-zip' ? 'csv' : found.kind;
    return { ok: true, kind, name, bytes, checksum: sha256(bytes) };
  } catch (cause) {
    if (cause instanceof FileRefused) {
      const name = sourceName(typeof (file as File).name === 'string' ? (file as File).name : '');
      const message = cause.message.startsWith('The ')
        ? `${name}: ${cause.message}`
        : cause.message;
      return { ok: false, message };
    }
    throw cause;
  }
}
