import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseConfig, walkIncludes, walkPrompts } from '../dist/node.js';

/**
 * Saying which files are prompts, when the extension cannot.
 *
 * Directory mode decided from the extension alone, and `.txt` in a repository
 * with a test corpus means *fixtures*. Pointed at this project's own root it
 * read seventy-four documents — README, changelog, roadmap — and thirty-five
 * test fixtures as prompts, which is why nobody here had ever committed a
 * baseline of it.
 *
 * A hard-coded skip list would have been this project guessing at somebody
 * else's layout. `ignore` is the repository saying so.
 */

const tree = async () => {
  const root = await mkdtemp(join(tmpdir(), 'trazum-ignore-'));
  await mkdir(join(root, 'prompts'), { recursive: true });
  await mkdir(join(root, 'test', 'fixtures'), { recursive: true });
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'prompts', 'system.txt'), 'You are helpful.\n');
  await writeFile(join(root, 'prompts', 'user.txt'), 'Answer briefly.\n');
  await writeFile(join(root, 'test', 'fixtures', 'sample.txt'), 'fixture\n');
  await writeFile(join(root, 'test', 'other.txt'), 'fixture\n');
  await writeFile(join(root, 'docs', 'guide.txt'), 'prose\n');
  return root;
};

describe('walkPrompts: ignore', () => {
  it('finds everything when nothing is ignored', async () => {
    const { files } = await walkPrompts(await tree(), { extensions: ['.txt'] });
    assert.deepEqual(files, [
      'docs/guide.txt',
      'prompts/system.txt',
      'prompts/user.txt',
      'test/fixtures/sample.txt',
      'test/other.txt',
    ]);
  });

  it('leaves out a whole tree, not just the files directly in it', async () => {
    const { files } = await walkPrompts(await tree(), {
      extensions: ['.txt'],
      ignore: ['**/test/**'],
    });
    assert.deepEqual(files, ['docs/guide.txt', 'prompts/system.txt', 'prompts/user.txt']);
  });

  it('matches a bare directory pattern as well as a trailing-slash one', async () => {
    /**
     * `test` and `test/**` are both what somebody writes meaning the same
     * thing, and a walker that honoured one and silently ignored the other
     * would leave fixtures in a baseline with no visible reason.
     */
    for (const pattern of ['test', 'test/**', '**/test/**']) {
      const { files } = await walkPrompts(await tree(), {
        extensions: ['.txt'],
        ignore: [pattern],
      });
      assert.ok(
        !files.some((file) => file.startsWith('test/')),
        `"${pattern}" left fixtures in: ${files.join(', ')}`,
      );
    }
  });

  it('leaves out a single file without its neighbours', async () => {
    const { files } = await walkPrompts(await tree(), {
      extensions: ['.txt'],
      ignore: ['prompts/user.txt'],
    });
    assert.ok(files.includes('prompts/system.txt'));
    assert.ok(!files.includes('prompts/user.txt'));
  });

  it('ignores nothing when the pattern matches nothing', async () => {
    // The failure worth catching is a pattern that quietly matches everything
    // or nothing; a typo must leave the walk exactly as it was.
    const { files } = await walkPrompts(await tree(), {
      extensions: ['.txt'],
      ignore: ['tset/**'],
    });
    assert.equal(files.length, 5);
  });
});

describe('the config carries it', () => {
  const load = (text) => parseConfig(text, 'trazum.config.json');

  it('accepts a list of patterns', () => {
    const config = load('{"ignore": ["**/fixtures/**", "docs/**"]}');
    assert.deepEqual(config.ignore, ['**/fixtures/**', 'docs/**']);
  });

  it('refuses a pattern that climbs out of the project', () => {
    /**
     * The same rule a budget pattern gets, for the same reason: a pattern
     * reaching outside the repository either matches nothing or matches
     * somebody else's files. On a pull request the config comes from whoever
     * opened it.
     */
    assert.throws(() => load('{"ignore": ["../secrets/**"]}'), /relative path inside the project/);
    assert.throws(() => load('{"ignore": ["/etc/**"]}'), /relative path inside the project/);
  });

  it('refuses something that is not a list of non-empty strings', () => {
    assert.throws(() => load('{"ignore": "**/test/**"}'), /must be an array/);
    assert.throws(() => load('{"ignore": [""]}'), /path patterns/);
    assert.throws(() => load('{"ignore": [7]}'), /path patterns/);
  });

  it('is absent rather than empty when nothing is configured', () => {
    // An empty array and "not configured" would read the same downstream; the
    // walker takes `undefined` to mean "no filtering" and that has to survive.
    assert.equal(load('{}').ignore, undefined);
  });
});

/**
 * `walkIncludes` answers, path by path, what `walkPrompts` answers by reading
 * the disk. `check --base` (#785) lists the base branch's files from git and
 * keeps the ones the walk would keep, so the two disagreeing reads as a
 * prompt the pull request deleted, or one it never saw. Held to one tree
 * that has every rule in it: a dot directory, a skipped directory, an
 * ignored tree, an ignored file, a foreign extension and the depth limit.
 */
describe('walkIncludes agrees with walkPrompts', () => {
  it('keeps exactly the files the walk lists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trazum-includes-'));
    const files = [
      'prompts/system.txt',
      'prompts/.drafts/hidden.txt',
      '.config/prompt.txt',
      'node_modules/pkg/prompt.txt',
      'prompts/dist/built.txt',
      'test/fixtures/sample.txt',
      'prompts/skip.txt',
      'prompts/notes.md',
      'prompts/image.png',
      'a/b/c/deep.txt',
      'a/b/c/d/too-deep.txt',
    ];
    for (const file of files) {
      await mkdir(join(root, ...file.split('/').slice(0, -1)), { recursive: true });
      await writeFile(join(root, ...file.split('/')), 'text\n');
    }
    const options = { extensions: ['.txt', '.md'], ignore: ['**/test/**', 'prompts/skip.txt'], maxDepth: 3 };
    const { files: walked } = await walkPrompts(root, options);
    const included = files.filter((file) => walkIncludes(file, options)).sort();
    assert.deepEqual(included, walked);
    assert.deepEqual(walked, ['a/b/c/deep.txt', 'prompts/notes.md', 'prompts/system.txt']);
  });
});
