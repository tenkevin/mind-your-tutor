// Test helpers: write zips and .xlsx workbooks with exactly the quirks a test needs.
import { readFileSync } from 'node:fs';
import { crc32, deflateRawSync, deflateSync } from 'node:zlib';

export const fixtureDir = new URL('../../../../fixtures/water-cycle/', import.meta.url);
export const TABS = [
  'Course',
  'Units',
  'Ideas',
  'Links',
  'Categories',
  'Assessment',
  'Personas',
  'Library',
];

export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(name, fixtureDir)));
}

export const fixtureText = (name: string) => readFileSync(new URL(name, fixtureDir), 'utf8');

export function file(name: string, content: string | Uint8Array, type = ''): File {
  return new File([typeof content === 'string' ? content : Buffer.from(content)], name, { type });
}

export const fixtureCsvFiles = () =>
  TABS.map((tab) => file(`${tab}.csv`, fixtureText(`${tab}.csv`)));

export interface ZipInput {
  name: string;
  data: string | Uint8Array;
  /** Override the sizes written in the headers (to fake a zip bomb's claims). */
  claimedSize?: number;
  store?: boolean;
  /** Raw deflate data to store as is, with the CRC to claim for it. */
  deflated?: { data: Uint8Array; crc: number };
}

/** Writes a zip archive. */
export function zip(entries: readonly ZipInput[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const raw =
      typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : Buffer.from(entry.data);
    const packed = entry.deflated
      ? Buffer.from(entry.deflated.data)
      : entry.store
        ? raw
        : deflateRawSync(raw);
    const name = Buffer.from(entry.name, 'utf8');
    const crc = entry.deflated ? entry.deflated.crc : crc32(raw);
    const size = entry.claimedSize ?? raw.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(entry.store ? 0 : 8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(entry.store ? 0 : 8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

/** A cell for `xlsx`: a value, optionally with a number format, a formula or a type. */
export type XCell =
  | string
  | number
  | boolean
  | null
  | {
      v?: string | number;
      f?: string;
      t?: 's' | 'str' | 'e' | 'n' | 'b' | 'd';
      format?: string;
      numFmtId?: number;
    };

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function columnName(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface XlsxOptions {
  /** Store strings in sharedStrings.xml (as Excel does) instead of inline. */
  shared?: boolean;
  date1904?: boolean;
  /** Replace a part's XML outright. */
  parts?: Record<string, string>;
  extra?: ZipInput[];
  contentTypes?: string;
}

/** Writes an .xlsx workbook with one sheet per entry. */
export function xlsx(sheets: Record<string, XCell[][]>, options: XlsxOptions = {}): Uint8Array {
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  const formats: { id: number; code?: string }[] = [];
  const styleOf = (cell: { format?: string; numFmtId?: number }) => {
    if (cell.format === undefined && cell.numFmtId === undefined) return 0;
    const id = cell.numFmtId ?? 164 + formats.filter((f) => f.code !== undefined).length;
    let index = formats.findIndex((f) =>
      cell.format ? f.code === cell.format : f.id === id && !f.code,
    );
    if (index < 0) {
      formats.push({ id, code: cell.format });
      index = formats.length - 1;
    }
    return index + 1;
  };
  const shared = (s: string) => {
    let i = stringIndex.get(s);
    if (i === undefined) {
      i = strings.length;
      strings.push(s);
      stringIndex.set(s, i);
    }
    return i;
  };
  const sheetXml = Object.values(sheets).map((rows) => {
    const body = rows
      .map((cells, r) => {
        const xml = cells
          .map((cell, c) => {
            const ref = `${columnName(c)}${r + 1}`;
            if (cell === null) return '';
            if (typeof cell === 'string') {
              return options.shared
                ? `<c r="${ref}" t="s"><v>${shared(cell)}</v></c>`
                : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`;
            }
            if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
            if (typeof cell === 'boolean') return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
            const s = styleOf(cell);
            const t = cell.t ? ` t="${cell.t}"` : '';
            const f = cell.f !== undefined ? `<f>${esc(cell.f)}</f>` : '';
            const v = cell.v !== undefined ? `<v>${esc(String(cell.v))}</v>` : '';
            return `<c r="${ref}"${s ? ` s="${s}"` : ''}${t}>${f}${v}</c>`;
          })
          .join('');
        return `<row r="${r + 1}">${xml}</row>`;
      })
      .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  });
  const names = Object.keys(sheets);
  const custom = formats.filter((f) => f.code !== undefined);
  const styles =
    `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="${custom.length}">${custom.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${esc(f.code!)}"/>`).join('')}</numFmts>` +
    `<cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>` +
    `<cellXfs count="${formats.length + 1}"><xf numFmtId="0"/>${formats.map((f) => `<xf numFmtId="${f.id}" applyNumberFormat="1"/>`).join('')}</cellXfs></styleSheet>`;
  const parts: Record<string, string> = {
    '[Content_Types].xml':
      options.contentTypes ??
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr${options.date1904 ? ' date1904="1"' : ''}/><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    'xl/styles.xml': styles,
    ...Object.fromEntries(sheetXml.map((xml, i) => [`xl/worksheets/sheet${i + 1}.xml`, xml])),
  };
  parts['xl/sharedStrings.xml'] =
    `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`;
  Object.assign(parts, options.parts);
  return zip([
    ...Object.entries(parts).map(([name, data]) => ({ name, data })),
    ...(options.extra ?? []),
  ]);
}

/** Splits a CSV the simple way, for building test sheets from the fixture. */
export { parseCsv } from '../csv.js';

/**
 * A small PDF with one page per string (Flate-compressed content streams), for library
 * tests. `extra` is added to the catalog, for example a JavaScript action.
 */
export function pdf(pages: readonly string[], extra = ''): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + 2 * i);
  objects[1] = `<< /Type /Catalog /Pages 2 0 R ${extra} >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  const streams = new Map<number, Buffer>();
  pages.forEach((text, i) => {
    const id = 4 + 2 * i;
    const lines = text.split('\n').map((line) => `(${line.replace(/([\\()])/g, '\\$1')}) Tj T*`);
    const content = deflateSync(Buffer.from(`BT /F1 12 Tf 14 TL 72 720 Td ${lines.join(' ')} ET`));
    objects[id] =
      `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`;
    streams.set(id + 1, content);
  });
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  for (let id = 1; id < 4 + 2 * pages.length; id++) {
    const stream = streams.get(id);
    parts.push(
      stream
        ? Buffer.concat([
            Buffer.from(
              `${id} 0 obj\n<< /Filter /FlateDecode /Length ${stream.length} >>\nstream\n`,
            ),
            stream,
            Buffer.from('\nendstream\nendobj\n'),
          ])
        : Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, 'latin1'),
    );
  }
  parts.push(Buffer.from('trailer\n<< /Root 1 0 R >>\n%%EOF\n'));
  return new Uint8Array(Buffer.concat(parts));
}

/** A .docx whose body is the given paragraphs; `heading:` marks a Heading 1 paragraph. */
export function docx(paragraphs: readonly string[]): Uint8Array {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = paragraphs
    .map((p) =>
      p.startsWith('heading:')
        ? `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escape(p.slice(8))}</w:t></w:r></w:p>`
        : `<w:p><w:r><w:t xml:space="preserve">${escape(p)}</w:t></w:r></w:p>`,
    )
    .join('');
  return zip([
    {
      name: '[Content_Types].xml',
      data: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    },
    {
      name: 'word/document.xml',
      data: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    },
  ]);
}
