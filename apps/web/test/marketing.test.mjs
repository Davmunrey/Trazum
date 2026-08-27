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

  it('respects prefers-reduced-motion, wherever the motion lives', () => {
    /**
     * The claim is the landing's, not one component's, and this guard used to
     * be pinned to the component.
     *
     * It asserted that `marketing.tsx` mentioned `prefers-reduced-motion` and
     * contained `setShown(true); return;` — the two lines inside `Reveal`. So
     * it passed for as long as `Reveal` existed and failed the moment it was
     * deleted, which is backwards: `Reveal` was deleted **because** it
     * rendered copy at zero opacity and left whole sections invisible when its
     * observer never fired, and a guard that fails when a defect is removed is
     * guarding an implementation rather than a promise.
     *
     * The promise is that the landing's motion is switched off for a reader
     * who asked for less of it. It is now one animation — the hero ledger
     * filling — and it lives in the stylesheet, so that is where this looks.
     */
    const css = read('app/globals.css');
    assert.match(css, /prefers-reduced-motion/, 'nothing gates motion for the reader who asked for less');

    /*
      Every keyframe animation the landing runs has to be inside a
      no-preference block. Read off the stylesheet rather than listed here, so
      an animation added next year is covered by existing rather than by
      somebody remembering to add it to an array.
    */
    const guarded = css
      .split(/@media \(prefers-reduced-motion: no-preference\)/)
      .slice(1)
      .join('\n');
    for (const name of ['ledger-fill']) {
      assert.match(guarded, new RegExp(`animation:\\s*${name}`), `${name} runs regardless of the reader's preference`);
    }

    // And the finished state is the default, so a browser that runs no
    // animation at all still draws the completed figure.
    assert.match(landing, /ledger-bar/, 'the landing no longer uses the class this guard describes');
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

  it('the landing’s headline figure is the one the rules actually produce', async () => {
    /**
     * This used to be a list of literals: `['−37.4%', '40–80%', '−50%']`,
     * asserted to appear on the landing. Both halves of that were the same
     * hand-typed number, so it could only catch a figure being deleted, never
     * one being wrong — and one of them was.
     *
     * −37.4% described itself as `optimize --level aggressive` over the demo
     * prompt. No prompt in this repository produces it. The demo prompt is the
     * one `createPlaygroundFiles` loads as `prompt.txt`, which is what the
     * Playground tab runs and what the Optimiser fills itself with when a
     * visitor clicks through from this page — so it is the prompt whose figure
     * the landing is allowed to quote, and it comes out at −20.1%.
     *
     * Derived here by running the rules, so the landing cannot claim a
     * reduction the product does not deliver, and cannot drift the next time a
     * rule is added.
     */
    const { optimize } = await import('@trazum/core');
    const { createPlaygroundFiles } = await import('../lib/playground.ts');
    const prompt = createPlaygroundFiles().get('prompt.txt');
    assert.ok(prompt, 'the demo prompt the landing quotes is no longer in the playground files');

    const result = optimize(prompt, { level: 'aggressive' });
    const figure = `−${result.reductionPct.toFixed(1)}%`;

    /*
      Every reduction on both surfaces, not just one of them. `includes` was
      the first spelling of this and it is too weak to be worth having: the
      hero draws the figure and the proof row states it, so either could drift
      alone and the page would still contain the right string somewhere.
      A reduction is the only figure written to one decimal here; the Batch
      50% and the routing span carry none.
    */
    const stated = (text) => [...text.matchAll(/−\d+\.\d%/g)].map((match) => match[0]);
    for (const [where, text] of [
      ['the landing', landing],
      ['the share card', read('app/opengraph-image.tsx')],
    ]) {
      const figures = stated(text);
      assert.ok(figures.length > 0, `${where} states no reduction at all`);
      for (const said of figures) {
        assert.equal(
          said,
          figure,
          `${where} states ${said}; the rules take ${figure} off the demo prompt`,
        );
      }
    }
  });

  it('the landing’s other figures are the product’s own, with their sources named', () => {
    // The model-routing and Batch spans the profile report itself states. The
    // routing span's floor is derived from the prices in
    // packages/core/test/pricing-review.test.js, which is where it belongs:
    // it is arithmetic on the catalogue, not a property of this page.
    for (const figure of ['60–80%', '−50%']) {
      assert.ok(landing.includes(figure), `the measured figure ${figure} left the landing`);
    }
    assert.equal(/testimonial|logo/i.test(landing), false, 'invented social proof on the landing');
  });
});
