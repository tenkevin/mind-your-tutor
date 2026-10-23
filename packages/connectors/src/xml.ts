import { FileRefused } from './issues.js';

// A minimal XML tokenizer for the parts of an XLSX workbook. It never fetches
// anything and never expands entities: a document type declaration (the only way
// to declare entities, external or nested) refuses the file, and only the five
// predefined entities and numeric character references are decoded.

export interface XmlTag {
  /** Local name, without any namespace prefix. */
  name: string;
  attrs: Record<string, string>;
  /** `<x/>` */
  selfClosing: boolean;
}

export interface XmlHandler {
  open?(tag: XmlTag): void;
  close?(name: string): void;
  text?(text: string): void;
}

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,4});/g, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[ref] ?? whole;
  });
}

export function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

const localName = (name: string) => {
  const colon = name.indexOf(':');
  return colon < 0 ? name : name.slice(colon + 1);
};

// A tag never spans a "<" (XML doesn't allow one in a tag or attribute value), so a
// tag that never closes costs one short scan, not a scan to the end of the file.
// An unterminated comment, CDATA or declaration falls through to the last
// alternative, which refuses the file, so no construct is scanned twice.
const TOKEN =
  /<(\/?)([A-Za-z_][\w.:-]*)((?:[^<>"']|"[^<"]*"|'[^<']*')*?)(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[!?]/g;
const ATTR = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Walks an XML document, calling the handler for each tag and run of text. */
export function walkXml(xml: string, handler: XmlHandler): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new FileRefused(
      'The workbook contains an XML document type declaration, which spreadsheets never need. It was refused for safety.',
    );
  }
  TOKEN.lastIndex = 0;
  let last = 0;
  for (let match = TOKEN.exec(xml); match !== null; match = TOKEN.exec(xml)) {
    if (handler.text && match.index > last)
      handler.text(decodeEntities(xml.slice(last, match.index)));
    last = TOKEN.lastIndex;
    const [whole, closing, name, rawAttrs, selfClosing, cdata] = match;
    if (whole === '<!' || whole === '<?')
      throw new FileRefused('The workbook has XML that could not be read.');
    if (cdata !== undefined) {
      handler.text?.(cdata);
    } else if (name !== undefined) {
      const local = localName(name);
      if (closing) {
        handler.close?.(local);
      } else {
        const attrs: Record<string, string> = Object.create(null) as Record<string, string>;
        if (rawAttrs) {
          ATTR.lastIndex = 0;
          for (let a = ATTR.exec(rawAttrs); a !== null; a = ATTR.exec(rawAttrs)) {
            attrs[localName(a[1]!)] = decodeEntities(a[2] ?? a[3] ?? '');
          }
        }
        handler.open?.({ name: local, attrs, selfClosing: selfClosing === '/' });
        if (selfClosing === '/') handler.close?.(local);
      }
    }
  }
  if (handler.text && last < xml.length) handler.text(decodeEntities(xml.slice(last)));
}
