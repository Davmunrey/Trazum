import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const SCRIPT = join(repoRoot, 'scripts', 'recover-workspace.sh');
const HOOK = join(repoRoot, '.claude', 'hooks', 'session-start.sh');

/**
 * `scripts/recover-workspace.sh`.
 *
 * The environment this repository is developed in restored its container disk
 * to a stale snapshot roughly twenty times in one session — every tracked file
 * reverted, mid-work, silently. The script cannot prevent that (it reverts along
 * with everything else, and the first draft of it was destroyed by the exact
 * failure it repairs, one commit short of being safe); it makes recovery one
 * safe move instead of a confusing half-hour.
 *
 * Every test here drives the real script against a real git repository in a
 * temp directory, because the thing being tested is precisely its judgement
 * about git states: *when* it resets matters more than *that* it resets. A
 * recovery script that fires on the wrong state is a data-loss tool with a
 * reassuring name.
 */

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * A bare origin and a clone, with `main` at commit B and the clone wherever the
 * test needs it. No package-lock.json anywhere, deliberately: the script skips
 * the npm steps when there is no lockfile, which is what lets these fixtures
 * exercise the git logic without installing anything.
 */
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'trazum-recover-'));
  const origin = join(root, 'origin.git');
  const clone = join(root, 'clone');

  spawnSync('git', ['init', '--bare', '-b', 'main', origin], { encoding: 'utf8' });
  spawnSync('git', ['clone', origin, clone], { encoding: 'utf8' });
  git(clone, 'config', 'user.email', 'test@example.invalid');
  git(clone, 'config', 'user.name', 'test');

  await writeFile(join(clone, 'file.txt'), 'first\n');
  git(clone, 'add', '.');
  git(clone, 'commit', '-m', 'A');
  const a = git(clone, 'rev-parse', 'HEAD');

  await writeFile(join(clone, 'file.txt'), 'second\n');
  await writeFile(join(clone, 'added-later.txt'), 'exists at B\n');
  git(clone, 'add', '.');
  git(clone, 'commit', '-m', 'B');
  const b = git(clone, 'rev-parse', 'HEAD');

  git(clone, 'push', 'origin', 'main');
  return { clone, a, b };
}

const run = (cwd) => spawnSync('sh', [SCRIPT], { cwd, encoding: 'utf8' });

describe('the rollback signature: HEAD strictly behind origin/main', () => {
  it('resets the tree to origin/main', async () => {
    const { clone, a, b } = await fixture();
    // The rollback: the whole tree reverts to A, including files added at B.
    git(clone, 'reset', '--hard', a);
    assert.equal(git(clone, 'rev-parse', 'HEAD'), a, 'the fixture did not roll back');

    const result = run(clone);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(clone, 'rev-parse', 'HEAD'), b);
    assert.equal(await readFile(join(clone, 'file.txt'), 'utf8'), 'second\n');
    assert.equal(await readFile(join(clone, 'added-later.txt'), 'utf8'), 'exists at B\n');
    assert.match(result.stdout, /Resetting/);
  });

  it('stashes uncommitted work instead of discarding it', async () => {
    /**
     * A rollback usually leaves a clean tree, so a dirty one means somebody was
     * mid-edit. Their work has to survive the reset — in the stash, named, not
     * in the void. This is the difference between a recovery script and a
     * data-loss tool with a reassuring name.
     */
    const { clone, a, b } = await fixture();
    git(clone, 'reset', '--hard', a);
    await writeFile(join(clone, 'file.txt'), 'uncommitted edit\n');
    await writeFile(join(clone, 'brand-new.txt'), 'untracked work\n');

    const result = run(clone);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(clone, 'rev-parse', 'HEAD'), b);
    // The tree is origin/main's...
    assert.equal(await readFile(join(clone, 'file.txt'), 'utf8'), 'second\n');
    // ...and the work is in the stash, tracked and untracked alike.
    const stash = git(clone, 'stash', 'list');
    assert.match(stash, /recover-workspace/);
    const shown = git(clone, 'stash', 'show', '-u', '-p', 'stash@{0}');
    assert.match(shown, /uncommitted edit/);
    assert.match(shown, /untracked work/);
    assert.match(result.stdout, /stashed/);
  });
});

describe('everything that is not the signature is left alone', () => {
  it('a current tree: says so and stops', async () => {
    const { clone, b } = await fixture();
    const result = run(clone);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(clone, 'rev-parse', 'HEAD'), b);
    assert.match(result.stdout, /nothing to recover/);
  });

  it('a tree ahead of origin/main: that is work in progress, not damage', async () => {
    const { clone } = await fixture();
    await writeFile(join(clone, 'file.txt'), 'local progress\n');
    git(clone, 'add', '.');
    git(clone, 'commit', '-m', 'C, unpushed');
    const c = git(clone, 'rev-parse', 'HEAD');

    const result = run(clone);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(clone, 'rev-parse', 'HEAD'), c, 'an unpushed commit was destroyed');
    assert.equal(await readFile(join(clone, 'file.txt'), 'utf8'), 'local progress\n');
    assert.match(result.stdout, /work in progress/);
  });

  it('a diverged tree: refuses, loudly, and changes nothing', async () => {
    /**
     * Local commit C, remote commit D, no ancestor relation either way.
     * Choosing a side means throwing one of them away, and which one is not a
     * script's call. Exit 1 rather than a quiet 0: a hook running this should
     * know it did not end in a good state.
     */
    const { clone, a } = await fixture();
    git(clone, 'reset', '--hard', a);
    await writeFile(join(clone, 'file.txt'), 'diverged local\n');
    git(clone, 'add', '.');
    git(clone, 'commit', '-m', 'C, diverged');
    const c = git(clone, 'rev-parse', 'HEAD');

    const result = run(clone);
    assert.notEqual(result.status, 0, 'a diverged tree was accepted');
    assert.equal(git(clone, 'rev-parse', 'HEAD'), c, 'a diverged tree was modified');
    assert.match(result.stderr, /diverged/);
  });
});

describe('what the fixtures cannot exercise, asserted on the source', () => {
  /**
   * The fixtures are bare git repositories with no package to install, so the
   * npm steps never run in them — and a mutation run deleting those steps would
   * survive every behavioural test above. Asserted on the comment-stripped
   * source instead: after a rollback the installed tree matches a lockfile that
   * no longer exists, and a recovery that leaves `node_modules` drifted has
   * repaired half the problem.
   */
  const code = readFileSync(SCRIPT, 'utf8').replace(/^[ \t]*#.*$/gm, '');

  it('reinstalls from the lockfile and rebuilds after a reset', () => {
    assert.match(code, /npm ci --ignore-scripts/);
    assert.match(code, /npm run build/);
    // In that order, and after the reset: an install before the reset installs
    // the rolled-back lockfile.
    const reset = code.indexOf('git reset --hard origin/main');
    assert.ok(reset !== -1, 'the reset has moved — update this test');
    assert.ok(code.indexOf('npm ci') > reset, 'npm ci runs before the reset');
  });

  it('never force-pushes, force-checkouts or touches the remote', () => {
    // The script repairs the local tree from the remote, never the other way
    // around. A recovery tool that can write to origin is a much worse failure
    // waiting for a much better moment.
    assert.ok(!code.includes('git push'), 'the recovery script pushes');
    assert.ok(!/--force/.test(code), 'the recovery script forces something');
  });
});

describe('the SessionStart hook that runs it', () => {
  const hook = readFileSync(HOOK, 'utf8');
  const hookCode = hook.replace(/^[ \t]*#.*$/gm, '');

  it('runs only in Claude Code on the web', () => {
    // On a local machine the working tree is the developer's own, resets are
    // not this hook's call, and nobody asked for an npm install.
    assert.match(hookCode, /CLAUDE_CODE_REMOTE/);
  });

  it('invokes the recovery script before anything else touches the tree', () => {
    assert.match(hookCode, /recover-workspace\.sh/);
  });

  it('is registered in .claude/settings.json', () => {
    const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
    const entries = settings.hooks?.SessionStart?.flatMap((group) => group.hooks) ?? [];
    assert.ok(
      entries.some((entry) => entry.command?.includes('session-start.sh')),
      'the hook exists and nothing runs it',
    );
  });
});

describe('the fetch is load-bearing, not ceremony', () => {
  it('recovers even when the remote-tracking ref rolled back too', async () => {
    /**
     * The snapshot restore reverts `.git` along with the working tree, so
     * `refs/remotes/origin/main` points at the stale commit as well. A script
     * that compared HEAD to the *ref* would see them equal and announce there
     * is nothing to recover — while origin, the one thing the rollback cannot
     * touch, is far ahead. This fixture builds exactly that state: the clone
     * has never seen commit B, and only a real fetch can reveal it.
     */
    const root = await mkdtemp(join(tmpdir(), 'trazum-recover-fetch-'));
    const origin = join(root, 'origin.git');
    const writer = join(root, 'writer');
    const workspace = join(root, 'workspace');

    spawnSync('git', ['init', '--bare', '-b', 'main', origin], { encoding: 'utf8' });
    spawnSync('git', ['clone', origin, writer], { encoding: 'utf8' });
    git(writer, 'config', 'user.email', 'test@example.invalid');
    git(writer, 'config', 'user.name', 'test');
    await writeFile(join(writer, 'file.txt'), 'first\n');
    git(writer, 'add', '.');
    git(writer, 'commit', '-m', 'A');
    git(writer, 'push', 'origin', 'main');

    // The workspace clones at A: its origin/main ref says A and always has.
    spawnSync('git', ['clone', origin, workspace], { encoding: 'utf8' });
    const a = git(workspace, 'rev-parse', 'HEAD');

    // Origin moves on without the workspace hearing about it.
    await writeFile(join(writer, 'file.txt'), 'second\n');
    git(writer, 'add', '.');
    git(writer, 'commit', '-m', 'B');
    git(writer, 'push', 'origin', 'main');
    const b = git(writer, 'rev-parse', 'HEAD');
    assert.equal(git(workspace, 'rev-parse', 'origin/main'), a, 'the fixture leaked the fetch');

    const result = run(workspace);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(workspace, 'rev-parse', 'HEAD'), b, 'the stale remote-tracking ref won');
  });
});
