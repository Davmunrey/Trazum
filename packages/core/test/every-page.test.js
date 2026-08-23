import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Every page in this repository, held to the three things a page can be wrong
 * about without anybody noticing.
 *
 * Found by emptying each one and re-running the suites — the probe that found
 * `docs/doctrine.md` unguarded. **Six more broke nothing at all**:
 * `docs/ci.md`, `docs/running.md`, `docs/accounts.md`,
 * `docs/authoring-rules.md`, `SECURITY.md` and `VERSIONING.md`. The last two
 * are the ones worth naming: one tells somebody how to report a vulnerability,
 * and the other defines what this project's three version numbers mean, which
 * every release depends on.
 *
 * Writing six bespoke guards would have left the seventh page unguarded, so
 * this is derived from the filesystem instead. What it proves is narrow and
 * worth stating: **a page exists, says something, links only to things that are
 * there, and shows only commands this CLI actually has.** It cannot check that
 * what a page says is true — nothing mechanical can — but the failure the
 * probe found was not a subtle mischaracterisation. It was six pages that could
 * have been deleted in silence.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;

/** The pages, from the filesystem — never a list typed here. */
const pages = () => {
  const found = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        if (/node_modules|\.next|\.git|dist/.test(entry.name)) continue;
        walk(join(dir, entry.name), `${rel}/`);
      } else if (entry.name.endsWith('.md')) {
        found.push(rel);
      }
    }
  };
  walk('docs', 'docs/');
  for (const name of readdirSync(ROOT, { withFileTypes: true })) {
    if (name.isFile() && name.name.endsWith('.md')) found.push(name.name);
  }
  return found;
};

const read = (page) => readFileSync(join(ROOT, page), 'utf8');

/**
 * Two hundred characters, which is a paragraph.
 *
 * Not "non-empty": a page emptied to a single heading would pass that and be
 * exactly as useless. The threshold is low enough that a genuinely short page
 * is fine and high enough that a gutted one is not.
 */
const MIN_CHARS = 200;

/**
 * An invocation, not a mention.
 *
 * The first version matched `trazum` after any whitespace, and the changelog's
 * *"Executable trazum not found"* — prose quoting an error message — came back
 * as a command called `not`. Exempting that file would have been the wrong fix:
 * a guard that needs an allowlist to stay quiet is a guard somebody deletes.
 *
 * An invocation **begins** its command: at the start of a line (indented or
 * not), just inside a code span, or after a shell prompt. A word before it means
 * the word is the subject and `trazum` is being talked about.
 */
const INVOCATION = /(?:^[ \t]*|`|\$ )trazum ([a-z][a-z-]*)/gm;

describe('every page in this repository', () => {
  it('is found at all, and there are as many as this repository has', () => {
    const all = pages();
    assert.ok(all.length >= 20, `only ${all.length} pages found — has the layout moved?`);
    assert.ok(all.includes('SECURITY.md'), 'SECURITY.md is not in the walk');
    assert.ok(all.includes('docs/doctrine.md'), 'docs/doctrine.md is not in the walk');
  });

  it('says something — no page is a stub or an empty file', () => {
    const thin = pages()
      .map((page) => [page, read(page).trim().length])
      .filter(([, length]) => length < MIN_CHARS);
    assert.deepEqual(
      thin.map(([page, length]) => `${page} (${length} chars)`),
      [],
      'a page could be emptied and nothing else in this repository would fail',
    );
  });

  it('links only to files that are there', () => {
    const broken = [];
    let checked = 0;
    for (const page of pages()) {
      for (const match of read(page).matchAll(/\]\((?!https?:|mailto:|#)([^)#]+)/g)) {
        checked += 1;
        if (!existsSync(resolve(join(ROOT, dirname(page)), match[1]))) {
          broken.push(`${page} -> ${match[1]}`);
        }
      }
    }
    assert.ok(checked > 100, `only ${checked} relative links found — has the pattern stopped matching?`);
    assert.deepEqual(broken, [], 'a page links to something that is not there');
  });

  it('shows only commands this CLI dispatches', () => {
    /**
     * The drift this catches is a rename: `trazum profile` becoming something
     * else leaves eleven pages describing a command that no longer exists, and
     * the only thing that would notice is a reader typing it.
     *
     * Derived from `COMMAND_FLAGS` — the same list `help-enumerations.test.js`
     * holds USAGE to — so the two documentations of the command set cannot
     * disagree with the product or with each other.
     */
    const source = readFileSync(join(ROOT, 'packages/cli/src/index.ts'), 'utf8');
    const start = source.indexOf('const COMMAND_FLAGS');
    const block = source.slice(start, source.indexOf('\n};', start));
    const known = new Set([...block.matchAll(/^ {2}([a-z][a-z-]*):\s*\[/gm)].map((m) => m[1]));
    assert.ok(known.size >= 30, `only ${known.size} commands parsed out of COMMAND_FLAGS`);

    const invented = [];
    let seen = 0;
    for (const page of pages()) {
      for (const match of read(page).matchAll(INVOCATION)) {
        seen += 1;
        if (!known.has(match[1])) invented.push(`${page}: trazum ${match[1]}`);
      }
    }
    assert.ok(seen > 50, `only ${seen} documented invocations found`);
    assert.deepEqual(invented, [], 'a page shows a command this CLI does not have');
  });
});

describe('and each check can see its own failure', () => {
  /**
   * Every one of them passes on this repository today, which is the state a
   * guard is least able to prove itself in.
   */
  it('sees a page gutted to a heading', () => {
    assert.ok('# Title\n'.trim().length < MIN_CHARS);
    assert.ok(read('SECURITY.md').trim().length >= MIN_CHARS);
  });

  it('sees a link to a file that is not there', () => {
    const made = '[gone](./no-such-file.md)';
    const [, target] = /\]\((?!https?:|mailto:|#)([^)#]+)/.exec(made);
    assert.equal(existsSync(resolve(join(ROOT, 'docs'), target)), false);
  });

  it('sees an invocation of a command that does not exist', () => {
    const made = 'Run `trazum invent` to do the thing.';
    assert.deepEqual([...made.matchAll(INVOCATION)].map((m) => m[1]), ['invent']);
  });

  it('and reads prose about the tool as prose', () => {
    // The false positive this pattern was tightened for, kept as the case it
    // has to keep getting right.
    const prose = 'the root gives `Executable trazum not found`, because the root is private';
    assert.deepEqual([...prose.matchAll(INVOCATION)].map((m) => m[1]), []);
    // And an indented invocation inside a fenced block is still one.
    assert.deepEqual([...'    trazum check .'.matchAll(INVOCATION)].map((m) => m[1]), ['check']);
  });
});
