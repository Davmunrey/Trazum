import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The icons a browser and a phone ask this app for.
 *
 * Measured on the deployed app on 2026-11-17, before any of this existed:
 * `/icon.svg` answered 200 and `/favicon.ico`, `/apple-icon.png` and
 * `/manifest.webmanifest` each answered 404. The page carried one icon tag, to
 * the SVG. A client that asks for `/favicon.ico` without reading the page got
 * nothing, and a home screen got a screenshot.
 *
 * Next serves three of these by where the file is, so a file moved or renamed
 * stops being served without a build error. That is what this holds: the files
 * are where the framework looks, and the manifest names files that exist at
 * the sizes it claims. The bytes themselves are held by `brand.test.js`.
 */
const at = (path) => new URL(`../${path}`, import.meta.url);
const read = (path) => readFileSync(at(path));
/**
 * The manifest's code without its block comment, which discusses the very
 * values it explains: a test that read the whole file found `display:
 * 'browser'` in the prose after the code had been changed to something else.
 */
const manifestSource = () => {
  const whole = readFileSync(at('app/manifest.ts'), 'utf8');
  const code = whole.indexOf('export default function manifest');
  assert.ok(code !== -1, 'manifest.ts no longer exports a manifest function');
  return whole.slice(code);
};

/** The declared size of a PNG: two 32-bit numbers in its first chunk. */
const pngSize = (bytes) => {
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'not a PNG');
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
};

describe('the app serves the icons a client asks for', () => {
  it('has each file where Next looks for it', () => {
    for (const path of ['app/favicon.ico', 'app/icon.svg', 'app/apple-icon.png', 'app/manifest.ts']) {
      assert.ok(existsSync(at(path)), `${path} is gone, and nothing else serves that address`);
    }
  });

  it('ships a favicon.ico that is an icon file with a 16 and a 32 in it', () => {
    const ico = read('app/favicon.ico');
    assert.equal(ico.readUInt16LE(2), 1, 'not an icon file');
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico[6 + index * 16]);
    assert.ok(sizes.includes(16) && sizes.includes(32), `favicon.ico holds ${sizes.join(', ')}`);
  });

  it('ships an Apple touch icon at the size iOS asks for', () => {
    assert.equal(pngSize(read('app/apple-icon.png')), '180x180');
  });

  it('names in its manifest only files that exist, at the size each claims', () => {
    const source = manifestSource();
    const entries = [...source.matchAll(/\{ src: '\/([^']+)', sizes: '(\d+x\d+)', type: 'image\/png'/g)];
    assert.ok(entries.length >= 2, `the manifest lists ${entries.length} icon(s); a launcher wants 192 and 512`);
    for (const [, file, sizes] of entries) {
      assert.ok(existsSync(at(`public/${file}`)), `the manifest names /${file}, which public/ does not hold`);
      assert.equal(pngSize(read(`public/${file}`)), sizes, `/${file} is not the ${sizes} the manifest says`);
    }
    const listed = entries.map(([, , sizes]) => sizes);
    assert.ok(listed.includes('192x192') && listed.includes('512x512'));
    assert.match(source, /purpose: 'maskable'/, 'no maskable icon: a launcher crops the bordered one');
  });

  it('promises a shortcut, not an installed app', () => {
    /*
      `standalone` removes the address bar and implies something that works
      offline. This is a page that needs its server; the manifest says so.
    */
    const source = manifestSource();
    assert.match(source, /display: 'browser'/);
  });

  it('paints the manifest in the paper the light theme declares', () => {
    const source = manifestSource();
    const css = readFileSync(at('app/globals.css'), 'utf8');
    const paper = css.match(/--paper:\s*(#[0-9a-f]{6})/)?.[1];
    assert.ok(paper, 'globals.css no longer declares --paper');
    assert.ok(source.includes(`background_color: '${paper}'`), `the manifest's background is not ${paper}`);
    assert.ok(source.includes(`theme_color: '${paper}'`), `the manifest's theme colour is not ${paper}`);
  });
});
