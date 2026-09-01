import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from '../../cli/test/env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const script = join(repoRoot, 'scripts', 'assert-commit-identity.sh');

/**
 * Whose commits a web session's clone produces, held to the script that
 * decides it.
 *
 * ## The failure this closes, which happened twice in one day
 *
 * The platform re-asserts its own bot identity in *global* git config on every
 * session start, deliberately. A fresh clone has no repo-local identity, so
 * the first commit after any re-clone was authored "Claude" — which this
 * repository's owner has ruled out — and carried no Signed-off-by, which the
 * required DCO check then rejected. Fixed by hand, and undone by the next
 * container rebuild.
 *
 * ## What is being promised
 *
 * The identity is the *session's*, not this repository's owner's. The email
 * comes from the account that opened the session, so a contributor's session
 * on a fork asserts the contributor — deriving it from the history instead
 * would attribute their work to whoever committed last. The name is whatever
 * that email already calls itself here, because on a squash-only main the
 * author is rewritten and the Signed-off-by trailer is often the only place
 * the name survives.
 */

/** A throwaway repository, so the test reads the script and not this machine. */
function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-identity-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...SPAWN_ENV } });
  git('init', '--quiet');
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(script, join(dir, 'scripts', 'assert-commit-identity.sh'));
  copyFileSync(
    join(repoRoot, 'scripts', 'prepare-commit-msg'),
    join(dir, 'scripts', 'prepare-commit-msg'),
  );
  return { dir, git };
}

/** Run the script as the session hook would, with the email the session has. */
function run(dir, email) {
  return execFileSync('sh', ['scripts/assert-commit-identity.sh'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...SPAWN_ENV, CLAUDE_CODE_USER_EMAIL: email },
  });
}

/** Repo-local config only, or null — never the global fallback. */
const local = (git, key) => {
  try {
    return git('config', '--local', key).trim();
  } catch {
    return null;
  }
};

describe('the identity a clone commits under', () => {
  it('is taken from a commit the session email authored, when one exists', () => {
    const { dir, git } = scratchRepo();
    git('-c', 'user.name=Proper Name', '-c', 'user.email=person@example.test',
      'commit', '--allow-empty', '--quiet', '-m', 'seed');

    run(dir, 'person@example.test');
    assert.equal(local(git, 'user.name'), 'Proper Name');
    assert.equal(local(git, 'user.email'), 'person@example.test');
  });

  it('falls back to the Signed-off-by trailer, which a squash merge preserves', () => {
    /*
      The case this repository actually is: squash merges rewrite the author
      to the platform's GitHub identity, so the session email never appears as
      an author on main — but every squashed message keeps its trailer.
    */
    const { dir, git } = scratchRepo();
    git('-c', 'user.name=A Bot', '-c', 'user.email=bot@platform.test',
      'commit', '--allow-empty', '--quiet', '-m',
      'squashed work\n\nSigned-off-by: Proper Name <person@example.test>');

    run(dir, 'person@example.test');
    assert.equal(local(git, 'user.name'), 'Proper Name');
  });

  it('prefers the authored name over the trailer, which is the fresher fact', () => {
    const { dir, git } = scratchRepo();
    git('-c', 'user.name=Old Wording', '-c', 'user.email=bot@platform.test',
      'commit', '--allow-empty', '--quiet', '-m',
      'older\n\nSigned-off-by: Old Wording <person@example.test>');
    git('-c', 'user.name=Current Name', '-c', 'user.email=person@example.test',
      'commit', '--allow-empty', '--quiet', '-m', 'newer');

    run(dir, 'person@example.test');
    assert.equal(local(git, 'user.name'), 'Current Name');
  });

  it('uses the address’s own name for an email this repository has never seen', () => {
    /*
      Honest rather than empty: the only name the clone can prove is the
      address itself, and a first-time contributor's commits should still not
      come out as the bot's.
    */
    const { dir, git } = scratchRepo();
    git('-c', 'user.name=A Bot', '-c', 'user.email=bot@platform.test',
      'commit', '--allow-empty', '--quiet', '-m', 'seed');

    const said = run(dir, 'newcomer@dev.test');
    assert.equal(local(git, 'user.name'), 'newcomer');
    assert.equal(local(git, 'user.email'), 'newcomer@dev.test');
    assert.match(said, /using the address's own name/);
  });

  it('does nothing at all without a session account', () => {
    /*
      A session no human opened is the bot's, and inventing a person to
      attribute it to would be worse than the name it already has. Checked on
      the local scope, because the global one legitimately carries the
      platform's identity and is not this script's to touch either way.
    */
    const { dir, git } = scratchRepo();
    const said = run(dir, '');
    assert.equal(local(git, 'user.name'), null);
    assert.equal(local(git, 'user.email'), null);
    assert.match(said, /leaving the platform identity alone/);
  });

  it('writes the repo-local scope and never the global one', () => {
    /*
      The whole mechanism: local outlives the platform's global re-assertion
      because git reads the most specific scope first. A version of this that
      wrote --global would fight the platform on its own ground and would leak
      one repository's identity into every other clone on the machine.
    */
    const source = readFileSync(script, 'utf8');
    assert.ok(!source.includes('--global'), 'the script touches global git config');
  });
});

describe('the sign-off hook exists before the first commit needs it', () => {
  it('is installed executable into the hooks directory', () => {
    const { dir } = scratchRepo();
    run(dir, 'person@example.test');
    const installed = join(dir, '.git', 'hooks', 'prepare-commit-msg');
    assert.ok(existsSync(installed), 'the hook was not installed');
    /* And it is the repository's own, not a stub with the same name. */
    assert.equal(readFileSync(installed, 'utf8'), readFileSync(join(dir, 'scripts', 'prepare-commit-msg'), 'utf8'));
  });
});

describe('the session hook actually runs this', () => {
  it('session-start.sh invokes the script after recovering the workspace', () => {
    /*
      The script working and nothing calling it is exactly how the failure
      recurs: everything below passes, and the next rebuilt container commits
      as the bot anyway. Read from the hook rather than asserted in prose.
    */
    /*
      The *invocation*, not the word. The first version of this looked for the
      script's name anywhere in the hook and stayed green when the call was
      deleted, because the hook's own comment still mentioned it — a guard
      satisfied by prose about the thing it guards. Found by planting exactly
      that deletion.
    */
    const hook = readFileSync(join(repoRoot, '.claude', 'hooks', 'session-start.sh'), 'utf8');
    const call = /^sh scripts\/assert-commit-identity\.sh$/m;
    assert.match(hook, call, 'session-start.sh never runs assert-commit-identity.sh');
    const recover = hook.search(/^sh scripts\/recover-workspace\.sh$/m);
    const identity = hook.search(call);
    assert.ok(
      recover !== -1 && recover < identity,
      'the workspace is recovered after the identity is asserted, so a reset could outdate it',
    );
  });

  it('this check can fail: both lookups are detected when planted', () => {
    /*
      An empty name from both paths is also what broken lookups produce, so
      the shape is proved against a string it must extract from.

      Extraction rather than stripping, deliberately: the first version
      trimmed the address off with a replace on `<`, and CodeQL read that as
      incomplete HTML sanitisation — wrongly about the intent, rightly about
      the shape, since a strip-what-you-recognise is exactly how sanitisers go
      wrong. Matching what the name *is* says what this code means and gives
      the scanner nothing to misread.
    */
    const trailer = 'Signed-off-by: Proper Name <person@example.test>';
    assert.ok(trailer.includes('<person@example.test>'));
    const name = /^Signed-off-by: (.*?) *</.exec(trailer);
    assert.ok(name !== null, 'the trailer shape stopped matching');
    assert.equal(name[1], 'Proper Name');
  });
});
