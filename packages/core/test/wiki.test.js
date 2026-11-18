import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { sectionOf } from '../../../test-utils/section.mjs';
import { paired } from '../../../scripts/wiki-tags.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const wiki = join(repoRoot, 'wiki');

/**
 * The wiki, held to the repository it is a copy of.
 *
 * GitHub indexes a wiki separately from code, which is the whole reason to
 * have one: a reader searching for "cache TTL" reaches a page instead of a
 * line of a 1,200-line README. It is also the reason a wiki is the worst place
 * in a project for a second copy of anything — somebody arriving from a search
 * has no way of knowing they are reading last month's answer, and no reason to
 * suspect it.
 *
 * So no page is written. Every one is a section of a file this repository
 * already keeps, copied verbatim by `scripts/build-wiki.mjs`, and this fails
 * when the checked-in pages are not what that script produces. The rule is the
 * same one the plugin skill lives under: a copy that nothing regenerates is a
 * copy that drifts.
 */

const run = (...args) =>
  execFileSync('node', [join(repoRoot, 'scripts', 'build-wiki.mjs'), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const pages = () => readdirSync(wiki).filter((name) => name.endsWith('.md'));

describe('the wiki is the repository, not a second copy of it', () => {
  it('is exactly what the build script writes', () => {
    /*
      `--check` rather than rebuilding and diffing here: the script is the one
      that knows what a page is, and a test that reimplemented that would be
      the second copy this whole arrangement exists to refuse.
    */
    run('--check');
  });

  it('and the check is not one that can never fire', () => {
    /*
      Planted rather than trusted. A `--check` that passed on anything would be
      a guard nobody could tell from an absent one, and the page it reads is
      restored whether the assertion holds or not.
    */
    const page = join(wiki, 'Home.md');
    const held = readFileSync(page, 'utf8');
    try {
      writeFileSync(page, `${held}\nA sentence nobody generated.\n`);
      assert.throws(() => run('--check'), /not what this script writes/);
    } finally {
      writeFileSync(page, held);
    }
    run('--check');
  });
});

describe('every page closes what it opens', () => {
  /**
   * A page is a section cut out of a document by its heading. The README
   * centres its opening block in a `<div>` that starts above the heading the
   * Home page is cut at, so Home ended on a `</div>` that closed nothing,
   * from the first build until 2026-11-18. GitHub draws that without
   * complaint and the next renderer may not, and a tag left open would centre
   * or hide everything after it. So the tags are counted, outside code.
   */
  const tags = (text) => {
    const prose = text.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '').replace(/(`+)[^`\n]*?\1/g, '');
    let open = 0;
    let orphans = 0;
    for (const [tag] of prose.matchAll(/<div\b[^>]*>|<\/div\s*>/gi)) {
      if (tag.startsWith('</')) {
        if (open === 0) orphans += 1;
        else open -= 1;
      } else open += 1;
    }
    return { open, orphans };
  };

  it('counts what it claims to count', () => {
    assert.deepEqual(tags('<div align="center">\n\ntext\n\n</div>'), { open: 0, orphans: 0 });
    assert.deepEqual(tags('text\n\n</div>'), { open: 0, orphans: 1 });
    assert.deepEqual(tags('<div>\n\ntext'), { open: 1, orphans: 0 });
    assert.deepEqual(tags('```html\n</div>\n```'), { open: 0, orphans: 0 });
    assert.deepEqual(tags('A page closes with `</div>` and opens with `<div align="center">`.'), { open: 0, orphans: 0 });
  });

  it('the builder drops a closing tag with nothing open, closes one left open, and reads code as text', () => {
    assert.equal(paired('text\n\n</div>'), 'text\n');
    assert.equal(paired('<div align="center">\n\ntext'), '<div align="center">\n\ntext\n</div>');
    assert.equal(paired('<div>\n\ntext\n\n</div>'), '<div>\n\ntext\n\n</div>');
    assert.equal(paired('```html\n</div>\n```'), '```html\n</div>\n```');
    // A sentence that names a tag neither opens nor closes one: counted, the
    // `<div>` in backticks here would have kept the orphan below it.
    const named = 'The block opens with `<div align="center">`.\n\n</div>';
    assert.equal(paired(named), 'The block opens with `<div align="center">`.\n');
    assert.equal(paired('It ends with `</div>`.\n\n<div>\n\ntext'), 'It ends with `</div>`.\n\n<div>\n\ntext\n</div>');
  });

  it('and the README still hands the Home page a closing tag to drop, so this is not vacuous', () => {
    const opening = sectionOf(readFileSync(join(repoRoot, 'README.md'), 'utf8'), '### Know what your AI agents cost, per project, without your prompts leaving the machine.');
    assert.deepEqual(tags(opening), { open: 0, orphans: 1 }, 'the README no longer closes its centred block inside the section Home is cut from: this guard has nothing to catch, so say so here');
  });

  for (const name of pages()) {
    it(`${name} has no closing tag with nothing open, and nothing left open`, () => {
      assert.deepEqual(tags(readFileSync(join(wiki, name), 'utf8')), { open: 0, orphans: 0 });
    });
  }
});

describe('every page survives being served from somewhere else', () => {
  /**
   * A wiki is served from `/wiki/<Page>`, not from the repository tree, so a
   * relative link copied out of the README points at a wiki page nobody wrote.
   * That is a correctness requirement of the wiki rather than a rule this test
   * invented: the rewrite would be needed with nothing checking it.
   */
  for (const name of pages()) {
    it(`${name} links nowhere relative`, () => {
      const text = readFileSync(join(wiki, name), 'utf8').replace(/```[\s\S]*?```/g, '');
      const relative = [
        ...[...text.matchAll(/]\(([^)\s]+)\)/g)].map((match) => match[1]),
        ...[...text.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]),
      ].filter((target) => !/^(https?:|mailto:)/.test(target));
      assert.deepEqual(relative, [], `${name} carries links that break on a wiki: ${relative.join(', ')}`);
    });

    it(`${name} says where it came from`, () => {
      /* The one sentence a reader arriving from a search needs, and the reason
         nobody should edit a page in the wiki editor. */
      const text = readFileSync(join(wiki, name), 'utf8');
      assert.match(text, /Generated from/, `${name} does not say it is generated`);
      assert.match(text, /scripts\/build-wiki\.mjs/, `${name} does not name the script that writes it`);
    });
  }

  it('has pages to check at all', () => {
    assert.ok(pages().length >= 5, `only ${pages().length} wiki pages — is the build script writing?`);
  });
});
