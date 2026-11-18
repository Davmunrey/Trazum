/**
 * The files the brand page lets a person download, and the wordmark the site's
 * social images draw, all made from `brand.mjs` and the typeface.
 *
 * Two marks, each on a light ground and on a dark one, each as SVG and as PNG:
 *
 *   trazum-wordmark-{light,dark}.{svg,png}   the full name, as outlines
 *   trazum-t-{light,dark}.{svg,png}          the plain T, as the favicon draws it
 *
 * Nothing is exported by hand. `scripts/draw-icon.mjs` writes every one of
 * them, `brand.test.js` regenerates each and compares it byte for byte, and
 * the page lists what is in `BRAND_FILES` and nothing else. The colours are
 * `brand.mjs`'s; the outlines are `wordmark.mjs`'s, read from the font the web
 * app ships; the T is `brand.mjs`'s `MARK`, which `brand.test.js` holds to
 * `apps/web/app/icon.svg`.
 *
 * **Light and dark** name the ground a file is for. The wordmark is drawn in
 * the theme's text colour with no ground of its own, so it sits on whatever
 * page it is placed on: ink for a light page, the dark theme's text colour for
 * a dark one. The T keeps its acid fill and its ink T on either; only its
 * border follows the theme's ink, which is what every border in the app does.
 *
 * **The PNGs** are rasterised here, by a scanline fill of the same outlines
 * the SVG holds, with no dependency: four sub-scanlines a pixel and exact
 * coverage along each, so an edge is as soft as it should be and two runs give
 * the same bytes.
 */

import { ACID, DARK, INK, markGlyphPath, markGroundPath, MARK, markPng, rgbaPng } from './brand.mjs';
import { wordmarkOutline } from './wordmark.mjs';

/** The width of the wordmark's PNG, in pixels, and the T's side. */
export const WORDMARK_PNG_WIDTH = 1600;
export const T_PNG_SIZE = 512;

/** The ground a file is for, and the colours it is drawn in. */
export const GROUNDS = {
  light: { wordmark: INK, edge: INK },
  dark: { wordmark: DARK.text, edge: DARK.text },
};

let outline;
/** The wordmark's outline, read from the font once. */
export function wordmark() {
  outline ??= wordmarkOutline();
  return outline;
}

/** The viewBox size the wordmark's files and the page's drawing share. */
export function wordmarkBox() {
  const { width, height } = wordmark();
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

/* ------------------------------------------------------------------ */
/* The SVG files                                                       */
/* ------------------------------------------------------------------ */

export function wordmarkSvg(ground) {
  const { width, height } = wordmarkBox();
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width / 10}" height="${height / 10}" role="img" aria-label="Trazum">\n`
    + '  <title>Trazum</title>\n'
    + `  <path fill="${GROUNDS[ground].wordmark}" d="${wordmark().d}"/>\n`
    + '</svg>\n'
  );
}

export function tSvg(ground) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK.grid} ${MARK.grid}" width="${MARK.grid * 4}" height="${MARK.grid * 4}" role="img" aria-label="Trazum">\n`
    + '  <title>Trazum</title>\n'
    + `  <path fill="${ACID}" stroke="${GROUNDS[ground].edge}" stroke-width="${MARK.border}" d="${markGroundPath()}"/>\n`
    + `  <path d="${markGlyphPath()}" fill="${INK}"/>\n`
    + '</svg>\n'
  );
}

/* ------------------------------------------------------------------ */
/* The wordmark's PNG                                                  */
/* ------------------------------------------------------------------ */

/**
 * A path written with `M`, `L`, `Q` and `Z` as closed contours of line
 * segments, with each curve cut into `STEPS` straight ones. This reads what
 * `wordmark.mjs` writes and nothing else, and throws on a command it does not
 * know rather than draw part of a shape.
 */
const STEPS = 16;
export function pathContours(d) {
  const contours = [];
  let current = null;
  let at = [0, 0];
  for (const [, command, args] of d.matchAll(/([MLQZ])([^MLQZ]*)/g)) {
    const n = args.trim() === '' ? [] : args.trim().split(/[ ,]+/).map(Number);
    if (n.some((value) => !Number.isFinite(value))) throw new Error(`a number this reader cannot read in the path: ${args}`);
    if (command === 'M') {
      current = [[n[0], n[1]]];
      contours.push(current);
      at = [n[0], n[1]];
    } else if (command === 'L') {
      current.push([n[0], n[1]]);
      at = [n[0], n[1]];
    } else if (command === 'Q') {
      for (let step = 1; step <= STEPS; step++) {
        const t = step / STEPS;
        const u = 1 - t;
        current.push([u * u * at[0] + 2 * u * t * n[0] + t * t * n[2], u * u * at[1] + 2 * u * t * n[1] + t * t * n[3]]);
      }
      at = [n[2], n[3]];
    } else current = null;
  }
  return contours;
}

const SUBROWS = 4;

/**
 * The coverage of closed contours over a `width` by `height` grid of pixels,
 * as numbers from 0 to 1, under the nonzero rule, `scale` pixels to a unit.
 */
export function coverage(contours, scale, width, height) {
  const edges = [];
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i++) {
      const [x0, y0] = contour[i];
      const [x1, y1] = contour[(i + 1) % contour.length];
      if (y0 !== y1) edges.push({ x0: x0 * scale, y0: y0 * scale, x1: x1 * scale, y1: y1 * scale, up: y1 < y0 });
    }
  }
  const out = new Float64Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let sub = 0; sub < SUBROWS; sub++) {
      const y = row + (sub + 0.5) / SUBROWS;
      const crossings = [];
      for (const e of edges) {
        const [top, bottom] = e.y0 < e.y1 ? [e.y0, e.y1] : [e.y1, e.y0];
        if (y < top || y >= bottom) continue;
        crossings.push({ x: e.x0 + ((y - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), w: e.up ? 1 : -1 });
      }
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0;
      for (let k = 0; k < crossings.length - 1; k++) {
        winding += crossings[k].w;
        if (winding === 0) continue;
        const from = Math.max(0, crossings[k].x);
        const to = Math.min(width, crossings[k + 1].x);
        for (let px = Math.floor(from); px < to; px++) {
          const overlap = Math.min(px + 1, to) - Math.max(px, from);
          if (overlap > 0) out[row * width + px] += overlap / SUBROWS;
        }
      }
    }
  }
  return out;
}

const rgb = (hex) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

export function wordmarkPng(ground) {
  const { width: boxWidth, height: boxHeight } = wordmarkBox();
  const scale = WORDMARK_PNG_WIDTH / boxWidth;
  const width = WORDMARK_PNG_WIDTH;
  const height = Math.ceil(boxHeight * scale);
  const cover = coverage(pathContours(wordmark().d), scale, width, height);
  const [r, g, b] = rgb(GROUNDS[ground].wordmark);
  const stride = width * 4 + 1;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * stride + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = Math.round(Math.min(1, cover[y * width + x]) * 255);
    }
  }
  return rgbaPng(width, height, raw);
}

/* ------------------------------------------------------------------ */
/* The list                                                            */
/* ------------------------------------------------------------------ */

export const BRAND_DIR = 'apps/web/public/brand';

/**
 * Every downloadable file: where it is written, what it is, and its bytes.
 * The page's download links are made from this list, so a file is on the page
 * exactly when the script writes it.
 */
export const BRAND_FILES = ['wordmark', 't'].flatMap((mark) =>
  ['light', 'dark'].flatMap((ground) => [
    { mark, ground, format: 'svg', name: `trazum-${mark}-${ground}.svg`, path: `${BRAND_DIR}/trazum-${mark}-${ground}.svg`, bytes: () => Buffer.from(mark === 'wordmark' ? wordmarkSvg(ground) : tSvg(ground)) },
    {
      mark,
      ground,
      format: 'png',
      name: `trazum-${mark}-${ground}.png`,
      path: `${BRAND_DIR}/trazum-${mark}-${ground}.png`,
      bytes: () => (mark === 'wordmark' ? wordmarkPng(ground) : markPng(T_PNG_SIZE, { edge: GROUNDS[ground].edge })),
    },
  ]),
);

/** The pixel size of each PNG, for the page to say. */
export function pngSize(mark) {
  if (mark === 't') return { width: T_PNG_SIZE, height: T_PNG_SIZE };
  const { width: boxWidth, height: boxHeight } = wordmarkBox();
  return { width: WORDMARK_PNG_WIDTH, height: Math.ceil(boxHeight * (WORDMARK_PNG_WIDTH / boxWidth)) };
}

/* ------------------------------------------------------------------ */
/* The repository's social preview                                     */
/* ------------------------------------------------------------------ */

export const SOCIAL_PREVIEW_HTML = 'docs/assets/social-preview.html';

/**
 * `docs/assets/social-preview.html` with the lines between its two wordmark
 * markers replaced by the wordmark as an inline SVG, in the ink. The rest of
 * the file is written by hand and is not touched; the PNG beside it is a
 * screenshot of it, which a script without a browser cannot take.
 */
export function socialPreviewHtml(current) {
  const start = '<!-- wordmark:start -->';
  const end = '<!-- wordmark:end -->';
  const from = current.indexOf(start);
  const to = current.indexOf(end);
  if (from === -1 || to === -1 || to < from) throw new Error(`${SOCIAL_PREVIEW_HTML} has lost its wordmark markers`);
  const { width, height } = wordmarkBox();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trazum"><path fill="${INK}" d="${wordmark().d}"/></svg>`;
  return `${current.slice(0, from + start.length)}\n    ${svg}\n    ${current.slice(to)}`;
}

/* ------------------------------------------------------------------ */
/* The module the web app draws the wordmark from                      */
/* ------------------------------------------------------------------ */

export const WORDMARK_MODULE = 'apps/web/lib/wordmark.ts';

/**
 * The wordmark's outline as a TypeScript module, for the site's social images
 * and the brand page. The web app cannot read the font at request time and
 * must not need to: this is the same path the SVG files hold, written once.
 */
export function wordmarkModule() {
  const { width, height } = wordmarkBox();
  return [
    '// Written by scripts/draw-icon.mjs from the typeface the web app ships (scripts/wordmark.mjs).',
    '// Not edited by hand: packages/core/test/brand.test.js regenerates it and compares.',
    '',
    'export const WORDMARK = {',
    `  width: ${width},`,
    `  height: ${height},`,
    `  d: '${wordmark().d}',`,
    '} as const;',
    '',
  ].join('\n');
}
