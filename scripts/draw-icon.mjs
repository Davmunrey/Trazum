/**
 * Writes every icon this repository ships: the extension's marketplace icon
 * and the web app's favicon, Apple touch icon and manifest icons, and the files
 * the brand page offers to download: the wordmark and the plain T, light and
 * dark, as SVG and PNG (`brand-files.mjs`), with the wordmark's outline as the
 * module the site's social images draw it from.
 *
 * Generated rather than drawn, for the reason `draw-architecture.mjs` gives
 * about the boundary picture: an asset nobody can regenerate is one nobody can
 * correct, and a binary in a repository is the least reviewable thing in it. A
 * reader who wants to know what an icon is can read `scripts/brand.mjs`
 * instead of opening an image editor, and `npm run draw:icon` reproduces every
 * file byte for byte.
 *
 * **One mark.** All of them are the T of `apps/web/app/icon.svg`, which
 * `DESIGN.md` names as the identity wherever the wordmark cannot fit. The
 * extension's icon used to be a proportion bar in the palette the product had
 * before that direction was approved, so the editor's listing and the browser
 * tab showed two different products.
 *
 * **What the web app was missing.** It shipped `icon.svg` and nothing else.
 * Measured on the deployed app on 2026-11-17: `/favicon.ico`, the Apple touch
 * icon and the manifest each answered 404. A client that asks for
 * `/favicon.ico` without reading the page got nothing, and a phone's home
 * screen got a screenshot of the page.
 *
 *   node scripts/draw-icon.mjs          writes the files
 *   node scripts/draw-icon.mjs --check  fails when a file is not what this draws
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { markIco, markPng } from './brand.mjs';
import { BRAND_FILES, SOCIAL_PREVIEW_HTML, WORDMARK_MODULE, socialPreviewHtml, wordmarkModule } from './brand-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Twice the 128 the marketplace lays the icon out at, so a dense screen has a
 * pixel for each of its own.
 */
export const EXTENSION_SIZE = 256;

/** The sizes inside `favicon.ico`: a tab, a dense tab, a Windows shortcut. */
export const FAVICON_SIZES = [16, 32, 48];

/** What iOS asks for a home screen icon. */
export const APPLE_SIZE = 180;

/**
 * Every file, with the bytes it should hold.
 *
 * The two full-bleed ones have no border on purpose. iOS rounds the corners of
 * a touch icon and an Android launcher cuts a maskable icon to its own shape,
 * and both would slice through a border drawn at the edge. The T sits well
 * inside what either keeps; `brand.test.js` measures that.
 */
export const ICONS = [
  { path: 'apps/vscode/icon.png', bytes: () => markPng(EXTENSION_SIZE) },
  { path: 'apps/web/app/favicon.ico', bytes: () => markIco(FAVICON_SIZES) },
  { path: 'apps/web/app/apple-icon.png', bytes: () => markPng(APPLE_SIZE, { bordered: false }) },
  { path: 'apps/web/public/icon-192.png', bytes: () => markPng(192) },
  { path: 'apps/web/public/icon-512.png', bytes: () => markPng(512) },
  { path: 'apps/web/public/icon-maskable-512.png', bytes: () => markPng(512, { bordered: false }) },
  ...BRAND_FILES.map(({ path, bytes }) => ({ path, bytes })),
  { path: WORDMARK_MODULE, bytes: () => Buffer.from(wordmarkModule()) },
  { path: SOCIAL_PREVIEW_HTML, bytes: () => Buffer.from(socialPreviewHtml(readFileSync(join(ROOT, SOCIAL_PREVIEW_HTML), 'utf8'))) },
];

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const icon of ICONS) {
    const bytes = icon.bytes();
    const file = join(ROOT, icon.path);
    if (check) {
      let current = null;
      try {
        current = readFileSync(file);
      } catch {
        // Missing is the same failure as different.
      }
      if (current === null || !current.equals(bytes)) stale.push(icon.path);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    console.log(`wrote ${icon.path} (${bytes.length} bytes)`);
  }
  if (stale.length > 0) {
    console.error(`Not what this script draws: ${stale.join(', ')}\n\nRun: node scripts/draw-icon.mjs`);
    process.exit(1);
  }
}
