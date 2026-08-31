import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

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

/** Run the hook against a message file, as git would. */
function runHook(text, source) {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-signoff-'));
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, text);
  execFileSync(hook, source === undefined ? [file] : [file, source], {
    cwd: repoRoot,
    encoding: 'utf8',
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
    const dir = mkdtempSync(join(tmpdir(), 'trazum-signoff-off-'));
    const file = join(dir, 'COMMIT_EDITMSG');
    writeFileSync(file, message);
    execFileSync(hook, [file], { cwd: repoRoot, env: { ...process.env, TRAZUM_SIGNOFF_HOOK: '0' } });
    assert.equal(readFileSync(file, 'utf8'), message);
  });

  it('is documented beside the hook that was already here', () => {
    /* `scripts/pre-commit` has an install line in docs/ci.md. A second hook
       nobody is told about is a second hook nobody installs. */
    const ci = readFileSync(join(repoRoot, 'docs', 'ci.md'), 'utf8');
    assert.match(ci, /prepare-commit-msg/, 'docs/ci.md does not mention the hook');
  });
});
