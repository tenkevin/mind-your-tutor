import { describe, expect, it } from 'vitest';
import {
  chunkSections,
  extractDocument,
  screenLibraryFile,
  type LibrarySection,
} from './library.js';
import { docx, pdf, zip } from './testing/build.js';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('screenLibraryFile (A3-S2)', () => {
  it('accepts a PDF, a DOCX, text and Markdown by their bytes', () => {
    expect(screenLibraryFile('a.pdf', pdf(['hi']))).toEqual({ ok: true, kind: 'pdf' });
    expect(screenLibraryFile('a.docx', docx(['hi']))).toEqual({ ok: true, kind: 'docx' });
    expect(screenLibraryFile('a.txt', bytes('hi'))).toEqual({ ok: true, kind: 'text' });
    expect(screenLibraryFile('a.md', bytes('# hi'))).toEqual({ ok: true, kind: 'text' });
  });

  it('refuses an empty file and one over the limit', () => {
    expect(screenLibraryFile('a.txt', new Uint8Array())).toMatchObject({ ok: false });
    const result = screenLibraryFile('a.txt', bytes('x'.repeat(100)), { maxFileBytes: 50 });
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.message).toContain('the most a library document can be');
  });

  it('refuses programs, whatever the name says', () => {
    const programs = [
      Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]),
      Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]),
      bytes('#!/bin/sh\nrm -rf /\n'),
    ];
    for (const name of ['lab.pdf', 'lab.docx', 'lab.txt', 'lab.exe']) {
      for (const program of programs) {
        expect(screenLibraryFile(name, program)).toMatchObject({ ok: false });
      }
    }
  });

  it('refuses a file whose bytes disagree with its name, and other zips', () => {
    expect(screenLibraryFile('a.pdf', bytes('just text'))).toMatchObject({ ok: false });
    expect(screenLibraryFile('a.txt', pdf(['hi']))).toMatchObject({ ok: false });
    expect(screenLibraryFile('a.pdf', docx(['hi']))).toMatchObject({ ok: false });
    expect(screenLibraryFile('a.txt', Uint8Array.from([0x68, 0, 0x69]))).toMatchObject({
      ok: false,
    });
    expect(() => extractDocument('a.docx', zip([{ name: 'x.jar', data: 'x' }]))).toThrow(
      /isn't a Word document/,
    );
  });
});

describe('extractDocument', () => {
  it('reads a PDF page by page, in order', () => {
    const doc = extractDocument(
      'water.pdf',
      pdf([
        'Evaporation turns water into vapor.\nHeat drives it.',
        'Condensation forms clouds (really).',
      ]),
    );
    expect(doc.kind).toBe('pdf');
    expect(doc.sections).toEqual([
      { page: 1, section: null, text: 'Evaporation turns water into vapor.\nHeat drives it.' },
      { page: 2, section: null, text: 'Condensation forms clouds (really).' },
    ]);
  });

  it('neutralises a PDF with an embedded script: only the text is kept', () => {
    const doc = extractDocument(
      'evil.pdf',
      pdf(
        ['Lab safety rules'],
        '/OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >> /Names << /JavaScript 9 0 R >>',
      ),
    );
    expect(doc.sections.map((s) => s.text).join(' ')).toBe('Lab safety rules');
  });

  it('refuses a PDF with no text and an encrypted one', () => {
    expect(() => extractDocument('scan.pdf', pdf(['']))).toThrow(/No text could be read/);
    const encrypted = Buffer.concat([Buffer.from(pdf(['x'])), Buffer.from('\n/Encrypt 9 0 R\n')]);
    expect(() => extractDocument('p.pdf', encrypted)).toThrow(/password-protected/);
  });

  it('reads a DOCX into sections by heading', () => {
    const doc = extractDocument(
      'notes.docx',
      docx([
        'Intro text.',
        'heading:The sun',
        'The sun heats the oceans.',
        'heading:Clouds',
        'Vapor rises & cools <fast>.',
      ]),
    );
    expect(doc.sections).toEqual([
      { page: null, section: null, text: 'Intro text.' },
      { page: null, section: 'The sun', text: 'The sun heats the oceans.' },
      { page: null, section: 'Clouds', text: 'Vapor rises & cools <fast>.' },
    ]);
  });

  it('refuses a DOCX that declares entities, and a zip bomb', () => {
    const xxe = zip([
      {
        name: 'word/document.xml',
        data: '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><w:document xmlns:w="w"><w:body><w:p><w:r><w:t>&a;</w:t></w:r></w:p></w:body></w:document>',
      },
    ]);
    expect(() => extractDocument('x.docx', xxe)).toThrow(/declares entities/);
    const bomb = zip([{ name: 'word/document.xml', data: '<a>' + ' '.repeat(2_000_000) + '</a>' }]);
    expect(() => extractDocument('x.docx', bomb, { maxUnpackedBytes: 100_000 })).toThrow(
      /unpacks to more than/,
    );
  });

  it('keeps Markdown headings as sections and strips control characters', () => {
    const doc = extractDocument(
      'lab.md',
      bytes('Preface\u0007 here\n\n# Materials\nBeaker, ice.\n\n## Steps\nHeat it.'),
    );
    expect(doc.sections).toEqual([
      { page: null, section: null, text: 'Preface here' },
      { page: null, section: 'Materials', text: 'Beaker, ice.' },
      { page: null, section: 'Steps', text: 'Heat it.' },
    ]);
  });

  it('refuses a document with no text', () => {
    expect(() => extractDocument('empty.txt', bytes('   \n  '))).toThrow(/no text/);
  });
});

describe('chunkSections', () => {
  const long = Array.from(
    { length: 40 },
    (_, i) => `Sentence number ${i} about the water cycle.`,
  ).join(' ');

  it('keeps every chunk within the limit and numbers them from 0', () => {
    const chunks = chunkSections([{ page: 3, section: null, text: long }], {
      maxChars: 200,
      overlap: 0,
    });
    expect(chunks.length).toBeGreaterThan(5);
    chunks.forEach((c, i) => {
      expect(c.ordinal).toBe(i);
      expect(c.content.length).toBeLessThanOrEqual(200);
      expect(c.content.length).toBeGreaterThan(0);
      expect(c.page).toBe(3);
    });
    // Nothing is lost.
    expect(
      chunks
        .map((c) => c.content)
        .join(' ')
        .replace(/\s+/g, ' '),
    ).toBe(long);
  });

  it('never spans two sections and keeps their labels', () => {
    const sections: LibrarySection[] = [
      { page: null, section: 'A', text: 'Alpha one.\nAlpha two.' },
      { page: null, section: 'B', text: 'Beta one.' },
    ];
    const chunks = chunkSections(sections, { maxChars: 1000 });
    expect(chunks.map((c) => [c.section, c.content])).toEqual([
      ['A', 'Alpha one.\nAlpha two.'],
      ['B', 'Beta one.'],
    ]);
  });

  it('splits one huge unbroken word run and is deterministic', () => {
    const text = 'x'.repeat(5_000);
    const a = chunkSections([{ page: 1, section: null, text }], { maxChars: 1000 });
    expect(a.every((c) => c.content.length <= 1000)).toBe(true);
    expect(chunkSections([{ page: 1, section: null, text }], { maxChars: 1000 })).toEqual(a);
  });

  it('refuses a document that makes too many passages', () => {
    expect(() =>
      chunkSections([{ page: 1, section: null, text: long }], { maxChars: 100, maxChunks: 3 }),
    ).toThrow(/too long/);
  });
});
