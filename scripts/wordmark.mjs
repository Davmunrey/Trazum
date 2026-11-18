/**
 * The wordmark as outlines, read from the typeface the web app ships.
 *
 * `DESIGN.md` says the full name leads and that it is set in Space Grotesk
 * Variable. A file somebody downloads cannot load a font, and an SVG that names
 * one is drawn in whatever the reader's machine has instead. So the name is
 * drawn here as outlines: the glyphs of `T`, `r`, `a`, `z`, `u` and `m` at
 * weight 700, placed with the font's own advances and pair kerning and the
 * tracking the site's header uses.
 *
 * Nothing is typed in. The font is the WOFF2 file `@fontsource-variable/
 * space-grotesk` installs and `globals.css` imports, and this file reads it
 * the way a browser does, as far as these six letters need:
 *
 *   - the WOFF2 container, whose `glyf` table is stored in a transformed form;
 *   - `cmap`, to find each letter's glyph;
 *   - `gvar` and `avar`, to move the outlines to weight 700;
 *   - `hmtx` and `HVAR`, for the advances at that weight;
 *   - the `kern` feature of `GPOS`, with the variation `GDEF` carries.
 *
 * It writes no file and holds no value of its own: `brand.mjs` calls it and
 * `draw-icon.mjs` writes what comes out. The font is under the SIL Open Font
 * License 1.1, whose text is in the package beside the file. No dependency is
 * added: the container's compression is Brotli, which Node's `zlib` reads.
 *
 * What it does not read: composite glyphs (none of the six letters is one, and
 * it says so rather than draw them wrong), any lookup but pair adjustment, and
 * any feature but `kern`. `brand.test.js` compares what it draws with a
 * browser's rendering of the same text.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';

/** The name the site draws, and the weight and tracking its header draws it at. */
export const WORDMARK_TEXT = 'Trazum';
export const WORDMARK_WEIGHT = 700;
/** `tracking-[-0.04em]` on the header's wordmark in `SiteHeader.tsx`. */
export const WORDMARK_TRACKING = -0.04;

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp',
  'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL',
  'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx',
  'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

/** The font file the web app's stylesheet imports, found the way Node finds any package. */
export function fontPath() {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve('@fontsource-variable/space-grotesk/package.json', { paths: [join(dirname(new URL(import.meta.url).pathname), '../apps/web')] });
  return join(dirname(manifest), 'files/space-grotesk-latin-wght-normal.woff2');
}

/* ------------------------------------------------------------------ */
/* The WOFF2 container                                                 */
/* ------------------------------------------------------------------ */

/** @param {Buffer} file @returns {Record<string, Buffer>} each table, undone from the container */
export function woff2Tables(file) {
  if (file.toString('ascii', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const count = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  let at = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = file[at++];
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error('a number in the table directory is too long');
  };
  const entries = [];
  for (let i = 0; i < count; i++) {
    const flags = file[at++];
    const index = flags & 0x3f;
    let tag;
    if (index === 63) {
      tag = file.toString('ascii', at, at + 4);
      at += 4;
    } else tag = KNOWN_TAGS[index];
    const version = flags >> 6;
    const original = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    const stored = transformed ? base128() : original;
    entries.push({ tag, original, stored, transformed });
  }
  const data = brotliDecompressSync(file.subarray(at, at + compressedSize));
  const tables = {};
  let offset = 0;
  for (const entry of entries) {
    const bytes = data.subarray(offset, offset + entry.stored);
    offset += entry.stored;
    if (entry.transformed && entry.tag !== 'glyf' && entry.tag !== 'loca') throw new Error(`the ${entry.tag} table is stored transformed, which this reader does not undo`);
    tables[entry.tag] = entry.transformed ? { transformed: bytes } : bytes;
  }
  return tables;
}

/** A cursor over a buffer, in the big-endian numbers a font is written in. */
class Reader {
  constructor(bytes, at = 0) {
    this.bytes = bytes;
    this.at = at;
  }
  u8() { return this.bytes[this.at++]; }
  i8() { const v = this.bytes.readInt8(this.at); this.at += 1; return v; }
  u16() { const v = this.bytes.readUInt16BE(this.at); this.at += 2; return v; }
  i16() { const v = this.bytes.readInt16BE(this.at); this.at += 2; return v; }
  u32() { const v = this.bytes.readUInt32BE(this.at); this.at += 4; return v; }
  i32() { const v = this.bytes.readInt32BE(this.at); this.at += 4; return v; }
  f2dot14() { return this.i16() / 16384; }
  /** The `255UInt16` of the WOFF2 specification. */
  u255() {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 506;
    return code;
  }
}

const withSign = (flag, value) => ((flag & 1) === 1 ? value : -value);

/**
 * Every glyph of the transformed `glyf` table as `{ x, y, on }` points and the
 * index of the last point of each contour. A composite glyph is `{ composite: true }`.
 * @param {Buffer} bytes
 */
export function readGlyf(bytes) {
  const head = new Reader(bytes);
  head.u16(); // version
  head.u16(); // option flags
  const glyphCount = head.u16();
  head.u16(); // index format
  const sizes = Array.from({ length: 7 }, () => head.u32());
  let at = 36;
  const [nContourSize, nPointsSize, flagSize, glyphSize, compositeSize, bboxSize, instructionSize] = sizes;
  const slice = (size) => {
    const part = new Reader(bytes, at);
    at += size;
    return part;
  };
  const nContours = slice(nContourSize);
  const nPoints = slice(nPointsSize);
  const flags = slice(flagSize);
  const glyphs = slice(glyphSize);
  const composites = slice(compositeSize);
  const bbox = slice(bboxSize);
  const instructions = slice(instructionSize);
  const bitmapLength = 4 * ((glyphCount + 31) >> 5);
  const bitmap = bytes.subarray(bbox.at, bbox.at + bitmapLength);
  bbox.at += bitmapLength;

  const out = [];
  for (let glyph = 0; glyph < glyphCount; glyph++) {
    const contours = nContours.i16();
    const hasBox = (bitmap[glyph >> 3] & (0x80 >> (glyph & 7))) !== 0;
    if (contours === 0) {
      out.push({ points: [], ends: [] });
      continue;
    }
    if (contours < 0) {
      let more = true;
      let instructed = false;
      while (more) {
        const flag = composites.u16();
        composites.u16(); // component glyph
        composites.at += flag & 0x0001 ? 4 : 2;
        if (flag & 0x0008) composites.at += 2;
        else if (flag & 0x0040) composites.at += 4;
        else if (flag & 0x0080) composites.at += 8;
        more = (flag & 0x0020) !== 0;
        if (flag & 0x0100) instructed = true;
      }
      if (instructed) instructions.at += glyphs.u255();
      bbox.at += 8;
      out.push({ composite: true, points: [], ends: [] });
      continue;
    }
    const ends = [];
    let total = 0;
    for (let c = 0; c < contours; c++) {
      total += nPoints.u255();
      ends.push(total - 1);
    }
    const flagList = [];
    for (let p = 0; p < total; p++) flagList.push(flags.u8());
    const points = [];
    let x = 0;
    let y = 0;
    for (const raw of flagList) {
      const on = (raw & 0x80) === 0;
      const flag = raw & 0x7f;
      let dx;
      let dy;
      if (flag < 10) {
        dx = 0;
        dy = withSign(flag, ((flag & 14) << 7) + glyphs.u8());
      } else if (flag < 20) {
        dx = withSign(flag, (((flag - 10) & 14) << 7) + glyphs.u8());
        dy = 0;
      } else if (flag < 84) {
        const b0 = flag - 20;
        const b1 = glyphs.u8();
        dx = withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4));
        dy = withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f));
      } else if (flag < 120) {
        const b0 = flag - 84;
        dx = withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + glyphs.u8());
        dy = withSign(flag >> 1, 1 + ((((b0 % 12) >> 2)) << 8) + glyphs.u8());
      } else if (flag < 124) {
        const b1 = glyphs.u8();
        const b2 = glyphs.u8();
        const b3 = glyphs.u8();
        dx = withSign(flag, (b1 << 4) + (b2 >> 4));
        dy = withSign(flag >> 1, ((b2 & 0x0f) << 8) + b3);
      } else {
        const b1 = glyphs.u8();
        const b2 = glyphs.u8();
        const b3 = glyphs.u8();
        const b4 = glyphs.u8();
        dx = withSign(flag, (b1 << 8) + b2);
        dy = withSign(flag >> 1, (b3 << 8) + b4);
      }
      x += dx;
      y += dy;
      points.push({ x, y, on });
    }
    instructions.at += glyphs.u255();
    if (hasBox) bbox.at += 8;
    out.push({ points, ends });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tables read in the open                                             */
/* ------------------------------------------------------------------ */

export function readCmap(bytes) {
  const header = new Reader(bytes, 2);
  const count = header.u16();
  const subtables = [];
  for (let i = 0; i < count; i++) subtables.push({ platform: header.u16(), encoding: header.u16(), offset: header.u32() });
  /** The Unicode subtable that reaches the most: 4 or 12. */
  const chosen = subtables.find((table) => table.platform === 3 && table.encoding === 10) ?? subtables.find((table) => table.platform === 3 && table.encoding === 1) ?? subtables.find((table) => table.platform === 0);
  if (chosen === undefined) throw new Error('the font has no Unicode cmap');
  const sub = new Reader(bytes, chosen.offset);
  const format = sub.u16();
  return (code) => {
    const r = new Reader(bytes, chosen.offset + 2);
    if (format === 12) {
      const groups = chosen.offset + 12;
      const n = bytes.readUInt32BE(groups);
      for (let g = 0; g < n; g++) {
        const at = groups + 4 + g * 12;
        const start = bytes.readUInt32BE(at);
        const end = bytes.readUInt32BE(at + 4);
        if (code >= start && code <= end) return bytes.readUInt32BE(at + 8) + (code - start);
      }
      return 0;
    }
    if (format !== 4) throw new Error(`cmap format ${format} is not read`);
    r.u16(); // length
    r.u16(); // language
    const segCount = r.u16() / 2;
    r.at += 6;
    const endAt = r.at;
    const startAt = endAt + segCount * 2 + 2;
    const deltaAt = startAt + segCount * 2;
    const rangeAt = deltaAt + segCount * 2;
    for (let s = 0; s < segCount; s++) {
      const end = bytes.readUInt16BE(endAt + s * 2);
      if (code > end) continue;
      const start = bytes.readUInt16BE(startAt + s * 2);
      if (code < start) return 0;
      const delta = bytes.readInt16BE(deltaAt + s * 2);
      const range = bytes.readUInt16BE(rangeAt + s * 2);
      if (range === 0) return (code + delta) & 0xffff;
      const at = rangeAt + s * 2 + range + (code - start) * 2;
      const glyph = bytes.readUInt16BE(at);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

/** The weight axis, as `[min, default, max]`, and its place among the axes. */
function readAxes(fvar, tag) {
  const r = new Reader(fvar, 4);
  const axesOffset = r.u16();
  r.u16(); // reserved
  const count = r.u16();
  const size = r.u16();
  for (let i = 0; i < count; i++) {
    const at = axesOffset + i * size;
    if (fvar.toString('ascii', at, at + 4) === tag) {
      return { index: i, count, min: fvar.readInt32BE(at + 4) / 65536, def: fvar.readInt32BE(at + 8) / 65536, max: fvar.readInt32BE(at + 12) / 65536 };
    }
  }
  throw new Error(`the font has no ${tag} axis`);
}

/** The user value on the axis as `-1..1`, with `avar`'s correction. */
function normalise(axis, value, avar) {
  let v = Math.min(axis.max, Math.max(axis.min, value));
  v = v === axis.def ? 0 : v < axis.def ? (v - axis.def) / (axis.def - axis.min) : (v - axis.def) / (axis.max - axis.def);
  if (avar !== undefined) {
    const r = new Reader(avar, 6);
    for (let a = 0; a < axis.count; a++) {
      const pairs = r.u16();
      const map = [];
      for (let p = 0; p < pairs; p++) map.push([r.f2dot14(), r.f2dot14()]);
      if (a !== axis.index) continue;
      for (let p = 1; p < map.length; p++) {
        const [fromA, toA] = map[p - 1];
        const [fromB, toB] = map[p];
        if (v <= fromB) return fromB === fromA ? toB : toA + ((v - fromA) / (fromB - fromA)) * (toB - toA);
      }
    }
  }
  return v;
}

/** How much a region of the axes counts at a point: the product over the axes. */
function regionScalar(coords, region) {
  let scalar = 1;
  for (let a = 0; a < coords.length; a++) {
    const { start, peak, end } = region[a];
    // An axis a region does not constrain, or describes in a way the format ignores.
    if (peak === 0 || start > peak || peak > end || (start < 0 && end > 0)) continue;
    const c = coords[a];
    if (c < start || c > end) return 0;
    if (c === peak) continue;
    scalar *= c < peak ? (c - start) / (peak - start) : (end - c) / (end - peak);
  }
  return scalar;
}

/** An `ItemVariationStore` at `at` in `bytes`, as a function of `(outer, inner)` and the coordinates. */
function itemVariationStore(bytes, at) {
  const r = new Reader(bytes, at);
  r.u16(); // format
  const regionListOffset = r.u32();
  const dataCount = r.u16();
  const dataOffsets = Array.from({ length: dataCount }, () => r.u32());
  const list = new Reader(bytes, at + regionListOffset);
  const axisCount = list.u16();
  const regionCount = list.u16();
  const regions = [];
  for (let i = 0; i < regionCount; i++) {
    const region = [];
    for (let a = 0; a < axisCount; a++) region.push({ start: list.f2dot14(), peak: list.f2dot14(), end: list.f2dot14() });
    regions.push(region);
  }
  return (outer, inner, coords) => {
    const d = new Reader(bytes, at + dataOffsets[outer]);
    const items = d.u16();
    const wordCount = d.u16();
    const regionIndexCount = d.u16();
    const indexes = Array.from({ length: regionIndexCount }, () => d.u16());
    if (inner >= items) return 0;
    const long = (wordCount & 0x8000) !== 0;
    const words = wordCount & 0x7fff;
    const width = long ? 4 : 2;
    const narrow = long ? 2 : 1;
    d.at += inner * (words * width + (regionIndexCount - words) * narrow);
    let total = 0;
    for (let k = 0; k < regionIndexCount; k++) {
      const delta = k < words ? (long ? d.i32() : d.i16()) : long ? d.i16() : d.i8();
      total += delta * regionScalar(coords, regions[indexes[k]]);
    }
    return total;
  };
}

/** `HVAR`'s advance-width delta for a glyph. */
function advanceDelta(hvar, gid, coords) {
  const r = new Reader(hvar, 4);
  const storeOffset = r.u32();
  const mapOffset = r.u32();
  const delta = itemVariationStore(hvar, storeOffset);
  if (mapOffset === 0) return delta(0, gid, coords);
  const m = new Reader(hvar, mapOffset);
  const format = m.u8();
  const entryFormat = m.u8();
  const count = format === 0 ? m.u16() : m.u32();
  const innerBits = (entryFormat & 0x0f) + 1;
  const entrySize = ((entryFormat & 0x30) >> 4) + 1;
  const index = Math.min(gid, count - 1);
  m.at += index * entrySize;
  let entry = 0;
  for (let b = 0; b < entrySize; b++) entry = entry * 256 + m.u8();
  return delta(entry >>> innerBits, entry & ((1 << innerBits) - 1), coords);
}

/* ------------------------------------------------------------------ */
/* gvar: moving the outline to the weight                              */
/* ------------------------------------------------------------------ */

function packedPoints(r) {
  let count = r.u8();
  if (count & 0x80) count = ((count & 0x7f) << 8) | r.u8();
  if (count === 0) return null; // every point
  const points = [];
  let last = 0;
  while (points.length < count) {
    const control = r.u8();
    const run = (control & 0x7f) + 1;
    const words = (control & 0x80) !== 0;
    for (let i = 0; i < run; i++) {
      last += words ? r.u16() : r.u8();
      points.push(last);
    }
  }
  return points;
}

function packedDeltas(r, count) {
  const deltas = [];
  while (deltas.length < count) {
    const control = r.u8();
    const run = (control & 0x3f) + 1;
    for (let i = 0; i < run; i++) {
      if (control & 0x80) deltas.push(0);
      else if (control & 0x40) deltas.push(r.i16());
      else deltas.push(r.i8());
    }
  }
  return deltas;
}

/** Fill in the deltas of points a tuple left out, contour by contour: "interpolate untouched points". */
function interpolateUntouched(original, deltas, touched, ends) {
  const out = deltas.map((delta) => ({ ...delta }));
  let start = 0;
  for (const end of ends) {
    const indexes = [];
    for (let p = start; p <= end; p++) if (touched.has(p)) indexes.push(p);
    if (indexes.length === 1) {
      for (let p = start; p <= end; p++) {
        out[p].x = deltas[indexes[0]].x;
        out[p].y = deltas[indexes[0]].y;
      }
    } else if (indexes.length > 1) {
      for (let k = 0; k < indexes.length; k++) {
        const a = indexes[k];
        const b = indexes[(k + 1) % indexes.length];
        for (const axis of ['x', 'y']) {
          const [c1, c2] = [original[a][axis], original[b][axis]];
          const [d1, d2] = [deltas[a][axis], deltas[b][axis]];
          let p = a + 1 > end ? start : a + 1;
          while (p !== b) {
            const c = original[p][axis];
            let d;
            if (c1 === c2) d = d1 === d2 ? d1 : 0;
            else {
              const lo = Math.min(c1, c2);
              const hi = Math.max(c1, c2);
              const dLo = c1 <= c2 ? d1 : d2;
              const dHi = c1 <= c2 ? d2 : d1;
              d = c <= lo ? dLo : c >= hi ? dHi : dLo + ((c - lo) / (hi - lo)) * (dHi - dLo);
            }
            out[p][axis] = d;
            p = p + 1 > end ? start : p + 1;
          }
        }
      }
    }
    start = end + 1;
  }
  return out;
}

/** A glyph's points at `coords`, from `gvar`. */
function varyGlyph(gvar, gid, glyph, coords) {
  const r = new Reader(gvar, 4);
  const axisCount = r.u16();
  const sharedCount = r.u16();
  const sharedOffset = r.u32();
  const glyphCount = r.u16();
  const flags = r.u16();
  const dataOffset = r.u32();
  const long = (flags & 1) !== 0;
  const offsetAt = 20 + gid * (long ? 4 : 2);
  const [from, to] = long ? [gvar.readUInt32BE(offsetAt), gvar.readUInt32BE(offsetAt + 4)] : [gvar.readUInt16BE(offsetAt) * 2, gvar.readUInt16BE(offsetAt + 2) * 2];
  const shared = new Reader(gvar, sharedOffset);
  const sharedTuples = Array.from({ length: sharedCount }, () => Array.from({ length: axisCount }, () => shared.f2dot14()));
  const points = glyph.points.map((point) => ({ x: point.x, y: point.y }));
  const total = points.length + 4;
  const sum = Array.from({ length: total }, () => ({ x: 0, y: 0 }));
  if (to > from && gid < glyphCount) {
    const g = new Reader(gvar, dataOffset + from);
    const countField = g.u16();
    const dataStart = dataOffset + from + g.u16();
    const tupleCount = countField & 0x0fff;
    const sharedPoints = (countField & 0x8000) !== 0;
    const headers = [];
    for (let t = 0; t < tupleCount; t++) {
      const size = g.u16();
      const index = g.u16();
      const peak = index & 0x8000 ? Array.from({ length: axisCount }, () => g.f2dot14()) : sharedTuples[index & 0x0fff];
      let start;
      let end;
      if (index & 0x4000) {
        start = Array.from({ length: axisCount }, () => g.f2dot14());
        end = Array.from({ length: axisCount }, () => g.f2dot14());
      }
      headers.push({ size, privatePoints: (index & 0x2000) !== 0, peak, start, end });
    }
    const data = new Reader(gvar, dataStart);
    const common = sharedPoints ? packedPoints(data) : undefined;
    for (const header of headers) {
      const tuple = new Reader(gvar, data.at);
      const here = header.privatePoints ? packedPoints(tuple) : common;
      const touched = here === null || here === undefined ? Array.from({ length: total }, (_, i) => i) : here;
      const xs = packedDeltas(tuple, touched.length);
      const ys = packedDeltas(tuple, touched.length);
      data.at += header.size;
      let scalar = 1;
      for (let a = 0; a < axisCount; a++) {
        const peak = header.peak[a];
        if (peak === 0) continue;
        const c = coords[a];
        if (header.start !== undefined) {
          const [s, e] = [header.start[a], header.end[a]];
          if (c < s || c > e) {
            scalar = 0;
            break;
          }
          if (c !== peak) scalar *= c < peak ? (c - s) / (peak - s) : (e - c) / (e - peak);
        } else {
          if (c === 0 || c < Math.min(0, peak) || c > Math.max(0, peak)) {
            scalar = 0;
            break;
          }
          scalar *= c / peak;
        }
      }
      if (scalar === 0) continue;
      let deltas = Array.from({ length: total }, () => ({ x: 0, y: 0 }));
      touched.forEach((point, k) => {
        deltas[point] = { x: xs[k], y: ys[k] };
      });
      if (here !== null && here !== undefined) {
        const set = new Set(touched);
        deltas = [...interpolateUntouched(points, deltas.slice(0, points.length), set, glyph.ends), ...deltas.slice(points.length)];
      }
      for (let p = 0; p < total; p++) {
        sum[p].x += deltas[p].x * scalar;
        sum[p].y += deltas[p].y * scalar;
      }
    }
  }
  return points.map((point, p) => ({ x: point.x + sum[p].x, y: point.y + sum[p].y, on: glyph.points[p].on }));
}

/* ------------------------------------------------------------------ */
/* GPOS: pair kerning                                                  */
/* ------------------------------------------------------------------ */

function coverageIndex(bytes, at, gid) {
  const r = new Reader(bytes, at);
  const format = r.u16();
  const count = r.u16();
  if (format === 1) {
    for (let i = 0; i < count; i++) if (r.u16() === gid) return i;
    return -1;
  }
  for (let i = 0; i < count; i++) {
    const start = r.u16();
    const end = r.u16();
    const first = r.u16();
    if (gid >= start && gid <= end) return first + (gid - start);
  }
  return -1;
}

function classOf(bytes, at, gid) {
  const r = new Reader(bytes, at);
  const format = r.u16();
  if (format === 1) {
    const first = r.u16();
    const count = r.u16();
    return gid >= first && gid < first + count ? bytes.readUInt16BE(at + 6 + (gid - first) * 2) : 0;
  }
  const count = r.u16();
  for (let i = 0; i < count; i++) {
    const start = r.u16();
    const end = r.u16();
    const klass = r.u16();
    if (gid >= start && gid <= end) return klass;
  }
  return 0;
}

/** The advance adjustment a value record makes to its glyph, and the bytes it takes. */
function valueRecord(r, format, subtable, bytes, store, coords) {
  let xAdvance = 0;
  for (const bit of [0x1, 0x2, 0x4, 0x8, 0x10, 0x20, 0x40, 0x80]) {
    if ((format & bit) === 0) continue;
    const value = bit < 0x10 ? r.i16() : r.u16();
    if (bit === 0x4) xAdvance += value;
    if (bit === 0x40 && value !== 0) {
      const d = new Reader(bytes, subtable + value);
      const outer = d.u16();
      const inner = d.u16();
      if (d.u16() === 0x8000 && store !== undefined) xAdvance += store(outer, inner, coords);
    }
  }
  return xAdvance;
}

/** The `kern` adjustment between two glyphs, as the first lookup that has the pair gives it. */
export function makeKerning(gpos, gdef, coords) {
  const store = gdef === undefined ? undefined : (() => {
    const offset = gdef.readUInt32BE(0) >= 0x00010003 ? gdef.readUInt32BE(14) : 0;
    return offset === 0 ? undefined : itemVariationStore(gdef, offset);
  })();
  const r = new Reader(gpos, 4);
  r.u16(); // the script list: every `kern` feature is read, whichever script names it
  const featureListOffset = r.u16();
  const lookupListOffset = r.u16();
  const features = new Reader(gpos, featureListOffset);
  const featureCount = features.u16();
  const lookupIndexes = new Set();
  for (let i = 0; i < featureCount; i++) {
    const tag = gpos.toString('ascii', featureListOffset + 2 + i * 6, featureListOffset + 6 + i * 6);
    const offset = gpos.readUInt16BE(featureListOffset + 6 + i * 6);
    if (tag !== 'kern') continue;
    const feature = new Reader(gpos, featureListOffset + offset + 2);
    const n = feature.u16();
    for (let k = 0; k < n; k++) lookupIndexes.add(feature.u16());
  }
  const lookups = [...lookupIndexes].sort((a, b) => a - b);
  const subtablesOf = (lookupIndex) => {
    const list = lookupListOffset + gpos.readUInt16BE(lookupListOffset + 2 + lookupIndex * 2);
    const l = new Reader(gpos, list);
    let type = l.u16();
    l.u16(); // flag
    const n = l.u16();
    const out = [];
    for (let s = 0; s < n; s++) {
      let at = list + l.u16();
      let kind = type;
      if (type === 9) {
        const e = new Reader(gpos, at + 2);
        kind = e.u16();
        at += e.u32();
      }
      out.push({ kind, at });
    }
    return out;
  };
  return (left, right) => {
    for (const lookup of lookups) {
      for (const { kind, at } of subtablesOf(lookup)) {
        if (kind !== 2) continue;
        const s = new Reader(gpos, at);
        const format = s.u16();
        const coverage = coverageIndex(gpos, at + s.u16(), left);
        if (coverage === -1) continue;
        const format1 = s.u16();
        const format2 = s.u16();
        const size = (f) => [0x1, 0x2, 0x4, 0x8, 0x10, 0x20, 0x40, 0x80].filter((bit) => (f & bit) !== 0).length * 2;
        if (format === 1) {
          const sets = s.u16();
          if (coverage >= sets) continue;
          const pairs = new Reader(gpos, at + gpos.readUInt16BE(at + 10 + coverage * 2));
          const n = pairs.u16();
          for (let k = 0; k < n; k++) {
            const second = pairs.u16();
            const first = valueRecord(pairs, format1, at, gpos, store, coords);
            pairs.at += size(format2);
            if (second === right) return first;
          }
        } else if (format === 2) {
          const class1At = at + s.u16();
          const class2At = at + s.u16();
          const class1Count = s.u16();
          const class2Count = s.u16();
          const c1 = classOf(gpos, class1At, left);
          const c2 = classOf(gpos, class2At, right);
          if (c1 >= class1Count || c2 >= class2Count) continue;
          const record = size(format1) + size(format2);
          const cell = new Reader(gpos, s.at + (c1 * class2Count + c2) * record);
          return valueRecord(cell, format1, at, gpos, store, coords);
        }
      }
    }
    return 0;
  };
}

/* ------------------------------------------------------------------ */
/* The wordmark                                                        */
/* ------------------------------------------------------------------ */

const trim = (n) => {
  const text = n.toFixed(1);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
};

/** One contour as TrueType's quadratic curves, with the on-curve points the format leaves out put back. */
function contourPath(points, flipTo) {
  const at = (p) => `${trim(p.x)} ${trim(flipTo - p.y)}`;
  const n = points.length;
  let start = points.findIndex((p) => p.on);
  let first;
  let rest;
  if (start === -1) {
    const mid = { x: (points[0].x + points[n - 1].x) / 2, y: (points[0].y + points[n - 1].y) / 2, on: true };
    first = mid;
    rest = points;
  } else {
    first = points[start];
    rest = [...points.slice(start + 1), ...points.slice(0, start)];
  }
  let d = `M${at(first)}`;
  let control = null;
  for (const p of rest) {
    if (p.on) {
      d += control === null ? `L${at(p)}` : `Q${at(control)} ${at(p)}`;
      control = null;
    } else if (control === null) control = p;
    else {
      d += `Q${at(control)} ${at({ x: (control.x + p.x) / 2, y: (control.y + p.y) / 2 })}`;
      control = p;
    }
  }
  if (control !== null) d += `Q${at(control)} ${at(first)}`;
  return `${d}Z`;
}

/**
 * The name as one path in a box of `height` units, with the baseline `baseline`
 * units from the top, and the width of the box.
 *
 * The box is the glyphs' own extent plus no margin: the ink starts at 0 and
 * ends at `width`, so a file made from it has the margin the file chooses.
 */
export function wordmarkOutline({ text = WORDMARK_TEXT, weight = WORDMARK_WEIGHT, tracking = WORDMARK_TRACKING, file = readFileSync(fontPath()) } = {}) {
  const tables = woff2Tables(file);
  const head = tables.head;
  const unitsPerEm = head.readUInt16BE(18);
  const hhea = new Reader(tables.hhea, 4);
  const ascender = hhea.i16();
  const descender = hhea.i16();
  const metricCount = tables.hhea.readUInt16BE(34);
  const glyf = readGlyf(tables.glyf.transformed);
  const cmap = readCmap(tables.cmap);
  const axis = readAxes(tables.fvar, 'wght');
  const coords = Array.from({ length: axis.count }, (_, i) => (i === axis.index ? normalise(axis, weight, tables.avar) : 0));
  const kerning = makeKerning(tables.GPOS, tables.GDEF, coords);

  const advanceOf = (gid) => {
    const base = tables.hmtx.readUInt16BE(Math.min(gid, metricCount - 1) * 4);
    return base + (tables.HVAR === undefined ? 0 : advanceDelta(tables.HVAR, gid, coords));
  };

  const gids = [...text].map((character) => {
    const gid = cmap(character.codePointAt(0));
    if (gid === 0) throw new Error(`the font has no glyph for ${character}`);
    if (glyf[gid].composite === true) throw new Error(`the glyph for ${character} is a composite, which this reader does not draw`);
    return gid;
  });

  let pen = 0;
  const contours = [];
  let inkLeft = Number.POSITIVE_INFINITY;
  let inkRight = Number.NEGATIVE_INFINITY;
  gids.forEach((gid, index) => {
    const points = varyGlyph(tables.gvar, gid, glyf[gid], coords).map((p) => ({ ...p, x: p.x + pen }));
    let from = 0;
    for (const end of glyf[gid].ends) {
      contours.push(points.slice(from, end + 1));
      from = end + 1;
    }
    for (const p of points) {
      inkLeft = Math.min(inkLeft, p.x);
      inkRight = Math.max(inkRight, p.x);
    }
    const next = gids[index + 1];
    pen += advanceOf(gid) + (next === undefined ? 0 : kerning(gid, next)) + tracking * unitsPerEm;
  });

  const yTop = Math.max(...contours.flat().map((p) => p.y));
  const yBottom = Math.min(...contours.flat().map((p) => p.y));
  const shifted = contours.map((contour) => contour.map((p) => ({ ...p, x: p.x - inkLeft })));
  const d = shifted.map((contour) => contourPath(contour, yTop)).join('');
  return { d, width: inkRight - inkLeft, height: yTop - yBottom, unitsPerEm, ascender, descender, baseline: yTop };
}
