import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * A merge that changed this repository has a line in the changelog.
 *
 * ## The rule was written down and nothing held it
 *
 * `CHANGELOG.md` opens by saying it: *`Unreleased` holds what is merged into
 * `main` but not yet tagged. A change that alters nothing installable — a test,
 * a document — still lands there rather than nowhere: the changelog is the
 * record of what happened to this repository, and a merged commit with no entry
 * is a change only `git log` remembers.*
 *
 * Four consecutive pull requests after 2.3.0 left `Unreleased` empty. A CLI
 * flag, a wiki generator, a commit hook, a corrected skill and an advanced
 * Action pin — none of them wrote a line, and nothing anywhere failed. The
 * rule read as enforced because it was stated in the imperative, which is the
 * same shape as every unenforced rule this repository has found in itself.
 *
 * ## What this asks, and what it deliberately does not
 *
 * It asks one question: **are there commits after the newest tag, and is this
 * section empty?** That is the state that cannot be right. It does not try to
 * match commits to entries — a mapping from pull requests to bullet points
 * would need either a convention in commit messages or a list somebody keeps in
 * step, and the second is the defect this file exists to catch.
 *
 * So a single line under `## Unreleased` satisfies it, and that is on purpose:
 * this guard catches the section nobody touched, which is the failure that
 * actually happened. Whether the line is *good* is what review is for.
 *
 * ## Why the tag, and what happens without one
 *
 * The newest tag is what "not yet released" is measured against, and asking git
 * is the only way to know it — the version in `package.json` is bumped in the
 * release pull request itself, so it agrees with the tag only after the tag
 * exists. `security.test.js` reaches for tags the same way and for the same
 * reason.
 *
 * A checkout with no tags cannot answer, and this **refuses rather than
 * passes**: a guard that goes quiet exactly where its input is missing is a
 * guard that reports green on every shallow clone. CI checks this repository
 * out at `fetch-depth: 0`, so the tags are there; a contributor running the
 * suite on a shallow clone is told what to fetch rather than told nothing.
 */

const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The newest tag reachable from HEAD, or `null` when this clone has none. */
function newestTag() {
  try {
    return git('describe', '--tags', '--abbrev=0');
  } catch {
    return null;
  }
}

/**
 * The body of one `##` section, up to the next one.
 *
 * Read out of the file rather than by line number, so the section moving down
 * as releases accumulate does not silently start reading a different one.
 */
function sectionBody(source, heading) {
  const start = source.indexOf(`\n${heading}\n`);
  assert.notEqual(start, -1, `${heading} is no longer a heading in CHANGELOG.md`);
  const after = start + heading.length + 2;
  const next = source.indexOf('\n## ', after);
  return source.slice(after, next === -1 ? source.length : next);
}

describe('every merge is in the changelog', () => {
  const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');

  it('reads the section rather than a line number', () => {
    /*
      A section that always came back empty would make the assertion below pass
      forever, which is how this whole class of guard fails. `## Changelog`
      does not exist and 2.3.0's does, so both halves of the reader are checked
      against a known answer.
    */
    assert.throws(() => sectionBody(changelog, '## Nothing By This Name'));
    const released = sectionBody(
      changelog,
      '## 2.3.0 — The warning that cried wolf, and a skill written for one agent',
    );
    assert.ok(released.includes('reviewedForModels'), 'the section reader found the wrong body');
  });

  it('Unreleased is not empty while commits sit on top of the newest tag', () => {
    const tag = newestTag();
    assert.notEqual(
      tag,
      null,
      'no tag is reachable from HEAD, so this guard cannot tell released from not: '
        + 'run `git fetch --tags` (CI checks out at fetch-depth 0)',
    );

    const since = git('log', '--oneline', `${tag}..HEAD`).split('\n').filter(Boolean);
    if (since.length === 0) return;

    const unreleased = sectionBody(changelog, '## Unreleased').trim();
    assert.notEqual(
      unreleased,
      '',
      `${since.length} commit(s) sit on top of ${tag} and Unreleased is empty:\n  `
        + since.join('\n  '),
    );
  });
});
