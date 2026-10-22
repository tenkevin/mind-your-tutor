import { crc32, inflateRawSync } from 'node:zlib';
import { FileRefused, megabytes } from './issues.js';

// A small zip reader for XLSX workbooks and zipped CSVs. Everything stays in
// memory: entry names are only ever used as lookup keys, never as paths, so a
// name like "../../etc/passwd" can't write anywhere. Each entry is inflated with
// a hard output cap, so a zip bomb stops at the unpacked-size budget whatever
// sizes its headers claim.

export interface ZipEntry {
  /** The entry's name as stored, with "\" turned into "/". */
  name: string;
  /** True for a name that is absolute or climbs out with "..". */
  unsafe: boolean;
  method: number;
  compressedSize: number;
  size: number;
  crc: number;
  localOffset: number;
  encrypted: boolean;
}

/** The unpacked-byte budget shared by every zip in one import. */
export interface UnpackBudget {
  remaining: number;
  readonly total: number;
}

export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06))
  );
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

function unsafeName(name: string): boolean {
  return (
    name.startsWith('/') ||
    /^[a-zA-Z]:/.test(name) ||
    name.split('/').some((part) => part === '..') ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f]/.test(name)
  );
}

export class ZipReader {
  readonly entries: ReadonlyMap<string, ZipEntry>;

  private constructor(
    private readonly bytes: Uint8Array,
    entries: Map<string, ZipEntry>,
    private readonly budget: UnpackBudget,
  ) {
    this.entries = entries;
  }

  static open(bytes: Uint8Array, budget: UnpackBudget, maxEntries: number): ZipReader {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const broken = () => new FileRefused('The file is a damaged or unsupported zip archive.');
    // The end-of-central-directory record is in the last 64 KB + 22 bytes.
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
      if (view.getUint32(i, true) === EOCD) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw broken();
    const count = view.getUint16(eocd + 10, true);
    const cdSize = view.getUint32(eocd + 12, true);
    const cdOffset = view.getUint32(eocd + 16, true);
    if (count === 0xffff || cdOffset === 0xffffffff) {
      throw new FileRefused('The file uses ZIP64, which is only needed for very large files.');
    }
    if (count > maxEntries) {
      throw new FileRefused(
        `The zip has ${count.toLocaleString('en')} files in it; the most is ${maxEntries.toLocaleString('en')}.`,
      );
    }
    if (cdOffset + cdSize > eocd) throw broken();
    const entries = new Map<string, ZipEntry>();
    const decoder = new TextDecoder('utf-8');
    let at = cdOffset;
    for (let n = 0; n < count; n++) {
      if (at + 46 > eocd || view.getUint32(at, true) !== CENTRAL) throw broken();
      const flags = view.getUint16(at + 8, true);
      const nameLength = view.getUint16(at + 28, true);
      const extraLength = view.getUint16(at + 30, true);
      const commentLength = view.getUint16(at + 32, true);
      if (at + 46 + nameLength > eocd) throw broken();
      const rawName = bytes.subarray(at + 46, at + 46 + nameLength);
      // Bit 11 marks UTF-8 names; older tools write CP437, read here as Latin-1.
      const name = (
        flags & 0x800 ? decoder.decode(rawName) : Buffer.from(rawName).toString('latin1')
      ).replace(/\\/g, '/');
      const entry: ZipEntry = {
        name,
        unsafe: unsafeName(name),
        method: view.getUint16(at + 10, true),
        crc: view.getUint32(at + 16, true),
        compressedSize: view.getUint32(at + 20, true),
        size: view.getUint32(at + 24, true),
        localOffset: view.getUint32(at + 42, true),
        encrypted: (flags & 0x1) !== 0,
      };
      if (!entries.has(name)) entries.set(name, entry);
      at += 46 + nameLength + extraLength + commentLength;
    }
    return new ZipReader(bytes, entries, budget);
  }

  /** Finds an entry by name, ignoring case and a leading "/". */
  find(name: string): ZipEntry | undefined {
    const wanted = name.replace(/^\/+/, '');
    const exact = this.entries.get(wanted);
    if (exact) return exact;
    const lower = wanted.toLowerCase();
    for (const entry of this.entries.values()) {
      if (entry.name.toLowerCase() === lower) return entry;
    }
    return undefined;
  }

  /** Unpacks one entry, charging its size to the shared budget. */
  read(entry: ZipEntry): Uint8Array {
    const tooBig = () =>
      new FileRefused(
        `The upload unpacks to more than ${megabytes(this.budget.total)}, which is the most an import can unpack.`,
      );
    if (entry.encrypted)
      throw new FileRefused(
        'The file is password-protected. Save a copy without a password and upload that.',
      );
    if (entry.size > this.budget.remaining) throw tooBig();
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const at = entry.localOffset;
    if (at + 30 > this.bytes.length || view.getUint32(at, true) !== LOCAL) {
      throw new FileRefused('The file is a damaged zip archive.');
    }
    const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
    const end = start + entry.compressedSize;
    if (end > this.bytes.length) throw new FileRefused('The file is a damaged zip archive.');
    const packed = this.bytes.subarray(start, end);
    let data: Uint8Array;
    if (entry.method === 0) {
      data = packed;
    } else if (entry.method === 8) {
      try {
        // The cap holds even when the header understates the size.
        data = inflateRawSync(packed, { maxOutputLength: Math.max(1, this.budget.remaining) });
      } catch (cause) {
        if (
          cause instanceof RangeError ||
          (cause as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
        ) {
          throw tooBig();
        }
        throw new FileRefused('The file is a damaged zip archive.');
      }
    } else {
      throw new FileRefused("The file uses a zip compression method that isn't supported.");
    }
    if (data.length > this.budget.remaining) throw tooBig();
    if (data.length !== entry.size || crc32(data) !== entry.crc) {
      throw new FileRefused('The file is a damaged zip archive (a part of it fails its checksum).');
    }
    this.budget.remaining -= data.length;
    return data;
  }
}
