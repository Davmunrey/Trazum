import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const read = (relative) => readFileSync(join(web, relative), 'utf8');
const codeOf = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * The marketing pages sell the product; these guards keep them from selling
 * anything the product is not. A Persuade surface in this repository plays
 * by the same rules as the app: no network, honest numbers, both locales,
 * and motion that respects the reader who asked for less of it.
 */
describe('the marketing pages play by the app’s rules', () => {
  const marketing = codeOf('components/marketing.tsx');
  const landing = codeOf('app/landing/page.tsx');

  it('never fetch — a static page has no business calling anywhere', () => {
    for (const [name, code] of [
      ['marketing.tsx', marketing],
      ['landing', landing],
    ]) {
      assert.equal(/\bfetch\s*\(/.test(code), false, `${name} contains a fetch call`);
      assert.equal(/XMLHttpRequest|sendBeacon|WebSocket/.test(code), false, `${name} opens a channel`);
    }
  });

  it('respects prefers-reduced-motion by not observing at all', () => {
    // The observer is never attached under reduced motion — everything
    // renders visible — rather than attached and softened.
    assert.match(marketing, /prefers-reduced-motion/);
    assert.match(marketing, /setShown\(true\);\s*return;/);
  });

  it('shares the app’s locale key, because it is one product', () => {
    assert.match(marketing, /LOCALE_STORAGE_KEY/);
    assert.equal(/['"]trazum:locale['"]/.test(marketing), false, 'the key is duplicated as a literal');
  });

  it('carries no price — the owner decided to stay open source, priceless', () => {
    // "Deja la landing sin precios por ahora": no euro figure, no tier name,
    // no pricing route. The open-source section may say hosted things will
    // cost money one day; it may not say how much.
    assert.equal(/€\s?\d|\/pricing/.test(landing), false, 'a price or pricing link crept back onto the landing');
  });

  it('no private mailbox leaks into a public page', () => {
    assert.equal(/gmail/.test(landing + marketing), false, 'a private mailbox leaked into a public page');
  });

  it('external links carry rel="noreferrer noopener"', () => {
    for (const code of [landing]) {
      const targets = code.match(/target="_blank"|target: '_blank'/g) ?? [];
      const rels = code.match(/rel="noreferrer noopener"|rel: 'noreferrer noopener'/g) ?? [];
      assert.ok(targets.length > 0, 'no external links found at all — the pattern moved');
      assert.equal(targets.length, rels.length, 'an external link without rel protection');
    }
  });

  it('the landing’s figures are the product’s own, with their sources named', () => {
    // −37.4% is optimize --level aggressive over the demo prompt at 1M
    // calls; 40–80% and 50% are the spans the profile report itself states.
    // A figure added here without a measurement behind it should fail loudly
    // in review — this pins the ones that exist today.
    for (const figure of ['−37.4%', '40–80%', '−50%']) {
      assert.ok(landing.includes(figure), `the measured figure ${figure} left the landing`);
    }
    assert.equal(/testimonial|logo/i.test(landing), false, 'invented social proof on the landing');
  });
});
