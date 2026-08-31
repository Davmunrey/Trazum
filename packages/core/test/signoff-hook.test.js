import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from '../../cli/test/env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const hook = join(repoRoot, 'scripts', 'prepare-commit-msg');

/**
 * The hook that keeps a branch mergeable, held to the check that decides it.
 *
 * `.github/workflows/dco.yml` requires every non-merge commit in a pull request
 * to carry a `Signed-off-by` trailer, and it is a **required** check. So one
 * commit made without `-s` cannot be fixed by adding the trailer to a later
 * one, or by reverting: the workflow walks `base..head` and the offending
 * commit is still in that range. The only fix is rewriting history and
 * force-pushing, which is a large price for forgetting a flag once. This file
 * is why that stops happening.
 *
 * **The regex is read out of the workflow rather than restated here.** A hook
 * that wrote a trailer the check does not accept would be worse than no hook —
 * it would look like the problem was solved. So the two cannot disagree about
 * what a trailer looks like: this test takes the pattern from the file that
 * enforces it and asserts the hook's own output matches.
 */

/** The pattern the workflow greps for, read from the workflow. */
function required() {
  const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'dco.yml'), 'utf8');
  const match = /grep -qiE '([^']+)'/.exec(workflow);
  assert.ok(match, 'the DCO workflow no longer greps for a pattern this test can read');
  /*
    POSIX `[[:space:]]` is what `grep -E` speaks and JavaScript does not.
    Translated rather than hand-copied, so the only thing this file decides is
    the dialect and never the pattern.
  */
  return new RegExp(match[1].replaceAll('[[:space:]]', '\\s'), 'im');
}

/**
 * A repository with an identity of its own, so this test does not depend on
 * whoever is running it.
 *
 * The first version ran the hook against `repoRoot` and passed on a laptop and
 * failed in CI, which is the more useful of the two answers: `actions/checkout`
 * configures no `user.name`, the hook correctly declines to invent one, and the
 * test was reading the machine rather than the hook. A throwaway repository is
 * the only way to ask "what does it write" without also asking "who is asking".
 */
function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-signoff-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '--quiet');
  git('config', 'user.name', 'A Contributor');
  git('config', 'user.email', 'contributor@example.com');
  return dir;
}

/** Run the hook against a message file, as git would. */
function runHook(text, source, env = {}) {
  const dir = scratchRepo();
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, text);
  execFileSync(hook, source === undefined ? [file] : [file, source], {
    cwd: dir,
    encoding: 'utf8',
    /*
      `SPAWN_ENV` rather than `process.env` spread inline, which `i18n.test.js`
      caught this file doing. Nothing here reads a locale, but the guard is not
      about this file: five hand-rolled variants of that object had grown across
      the suite before it existed, and the one that mattered was always the one
      somebody wrote by hand because their case looked too simple to need it.
    */
    env: { ...SPAWN_ENV, ...env },
  });
  return readFileSync(file, 'utf8');
}

const trailers = (text) => [...text.matchAll(/^Signed-off-by: /gim)].length;

describe('the sign-off hook and the check that requires it', () => {
  it('writes a trailer the workflow accepts', () => {
    const out = runHook('A commit message\n\nWith a body.\n');
    const line = out.split('\n').find((entry) => /^Signed-off-by: /i.test(entry));
    assert.ok(line, 'the hook added no trailer at all');
    assert.match(line, required());
  });

  it('and the check really would reject a message without one', () => {
    /* The guard on the guard: a pattern that matched anything would make the
       assertion above true of a hook that wrote nothing useful. */
    assert.equal(required().test('A commit message with no trailer'), false);
  });

  it('never adds a second trailer', () => {
    /*
      Idempotence matters more than it looks. `git commit --amend`, a rebase
      and an editor re-run all put the same message back through this hook, and
      a message carrying the trailer twice is a message somebody has to clean
      up by hand — which is the friction that gets a hook uninstalled.
    */
    const once = runHook('A commit message\n');
    const twice = runHook(once);
    assert.equal(trailers(twice), 1, `the trailer appears ${trailers(twice)} times`);
  });

  it('leaves a message that was already signed by hand exactly as it is', () => {
    const signed = 'A commit message\n\nSigned-off-by: Somebody Else <somebody@example.com>\n';
    assert.equal(runHook(signed), signed);
  });

  it('skips a merge, because the workflow skips merges', () => {
    /*
      The two have to agree about which commits need a trailer, not only about
      what one looks like. GitHub writes merge commits itself and the workflow
      exempts them; a hook that signed them anyway would be adding a line to a
      message nobody wrote, for a check that was never going to read it.
    */
    const message = 'Merge branch main into a feature branch\n';
    assert.equal(runHook(message, 'merge'), message);
  });

  it('and the workflow really does skip them, which is why the hook may', () => {
    const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'dco.yml'), 'utf8');
    assert.match(workflow, /--no-merges/, 'the workflow no longer exempts merge commits');
  });

  it('can be switched off, and says so where somebody would look', () => {
    /* An escape hatch that is not documented is an escape hatch people find by
       deleting the hook. */
    const source = readFileSync(hook, 'utf8');
    assert.match(source, /TRAZUM_SIGNOFF_HOOK/);
    const message = 'A commit message\n';
    assert.equal(runHook(message, undefined, { TRAZUM_SIGNOFF_HOOK: '0' }), message);
  });

  it('declines quietly when there is no identity to sign with', () => {
    /*
      What CI found. `actions/checkout` configures no `user.name`, and a hook
      that guessed one would put a stranger's name in somebody's commit. Git is
      about to refuse this commit itself with a better message than anything
      here could print, so the hook stays out of the way rather than failing
      first and sending somebody to look in the wrong place.
    */
    const dir = mkdtempSync(join(tmpdir(), 'trazum-signoff-bare-'));
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
    const file = join(dir, 'COMMIT_EDITMSG');
    const message = 'A commit message\n';
    writeFileSync(file, message);
    /*
      `HOME` and `XDG_CONFIG_HOME` point at the empty directory so a global
      identity on the machine running this cannot answer for the repository.
    */
    execFileSync(hook, [file], {
      cwd: dir,
      env: { ...SPAWN_ENV, HOME: dir, XDG_CONFIG_HOME: dir, GIT_CONFIG_GLOBAL: '/dev/null' },
    });
    assert.equal(readFileSync(file, 'utf8'), message);
  });

  it('is documented beside the hook that was already here', () => {
    /* `scripts/pre-commit` has an install line in docs/ci.md. A second hook
       nobody is told about is a second hook nobody installs. */
    const ci = readFileSync(join(repoRoot, 'docs', 'ci.md'), 'utf8');
    assert.match(ci, /prepare-commit-msg/, 'docs/ci.md does not mention the hook');
  });
});
