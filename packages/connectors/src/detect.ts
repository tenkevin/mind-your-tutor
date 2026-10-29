import { FileRefused, megabytes, type ImportLimits } from './issues.js';
import { isZip, ZipReader } from './zip.js';

// Works out what an upload is from its bytes. The file name's extension is never
// trusted: a PNG renamed to .xlsx is still a PNG.

export type Detected =
  | { kind: 'xlsx' | 'csv-zip' | 'csv' | 'json' }
  | { kind: 'refused'; message: string };

const SIGNATURES: [string, number[]][] = [
  ['a PNG image', [0x89, 0x50, 0x4e, 0x47]],
  ['a JPEG image', [0xff, 0xd8, 0xff]],
  ['a GIF image', [0x47, 0x49, 0x46, 0x38]],
  ['a PDF document', [0x25, 0x50, 0x44, 0x46]],
  ['a RAR archive', [0x52, 0x61, 0x72, 0x21]],
  ['a 7-Zip archive', [0x37, 0x7a, 0xbc, 0xaf]],
  ['a gzip archive', [0x1f, 0x8b]],
];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const startsWith = (bytes: Uint8Array, sig: readonly number[]) =>
  bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);

const EXPECTED =
  'Upload the pack as an .xlsx workbook, as CSV files (one per tab, or zipped), or as pack JSON.';

/** A file name made safe to show: no control characters, no folders, not too long. */
export function sourceName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const shown = clean === '' ? 'the uploaded file' : clean;
  return shown.length > 120 ? `${shown.slice(0, 119)}…` : shown;
}

function detectZip(bytes: Uint8Array, label: string): Detected {
  let zip: ZipReader;
  try {
    // Only the directory is read here; the connector enforces the byte budget
    // before reading the entries it needs.
    zip = ZipReader.open(bytes, { remaining: 0, total: 0 }, Number.MAX_SAFE_INTEGER);
  } catch (cause) {
    return { kind: 'refused', message: `${label}: ${(cause as Error).message}` };
  }
  const names = [...zip.entries.keys()].map((n) => n.toLowerCase());
  if (names.some((n) => n.endsWith('vbaproject.bin'))) {
    return {
      kind: 'refused',
      message: `${label} contains macros, which imports never accept. Save it as an .xlsx (Excel Workbook) and upload that.`,
    };
  }
  if (names.includes('xl/workbook.bin')) {
    return {
      kind: 'refused',
      message: `${label} is an Excel binary workbook (.xlsb). Save it as an .xlsx (Excel Workbook) and upload that.`,
    };
  }
  if (names.includes('xl/workbook.xml')) return { kind: 'xlsx' };
  if (names.some((n) => /\.(csv|tsv|txt)$/.test(n))) return { kind: 'csv-zip' };
  if (names.includes('content.xml') && names.includes('mimetype')) {
    return {
      kind: 'refused',
      message: `${label} is an OpenDocument file. Save it as an .xlsx (Excel Workbook) and upload that.`,
    };
  }
  return {
    kind: 'refused',
    message: `${label} is a zip with no CSV files or workbook in it. ${EXPECTED}`,
  };
}

/** Decides a file's type from its first bytes (and, for a zip, its list of contents). */
export function detect(bytes: Uint8Array, name: string): Detected {
  const label = sourceName(name);
  if (bytes.length === 0) return { kind: 'refused', message: `${label} is empty.` };
  if (isZip(bytes)) return detectZip(bytes, label);
  if (startsWith(bytes, OLE)) {
    return {
      kind: 'refused',
      message: `${label} is an older Excel file (.xls) or a password-protected workbook. Save it as an .xlsx (Excel Workbook) without a password and upload that.`,
    };
  }
  for (const [what, sig] of SIGNATURES) {
    if (startsWith(bytes, sig)) {
      return { kind: 'refused', message: `${label} is ${what}, not a spreadsheet. ${EXPECTED}` };
    }
  }
  const utf16 =
    (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  const head = bytes.subarray(0, 8192);
  if (!utf16 && head.includes(0)) {
    return { kind: 'refused', message: `${label} isn't a text or spreadsheet file. ${EXPECTED}` };
  }
  const text = new TextDecoder(utf16 ? (bytes[0] === 0xff ? 'utf-16le' : 'utf-16be') : 'utf-8')
    .decode(bytes.subarray(0, 1024))
    .trimStart();
  if (text.startsWith('{') || text.startsWith('[')) return { kind: 'json' };
  return { kind: 'csv' };
}

/** Reads an upload's bytes after checking its size. */
export async function readUpload(
  file: Blob,
  limits: ImportLimits,
): Promise<{ name: string; bytes: Uint8Array }> {
  const name = sourceName(typeof (file as File).name === 'string' ? (file as File).name : '');
  if (file.size > limits.maxFileBytes) {
    throw new FileRefused(
      `${name} is ${megabytes(file.size)}; the most an import accepts is ${megabytes(limits.maxFileBytes)} per file.`,
    );
  }
  return { name, bytes: new Uint8Array(await file.arrayBuffer()) };
}
