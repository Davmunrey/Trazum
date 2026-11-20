import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CHANGES_DIR, FRAGMENT, KINDS, bodyProblem, fold, fragmentProblem, parseName, readFragments } from '../../../scripts/changes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * One file per change under `changes/`, folded into `CHANGELOG.md` at release
 * (#847). These hold the name a file must have, the text it may hold, and the
 * fold a release writes: the same fold the site shows as pending.
 */

const fragment = (name, body) => ({ ...parseName(name), path: `${CHANGES_DIR}/${name}`, body });

describe('a change file is named <issue>.<kind>.md', () => {
  it('takes an issue, a second entry on it, or a slug, with one of the kinds', () => {
    for (const name of ['847.added.md', '847-2.changed.md', 'session-hook.fixed.md', '12.security.md', '9.removed.md', '9.deprecated.md']) {
      assert.ok(FRAGMENT.test(name), name);
      assert.equal(fragmentProblem(`changes/${name}`), null, name);
    }
    assert.deepEqual(parseName('847-2.changed.md'), { name: '847-2.changed.md', kind: 'changed', issue: 847, nth: 2, slug: null });
    assert.deepEqual(parseName('session-hook.fixed.md'), { name: 'session-hook.fixed.md', kind: 'fixed', issue: null, nth: 1, slug: 'session-hook' });
  });

  it('accepts exactly the kinds in KINDS: the literal pattern and the list agree', () => {
    for (const [kind] of KINDS) assert.ok(FRAGMENT.test(`1.${kind}.md`), kind);
    const named = /\(([a-z|]+)\)\\\.md\$/.exec(FRAGMENT.source)?.[1].split('|') ?? [];
    assert.deepEqual([...named].sort(), KINDS.map(([kind]) => kind).sort());
  });

  it('refuses anything else in the folder by name, and says what to call it', () => {
    for (const name of ['847.md', '847.improved.md', 'Fix.added.md', '847.added.txt', '-x.added.md', '847.added.md.bak']) {
      assert.match(fragmentProblem(`changes/${name}`), /name it <issue>\.<kind>\.md/, name);
    }
    assert.match(fragmentProblem('changes/sub/847.added.md'), /directly in changes\//);
  });

  it('has nothing to say about the README or a path outside the folder', () => {
    assert.equal(fragmentProblem('changes/README.md'), undefined);
    assert.equal(fragmentProblem('CHANGELOG.md'), undefined);
    assert.equal(fragmentProblem('docs/changes/847.added.md'), undefined);
  });
});

describe('a change file holds one entry', () => {
  it('refuses an empty one, a heading, and a leading "- "', () => {
    assert.match(bodyProblem('changes/1.added.md', '\n\n'), /empty/);
    assert.match(bodyProblem('changes/1.added.md', '### Added\n\n**x**'), /no headings/);
    assert.match(bodyProblem('changes/1.added.md', '- **x**'), /without the leading "- "/);
    assert.equal(bodyProblem('changes/1.added.md', '**x** (#1) y.\n- a detail\n'), null);
  });

  it('reads a folder, skipping the README, and stops at a file that is not one', () => {
    const root = mkdtempSync(join(tmpdir(), 'changes-'));
    try {
      assert.deepEqual(readFragments(root), [], 'no folder is no changes');
      mkdirSync(join(root, 'changes'));
      writeFileSync(join(root, 'changes', 'README.md'), 'How.\n');
      writeFileSync(join(root, 'changes', '2.fixed.md'), '**Two.** (#2)\n');
      assert.deepEqual(readFragments(root).map((f) => f.path), ['changes/2.fixed.md']);
      writeFileSync(join(root, 'changes', 'notes.md'), 'A stray note.\n');
      assert.throws(() => readFragments(root), /changes\/notes\.md: name it/);
      rmSync(join(root, 'changes', 'notes.md'));
      writeFileSync(join(root, 'changes', '3.added.md'), '');
      assert.throws(() => readFragments(root), /changes\/3\.added\.md: the entry is empty/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('a release folds them by kind, newest issue first', () => {
  it('writes a heading per kind in the order of KINDS, and an entry per file', () => {
    const folded = fold([
      fragment('12.fixed.md', '**An older fix.** (#12)'),
      fragment('30.added.md', '**A newer thing.** (#30)\n- a detail\n\n  more of it'),
      fragment('slug-name.fixed.md', '**No issue.**'),
      fragment('30-2.fixed.md', '**A second fix on 30.** (#30)'),
      fragment('30.fixed.md', '**A fix on 30.** (#30)'),
      fragment('5.security.md', '**A hole closed.** (#5)'),
    ]);
    assert.equal(
      folded,
      [
        '### Added',
        '',
        '- **A newer thing.** (#30)',
        '  - a detail',
        '',
        '    more of it',
        '',
        '### Fixed',
        '',
        '- **A fix on 30.** (#30)',
        '- **A second fix on 30.** (#30)',
        '- **An older fix.** (#12)',
        '- **No issue.**',
        '',
        '### Security',
        '',
        '- **A hole closed.** (#5)',
      ].join('\n'),
    );
    assert.equal(fold([]), '');
  });

  it('names every kind it accepts in the folder README, where a contributor looks', () => {
    const readme = readFileSync(join(ROOT, 'changes', 'README.md'), 'utf8');
    for (const [kind] of KINDS) assert.ok(readme.includes(`\`${kind}\``), `changes/README.md does not name the kind ${kind}`);
  });
});

describe("this repository's own changes/", () => {
  it('holds only change files that read, besides its README', () => {
    // Throws, naming the file, on the first one that is not a change file.
    readFragments(ROOT);
  });
});
