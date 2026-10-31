import { inflateSync } from 'node:zlib';
import { FileRefused, megabytes } from './issues.js';
import { walkXml } from './xml.js';
import { ZipReader, isZip } from './zip.js';

// Library documents (ARCHITECTURE.md D11, §7): the text of an uploaded PDF, DOCX, plain
// text or Markdown file, cut into passages for search. Reading never runs anything in
// the file: a PDF's scripts, actions and embedded files are ignored, a DOCX's macros and
// fields are never evaluated, and only the text is kept (A3-S2). Everything is read from
// memory and every unpacking step has a hard cap, so a crafted file can't use more than
// the limits below whatever its headers say.

export const LIBRARY_KINDS = ['pdf', 'docx', 'text'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

export interface LibraryLimits {
  /** Largest upload accepted, in bytes. */
  maxFileBytes: number;
  /** Most bytes any unpacking (a zip, a PDF stream) may produce, in total. */
  maxUnpackedBytes: number;
  /** Most passages one document may become. */
  maxChunks: number;
}

export const DEFAULT_LIBRARY_LIMITS: Readonly<LibraryLimits> = Object.freeze({
  maxFileBytes: 20 * 1024 * 1024,
  maxUnpackedBytes: 100 * 1024 * 1024,
  maxChunks: 5_000,
});

/** A run of text with where it came from: a PDF page, or a DOCX or Markdown heading. */
export interface LibrarySection {
  page: number | null;
  section: string | null;
  text: string;
}

export interface ExtractedDocument {
  kind: LibraryKind;
  sections: LibrarySection[];
}

export interface TextChunk {
  ordinal: number;
  page: number | null;
  section: string | null;
  content: string;
}

export type LibraryScreened = { ok: true; kind: LibraryKind } | { ok: false; message: string };

const EXTENSIONS: Record<string, LibraryKind> = {
  pdf: 'pdf',
  docx: 'docx',
  txt: 'text',
  md: 'text',
  markdown: 'text',
};

/** The file types a class or curriculum can upload, for messages. */
export const LIBRARY_TYPES_TEXT = 'PDF, DOCX, TXT or Markdown';

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

const startsWith = (bytes: Uint8Array, ...signature: number[]) =>
  signature.every((b, i) => bytes[i] === b);

/** True for the headers of programs and scripts the library never accepts. */
function looksExecutable(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, 0x4d, 0x5a) || // Windows PE ("MZ")
    startsWith(bytes, 0x7f, 0x45, 0x4c, 0x46) || // ELF
    startsWith(bytes, 0x23, 0x21) || // "#!" script
    startsWith(bytes, 0xfe, 0xed, 0xfa) || // Mach-O
    startsWith(bytes, 0xcf, 0xfa, 0xed, 0xfe) ||
    startsWith(bytes, 0xca, 0xfe, 0xba, 0xbe) // Java class or universal binary
  );
}

function utf8Text(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Decides what an upload is from its bytes, never from its name or declared type, and
 * checks the name agrees (a program renamed ".pdf" is refused). Cheap: the file is not
 * unpacked here.
 */
export function screenLibraryFile(
  name: string | null,
  bytes: Uint8Array,
  limits: Partial<LibraryLimits> = {},
): LibraryScreened {
  const max = limits.maxFileBytes ?? DEFAULT_LIBRARY_LIMITS.maxFileBytes;
  const refuse = (message: string) => ({ ok: false as const, message });
  if (bytes.length === 0) return refuse('The file is empty.');
  if (bytes.length > max) {
    return refuse(
      `The file is ${megabytes(bytes.length)}; the most a library document can be is ${megabytes(max)}.`,
    );
  }
  // With no name (re-reading a file already screened on upload) the bytes alone decide.
  const expected = name === null ? undefined : EXTENSIONS[extensionOf(name)];
  if (name !== null && !expected) return refuse(`Upload a ${LIBRARY_TYPES_TEXT} file.`);
  if (looksExecutable(bytes)) {
    return refuse(`The file is a program, not a document. Upload a ${LIBRARY_TYPES_TEXT} file.`);
  }
  let kind: LibraryKind | null = null;
  if (new TextDecoder('latin1').decode(bytes.subarray(0, 1024)).includes('%PDF-')) kind = 'pdf';
  else if (isZip(bytes)) kind = 'docx';
  else if (utf8Text(bytes) !== null) kind = 'text';
  if (kind === null || (expected && kind !== expected)) {
    const what =
      name === null ? 'a supported document' : `a real ${extensionOf(name).toUpperCase()}`;
    return refuse(`The file isn't ${what}. Upload a ${LIBRARY_TYPES_TEXT} file.`);
  }
  return { ok: true, kind };
}

// ---------------------------------------------------------------------------
// Text and Markdown

function plainSections(text: string): LibrarySection[] {
  const clean = tidy(text);
  const sections: LibrarySection[] = [];
  let heading: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    const body = lines.join('\n').trim();
    if (body) sections.push({ page: null, section: heading, text: body });
    lines = [];
  };
  for (const line of clean.split('\n')) {
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[1]!.slice(0, 200);
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

/** Control characters out, line endings normalised, runs of blank lines collapsed. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(
      // eslint-disable-next-line no-control-regex
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g,
      '',
    )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// DOCX

function docxSections(bytes: Uint8Array, limits: LibraryLimits): LibrarySection[] {
  const budget = { remaining: limits.maxUnpackedBytes, total: limits.maxUnpackedBytes };
  const archive = ZipReader.open(bytes, budget, 2_000);
  const entry = archive.find('word/document.xml');
  if (!entry || entry.unsafe) {
    throw new FileRefused("The file isn't a Word document (it has no document body).");
  }
  archive.preflightDeclared([entry]);
  const xml = new TextDecoder('utf-8').decode(archive.read(entry));

  const sections: LibrarySection[] = [];
  let heading: string | null = null;
  let body: string[] = [];
  let paragraph = '';
  let style = '';
  let inText = false;
  const flush = () => {
    const text = body.join('\n').trim();
    if (text) sections.push({ page: null, section: heading, text });
    body = [];
  };
  try {
    walkXml(xml, {
      open(tag) {
        if (tag.name === 'p') {
          paragraph = '';
          style = '';
        } else if (tag.name === 'pStyle') style = tag.attrs.val ?? '';
        else if (tag.name === 't') inText = true;
        else if (tag.name === 'tab') paragraph += '\t';
        else if (tag.name === 'br' || tag.name === 'cr') paragraph += '\n';
      },
      text(text) {
        if (inText) paragraph += text;
      },
      close(name) {
        if (name === 't') inText = false;
        else if (name === 'p') {
          const text = paragraph.trim();
          if (!text) return;
          if (/^(heading\s*\d|title)/i.test(style)) {
            flush();
            heading = text.slice(0, 200);
          } else {
            body.push(text);
          }
        }
      },
    });
  } catch (cause) {
    if (cause instanceof FileRefused) {
      throw new FileRefused(
        'The Word document has XML that could not be read, or declares entities, which a document never needs.',
      );
    }
    throw cause;
  }
  flush();
  return sections.map((s) => ({ ...s, text: tidy(s.text) })).filter((s) => s.text);
}

// ---------------------------------------------------------------------------
// PDF
//
// A small reader for the text of born-digital PDFs: it finds objects, inflates Flate
// streams under a cap, follows the page tree and reads the text-showing operators. It
// never interprets JavaScript, actions, forms or embedded files. Scanned pages (images
// only) and fonts that map codes to glyphs without Unicode text yield nothing, and a
// file with no readable text is refused with that explanation.

interface PdfObject {
  dict: string;
  stream: Buffer | null;
}

const latin1 = (buffer: Uint8Array) => Buffer.from(buffer).toString('latin1');

function inflateCapped(data: Buffer, budget: { remaining: number }): Buffer | null {
  try {
    const out = inflateSync(data, { maxOutputLength: Math.max(1, budget.remaining) });
    budget.remaining -= out.length;
    return out;
  } catch (cause) {
    if (
      cause instanceof RangeError ||
      (cause as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
    ) {
      throw new FileRefused('The PDF unpacks to more than the library allows.');
    }
    return null; // a damaged stream: skip it
  }
}

function parsePdfObjects(file: string, budget: { remaining: number }): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const header = /(\d+)\s+(\d+)\s+obj\b/g;
  const found: { num: number; start: number }[] = [];
  for (let m = header.exec(file); m !== null; m = header.exec(file)) {
    found.push({ num: Number(m[1]), start: m.index + m[0].length });
  }
  found.forEach(({ num, start }, i) => {
    const limit = i + 1 < found.length ? found[i + 1]!.start : file.length;
    const body = file.slice(start, limit);
    const streamAt = body.search(/stream\r?\n/);
    const dictEnd = streamAt < 0 ? body.indexOf('endobj') : streamAt;
    const dict = body.slice(0, dictEnd < 0 ? body.length : dictEnd);
    let stream: Buffer | null = null;
    if (streamAt >= 0) {
      const dataStart = streamAt + body.slice(streamAt).indexOf('\n') + 1;
      const dataEnd = body.indexOf('endstream', dataStart);
      if (dataEnd > dataStart) {
        const raw = Buffer.from(body.slice(dataStart, dataEnd).replace(/\r?\n$/, ''), 'latin1');
        stream = /\/FlateDecode|\/Fl\b/.test(dict) ? inflateCapped(raw, budget) : raw;
      }
    }
    objects.set(num, { dict, stream });
  });

  // Objects packed into object streams (PDF 1.5).
  for (const object of [...objects.values()]) {
    if (!object.stream || !/\/Type\s*\/ObjStm/.test(object.dict)) continue;
    const count = Number(/\/N\s+(\d+)/.exec(object.dict)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(object.dict)?.[1] ?? 0);
    const text = latin1(object.stream);
    const pairs = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < Math.min(count, pairs.length / 2); i++) {
      const num = pairs[2 * i]!;
      const from = first + pairs[2 * i + 1]!;
      const to = i + 1 < count ? first + pairs[2 * i + 3]! : text.length;
      if (Number.isFinite(num) && !objects.has(num)) {
        objects.set(num, { dict: text.slice(from, to), stream: null });
      }
    }
  }
  return objects;
}

const refsIn = (text: string) => [...text.matchAll(/(\d+)\s+\d+\s+R\b/g)].map((m) => Number(m[1]));

function pageOrder(objects: Map<number, PdfObject>): number[] {
  const isPage = (o: PdfObject) => /\/Type\s*\/Page(?![s\w])/.test(o.dict);
  const pages = [...objects].filter(([, o]) => isPage(o)).map(([n]) => n);
  const root = [...objects].find(
    ([, o]) => /\/Type\s*\/Pages\b/.test(o.dict) && !/\/Parent\b/.test(o.dict),
  );
  if (!root) return pages.sort((a, b) => a - b);
  const ordered: number[] = [];
  const seen = new Set<number>();
  const visit = (num: number, depth: number) => {
    const object = objects.get(num);
    if (!object || seen.has(num) || depth > 64) return;
    seen.add(num);
    if (isPage(object)) ordered.push(num);
    else {
      const kids = /\/Kids\s*\[([^\]]*)\]/.exec(object.dict)?.[1] ?? '';
      for (const kid of refsIn(kids)) visit(kid, depth + 1);
    }
  };
  visit(root[0], 0);
  // Pages the tree didn't reach (a damaged tree) follow in object order.
  return [...ordered, ...pages.filter((n) => !seen.has(n)).sort((a, b) => a - b)];
}

/** The characters of one PDF string operand. */
function decodePdfBytes(bytes: number[]): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
    }
    return out;
  }
  return Buffer.from(bytes).toString('latin1');
}

type Operand =
  | { type: 'str'; value: string }
  | { type: 'num'; value: number }
  | { type: 'arr'; items: Operand[] };

/** Text shown by one page's content stream. */
function contentText(content: string): string {
  let out = '';
  const operands: Operand[] = [];
  const stack: Operand[][] = [];
  const newline = () => {
    if (out && !out.endsWith('\n')) out += '\n';
  };
  const space = () => {
    if (out && !/\s$/.test(out)) out += ' ';
  };
  let i = 0;
  const n = content.length;
  const push = (operand: Operand) =>
    (stack.length ? stack[stack.length - 1]! : operands).push(operand);
  while (i < n) {
    const c = content[i]!;
    if (c === '(') {
      const bytes: number[] = [];
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = content[i]!;
        if (ch === '\\') {
          const next = content[i + 1] ?? '';
          const octal = /^[0-7]{1,3}/.exec(content.slice(i + 1, i + 4));
          if (octal) {
            bytes.push(parseInt(octal[0], 8) & 0xff);
            i += 1 + octal[0].length;
            continue;
          }
          const map: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
          if (next === '\n' || next === '\r') i += next === '\r' && content[i + 2] === '\n' ? 3 : 2;
          else {
            bytes.push(map[next] ?? next.charCodeAt(0));
            i += 2;
          }
          continue;
        }
        if (ch === '(') depth++;
        else if (ch === ')') {
          depth--;
          if (depth === 0) break;
        }
        bytes.push(ch.charCodeAt(0) & 0xff);
        i++;
      }
      i++;
      push({ type: 'str', value: decodePdfBytes(bytes) });
    } else if (c === '<' && content[i + 1] !== '<') {
      const end = content.indexOf('>', i);
      const hex = content.slice(i + 1, end < 0 ? n : end).replace(/[^0-9a-fA-F]/g, '');
      const bytes: number[] = [];
      for (let h = 0; h < hex.length; h += 2)
        bytes.push(parseInt(hex.slice(h, h + 2).padEnd(2, '0'), 16));
      i = end < 0 ? n : end + 1;
      push({ type: 'str', value: decodePdfBytes(bytes) });
    } else if (c === '[') {
      stack.push([]);
      i++;
    } else if (c === ']') {
      const items = stack.pop() ?? [];
      push({ type: 'arr', items });
      i++;
    } else if (c === '%') {
      while (i < n && content[i] !== '\n' && content[i] !== '\r') i++;
    } else if (c === '/') {
      i++;
      while (i < n && !/[\s()<>[\]/%]/.test(content[i]!)) i++;
      operands.length = 0;
    } else if (/[\s]/.test(c) || c === '<' || c === '>' || c === ')' || c === '{' || c === '}') {
      i++;
    } else {
      let j = i;
      while (j < n && !/[\s()<>[\]/%]/.test(content[j]!)) j++;
      const token = content.slice(i, j);
      i = j;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token)) {
        push({ type: 'num', value: Number(token) });
        continue;
      }
      const last = operands[operands.length - 1];
      switch (token) {
        case 'Tj':
          if (last?.type === 'str') out += last.value;
          break;
        case "'":
        case '"':
          newline();
          if (last?.type === 'str') out += last.value;
          break;
        case 'TJ':
          if (last?.type === 'arr') {
            for (const item of last.items) {
              if (item.type === 'str') out += item.value;
              else if (item.type === 'num' && item.value < -250) space();
            }
          }
          break;
        case 'Td':
        case 'TD': {
          const y = operands[operands.length - 1];
          if (y?.type === 'num' && y.value === 0) space();
          else newline();
          break;
        }
        case 'T*':
        case 'Tm':
        case 'ET':
          newline();
          break;
        case 'BI': {
          // Inline image: skip its data.
          const end = content.indexOf('EI', i);
          i = end < 0 ? n : end + 2;
          break;
        }
        default:
          break;
      }
      operands.length = 0;
      stack.length = 0;
    }
  }
  return out;
}

function pdfSections(bytes: Uint8Array, limits: LibraryLimits): LibrarySection[] {
  const file = latin1(bytes);
  if (/\/Encrypt\b/.test(file.slice(-4096)) || /trailer[\s\S]{0,400}\/Encrypt\b/.test(file)) {
    throw new FileRefused(
      'The PDF is password-protected. Save a copy without a password and upload that.',
    );
  }
  const budget = { remaining: limits.maxUnpackedBytes };
  const objects = parsePdfObjects(file, budget);
  const sections: LibrarySection[] = [];
  pageOrder(objects).forEach((num, index) => {
    const dict = objects.get(num)!.dict;
    const contents = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(dict)?.[1] ?? '';
    const content = refsIn(contents)
      .map((ref) => objects.get(ref)?.stream)
      .filter((s): s is Buffer => Boolean(s))
      .map((s) => s.toString('latin1'))
      .join('\n');
    const text = tidy(contentText(content));
    if (text) sections.push({ page: index + 1, section: null, text });
  });
  return sections;
}

// ---------------------------------------------------------------------------

/**
 * The text of an upload, in sections. Refuses (FileRefused) what can't be read:
 * damaged or password-protected files, and documents with no extractable text.
 */
export function extractDocument(
  name: string | null,
  bytes: Uint8Array,
  limits: Partial<LibraryLimits> = {},
): ExtractedDocument {
  const effective = { ...DEFAULT_LIBRARY_LIMITS, ...limits };
  const screened = screenLibraryFile(name, bytes, effective);
  if (!screened.ok) throw new FileRefused(screened.message);
  const { kind } = screened;
  let sections: LibrarySection[];
  if (kind === 'pdf') sections = pdfSections(bytes, effective);
  else if (kind === 'docx') sections = docxSections(bytes, effective);
  else {
    // Markdown headings are recognised in any text file; plain text rarely has "# " lines.
    sections = plainSections(utf8Text(bytes) ?? '');
  }
  sections = sections.filter((s) => s.text.length > 0);
  if (sections.length === 0) {
    throw new FileRefused(
      kind === 'pdf'
        ? "No text could be read from the PDF. Scanned pages (pictures of text) aren't supported; upload a PDF exported from a document."
        : 'The file has no text in it.',
    );
  }
  return { kind, sections };
}

// ---------------------------------------------------------------------------
// Chunking

export interface ChunkOptions {
  /** Longest passage, in characters. */
  maxChars?: number;
  /** Characters of the previous passage repeated at the start of the next, within a section. */
  overlap?: number;
  maxChunks?: number;
}

/** Splits text that has no paragraph breaks short enough: at sentences, then words. */
function pieces(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];
  const out: string[] = [];
  let current = '';
  for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
    for (let part = sentence; part.length > 0;) {
      let piece = part;
      if (piece.length > maxChars) {
        const cut = part.lastIndexOf(' ', maxChars);
        piece = part.slice(0, cut > maxChars / 2 ? cut : maxChars);
      }
      part = part.slice(piece.length).trimStart();
      if (current && current.length + 1 + piece.length > maxChars) {
        out.push(current);
        current = piece;
      } else {
        current = current ? `${current} ${piece}` : piece;
      }
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Cuts sections into passages of at most `maxChars`, on paragraph and sentence breaks,
 * each keeping its page or section. A passage never spans two sections. Deterministic.
 */
export function chunkSections(
  sections: readonly LibrarySection[],
  options: ChunkOptions = {},
): TextChunk[] {
  const maxChars = options.maxChars ?? 1_000;
  const overlap = Math.min(options.overlap ?? 120, Math.floor(maxChars / 4));
  const maxChunks = options.maxChunks ?? DEFAULT_LIBRARY_LIMITS.maxChunks;
  const chunks: TextChunk[] = [];
  const add = (section: LibrarySection, content: string) => {
    if (chunks.length >= maxChunks) {
      throw new FileRefused(
        `The document is too long: it makes more than ${maxChunks.toLocaleString('en')} passages. Split it into smaller documents.`,
      );
    }
    chunks.push({
      ordinal: chunks.length,
      page: section.page,
      section: section.section,
      content,
    });
  };
  for (const section of sections) {
    const paragraphs = section.text
      .split(/\n\s*\n|\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap((p) => pieces(p, maxChars));
    let current = '';
    let carried = '';
    const emit = () => {
      if (current) add(section, current);
      const tail = current.slice(Math.max(0, current.length - overlap));
      carried = overlap > 0 ? tail.slice(tail.indexOf(' ') + 1) : '';
      current = '';
    };
    for (const paragraph of paragraphs) {
      const joined = current ? `${current}\n${paragraph}` : paragraph;
      if (current && joined.length > maxChars) {
        emit();
        current =
          carried && carried.length + 1 + paragraph.length <= maxChars
            ? `${carried}\n${paragraph}`
            : paragraph;
      } else {
        current = joined;
      }
    }
    if (current && current !== carried) add(section, current);
  }
  return chunks;
}
