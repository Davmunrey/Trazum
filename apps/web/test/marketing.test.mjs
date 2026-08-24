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

  it('carries its own locale key, so an unreviewed language stays on the landing', () => {
    // The marketing surface reaches five languages; the tool speaks two. They
    // must not share storage, or a French landing would push 'fr' into a tool
    // that has no reviewed French — the "never push an unreviewed language
    // into the tool" invariant, pinned at its root.
    assert.match(marketing, /MARKETING_LOCALE_KEY = 'trazum:marketing-locale'/);
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

  it('speaks five languages, and every one is complete', () => {
    // The type system already forbids a partial COPY record — a missing key
    // is a build error — so this pins the intent: five locales named, and the
    // switcher renders all five. Adding German or Portuguese later is a
    // fill-in-the-blanks that the compiler completes.
    for (const code of ['en', 'es', 'fr', 'de', 'pt']) {
      assert.ok(
        new RegExp(`\\n  ${code}: \\{`).test(landing),
        `the landing is missing a ${code} copy block`,
      );
    }
    assert.match(marketing, /MARKETING_LOCALES = \['en', 'es', 'fr', 'de', 'pt'\]/);
  });

  it('says out loud which languages are machine-drafted, unreviewed', () => {
    // The maintainers-doctrine pattern applied to selling copy: fr/de/pt are
    // marked unreviewed and carry a visible note; en/es are reviewed and
    // carry none. A translation shipped as authoritative without review would
    // be the same lie the trimming dictionaries refuse.
    assert.match(marketing, /fr: \{ name: 'Français', reviewed: false \}/);
    assert.match(marketing, /en: \{ name: 'English', reviewed: true \}/);
    assert.match(landing, /UNREVIEWED_NOTE/);
    // The note is non-empty for every unreviewed language and empty for the
    // reviewed ones — no note shown where a human vouched for the words.
    for (const code of ['fr', 'de', 'pt']) {
      assert.ok(
        new RegExp(`${code}: '[^']+GitHub`).test(landing),
        `the ${code} unreviewed note is missing or does not point at GitHub`,
      );
    }
    assert.match(landing, /en: '',\n  es: '',/);
  });

  it('never pushes an unreviewed language into the tool', () => {
    // The marketing locale has its own storage key: a French visitor reads a
    // French landing and lands in the en/es tool, never a half-reviewed tool.
    assert.match(marketing, /trazum:marketing-locale/);
    assert.equal(/LOCALE_STORAGE_KEY/.test(marketing), false, 'the marketing locale reuses the tool key');
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
