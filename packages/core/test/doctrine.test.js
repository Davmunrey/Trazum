import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * `docs/doctrine.md` was the one prose contract in this repository with no
 * guard at all.
 *
 * That was measured rather than assumed: emptying the file and re-running the
 * suites broke nothing. Every other page that makes checkable claims — the
 * contract file, the interchange index, the usage-log format, `CONTRIBUTING`,
 * the README, the roadmap — fails a test when it goes stale. The doctrine, the
 * page whose whole subject is *check what enforces your own rules*, and where
 * the rule **a rule you wrote for yourself is a claim like any other** lives,
 * was enforced by nobody.
 *
 * What follows does not enforce the rules — most are about judgement and one
 * says outright that no test can hold it. It enforces the page: that the rules
 * its own preface names still exist under those names, that no rule is written
 * twice, that a rule the preface says joined at a release is on that record,
 * and that its links resolve. Those are the claims that go quietly wrong.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const DOCTRINE = join(ROOT, 'docs/doctrine.md');

/** Every rule, in order. */
const rules = (page) => [...page.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

/**
 * The preface: everything above the first rule, where the page describes its
 * own editions and says which rules joined when.
 *
 * Bounded to that, deliberately. Italics run through the whole document as
 * ordinary emphasis — *what else does this fail on*, *two correct sentences* —
 * and a search over the file would read those as rule names and report every
 * one of them missing.
 *
 * Inside the preface the opposite rule applies, and the page says so: italics
 * there are reserved for rule names, so every one of them is read as a rule and
 * an ordinary emphasis fails this check. That is not incidental strictness — a
 * preface that emphasises freely is a preface where a renamed rule hides. It
 * fired on the first draft of the paragraph announcing this test.
 */
const preface = (page) => page.slice(0, page.indexOf('\n## '));

/** The rules the preface names, as it names them. */
const named = (page) =>
  [...preface(page).matchAll(/\*([a-z][^*]{15,}?)\*/g)].map((match) =>
    match[1].replace(/\s+/g, ' ').trim(),
  );

const norm = (text) => text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** A preface name matches a rule when either is a prefix of the other. */
const matching = (name, headings) =>
  headings.find((heading) => norm(name).startsWith(norm(heading)) || norm(heading).startsWith(norm(name)));

describe('the doctrine is held to its own page', () => {
  it('has rules at all, so nothing below can pass on an empty file', async () => {
    // The finding this file exists for: the page could have been emptied and
    // every suite would still have gone green.
    const page = await readFile(DOCTRINE, 'utf8');
    assert.ok(rules(page).length >= 20, `only ${rules(page).length} rules found in docs/doctrine.md`);
    assert.ok(named(page).length >= 3, 'the preface names no rules, so the check below compares nothing');
  });

  it('still has every rule its own preface names', async () => {
    const page = await readFile(DOCTRINE, 'utf8');
    const headings = rules(page);
    const missing = named(page).filter((name) => !matching(name, headings));
    assert.deepEqual(
      missing,
      [],
      'the preface names a rule that is no longer a heading — renaming a rule leaves the page describing itself wrongly',
    );
  });

  it('writes no rule twice', async () => {
    const headings = rules(await readFile(DOCTRINE, 'utf8')).map(norm);
    const twice = headings.filter((heading, i) => headings.indexOf(heading) !== i);
    assert.deepEqual(twice, [], 'the same rule appears twice');
  });

  it('names each newly joined rule somewhere on the release record', async () => {
    /**
     * The preface says which release each recent rule joined at. A rule that
     * arrived with no release note is a rule with no provenance — and this
     * document's whole claim is that every rule was learned by getting it
     * wrong first, which is a claim about the record.
     */
    const page = await readFile(DOCTRINE, 'utf8');
    const releases = (await readFile(join(ROOT, 'RELEASES.md'), 'utf8')).toLowerCase();
    const unrecorded = named(page).filter((name) => {
      const headings = rules(page);
      const rule = matching(name, headings);
      return rule !== undefined && !releases.includes(rule.toLowerCase());
    });
    assert.deepEqual(
      unrecorded,
      [],
      'the preface says a rule joined at a release and no release note names it',
    );
  });

  it('links only to documents that exist', async () => {
    const page = await readFile(DOCTRINE, 'utf8');
    const links = [...page.matchAll(/\]\((?!https?:)([^)#]+)/g)].map((match) => match[1]);
    assert.ok(links.length > 0, 'the doctrine links nowhere, so this check compares nothing');
    for (const link of links) {
      await access(join(dirname(DOCTRINE), link));
    }
  });

  it('reads the preface and not the emphasis below it', () => {
    /**
     * The two halves this can get wrong, on a page written for the purpose.
     *
     * A search over the whole file reads ordinary emphasis as a rule name and
     * reports it missing — that is what the first attempt at this did. And a
     * preface name with no rule under it has to be caught, or "every rule the
     * preface names still exists" is a sentence about nothing.
     */
    const made = [
      '# The doctrine',
      '',
      'One joined at 9.9.9 — *a rule that is really here* — and it is the newest.',
      '',
      '---',
      '',
      '## A rule that is really here',
      '',
      'Prose with *ordinary emphasis in it* that is not a rule name.',
      '',
      '## Another rule entirely',
      '',
    ].join('\n');
    assert.deepEqual(named(made), ['a rule that is really here']);
    assert.ok(matching('a rule that is really here', rules(made)));

    const renamed = made.replace('## A rule that is really here', '## A rule under a different name');
    assert.equal(matching('a rule that is really here', rules(renamed)), undefined);
  });
});
