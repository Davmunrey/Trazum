/**
 * Writes `apps/vscode/icon.png`, the extension's marketplace icon.
 *
 * Generated rather than drawn, for the reason `draw-architecture.mjs` gives
 * about the boundary picture: an asset nobody can regenerate is one nobody can
 * correct, and a binary in a repository is the least reviewable thing in it. A
 * reader who wants to know what the icon is can read this file instead of
 * opening an image editor, and `npm run draw:icon` reproduces it byte for byte.
 *
 * **The palette is the product's own**, taken from `docs/assets/demo.svg`: the
 * terracotta accent and the dark ground the CLI and the web app already use.
 * Repeated here as named constants rather than parsed out of the SVG, because
 * an icon that failed to build when somebody edited a demo would be a strange
 * coupling — and `icon.test.js` holds the two together instead.
 *
 * **The mark is the proportion bar**, which is the one thing this product draws
 * in every surface: a run of filled cells against a run of empty ones, the
 * shape a reader already associates with "how much of the budget is gone".
 * Nothing here is a logo in the branding sense; it is the tool's own output at
 * icon size.
 *
 * PNG is written by hand — a zlib stream and four chunks — because `vsce`
 * requires PNG and this repository takes no dependency it can avoid. The format
 * is small enough to write correctly and the test decodes what comes out.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'apps', 'vscode', 'icon.png');

/** The marketplace renders at 128, and asks for no more. */
export const SIZE = 128;

/** The Trazum palette, as the rest of the product uses it. */
export const PALETTE = {
  ground: [0x17, 0x15, 0x12, 0xff],
  filled: [0xb0, 0x52, 0x2f, 0xff],
  empty: [0x30, 0x2c, 0x26, 0xff],
};

/**
 * The bar: five cells, three of them spent.
 *
 * Three of five is deliberate and is not a claim about anything — it is the
 * proportion that reads as "a bar, partly filled" at 32 pixels, where two of
 * five reads as empty and four of five reads as full. Stated because a number
 * in this repository without a reason is the thing the doctrine is about.
 */
export const CELLS = 5;
export const FILLED = 3;

/** One row of raw RGBA, from a function of x. */
const row = (colorAt) => {
  const bytes = new Uint8Array(SIZE * 4);
  for (let x = 0; x < SIZE; x++) bytes.set(colorAt(x), x * 4);
  return bytes;
};

/** The image as raw RGBA scanlines, each prefixed with a filter byte of 0. */
export function pixels() {
  const margin = Math.round(SIZE * 0.16);
  const barTop = Math.round(SIZE * 0.4);
  const barBottom = SIZE - barTop;
  const inner = SIZE - margin * 2;
  const gap = Math.round(inner * 0.04);
  const cell = (inner - gap * (CELLS - 1)) / CELLS;

  const colorAt = (x) => {
    if (x < margin || x >= SIZE - margin) return PALETTE.ground;
    const offset = x - margin;
    const index = Math.floor(offset / (cell + gap));
    const within = offset - index * (cell + gap);
    if (within >= cell) return PALETTE.ground;
    return index < FILLED ? PALETTE.filled : PALETTE.empty;
  };

  const bar = row(colorAt);
  const blank = row(() => PALETTE.ground);

  const raw = new Uint8Array(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y++) {
    const line = y >= barTop && y < barBottom ? bar : blank;
    raw[y * (SIZE * 4 + 1)] = 0;
    raw.set(line, y * (SIZE * 4 + 1) + 1);
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

/** The whole file: signature, IHDR, IDAT, IEND. */
export function png() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    // Level 9 so two runs of this script produce the same bytes.
    chunk('IDAT', deflateSync(Buffer.from(pixels()), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bytes = png();
  writeFileSync(OUT, bytes);
  console.log(`Wrote ${OUT} — ${SIZE}×${SIZE}, ${bytes.length} bytes`);
}
