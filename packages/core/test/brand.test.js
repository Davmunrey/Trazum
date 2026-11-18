import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import {
  ACID,
  DARK,
  INK,
  LIGHT,
  MARK,
  markGlyphPath,
  markGroundPath,
  markIco,
  markPixels,
  markPng,
  markSvg,
} from '../../../scripts/brand.mjs';
import { BRAND_FILES, GROUNDS, SOCIAL_PREVIEW_HTML, T_PNG_SIZE, WORDMARK_PNG_WIDTH, pathContours, wordmark, wordmarkBox } from '../../../scripts/brand-files.mjs';
import { APPLE_SIZE, EXTENSION_SIZE, FAVICON_SIZES, ICONS } from '../../../scripts/draw-icon.mjs';
import { makeKerning, readCmap, woff2Tables, fontPath } from '../../../scripts/wordmark.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

/**
 * One identity, held to the two files the web app reads.
 *
 * `DESIGN.md` records an approved direction and the web app follows it. For a
 * while nothing else did: the three pictures in the README and the editor
 * extension's icon each carried a palette copied from one another, all of them
 * the product's previous one, with a different accent, ground and mark on the
 * first screen of the repository. Nothing failed, because each surface agreed
 * with its own copy.
 *
 * `scripts/brand.mjs` is now the one place those values are written outside
 * the web app, and this file is what stops it becoming the next copy: its
 * colours have to be in `globals.css`, its T has to be `icon.svg`'s, every
 * picture has to be drawn in its colours and no others, and every icon file
 * has to be exactly what the generator writes.
 */
describe('the palette is the web app’s, not a copy that can drift', () => {
  const css = read('apps/web/app/globals.css').toLowerCase();
  const design = read('DESIGN.md').toLowerCase();

  /** The dark tokens: the block the explicit dark theme opens. */
  const dark = () => {
    const at = css.search(/:root\[data-theme=['"]dark['"]\]\s*\{/);
    assert.ok(at !== -1, 'globals.css no longer has an explicit dark theme');
    return css.slice(at, css.indexOf('}', at));
  };

  /**
   * By the token's own name, not by the value appearing somewhere in the
   * block: the dark theme uses its canvas colour a second time, as the text on
   * a primary button, and a search for the value alone kept passing after the
   * canvas itself had been changed.
   */
  const TOKEN = {
    canvas: '--paper',
    raised: '--paper-raised',
    sunken: '--paper-sunken',
    text: '--ink',
    secondary: '--ink-soft',
    rule: '--rule',
    wash: '--terracotta-wash',
    muted: '--ink-faint',
    strong: '--rule-strong',
    good: '--good',
    warn: '--warn',
    bad: '--destructive',
  };

  it('takes every dark value from the token of that role in the dark theme', () => {
    const block = dark();
    assert.deepEqual(Object.keys(TOKEN).sort(), Object.keys(DARK).sort(), 'a role with no token to hold it to');
    for (const [role, value] of Object.entries(DARK)) {
      const declared = block.match(new RegExp(`${TOKEN[role]}:\\s*(#[0-9a-f]{6})`));
      assert.ok(declared !== null, `the dark theme no longer declares ${TOKEN[role]}`);
      assert.equal(declared[1], value, `${role} is ${value} here and ${declared[1]} in the app's ${TOKEN[role]}`);
    }
  });

  it('takes every light value from the token of that role in the light theme', () => {
    /*
      The light theme is the `:root` block, the first one in the file; the
      explicit dark theme redeclares the same names further down, so this
      reads only up to the end of that first block.
    */
    const at = css.search(/:root\s*\{/);
    assert.ok(at !== -1, 'globals.css no longer opens with a :root block');
    const block = css.slice(at, css.indexOf('\n}', at));
    const LIGHT_TOKEN = {
      canvas: '--paper',
      raised: '--paper-raised',
      sunken: '--paper-sunken',
      text: '--ink',
      secondary: '--ink-soft',
      rule: '--rule',
    };
    assert.deepEqual(Object.keys(LIGHT_TOKEN).sort(), Object.keys(LIGHT).sort(), 'a role with no token to hold it to');
    for (const [role, value] of Object.entries(LIGHT)) {
      const declared = block.match(new RegExp(`${LIGHT_TOKEN[role]}:\\s*(#[0-9a-f]{6})`));
      assert.ok(declared !== null, `the light theme no longer declares ${LIGHT_TOKEN[role]}`);
      assert.equal(declared[1], value, `${role} is ${value} here and ${declared[1]} in the app's ${LIGHT_TOKEN[role]}`);
      assert.ok(design.includes(value), `${value} is not in DESIGN.md's token table`);
    }
  });

  it('takes the fill and the ink from the tokens the app declares', () => {
    assert.match(css, new RegExp(`--acid:\\s*${ACID}`), `the app's acid is not ${ACID}`);
    assert.match(css, new RegExp(`--ink:\\s*${INK}`), `the app's ink is not ${INK}`);
  });

  it('agrees with the table in DESIGN.md', () => {
    for (const value of [ACID, INK, DARK.canvas, DARK.raised, DARK.sunken, DARK.text, DARK.secondary, DARK.rule, DARK.wash]) {
      assert.ok(design.includes(value), `${value} is not in DESIGN.md's token table`);
    }
  });
});

describe('the mark is the T the app ships as its icon', () => {
  const icon = read('apps/web/app/icon.svg');

  it('draws the same two outlines in the same two colours', () => {
    assert.ok(icon.includes(`d="${markGroundPath()}"`), 'the square is not icon.svg’s');
    assert.ok(icon.includes(`d="${markGlyphPath()}"`), 'the T is not icon.svg’s');
    assert.ok(icon.includes(`fill="${ACID}"`) && icon.includes(`stroke="${INK}"`));
    assert.ok(icon.includes(`stroke-width="${MARK.border}"`));
    assert.ok(icon.includes(`viewBox="0 0 ${MARK.grid} ${MARK.grid}"`));
  });

  it('is symmetric on its grid, which the raster relies on to stay centred', () => {
    assert.equal(MARK.bar[0] + MARK.bar[2], MARK.grid);
    assert.equal(MARK.stem[0] + MARK.stem[2], MARK.grid);
    assert.equal(MARK.bar[3], MARK.stem[1], 'the stem does not start where the bar ends');
  });

  it('keeps the T inside what a launcher leaves of a maskable icon', () => {
    /*
      A launcher may cut a maskable icon down to a centred circle of 40% of its
      width in radius. The full-bleed icons have no border for that reason; the
      T itself has to survive the cut too.
    */
    const centre = MARK.grid / 2;
    const corners = [
      [MARK.bar[0], MARK.bar[1]],
      [MARK.bar[2], MARK.bar[1]],
      [MARK.stem[0], MARK.stem[3]],
      [MARK.stem[2], MARK.stem[3]],
    ];
    for (const [x, y] of corners) {
      const reach = Math.hypot(x - centre, y - centre) / MARK.grid;
      assert.ok(reach < 0.4, `a corner of the T is ${(reach * 100).toFixed(1)}% out, past the 40% a mask keeps`);
    }
  });
});

/** Width, height and decoded RGBA rows of a PNG this repository wrote. */
function decode(png) {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'not a PNG');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idatLength = png.readUInt32BE(33);
  assert.equal(png.toString('ascii', 37, 41), 'IDAT');
  const raw = inflateSync(png.subarray(41, 41 + idatLength));
  assert.equal(raw.length, height * (width * 4 + 1), 'the image data is not one RGBA row per line');
  const pixel = (x, y) => [...raw.subarray(y * (width * 4 + 1) + 1 + x * 4, y * (width * 4 + 1) + 5 + x * 4)];
  return { width, height, pixel };
}

const rgba = (hex) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).concat(0xff);

describe('every icon file is what the generator writes', () => {
  it('byte for byte, so each was generated and none was edited', () => {
    for (const icon of ICONS) {
      assert.ok(
        readFileSync(join(ROOT, icon.path)).equals(icon.bytes()),
        `${icon.path} is not what scripts/draw-icon.mjs draws. Run: npm run draw:icon`,
      );
    }
  });

  it('and the generator is reachable from a script somebody can run', () => {
    const scripts = JSON.parse(read('package.json')).scripts;
    for (const name of ['draw:icon', 'draw:bill', 'draw:demo', 'draw:architecture']) {
      assert.ok(scripts[name], `no npm script named ${name}`);
    }
  });

  it('covers what a browser, a phone and the editor each ask for', () => {
    const paths = ICONS.map((icon) => icon.path);
    for (const wanted of [
      'apps/web/app/favicon.ico',
      'apps/web/app/apple-icon.png',
      'apps/web/public/icon-192.png',
      'apps/web/public/icon-512.png',
      'apps/web/public/icon-maskable-512.png',
      'apps/vscode/icon.png',
    ]) {
      assert.ok(paths.includes(wanted), `nothing generates ${wanted}`);
    }
  });

  it('draws a T: ink at the middle of the bar and the stem, acid beside the stem', () => {
    for (const size of [16, 32, 48, APPLE_SIZE, EXTENSION_SIZE, 512]) {
      const { width, height, pixel } = decode(markPng(size));
      assert.equal(width, size);
      assert.equal(height, size);
      const at = (ux, uy) => pixel(Math.floor((ux / MARK.grid) * size), Math.floor((uy / MARK.grid) * size));
      assert.deepEqual(at(20, 13), rgba(INK), `${size}px: the bar is not ink`);
      assert.deepEqual(at(20, 25), rgba(INK), `${size}px: the stem is not ink`);
      assert.deepEqual(at(11, 25), rgba(ACID), `${size}px: the ground beside the stem is not acid`);
      assert.deepEqual(at(20, 35), rgba(ACID), `${size}px: the ground under the stem is not acid`);
      assert.deepEqual(pixel(0, 0), rgba(INK), `${size}px: the border is missing`);
    }
  });

  it('mirrors left to right at every size, to the pixel', () => {
    for (const size of [16, 32, 48, APPLE_SIZE, 192, EXTENSION_SIZE, 512]) {
      const { pixel } = decode(markPng(size));
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size / 2; x++) {
          assert.deepEqual(pixel(x, y), pixel(size - 1 - x, y), `${size}px is lopsided at ${x},${y}`);
        }
      }
    }
  });

  it('leaves the border off the two a device cuts to its own shape', () => {
    const { pixel } = decode(markPng(APPLE_SIZE, { bordered: false }));
    assert.deepEqual(pixel(0, 0), rgba(ACID), 'the full-bleed icon still has a border to slice through');
    assert.equal(markPixels(64, { bordered: false }).length, markPixels(64).length);
  });

  it('writes a favicon.ico whose directory matches the images inside it', () => {
    const ico = markIco(FAVICON_SIZES);
    assert.equal(ico.readUInt16LE(0), 0);
    assert.equal(ico.readUInt16LE(2), 1, 'not an icon file');
    assert.equal(ico.readUInt16LE(4), FAVICON_SIZES.length);
    FAVICON_SIZES.forEach((size, index) => {
      const entry = 6 + index * 16;
      assert.equal(ico[entry], size);
      assert.equal(ico[entry + 1], size);
      assert.equal(ico.readUInt16LE(entry + 6), 32, 'the directory does not say 32 bits a pixel');
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      const image = ico.subarray(offset, offset + length);
      assert.ok(image.equals(markPng(size)), `the ${size}px entry does not point at the ${size}px image`);
    });
    assert.ok(FAVICON_SIZES.includes(16) && FAVICON_SIZES.includes(32), 'a tab asks for 16 and 32');
  });
});

/**
 * The three pictures in the README.
 *
 * Each is drawn by a script, and the scripts take their colours from
 * `brand.mjs`. This reads the files instead of trusting that: a colour typed
 * into a drawing script, or a picture edited by hand, puts a value on the
 * front page that is in no token table, which is how the last palette
 * outlived the decision that replaced it.
 */
describe('the README’s pictures are drawn in this palette and no other', () => {
  const pictures = ['docs/assets/bill.svg', 'docs/assets/demo.svg', 'docs/assets/boundary.svg'];
  const allowed = new Set([ACID, INK, ...Object.values(DARK)]);

  for (const path of pictures) {
    it(`${path} uses only colours the product names`, () => {
      // The whole file, comment included: a colour written in a comment is
      // still a colour on the front page's source, and has to be one of these.
      const svg = read(path);
      const used = new Set([...svg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(([hex]) => hex.toLowerCase()));
      assert.ok(used.size > 0, 'no colour found: has the picture been emptied?');
      const strangers = [...used].filter((hex) => !allowed.has(hex));
      assert.deepEqual(strangers, [], `${path} carries ${strangers.join(', ')}, which brand.mjs does not name`);
      assert.ok(used.has(ACID), `${path} does not use the product's one accent`);
    });

    it(`${path} is XML a browser will draw through <img>`, () => {
      /*
        Two hyphens in a row are not allowed inside an XML comment. A browser
        then rejects the whole document and shows a broken image; nothing in a
        build notices. A command line in a comment is the natural way to do it.
      */
      for (const [, body] of read(path).matchAll(/<!--([\s\S]*?)-->/g)) {
        assert.ok(!body.includes('--'), `${path} has two hyphens in a row inside a comment`);
      }
    });
  }

  it('the two transcripts carry the mark, and keep their columns', () => {
    for (const path of ['docs/assets/bill.svg', 'docs/assets/demo.svg']) {
      const svg = read(path);
      assert.ok(svg.includes(markSvg(14, 11, 22)), `${path} does not carry the T in its window bar`);
      /*
        An SVG shown through <img> collapses runs of spaces, and a terminal's
        columns are runs of spaces. They are written as no-break spaces, so no
        text run in a transcript may contain an ordinary one at all.
      */
      const runs = [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(([, text]) => text);
      assert.ok(runs.length > 10, `${path} has no transcript in it`);
      const spaced = runs.filter((text) => text.includes(' '));
      assert.deepEqual(spaced, [], `${path} writes ordinary spaces, which <img> collapses`);
    }
  });
});

/**
 * The card a link preview shows for each public page of the web app.
 *
 * Drawn by `apps/web/lib/social-card.tsx` and served by each page's
 * `opengraph-image.tsx`. It is a picture like the three above, so the same
 * rule holds: every colour in it is one `brand.mjs` names, and it takes them
 * from there rather than typing them. A hex literal in the source is a colour
 * that would outlive the next change to the palette.
 */
describe('the web app’s social card is drawn in this palette and no other', () => {
  const card = read('apps/web/lib/social-card.tsx');

  it('imports its colours from brand.mjs', () => {
    assert.match(card, /import \{[^}]*\bACID\b[^}]*\} from '\.\.\/\.\.\/\.\.\/scripts\/brand\.mjs'/);
    for (const name of ['ACID', 'INK', 'LIGHT', 'DARK']) {
      assert.ok(new RegExp(`\\b${name}\\b[.,}]`).test(card.slice(card.indexOf('export function'))), `the card does not use ${name}`);
    }
  });

  it('types no colour of its own', () => {
    const typed = [...card.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)].map(([hit]) => hit);
    assert.deepEqual(typed, [], `the card types colours brand.mjs does not name: ${typed.join(', ')}`);
  });

  it('is the card both public pages draw', () => {
    for (const page of ['apps/web/app/opengraph-image.tsx', 'apps/web/app/app/opengraph-image.tsx']) {
      assert.match(read(page), /return socialCard\(/, `${page} draws something else`);
    }
  });
});


/**
 * The files the brand page lets a person download, and the wordmark the social
 * images draw.
 *
 * `draw-icon.mjs` writes them, so the byte-for-byte test above already
 * regenerates and compares each (they are in `ICONS`). This holds what that
 * cannot: that they are the right files, in the palette, with no mark the
 * design document does not allow, and that the outlines are the typeface's.
 */
describe('the brand files are the wordmark and the T, light and dark, in this palette', () => {
  const allowed = new Set([ACID, INK, ...Object.values(LIGHT), ...Object.values(DARK)]);

  it('are eight: the wordmark and the T, light and dark, as SVG and as PNG', () => {
    const names = BRAND_FILES.map((file) => file.name).sort();
    assert.deepEqual(names, [
      'trazum-t-dark.png', 'trazum-t-dark.svg', 'trazum-t-light.png', 'trazum-t-light.svg',
      'trazum-wordmark-dark.png', 'trazum-wordmark-dark.svg', 'trazum-wordmark-light.png', 'trazum-wordmark-light.svg',
    ]);
    const written = new Set(ICONS.map((icon) => icon.path));
    for (const file of BRAND_FILES) assert.ok(written.has(file.path), `${file.path} is not written by draw-icon.mjs`);
  });

  it('are drawn in colours brand.mjs names and no others', () => {
    for (const file of BRAND_FILES.filter((entry) => entry.format === 'svg')) {
      const svg = file.bytes().toString('utf8');
      const used = [...svg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(([hex]) => hex.toLowerCase());
      assert.ok(used.length > 0, `${file.name} has no colour`);
      assert.deepEqual(used.filter((hex) => !allowed.has(hex)), [], `${file.name} carries a colour brand.mjs does not name`);
      assert.ok(!/gradient|filter|<image|<text|font-family/i.test(svg), `${file.name} is not plain outlines`);
      assert.ok(!svg.includes('--'), `${file.name} has two hyphens in a row, which an XML comment may not`);
    }
  });

  it('draw the wordmark in the theme’s text colour and the T with its border in the theme’s ink', () => {
    for (const ground of ['light', 'dark']) {
      const word = BRAND_FILES.find((file) => file.name === `trazum-wordmark-${ground}.svg`).bytes().toString('utf8');
      assert.ok(word.includes(`fill="${GROUNDS[ground].wordmark}"`));
      const t = BRAND_FILES.find((file) => file.name === `trazum-t-${ground}.svg`).bytes().toString('utf8');
      assert.ok(t.includes(`stroke="${GROUNDS[ground].edge}"`) && t.includes(`fill="${ACID}"`) && t.includes(`fill="${INK}"`));
    }
    assert.equal(GROUNDS.light.wordmark, INK);
    assert.equal(GROUNDS.dark.wordmark, DARK.text);
  });

  it('keep the T the app’s T: the same two outlines as icon.svg, and no second mark', () => {
    const icon = read('apps/web/app/icon.svg');
    for (const ground of ['light', 'dark']) {
      const t = BRAND_FILES.find((file) => file.name === `trazum-t-${ground}.svg`).bytes().toString('utf8');
      assert.ok(t.includes(`d="${markGroundPath()}"`) && icon.includes(`d="${markGroundPath()}"`));
      assert.ok(t.includes(`d="${markGlyphPath()}"`) && icon.includes(`d="${markGlyphPath()}"`));
      assert.equal((t.match(/<path /g) ?? []).length, 2, 'the T file draws more than the square and the T');
    }
    const word = BRAND_FILES.find((file) => file.name === 'trazum-wordmark-light.svg').bytes().toString('utf8');
    assert.equal((word.match(/<path /g) ?? []).length, 1, 'the wordmark file draws more than the name');
  });

  it('PNGs are the same pictures as their SVGs, with the wordmark on no ground', () => {
    const word = decode(BRAND_FILES.find((file) => file.name === 'trazum-wordmark-dark.png').bytes());
    assert.equal(word.width, WORDMARK_PNG_WIDTH);
    assert.equal(word.height, Math.ceil(wordmarkBox().height * (WORDMARK_PNG_WIDTH / wordmarkBox().width)));
    assert.equal(word.pixel(0, word.height - 1)[3], 0, 'the corner is not transparent');
    // The top bar of the T is solid at its middle, in the dark theme's text colour, and the same shape is in the SVG's path.
    assert.deepEqual(word.pixel(Math.floor(word.width * 0.04), 10), [...[1, 3, 5].map((at) => Number.parseInt(DARK.text.slice(at, at + 2), 16)), 255]);
    const contours = pathContours(wordmark().d);
    assert.equal(contours.length, 7, 'the six letters have seven closed outlines between them (the a has a counter)');
    const t = decode(BRAND_FILES.find((file) => file.name === 'trazum-t-dark.png').bytes());
    assert.equal(t.width, T_PNG_SIZE);
    assert.deepEqual(t.pixel(0, 0), rgba(DARK.text), 'the dark T’s border is not the dark theme’s text colour');
    assert.deepEqual(t.pixel(Math.floor(T_PNG_SIZE / 2), Math.floor(T_PNG_SIZE * 0.4)), rgba(INK));
  });
});

describe('the wordmark is the typeface’s own outlines', () => {
  it('spans the cap height of the face and kerns the pairs the font kerns', () => {
    const tables = woff2Tables(readFileSync(fontPath()));
    const cmap = readCmap(tables.cmap);
    const kern = makeKerning(tables.GPOS, tables.GDEF, [1]);
    const gid = (letter) => cmap(letter.codePointAt(0));
    assert.ok(kern(gid('T'), gid('r')) < 0, 'the font pairs T with r closer, and the wordmark did not read it');
    const { width, height } = wordmark();
    assert.ok(width > 3000 && width < 3400, `the name is ${width} units wide at weight 700`);
    assert.ok(height > 700 && height < 740, `the name is ${height} units tall`);
  });

  it('is what a browser draws for the same text, to a few thousandths of its ink', () => {
    /*
      Measured once against Chromium's canvas rendering of "Trazum" at weight 700
      with -0.04em tracking: the two have the same bounding box, and 314 of
      878,005 inked pixels differ, the soft edges. A browser is not available to
      this suite, so what is held is the box and the advance the measurement
      agreed on.
    */
    const { width, height } = wordmark();
    assert.ok(Math.abs(width - 3180) < 1 && Math.abs(height - 714) < 1, `the wordmark is ${width} by ${height}, the browser's box was 3180 by 714`);
  });

  it('is the one module the social card draws, and the card types no outline of its own', () => {
    const module = read('apps/web/lib/wordmark.ts');
    assert.ok(module.includes(`d: '${wordmark().d}'`));
    const card = read('apps/web/lib/social-card.tsx');
    assert.match(card, /from '\.\/wordmark'/);
    assert.match(card, /<path d=\{WORDMARK\.d\} fill=\{INK\} \/>/);
    assert.ok(!/>Trazum</.test(card), 'the card sets the name as text in another face');
  });
});

describe('the repository’s social preview draws the same wordmark in the same palette', () => {
  const html = read(SOCIAL_PREVIEW_HTML);
  const allowed = new Set([ACID, INK, ...Object.values(LIGHT), ...Object.values(DARK)]);

  it('carries the wordmark’s outline and no colour brand.mjs does not name', () => {
    assert.ok(html.includes(`d="${wordmark().d}"`), 'the preview’s wordmark is not the brand page’s');
    const strangers = [...html.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(([hex]) => hex.toLowerCase()).filter((hex) => !allowed.has(hex));
    assert.deepEqual(strangers, []);
    assert.ok(!html.includes('M9 10h22v6'), 'the preview still draws the T tile beside the name');
  });
});
