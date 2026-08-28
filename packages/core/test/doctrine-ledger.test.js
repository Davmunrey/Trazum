import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Which test holds which rule, checked in both directions.
 *
 * `doctrine.test.js` holds the page — that its preface still names rules that
 * exist, that no rule is written twice. It does not hold the page's largest
 * claim, which is the sentence *the rules above are enforced by tests because a
 * rule with nothing checking it drifts exactly as fast as a number with nothing
 * checking it*. That was measured before this file was written: **11 of the 24
 * rules were quoted by name anywhere in the suite**, and no document
 * said which test held which rule — so a rule quoted in one file could be
 * enforced in another, or in none. A page arguing that unchecked claims drift
 * was making one.
 *
 * The ledger is two halves that have to agree. Every rule ends with a `Held by`
 * line naming the file that fails when the product stops doing what the rule
 * says, or naming nothing and giving the reason. Every named file carries a
 * `Doctrine:` line pointing back. This checks that the two sides match, in both
 * directions, so that neither a renamed rule nor a deleted citation can leave
 * the page describing coverage it does not have.
 *
 * ## What it deliberately does not claim
 *
 * That the named test *enforces* the rule. Nothing mechanical can read that,
 * and pretending otherwise would be the proxy the doctrine warns about two
 * rules from here. What it holds is narrower and still worth having: the rule
 * and the file each say they are about the other, so the link is a claim two
 * people wrote down rather than one somebody remembers.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const DOCTRINE = join(ROOT, 'docs/doctrine.md');

/** GitHub's anchor for a heading: lowercased, punctuation dropped, spaces hyphenated. */
const slugOf = (heading) =>
  heading.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-');

/**
 * Every rule and the `Held by` paragraph under it.
 *
 * Bounded by the subject: a rule runs to the next `## `, whatever it is called.
 * The paragraph is found by its own opening rather than by its position, so a
 * rule that gains a closing note keeps working.
 */
const ledger = (page) => {
  const parts = page.split(/^## /m).slice(1);
  return parts.map((part) => {
    const heading = part.slice(0, part.indexOf('\n'));
    const held = part
      .split('\n\n')
      .map((block) => block.trim())
      .find((block) => block.startsWith('**Held by**'));
    return { heading, held: held ?? null, body: part };
  });
};

/**
 * The files a `Held by` paragraph names, as repository-relative paths.
 *
 * A rule with no paragraph at all yields none rather than throwing: the missing
 * line is one failure, owned by one check above, and a guard that also crashes
 * five others reports the same defect five times and buries the one that names
 * it. Planted, both ways.
 */
const citedFiles = (held) =>
  held === null
    ? []
    : [...held.matchAll(/\[`([^`]+)`\]\(\.\.\/([^)]+)\)/g)].map(([, label, href]) => ({ label, href }));

/** Every `Doctrine:` citation in the repository, as {file, heading, href}. */
const citations = () => {
  const found = [];
  const skip = new Set(['node_modules', 'dist', '.git', '.next', 'coverage']);
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(js|mjs|ts|tsx)$/.test(entry.name)) continue;
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(/Doctrine: \[([^\]]+)\]\(([^)]+)\)/g)) {
        found.push({ file: relative(ROOT, path), heading: match[1], href: match[2], dir });
      }
    }
  };
  walk(join(ROOT, 'packages'));
  walk(join(ROOT, 'apps'));
  walk(join(ROOT, 'action'));
  walk(join(ROOT, 'test-utils'));
  return found;
};

/** Number words the preface uses for its two counts. */
const page = () => readFileSync(DOCTRINE, 'utf8');

describe('every rule names what holds it', () => {
  it('gives every rule exactly one Held by line', () => {
    const rules = ledger(page());
    assert.ok(rules.length >= 20, `only ${rules.length} rules found — has the page moved?`);
    const bare = rules.filter((rule) => rule.held === null).map((rule) => rule.heading);
    assert.deepEqual(bare, [], 'a rule states no test and declares no gap');
    const twice = rules.filter(
      (rule) => (rule.body.match(/^\*\*Held by\*\*/gm) ?? []).length !== 1,
    );
    assert.deepEqual(twice.map((rule) => rule.heading), [], 'a rule carries more than one Held by line');
  });

  it('names only files that exist, and never a directory', () => {
    for (const rule of ledger(page())) {
      for (const { href } of citedFiles(rule.held)) {
        const path = resolve(dirname(DOCTRINE), '..', href);
        assert.ok(existsSync(path), `${rule.heading} names ${href}, which is not in the repository`);
        assert.ok(statSync(path).isFile(), `${rule.heading} names ${href}, which is not a file`);
      }
    }
  });

  it('writes the label and the link to the same file', () => {
    // A path that reads correctly and links elsewhere is the failure a reader
    // cannot see: the eye checks the label, the click follows the href.
    for (const rule of ledger(page())) {
      for (const { label, href } of citedFiles(rule.held)) {
        assert.equal(href, label, `${rule.heading} labels ${label} and links to ${href}`);
      }
    }
  });

  it('is answered by every file it names', () => {
    /**
     * The other half of the link. A rule that names a test the test does not
     * claim is a rule with a citation rather than a guard — and that is the
     * exact shape the page warns about: two things each correct alone.
     */
    const cited = citations();
    for (const rule of ledger(page())) {
      for (const { href } of citedFiles(rule.held)) {
        const back = cited.find((entry) => entry.file === href);
        assert.ok(back, `${href} is named by "${rule.heading}" and carries no Doctrine line`);
        assert.equal(
          back.heading,
          rule.heading,
          `${href} says it holds "${back.heading}" and the page says "${rule.heading}"`,
        );
      }
    }
  });

  it('lets no file cite a rule that is not on the page', () => {
    // The direction a rename breaks. Renaming a rule leaves every citation of
    // it pointing at nothing, and this is the side that notices.
    const headings = ledger(page()).map((rule) => rule.heading);
    const orphans = citations()
      .filter((entry) => !headings.includes(entry.heading))
      .map((entry) => `${entry.file} cites "${entry.heading}"`);
    assert.deepEqual(orphans, [], 'a file cites a rule that is no longer on the page');
  });

  it('points every citation at the rule it names', () => {
    // The anchor is derived from the heading, so a rule that is renamed and
    // re-cited without its anchor being updated fails here rather than in a
    // reader's browser.
    for (const entry of citations()) {
      const [file, anchor] = entry.href.split('#');
      assert.equal(
        resolve(ROOT, dirname(entry.file), file),
        resolve(DOCTRINE),
        `${entry.file} points its Doctrine link at ${file}`,
      );
      assert.equal(anchor, slugOf(entry.heading), `${entry.file} links to #${anchor}`);
    }
  });

  it('gives every declared gap a reason, and never a bare one', () => {
    /**
     * Three rules name no test. Two are about how a guard is written, where
     * every mechanical check available is a proxy — and the second of them is
     * the rule against proxies. One says outright that no test can hold it.
     * A gap is allowed; a gap with nothing after it is the flattering version
     * of the same sentence, so the reason is what this checks.
     */
    const gaps = ledger(page()).filter((rule) => rule.held?.startsWith('**Held by** nothing'));
    assert.ok(gaps.length > 0, 'no gaps declared, so this check compares nothing');
    for (const gap of gaps) {
      assert.ok(
        gap.held.length > 200,
        `"${gap.heading}" declares a gap and gives no reason worth reading`,
      );
    }
  });

  it('states its own coverage on the page, and the page is right', () => {
    /**
     * The preface says how many rules name a test and how many rules there
     * are. Both are derived here, which makes the ledger's own headline the
     * kind of claim the rest of this repository holds itself to: a number in
     * prose that a test recomputes.
     */
    const text = page();
    const rules = ledger(text);
    const withTest = rules.filter((rule) => citedFiles(rule.held).length > 0);

    const claim = /— (\d+) of the (\d+) — or naming nothing/.exec(text);
    assert.ok(claim, 'the preface no longer states its coverage, so nothing here is checked');
    assert.equal(Number(claim[1]), withTest.length, 'the preface miscounts the rules that name a test');
    assert.equal(Number(claim[2]), rules.length, 'the preface miscounts the rules');

    const gaps = /reason, which (\d+) of them do/.exec(text);
    assert.ok(gaps, 'the preface no longer states how many rules declare a gap');
    assert.equal(Number(gaps[1]), rules.length - withTest.length, 'the preface miscounts the gaps');
  });

  it('reads a made page rather than only the real one', () => {
    /**
     * Both halves, on a page written for the purpose: the parser has to find a
     * rule's own paragraph and no other rule's, and it has to fail on the
     * absence rather than skipping the rule quietly.
     */
    const made = [
      '## A rule with a test',
      '',
      'Prose.',
      '',
      '**Held by** [`packages/core/test/one.test.js`](../packages/core/test/one.test.js).',
      '',
      '## A rule with a gap',
      '',
      'Prose.',
      '',
      '**Held by** nothing, because of a reason written out at length.',
      '',
      '## A rule with neither',
      '',
      'Prose.',
      '',
    ].join('\n');
    const rules = ledger(made);
    assert.deepEqual(rules.map((rule) => rule.heading), [
      'A rule with a test',
      'A rule with a gap',
      'A rule with neither',
    ]);
    assert.deepEqual(citedFiles(rules[0].held), [
      { label: 'packages/core/test/one.test.js', href: 'packages/core/test/one.test.js' },
    ]);
    // The gap has no file, and the rule with no line at all is null rather than
    // silently inheriting its neighbour's.
    assert.deepEqual(citedFiles(rules[1].held), []);
    assert.equal(rules[2].held, null);

    assert.equal(slugOf('A floor can prove "over" and can never prove "under"'),
      'a-floor-can-prove-over-and-can-never-prove-under');
  });
});
