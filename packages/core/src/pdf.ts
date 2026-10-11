/**
 * A PDF writer with nothing behind it.
 *
 * ## Why this exists
 *
 * The person who signs off a bill reads it as a PDF: attached to an email,
 * filed beside an invoice, printed for a meeting. The HTML report renders the
 * same everywhere a browser does, and a browser is still one step a finance
 * reader should not have to take. This writes the file directly.
 *
 * ## Why it is small on purpose
 *
 * This package has no runtime dependencies, and a PDF library would be the
 * largest thing in it by an order of magnitude. A bill report needs very little
 * of the format: text in two weights, filled and stroked rectangles, lines, and
 * pages. So this is exactly that, over the 14 standard fonts every PDF reader
 * carries, which means no font is embedded and a three-page bill weighs a few
 * kilobytes.
 *
 * ## What that costs, said plainly
 *
 * The standard fonts speak WinAnsiEncoding: Latin script, which covers every
 * locale this product ships (English, Spanish, French, German, Portuguese)
 * and nothing beyond it. A character outside it is written as its closest
 * ASCII form when there is an obvious one (`→` as `->`) and as `?` when there
 * is not, never dropped silently: a label in Japanese arrives as question
 * marks, which a reader can see is wrong, rather than as an empty cell, which
 * reads as nothing.
 *
 * ## Deterministic
 *
 * The same calls write the same bytes. No creation date unless one is passed,
 * no random ids, content streams uncompressed, so a test can compare the file
 * and a reader can open it in a text editor and find their figures. The file
 * is plain ASCII: every byte past 127 is written as an octal escape.
 */

export type PdfFont = 'regular' | 'bold' | 'mono';

/** A colour as `#rrggbb`. */
export type PdfColor = `#${string}`;

export interface PdfTextOptions {
  font?: PdfFont;
  size?: number;
  color?: PdfColor;
}

export interface PdfShapeOptions {
  fill?: PdfColor;
  stroke?: PdfColor;
  lineWidth?: number;
}

export interface PdfMetadata {
  title?: string;
  subject?: string;
  author?: string;
  /** Omitted unless given, so the same report writes the same bytes. */
  createdAt?: Date;
}

/** A4, in points. Letter readers print it with a small margin and lose nothing. */
export const PDF_PAGE = { width: 595.28, height: 841.89 } as const;

const FONT_NAME: Readonly<Record<PdfFont, string>> = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  mono: 'Courier',
};

const FONT_KEY: Readonly<Record<PdfFont, string>> = { regular: 'F1', bold: 'F2', mono: 'F3' };

/*
  Advance widths in thousandths of an em for character codes 32 to 126, from
  the Adobe font metrics every reader ships with these fonts. Needed for one
  thing: right-aligning a column of figures and wrapping a sentence, both of
  which a report has on every page.
*/
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** The WinAnsi code points that are not Latin-1's, and the punctuation reports use. */
const WIN_ANSI_EXTRA: ReadonlyMap<string, number> = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86],
  ['‡', 0x87], ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c],
  ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95],
  ['–', 0x96], ['—', 0x97], ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b],
  ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
]);

/** Characters outside WinAnsi with an obvious ASCII reading. */
const TRANSLITERATE: ReadonlyMap<string, string> = new Map([
  ['→', '->'], ['←', '<-'], ['↔', '<->'], ['≈', '~'], ['≤', '<='], ['≥', '>='],
  ['−', '-'], ['‑', '-'], ['‐', '-'], ['≠', '!='], ['✓', 'v'], ['✗', 'x'],
  // Thin and narrow spaces, which some locales use as a thousands separator.
  [' ', ' '], [' ', ' '], [' ', ' '], ['​', ''],
]);

/** Widths for the WinAnsi codes above 127 that are not an accented letter. */
const HIGH_WIDTH: ReadonlyMap<number, number> = new Map([
  [0x80, 556], [0x85, 1000], [0x91, 222], [0x92, 222], [0x93, 333], [0x94, 333],
  [0x95, 350], [0x96, 556], [0x97, 1000], [0x99, 1000], [0xa0, 278], [0xa1, 333],
  [0xa2, 556], [0xa3, 556], [0xa5, 556], [0xa7, 556], [0xa9, 737], [0xab, 556],
  [0xae, 737], [0xb0, 400], [0xb7, 278], [0xbb, 556], [0xbf, 611], [0xc6, 1000],
  [0xd7, 584], [0xd8, 778], [0xdf, 611], [0xe6, 889], [0xf7, 584], [0xf8, 611],
]);

/** One character as WinAnsi byte codes: one, several when transliterated, `?` when neither. */
function winAnsi(char: string): number[] {
  const code = char.codePointAt(0) ?? 63;
  if (code === 0x0a || code === 0x0d || code === 0x09) return [32];
  if (code >= 32 && code <= 126) return [code];
  if (code >= 0xa0 && code <= 0xff) return [code];
  const extra = WIN_ANSI_EXTRA.get(char);
  if (extra !== undefined) return [extra];
  const ascii = TRANSLITERATE.get(char);
  if (ascii !== undefined) return [...ascii].map((c) => c.charCodeAt(0));
  return [63];
}

/** The text as WinAnsi codes, the form both the width and the stream are measured in. */
export function pdfEncode(text: string): number[] {
  const codes: number[] = [];
  for (const char of text) codes.push(...winAnsi(char));
  return codes;
}

function codeWidth(code: number, font: PdfFont): number {
  if (font === 'mono') return 600;
  const table = font === 'bold' ? HELVETICA_BOLD : HELVETICA;
  if (code >= 32 && code <= 126) return table[code - 32] ?? 556;
  const high = HIGH_WIDTH.get(code);
  if (high !== undefined) return high;
  // An accented letter is as wide as the letter under the accent.
  const base = String.fromCharCode(code).normalize('NFD').charCodeAt(0);
  if (base >= 32 && base <= 126) return table[base - 32] ?? 556;
  return 556;
}

/** How wide `text` sets in `font` at `size` points. */
export function pdfTextWidth(text: string, font: PdfFont, size: number): number {
  let units = 0;
  for (const code of pdfEncode(text)) units += codeWidth(code, font);
  return (units * size) / 1000;
}

/**
 * `text` broken into lines no wider than `maxWidth`, at spaces.
 *
 * A word wider than the line on its own (a model id, a path) is broken
 * mid-word rather than left to run off the page, because a figure that leaves
 * the paper is a figure nobody reads.
 */
export function pdfWrap(text: string, font: PdfFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/)) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (pdfTextWidth(candidate, font, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== '') lines.push(line);
      let rest = word;
      while (pdfTextWidth(rest, font, size) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && pdfTextWidth(rest.slice(0, cut), font, size) > maxWidth) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** `text` cut to fit `maxWidth`, with an ellipsis saying it was cut. */
export function pdfFit(text: string, font: PdfFont, size: number, maxWidth: number): string {
  if (pdfTextWidth(text, font, size) <= maxWidth) return text;
  let cut = text.length;
  while (cut > 0 && pdfTextWidth(`${text.slice(0, cut)}…`, font, size) > maxWidth) cut -= 1;
  return `${text.slice(0, cut)}…`;
}

/** A PDF string literal: parentheses and backslashes escaped, every byte past 127 in octal. */
function literal(text: string): string {
  let out = '(';
  for (const code of pdfEncode(text)) {
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`;
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(code);
  }
  return `${out})`;
}

/** Numbers as PDF writes them: at most two decimals, no exponent, no `-0`. */
function num(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function rgb(color: PdfColor): string {
  const hex = color.slice(1);
  const channel = (offset: number): string => num(parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return `${channel(0)} ${channel(2)} ${channel(4)}`;
}

/**
 * Pages of text and shapes, written as one PDF.
 *
 * Coordinates are in points from the **top-left** corner, the way a layout is
 * thought about, and converted to PDF's bottom-left origin on the way out. A
 * text call's `y` is the baseline.
 */
export class PdfDocument {
  readonly width = PDF_PAGE.width;
  readonly height = PDF_PAGE.height;
  private readonly pages: string[][] = [];
  private current = -1;

  constructor() {
    this.addPage();
  }

  /** Starts a new page and makes it the one drawn on. */
  addPage(): number {
    this.pages.push([]);
    this.current = this.pages.length - 1;
    return this.current;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Draws on an earlier page, which is how a footer learns the page count. */
  setPage(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.pages.length) {
      throw new RangeError(`no page ${index}: the document has ${this.pages.length}`);
    }
    this.current = index;
  }

  private ops(): string[] {
    const page = this.pages[this.current];
    if (page === undefined) throw new RangeError('no page to draw on');
    return page;
  }

  text(x: number, y: number, text: string, options: PdfTextOptions = {}): void {
    const font = options.font ?? 'regular';
    const size = options.size ?? 10;
    const color = options.color ?? '#000000';
    this.ops().push(
      `BT /${FONT_KEY[font]} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(this.height - y)} Td ${literal(text)} Tj ET`,
    );
  }

  /** Text ending at `right`, for a column of figures. */
  textRight(right: number, y: number, text: string, options: PdfTextOptions = {}): void {
    const width = pdfTextWidth(text, options.font ?? 'regular', options.size ?? 10);
    this.text(right - width, y, text, options);
  }

  rect(x: number, y: number, width: number, height: number, options: PdfShapeOptions = {}): void {
    const { fill, stroke } = options;
    if (fill === undefined && stroke === undefined) return;
    const parts: string[] = ['q'];
    if (fill !== undefined) parts.push(`${rgb(fill)} rg`);
    if (stroke !== undefined) parts.push(`${rgb(stroke)} RG ${num(options.lineWidth ?? 1)} w`);
    parts.push(`${num(x)} ${num(this.height - y - height)} ${num(width)} ${num(height)} re`);
    parts.push(fill !== undefined && stroke !== undefined ? 'B' : fill !== undefined ? 'f' : 'S');
    parts.push('Q');
    this.ops().push(parts.join(' '));
  }

  line(x1: number, y1: number, x2: number, y2: number, options: { color?: PdfColor; width?: number } = {}): void {
    this.ops().push(
      `q ${rgb(options.color ?? '#000000')} RG ${num(options.width ?? 1)} w ${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S Q`,
    );
  }

  /** The whole file, as ASCII bytes. */
  toBytes(metadata: PdfMetadata = {}): Uint8Array {
    const text = this.toString(metadata);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
    return bytes;
  }

  /** The whole file as a string; every character is ASCII, so its length is its byte count. */
  toString(metadata: PdfMetadata = {}): string {
    /*
      Object numbers: 1 catalog, 2 page tree, 3 to 5 fonts, 6 info, then a page
      and its content stream for each page in order.
    */
    const objects: string[] = [];
    const pageIds = this.pages.map((_, i) => 7 + i * 2);
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`);
    for (const font of ['regular', 'bold', 'mono'] as const) {
      objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAME[font]} /Encoding /WinAnsiEncoding >>`);
    }
    const info: string[] = ['/Producer (Trazum)'];
    if (metadata.title !== undefined) info.push(`/Title ${literal(metadata.title)}`);
    if (metadata.subject !== undefined) info.push(`/Subject ${literal(metadata.subject)}`);
    if (metadata.author !== undefined) info.push(`/Author ${literal(metadata.author)}`);
    if (metadata.createdAt !== undefined) info.push(`/CreationDate (${pdfDate(metadata.createdAt)})`);
    objects.push(`<< ${info.join(' ')} >>`);
    const resources = '<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>';
    this.pages.forEach((ops, i) => {
      const contentId = 8 + i * 2;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] /Resources ${resources} /Contents ${contentId} 0 R >>`,
      );
      const stream = ops.join('\n');
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return out;
  }
}

/** `D:YYYYMMDDHHmmSSZ`, in UTC. */
function pdfDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}
