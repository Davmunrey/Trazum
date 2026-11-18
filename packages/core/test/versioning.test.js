import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { sectionOf } from '../../../test-utils/section.mjs';

/**
 * The versioning policy describes the version in the manifest.
 *
 * `VERSIONING.md` is what every changelog entry and every release points at.
 * On 2026-11-18, with the manifests at 2.7.12, it was still the policy of the
 * line before: the section was "The 1.x freeze", "a breaking change waits for
 * 2.0", the pin to copy was `^1.50.0`, and `CHANGELOG.md` opened with the
 * rule for versions below 1.0 and no other. One promise had come due without
 * anybody noticing: the entry that deprecated `tier` said it would be removed
 * in 2.0, 2.0.0 removed nothing, and no document said which of the two was
 * the mistake (#747).
 *
 * Nothing failed, because nothing compared the document with the number. So
 * these do. They are about agreement and not about the policy: what a major
 * means is the owner's to decide, and it is decided in the document.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const policy = read('VERSIONING.md');
const manifest = JSON.parse(read('package.json'));
const major = Number(manifest.version.split('.')[0]);
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** The count a sentence gives as a word, as a number. */
const counted = (text, pattern) => {
  const found = text.match(pattern);
  assert.ok(found, `the policy no longer has the sentence ${pattern}`);
  const number = WORDS.indexOf(found[1].toLowerCase());
  assert.notEqual(number, -1, `"${found[1]}" is not a count this test can read`);
  return number;
};

/** One `###` part of the policy, ending at the next heading of any depth. */
const part = (heading) => {
  const from = sectionOf(policy, heading).slice(heading.length);
  const end = from.search(/\n#{2,3} /);
  return end === -1 ? from : from.slice(0, end);
};

/** Every `@deprecated` in one source text: the name it marks, and its comment. */
function marksIn(file, source) {
  const found = [];
  for (const match of source.matchAll(/\/\*\*(?:(?!\*\/)[\s\S])*?@deprecated(?:(?!\*\/)[\s\S])*?\*\/\s*(?:export\s+)?(?:declare\s+)?(?:const|function|class|interface|type|enum|readonly)?\s*([A-Za-z_$][\w$]*)/g)) {
    found.push({ file, name: match[1], comment: match[0] });
  }
  return found;
}

/** Every `@deprecated` in the packages' sources. */
function deprecated() {
  return tracked
    .filter((path) => /^(packages|apps)\/[^/]+\/src\/.*\.tsx?$/.test(path))
    .flatMap((file) => marksIn(file, read(file)));
}

/**
 * The member this file was written about, as `types.ts` had it until 3.0.0
 * removed it (#764). Kept as text so the search is still seen to find a
 * `@deprecated` member when the sources hold none.
 */
const REMOVED_TIER = `export interface ModelPricing {
  /** Capability, on a vendor-neutral scale. */
  capability: Capability;
  /**
   * @deprecated Use \`capability\`. Anthropic's ladder used as a generic axis
   * stopped making sense once other providers were priced. Kept in step with
   * \`capability\`. It was to be removed in 2.0 and was not: 2.0.0 removed
   * nothing. It goes only in a major, and none has been named. See
   * VERSIONING.md.
   */
  tier: 'haiku' | 'sonnet' | 'opus' | 'frontier' | 'unknown';
}`;

describe('the freeze is stated for the line being released', () => {
  it('names the major line the manifest is on', () => {
    const freeze = sectionOf(policy, '## The freeze');
    assert.match(freeze, new RegExp(`inside the ${major}\\.x line`), `the manifest is at ${manifest.version} and the freeze does not say what holds inside ${major}.x`);
    assert.match(policy, new RegExp(`Nothing inside ${major}\\.x does that`), 'what a major means is said of the line being released');
  });

  it('makes a breaking change wait for a version that has not shipped', () => {
    const waits = [...policy.matchAll(/waits for (\d+)\.0/g)].map((match) => Number(match[1]));
    for (const version of waits) assert.ok(version > major, `"waits for ${version}.0" and the manifest is at ${manifest.version}`);
    assert.match(sectionOf(policy, '## The freeze'), /A breaking change waits for (the next major|\d+\.0)\./);
  });

  it('gives pins to copy that are on that line', () => {
    const pins = [...policy.matchAll(/`([\^~])(\d+)\.\d+\.\d+`/g)];
    assert.ok(pins.some((pin) => pin[1] === '^'), 'the policy says which caret range to pin');
    for (const pin of pins) assert.equal(Number(pin[2]), major, `${pin[0]} is a pin on another major than ${manifest.version}`);
  });
});

describe('what an earlier version said would be removed', () => {
  const marked = deprecated();
  const listed = [...part('### Deprecated, and still working').matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]);

  it('the search finds the one this was written about', () => {
    assert.deepEqual(
      marksIn('packages/core/src/types.ts', REMOVED_TIER).map((entry) => entry.name),
      ['tier'],
      'a `@deprecated` on `tier`, as types.ts had it, is what the search must find',
    );
  });

  it('`tier` is removed rather than still marked, and the policy no longer lists it', () => {
    // 3.0.0 removes it (#764). Marked again, the policy would have to list it
    // again; listed again, the policy would promise a field that is gone.
    assert.ok(!marked.some((entry) => entry.name === 'tier'), 'a `@deprecated` `tier` is back in the sources');
    assert.ok(!listed.includes('tier'), 'the policy still lists `tier` as deprecated and still working');
  });

  it('everything marked deprecated in the sources is listed in the policy, and nothing else is', () => {
    assert.deepEqual([...new Set(marked.map((entry) => entry.name))].sort(), [...listed].sort());
  });

  it('a removal promised for a version that has shipped says what became of it', () => {
    for (const { file, name, comment } of marked) {
      for (const promise of comment.matchAll(/removed in (\d+)\.0/g)) {
        if (Number(promise[1]) > major) continue;
        assert.match(comment, /was not/, `${file}: \`${name}\` was to be removed in ${promise[1]}.0, the manifest is at ${manifest.version}, and its comment does not say what happened`);
      }
    }
    for (const promise of part('### Deprecated, and still working').matchAll(/removed in (\d+)\.0/g)) {
      if (Number(promise[1]) <= major) assert.match(part('### Deprecated, and still working'), /It was not/);
    }
  });
});

describe('the release steps count what is there', () => {
  const workspaces = tracked.filter((path) => /^(packages|apps)\/[^/]+\/package\.json$/.test(path));
  const steps = sectionOf(policy, '## Merging, and then releasing');

  it('as many workspace manifests as there are workspaces', () => {
    assert.equal(counted(steps, /all (\w+) workspace\*\* manifests/), workspaces.length);
    for (const path of workspaces) assert.equal(JSON.parse(read(path)).version, manifest.version, `${path} is not at the root's version`);
  });

  it('as many type-checks as `npm run verify` runs, and every step verify has', () => {
    const typechecks = manifest.scripts.typecheck.split('&&').filter((step) => /typecheck -w /.test(step));
    assert.equal(counted(steps, /typecheck\s+across all (\w+)\s+workspaces/), typechecks.length);
    assert.equal(typechecks.length, workspaces.length, 'every workspace is type-checked');
    const verify = manifest.scripts.verify;
    for (const [step, said] of [['lint', /the linter/], ['build', /build/], ['test', /tests/], ['typecheck', /typecheck/], ['build:web', /the web build/]]) {
      assert.match(verify, new RegExp(`npm run ${step}( |$)`), `verify no longer runs ${step}`);
      assert.match(steps, said, `the release steps do not say verify runs ${step}`);
    }
  });
});

describe('the changelog opens with the rule for what is released now', () => {
  const opening = read('CHANGELOG.md').split('\n## ')[0];

  it('points at the policy and says what holds inside a major line', () => {
    assert.match(opening, /\[VERSIONING\.md\]\(VERSIONING\.md\)/);
    assert.match(opening, /Nothing breaks inside a\s+major line/);
  });

  it('gives the rule below 1.0 as history', () => {
    assert.doesNotMatch(opening, /Below 1\.0, minor versions\s+may contain/);
  });
});
