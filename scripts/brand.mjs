/**
 * Trazum's identity, for everything this repository draws outside the web app.
 *
 * `DESIGN.md` records the approved direction: warm paper, dark ink, acid yellow
 * as a fill, and a plain T where the full wordmark cannot fit. The web app
 * holds those values in `apps/web/app/globals.css` and the T in
 * `apps/web/app/icon.svg`. Until this file existed the three pictures in the
 * README and the extension's icon each kept a palette of their own, copied from
 * one another, and all of them were still the palette the product had before
 * that direction was approved: a different accent, a different ground and a
 * different mark, on the first screen of the repository.
 *
 * So the values live here once, the scripts that draw import them, and
 * `packages/core/test/brand.test.js` holds them against the two files the web
 * app reads. A colour changed there and not here fails the build; so does a
 * picture carrying a colour this file does not name.
 *
 * Nothing here is new design. Every value is one the web app already ships.
 */

import { deflateSync } from 'node:zlib';

/** The fill. Never text on paper: `DESIGN.md`, "Tokens". */
export const ACID = '#dce94d';
/** The ink the mark is drawn in, on either theme. */
export const INK = '#20231e';

/**
 * The dark tokens, by the names `DESIGN.md` gives them, plus the three
 * semantic colours `globals.css` keeps for good, caution and error.
 *
 * Dark, because every picture drawn from here is a terminal or sits directly
 * under one, and a terminal is dark in both schemes. The Playground makes the
 * same decision for the same reason.
 */
export const DARK = {
  canvas: '#1c211b',
  raised: '#242a21',
  sunken: '#2c3227',
  text: '#f0f1e5',
  secondary: '#c0c6af',
  rule: '#67715c',
  wash: '#343c20',
  good: '#6fc99a',
  warn: '#d6ad63',
  bad: '#f39f87',
};

/**
 * The light tokens, for the one picture drawn on paper: the social card each
 * public page of the web app draws (`apps/web/lib/social-card.tsx`), which a
 * link preview shows beside light pages. `brand.test.js` holds each value to
 * the token of its role in `globals.css`'s light theme, as it holds `DARK` to
 * the dark one.
 */
export const LIGHT = {
  canvas: '#f6f4ec',
  raised: '#fbf9f1',
  sunken: '#eeeee0',
  text: '#20231e',
  secondary: '#555a4f',
  rule: '#999f8a',
};

export const MONO ='ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
/**
 * The wordmark's face, then what a machine without it has. An SVG shown
 * through `<img>` cannot load a font, so the name is drawn in whatever bold
 * grotesque the reader's system offers; the T beside it is geometry and is the
 * same everywhere.
 */
export const DISPLAY = "'Space Grotesk',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/**
 * The T, on the 40-unit grid `apps/web/app/icon.svg` is drawn on.
 *
 * A bordered square, a bar and a stem: rectangles only, which is why the
 * raster below needs no anti-aliasing and no dependency. `[left, top, right,
 * bottom]`.
 */
export const MARK = {
  grid: 40,
  border: 3,
  bar: [9, 10, 31, 16],
  stem: [17, 16, 23, 31],
};

/** The square and its border, as `icon.svg` writes it: a stroke centred on the edge. */
export function markGroundPath() {
  const half = MARK.border / 2;
  const side = MARK.grid - MARK.border;
  return `M${half} ${half}h${side}v${side}h-${side}z`;
}

/** The T, as `icon.svg` writes it: one outline, bar then stem. */
export function markGlyphPath() {
  const [barL, barT, barR, barB] = MARK.bar;
  const [stemL, , stemR, stemB] = MARK.stem;
  return `M${barL} ${barT}h${barR - barL}v${barB - barT}h-${barR - stemR}v${stemB - barB}h-${stemR - stemL}V${barB}H${barL}z`;
}

/** The mark as SVG, `size` units square with its corner at `x`, `y`. */
export function markSvg(x, y, size) {
  const scale = size / MARK.grid;
  return `<g transform="translate(${x} ${y}) scale(${scale})">`
    + `<path fill="${ACID}" stroke="${INK}" stroke-width="${MARK.border}" d="${markGroundPath()}"/>`
    + `<path fill="${INK}" d="${markGlyphPath()}"/></g>`;
}

const rgb = (hex) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

/**
 * The mark as pixels: raw RGBA scanlines, each with a filter byte of 0.
 *
 * Every edge is rounded to a whole pixel, so the T is crisp at 16 pixels and
 * at 512 and no pixel is a blend of two colours. The right edges are mirrored
 * from the left ones rather than rounded on their own: the T is symmetric on
 * its grid, and rounding 9 and 31 separately lands one pixel off centre at the
 * sizes where both fall on a half.
 *
 * `bordered: false` is the full-bleed version, for the places that cut their
 * own shape out of an icon: a phone rounds the corners of an Apple touch icon
 * and an Android launcher masks a maskable one, and either would slice through
 * a border drawn at the edge.
 */
export function markPixels(size, { bordered = true } = {}) {
  const scale = size / MARK.grid;
  const at = (unit) => Math.round(unit * scale);
  const border = bordered ? Math.max(1, at(MARK.border)) : 0;
  const barL = at(MARK.bar[0]);
  const barT = at(MARK.bar[1]);
  const barB = at(MARK.bar[3]);
  const stemL = at(MARK.stem[0]);
  const stemB = at(MARK.stem[3]);
  const ink = [...rgb(INK), 0xff];
  const acid = [...rgb(ACID), 0xff];

  const inked = (x, y) =>
    x < border || y < border || x >= size - border || y >= size - border
    || (y >= barT && y < barB && x >= barL && x < size - barL)
    || (y >= barB && y < stemB && x >= stemL && x < size - stemL);

  const stride = size * 4 + 1;
  const raw = new Uint8Array(size * stride);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) raw.set(inked(x, y) ? ink : acid, y * stride + 1 + x * 4);
  }
  return raw;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** One PNG chunk: length, type, payload, CRC of type and payload. */
const chunk = (type, payload) => {
  const name = Buffer.from(type, 'ascii');
  const body = Buffer.concat([name, Buffer.from(payload)]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(payload.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};

/**
 * A PNG of the mark: signature, IHDR, IDAT, IEND.
 *
 * Written by hand, a zlib stream and three chunks, because this repository
 * takes no dependency it can avoid and the format is small enough to write
 * correctly. The tests decode what comes out.
 */
export function markPng(size, options) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    // Level 9 so two runs of this produce the same bytes.
    chunk('IDAT', deflateSync(Buffer.from(markPixels(size, options)), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * An `.ico` holding the mark at each of `sizes`, every image a PNG.
 *
 * Six bytes of header, sixteen per directory entry, then the images. A size of
 * 256 is written as 0, which is what the one-byte field means by it.
 */
export function markIco(sizes) {
  const images = sizes.map((size) => markPng(size));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // an icon, not a cursor
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((size, index) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // no palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(images[index].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[index].length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images]);
}
