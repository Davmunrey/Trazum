import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const HOOK = join(here, '..', '..', '..', 'scripts', 'pre-commit');
const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `scripts/pre-commit`.
 *
 * Two properties carry the whole design, and both are easy to get wrong in a way
 * that looks fine:
 *
 * 1. **It blocks only on prompts the commit touches.** `trazum check prompts/`
 *    would block a commit that touches one file because a different prompt,
 *    committed by somebody else last month, is over budget. A hook that fails for
 *    reasons outside the commit teaches people `--no-verify`, and then it is worse
 *    than no hook because it taught them the habit too.
 *
 * 2. **It names the files.** The first version announced "these prompts are over
 *    their token budget:" and printed nothing underneath — it tried to match path,
 *    tokens and maxTokens on one line, and `doctor --json` pretty-prints. It
 *    blocked the right commit and said nothing useful about why.
 *
 * The stub below is the point of the `TRAZUM` override: it lets the parsing be
 * tested against exact JSON rather than whatever a fixture happens to produce.
 */
function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

/** A repository with the hook installed, plus whatever files are given. */
async function repo(files = {}) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-hook-'));
  git(['init', '-q', '.'], root);
  git(['config', 'user.email', 'test@example.com'], root);
  git(['config', 'user.name', 'Test Person'], root);
  git(['config', 'commit.gpgsign', 'false'], root);
  git(['config', 'core.hooksPath', 'githooks'], root);

  await mkdir(join(root, 'githooks'), { recursive: true });
  const hook = await import('node:fs/promises').then((fs) => fs.readFile(HOOK, 'utf8'));
  await writeFile(join(root, 'githooks', 'pre-commit'), hook);
  await chmod(join(root, 'githooks', 'pre-commit'), 0o755);

  for (const [name, body] of Object.entries(files)) {
    const path = join(root, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }
  return root;
}

/** A fake `trazum` that answers `doctor . --json` with exactly this text. */
async function stub(root, json) {
  const path = join(root, 'fake-trazum.sh');
  await writeFile(path, `#!/bin/sh\ncat <<'EOF'\n${json}\nEOF\n`);
  await chmod(path, 0o755);
  return `sh ${path}`;
}

function commit(root, message, env = {}) {
  const result = spawnSync('git', ['commit', '-m', message], {
    cwd: root,
    encoding: 'utf8',
    env: { ...SPAWN_ENV, ...env },
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

const OVER = (path) => `{
  "root": ".",
  "prompts": 2,
  "unbudgeted": [],
  "overBudget": [
    {
      "path": "${path}",
      "tokens": 560,
      "maxTokens": 120,
      "pattern": "prompts/**"
    }
  ],
  "findings": []
}`;

const CLEAN = `{
  "root": ".",
  "prompts": 1,
  "unbudgeted": [],
  "overBudget": [],
  "findings": []
}`;

describe('the hook blocks on what the commit touches', () => {
  it('refuses a commit that stages an over-budget prompt, and names it', async () => {
    const root = await repo({ 'prompts/big.txt': 'padded\n' });
    const TRAZUM = await stub(root, OVER('prompts/big.txt'));
    git(['add', 'prompts/big.txt'], root);

    const { code, out } = commit(root, 'bad', { TRAZUM });
    assert.equal(code, 1, out);
    assert.match(out, /over their token budget/);
    assert.match(
      out,
      /^ {2}prompts\/big\.txt$/m,
      'the hook announced a list and did not name the file — the defect it shipped with',
    );
  });

  it('allows a commit that touches nothing over budget, even though something is', async () => {
    // The property that separates this from `trazum check prompts/`.
    const root = await repo({ 'prompts/big.txt': 'padded\n', 'NOTES.md': 'notes\n' });
    const TRAZUM = await stub(root, OVER('prompts/big.txt'));
    git(['add', 'NOTES.md'], root);

    const { code, out } = commit(root, 'unrelated', { TRAZUM });
    assert.equal(code, 0, out);
  });

  it('allows a commit when nothing is over budget', async () => {
    const root = await repo({ 'prompts/ok.txt': 'lean\n' });
    const TRAZUM = await stub(root, CLEAN);
    git(['add', 'prompts/ok.txt'], root);

    assert.equal(commit(root, 'fine', { TRAZUM }).code, 0);
  });

  it('reads paths only from the overBudget array', async () => {
    /**
     * A `path` key elsewhere in the document must not block a commit.
     *
     * The first draft grepped `"path"` out of the whole of `doctor --json`. That
     * works today because `overBudget` is the only section with one, and would
     * start refusing commits on the wrong files the moment another section gained
     * a `path` — a failure that would read as a Trazum bug rather than a hook bug.
     */
    const root = await repo({ 'prompts/ok.txt': 'lean\n' });
    const TRAZUM = await stub(
      root,
      `{
  "root": ".",
  "overBudget": [],
  "somethingElse": [
    {
      "path": "prompts/ok.txt"
    }
  ],
  "findings": []
}`,
    );
    git(['add', 'prompts/ok.txt'], root);

    const { code, out } = commit(root, 'fine', { TRAZUM });
    assert.equal(code, 0, `a path outside overBudget blocked the commit:\n${out}`);
  });
});

describe('the hook gets out of the way', () => {
  it('does nothing when no file is staged for content', async () => {
    const root = await repo({ 'prompts/big.txt': 'padded\n' });
    const TRAZUM = await stub(root, OVER('prompts/big.txt'));
    // Nothing added: git will refuse for its own reasons, and the hook must not
    // be the thing that spoke.
    const { out } = commit(root, 'empty', { TRAZUM });
    assert.doesNotMatch(out, /over their token budget/);
  });

  it('is disabled by TRAZUM_HOOK=0', async () => {
    const root = await repo({ 'prompts/big.txt': 'padded\n' });
    const TRAZUM = await stub(root, OVER('prompts/big.txt'));
    git(['add', 'prompts/big.txt'], root);

    assert.equal(commit(root, 'forced', { TRAZUM, TRAZUM_HOOK: '0' }).code, 0);
  });

  it('does not block when the survey cannot run', async () => {
    // A repository with no prompts, no config, an unreadable overlay: none of those
    // are a budget failure, and refusing somebody's commit over one would be a bug
    // that looks like a policy.
    const root = await repo({ 'prompts/big.txt': 'padded\n' });
    const failing = join(root, 'failing.sh');
    await writeFile(failing, '#!/bin/sh\necho "boom" >&2\nexit 1\n');
    await chmod(failing, 0o755);
    git(['add', 'prompts/big.txt'], root);

    const { code, out } = commit(root, 'survey broke', { TRAZUM: `sh ${failing}` });
    assert.equal(code, 0, out);
    assert.match(out, /could not survey/);
  });

  it('says so plainly when trazum cannot be found at all', async () => {
    const root = await repo({ 'prompts/big.txt': 'padded\n' });
    git(['add', 'prompts/big.txt'], root);

    /**
     * The machine's PATH with every directory holding a `trazum` taken out.
     *
     * Three wrong versions of this test came first, and all three were the test's
     * fault rather than the hook's. Emptying PATH breaks `git` itself, so the
     * assertion ran against a commit that never happened. Relying on the ambient
     * PATH passed standalone and failed under `npm test`, because npm puts this
     * workspace's own `trazum` bin on PATH. Then PATH was narrowed to the one
     * directory holding `git` — which is right only where `git` and `awk` happen
     * to live together: the hook pipes through `awk`, and on a machine whose git
     * comes from Homebrew that directory has no `awk` in it, so the hook died on
     * line 94 instead of reaching the branch under test.
     *
     * Subtracting is the version with nothing to enumerate. The test needs a PATH
     * that has everything the hook needs and no `trazum`, and that is what this
     * says, rather than a list of tools that goes stale the next time the hook
     * pipes through something new.
     */
    const withoutTrazum = (process.env.PATH ?? '')
      .split(delimiter)
      .filter((entry) => entry !== '' && !existsSync(join(entry, 'trazum')))
      .join(delimiter);
    assert.notEqual(withoutTrazum, '', 'nothing left on PATH: the hook cannot run at all');

    const { code, out } = commit(root, 'no trazum', { PATH: withoutTrazum, TRAZUM: '' });
    assert.equal(code, 0, out);
    assert.match(out, /not on PATH/);
  });
});

describe('the hook against the real CLI', () => {
  it('blocks a genuinely over-budget prompt end to end', async () => {
    // The stubs above pin the parsing; this pins that `doctor --json` really emits
    // the shape they assume. A hook tested only against its own fixtures is a hook
    // that agrees with itself.
    const root = await repo({
      'trazum.config.json': JSON.stringify({ budgets: { 'prompts/**': 120 } }),
      'prompts/big.txt': 'Please kindly classify {{t}}. '.repeat(40),
    });
    git(['add', '-A'], root);

    const { code, out } = commit(root, 'real', { TRAZUM: `node ${CLI}` });
    assert.equal(code, 1, out);
    assert.match(out, /^ {2}prompts\/big\.txt$/m);
  });

  it('and allows one inside its budget', async () => {
    const root = await repo({
      'trazum.config.json': JSON.stringify({ budgets: { 'prompts/**': 2000 } }),
      'prompts/ok.txt': 'Classify {{t}}. Answer with the category only.\n',
    });
    git(['add', '-A'], root);

    const { code, out } = commit(root, 'real ok', { TRAZUM: `node ${CLI}` });
    assert.equal(code, 0, out);
  });
});
