import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PdfDocument, pdfEncode, pdfFit, pdfTextWidth, pdfWrap } from '../dist/index.js';

/**
 * The PDF writer, held to what a reader of the file depends on.
 *
 * A PDF that opens in one viewer and not another is usually a cross-reference
 * table that points at the wrong byte, so the offsets are checked against the
 * file itself rather than trusted. The rest is what the module's comment
 * promises: the same calls write the same bytes, the file is ASCII, a
 * character outside the standard fonts' encoding is never dropped silently,
 * and text measured to fit a column does fit it.
 */

const ascii = (doc, meta) => doc.toString(meta);

function sample() {
  const doc = new PdfDocument();
  doc.text(48, 60, 'Where the money went', { font: 'bold', size: 18 });
  doc.textRight(547, 80, '$84.62', { size: 10, color: '#59606a' });
  doc.rect(48, 100, 200, 40, { fill: '#fbf6e9', stroke: '#8a6d1a', lineWidth: 1.5 });
  doc.line(48, 150, 547, 150, { color: '#d9d5cc' });
  doc.addPage();
  doc.text(48, 60, 'Page two (with parens) and a back\\slash');
  return doc;
}

describe('the file a reader opens', () => {
  it('has a cross-reference table whose every offset lands on its object', () => {
    const file = ascii(sample());
    assert.ok(file.startsWith('%PDF-1.4\n'));
    assert.ok(file.endsWith('%%EOF\n'));
    const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(file)[1]);
    assert.ok(file.slice(startxref).startsWith('xref\n'), 'startxref does not point at the xref table');
    const entries = [...file.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    assert.ok(entries.length >= 9, `only ${entries.length} objects`);
    entries.forEach((offset, i) => {
      assert.ok(file.slice(offset).startsWith(`${i + 1} 0 obj\n`), `object ${i + 1} is not at byte ${offset}`);
    });
    const size = Number(/\/Size (\d+)/.exec(file)[1]);
    assert.equal(size, entries.length + 1);
  });

  it('declares each content stream at its real length', () => {
    const file = ascii(sample());
    const streams = [...file.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)];
    assert.equal(streams.length, 2);
    for (const [, length, body] of streams) assert.equal(body.length, Number(length));
  });

  it('counts its pages and links each one to the tree', () => {
    const doc = sample();
    assert.equal(doc.pageCount, 2);
    const file = ascii(doc);
    assert.match(file, /\/Type \/Pages \/Kids \[7 0 R 9 0 R\] \/Count 2/);
    assert.equal([...file.matchAll(/\/Type \/Page \/Parent 2 0 R/g)].length, 2);
  });

  it('writes the same bytes for the same calls, and a date only when given one', () => {
    assert.equal(ascii(sample()), ascii(sample()));
    assert.doesNotMatch(ascii(sample()), /CreationDate/);
    const dated = ascii(sample(), { createdAt: new Date('2026-10-11T09:08:07Z') });
    assert.match(dated, /\/CreationDate \(D:20261011090807Z\)/);
  });

  it('is plain ASCII, so its length is its byte count', () => {
    const doc = new PdfDocument();
    doc.text(10, 10, 'búsqueda, caché, señal, 1.234,56 €, “quoted” — dash');
    const bytes = doc.toBytes({ title: 'Adónde fue el dinero' });
    for (const byte of bytes) assert.ok(byte < 128, `byte ${byte} is not ASCII`);
    assert.equal(bytes.length, doc.toString({ title: 'Adónde fue el dinero' }).length);
  });

  it('escapes what would end a string early', () => {
    const file = ascii(sample());
    assert.ok(file.includes('(Page two \\(with parens\\) and a back\\\\slash)'));
  });

  it('refuses a page that does not exist rather than drawing nowhere', () => {
    const doc = sample();
    assert.throws(() => doc.setPage(2), /no page 2: the document has 2/);
    assert.throws(() => doc.setPage(-1), RangeError);
    doc.setPage(0);
  });
});

describe('text outside the standard fonts is never dropped silently', () => {
  it('writes Latin-1 and the WinAnsi punctuation as their own codes', () => {
    assert.deepEqual(pdfEncode('ñ'), [0xf1]);
    assert.deepEqual(pdfEncode('€'), [0x80]);
    assert.deepEqual(pdfEncode('—'), [0x97]);
    assert.deepEqual(pdfEncode('…'), [0x85]);
  });

  it('writes an obvious ASCII form where there is one', () => {
    assert.deepEqual(pdfEncode('→'), [...'->'].map((c) => c.charCodeAt(0)));
    assert.deepEqual(pdfEncode('1 234'), [...'1 234'].map((c) => c.charCodeAt(0)));
  });

  it('and a question mark where there is not, one per character', () => {
    assert.deepEqual(pdfEncode('日本'), [63, 63]);
    assert.deepEqual(pdfEncode('🙂'), [63]);
  });
});

describe('measured text fits where it was measured for', () => {
  it('measures with the font metrics, so bold is wider than regular', () => {
    assert.equal(pdfTextWidth('0123456789', 'regular', 10), 55.6);
    assert.equal(pdfTextWidth('abc', 'mono', 10), 18);
    assert.ok(pdfTextWidth('Where', 'bold', 10) > pdfTextWidth('Where', 'regular', 10));
    // An accented letter is as wide as its letter.
    assert.equal(pdfTextWidth('é', 'regular', 10), pdfTextWidth('e', 'regular', 10));
  });

  it('wraps at spaces and never past the width, breaking a word too long for a line', () => {
    const text = 'claude-sonnet-5-5 routed the support workload ' + 'x'.repeat(120) + ' and stopped';
    const lines = pdfWrap(text, 'regular', 9, 200);
    assert.ok(lines.length > 2);
    for (const line of lines) assert.ok(pdfTextWidth(line, 'regular', 9) <= 200, `"${line}" overflows`);
    assert.equal(lines.join('').replaceAll(' ', ''), text.replaceAll(' ', ''));
  });

  it('keeps paragraph breaks', () => {
    assert.deepEqual(pdfWrap('one\ntwo', 'regular', 10, 500), ['one', 'two']);
  });

  it('fits a cell with an ellipsis that says it was cut, and leaves a fitting one alone', () => {
    assert.equal(pdfFit('short', 'regular', 8, 100), 'short');
    const cut = pdfFit('a-very-long-workload-label-from-somebodys-log', 'regular', 8, 60);
    assert.ok(cut.endsWith('…'));
    assert.ok(pdfTextWidth(cut, 'regular', 8) <= 60);
  });
});
