import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { applyPlanEdit } from '@trazum/core';

import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum plan --edits` and `trazum verify` on an edit (#796).
 *
 * The plan names an edit to a tracked prompt file, made by the safe rules and
 * recorded by hash; it writes no file. `verify` reads the file and the newer
 * log. Hand figures, at the catalogue's $5 input and $25 output per MTok for
 * claude-opus-5: three calls of 2,000 input and 100 output tokens are
 * 6,000 x $5/M = $0.03 plus 300 x $25/M = $0.0075, so $0.0375, at 2,000 input
 * tokens a call. The newer log's 1,500 a call is shorter; its 2,500 is not.
 */

const PROMPT = await readFile(new URL('../../../examples/support-prompt.txt', import.meta.url), 'utf8');
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

const log = (inputPerCall, month = '08') =>
  [1, 2, 3]
    .map((day) => JSON.stringify({ model: 'claude-opus-5', label: 'support', ts: `2026-${month}-0${day}T09:00:00Z`, usage: { input_tokens: inputPerCall, output_tokens: 100 } }))
    .join('\n') + '\n';

const setup = async ({ labels = { support: 'prompts/support.txt' }, track = true } = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'trazum-plan-edits-'));
  git(['init', '-q', '.'], root);
  git(['config', 'user.email', 'test@example.com'], root);
  git(['config', 'user.name', 'Test Person'], root);
  git(['config', 'commit.gpgsign', 'false'], root);
  await mkdir(join(root, 'prompts'));
  await writeFile(join(root, 'prompts', 'support.txt'), PROMPT);
  await writeFile(join(root, 'prompts', 'other.txt'), PROMPT);
  await writeFile(join(root, 'trazum.config.json'), JSON.stringify({ labels }));
  if (track) {
    git(['add', '-A'], root);
    git(['commit', '-q', '-m', 'init'], root);
  }
  await writeFile(join(root, 'usage.jsonl'), log(2000));
  return root;
};

const run = (args, cwd) =>
  spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: SPAWN_ENV, timeout: 60000 });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

/** Every file under `root` but git's own, with its text: what a command left behind. */
const tree = async (root, prefix = '') => {
  const out = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(out, await tree(root, rel));
    else out[rel] = await readFile(join(root, rel), 'utf8');
  }
  return out;
};

describe('plan --edits', () => {
  it('names one edit to the tracked file, by hash, against the measured figure', async () => {
    const root = await setup();
    const result = run(['plan', 'usage.jsonl', '--edits', '-o', 'plan.json', '--markdown-out', 'plan.md'], root);
    assert.equal(result.status, 0, flat(result));
    const plan = JSON.parse(await readFile(join(root, 'plan.json'), 'utf8'));
    const edits = plan.actions.filter((a) => a.kind === 'edit-file');
    assert.equal(edits.length, 1);
    const [action] = edits;
    assert.equal(action.label, 'support');
    assert.equal(action.detail.edit.path, 'prompts/support.txt');
    assert.deepEqual(action.detail.edit.steps, ['trim']);
    assert.equal(action.detail.edit.level, 'safe');
    assert.equal(action.detail.edit.beforeSha256, sha256(PROMPT));
    // No saving projected, and the figure is the one the log measured.
    assert.equal(action.savingUsd, null);
    assert.equal(action.stakeUsd, null);
    assert.equal(action.detail.baseline.calls, 3);
    assert.equal(action.detail.baseline.inputPerCallTokens, 2000);
    // The promised text is what the safe rules make of the file, and nothing else.
    const made = applyPlanEdit(action.detail.edit, PROMPT, sha256);
    assert.equal(made.ok, true);
    assert.equal(sha256(made.text), action.detail.edit.afterSha256);
    assert.ok(made.text.length < PROMPT.length);

    const md = (await readFile(join(root, 'plan.md'), 'utf8')).replace(/\s+/g, ' ');
    assert.match(md, /prompts\/support\.txt: trimmed by the safe rules/);
    assert.match(md, /estimated, not measured; no saving is projected/);
    assert.match(md, /expected against \$0\.0375 over 3 calls at 2,000 input tokens a call, measured/);
    assert.match(md, /trazum verify reads the file/);
  });

  it('writes no file but the ones it was asked for', async () => {
    const root = await setup();
    const before = await tree(root);
    const result = run(['plan', 'usage.jsonl', '--edits', '--reorder', '-o', 'plan.json'], root);
    assert.equal(result.status, 0, flat(result));
    const after = await tree(root);
    delete after['plan.json'];
    assert.deepEqual(after, before, 'plan --edits changed a file in the tree');
  });

  it('skips a file git does not track, and says so', async () => {
    const root = await setup({ track: false });
    const result = run(['plan', 'usage.jsonl', '--edits', '-o', 'plan.json'], root);
    assert.equal(result.status, 0, flat(result));
    const plan = JSON.parse(await readFile(join(root, 'plan.json'), 'utf8'));
    assert.equal(plan.actions.filter((a) => a.kind === 'edit-file').length, 0);
    assert.match(flat(result), /git does not track prompts\/support\.txt/);
  });

  it('skips a label with no traffic, and says why', async () => {
    const root = await setup({ labels: { support: 'prompts/support.txt', ghost: 'prompts/other.txt' } });
    const result = run(['plan', 'usage.jsonl', '--edits'], root);
    assert.equal(result.status, 0, flat(result));
    assert.match(flat(result), /No edit for ghost \(prompts\/other\.txt\): the log has no priced call/);
  });

  it('keeps an edit under --min-usd, which is a floor on money an edit does not carry', async () => {
    const root = await setup();
    const result = run(['plan', 'usage.jsonl', '--edits', '--min-usd', '5', '--json'], root);
    assert.equal(result.status, 0, flat(result));
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.actions.filter((a) => a.kind === 'edit-file').length, 1, '--min-usd dropped an edit');
  });

  it('refuses --edits with no labels, and --reorder without --edits', async () => {
    const root = await setup({ labels: {} });
    const none = run(['plan', 'usage.jsonl', '--edits'], root);
    assert.equal(none.status, 1);
    assert.match(flat(none), /maps none: add "labels"/);
    const reorder = run(['plan', 'usage.jsonl', '--reorder'], root);
    assert.equal(reorder.status, 1);
    assert.match(flat(reorder), /add --edits/);
  });
});

describe('verify on an edit', () => {
  const planned = async () => {
    const root = await setup();
    const result = run(['plan', 'usage.jsonl', '--edits', '-o', 'plan.json'], root);
    assert.equal(result.status, 0, flat(result));
    const plan = JSON.parse(await readFile(join(root, 'plan.json'), 'utf8'));
    return { root, edit: plan.actions.find((a) => a.kind === 'edit-file').detail.edit };
  };
  const verify = (root, input) => {
    const result = run(['verify', 'plan.json', '--against', 'newer.jsonl', '--gate', '--json'], root);
    const json = JSON.parse(result.stdout.slice(0, result.stdout.lastIndexOf('}') + 1));
    return { result, verified: json.actions.find((a) => a.action.kind === 'edit-file'), input };
  };

  it('arrives when the file holds the promised text and the calls got shorter', async () => {
    const { root, edit } = await planned();
    const made = applyPlanEdit(edit, PROMPT, sha256);
    await writeFile(join(root, 'prompts', 'support.txt'), made.text);
    await writeFile(join(root, 'newer.jsonl'), log(1500, '09'));
    const { result, verified } = verify(root);
    assert.equal(verified.outcome, 'arrived');
    assert.equal(verified.observed.inputPerCallTokens, 1500);
    assert.equal(verified.gateFailing, false, flat(result));
  });

  it('did not arrive when the file still holds the text the plan was made from', async () => {
    const { root } = await planned();
    await writeFile(join(root, 'newer.jsonl'), log(1500, '09'));
    const { result, verified } = verify(root);
    assert.equal(verified.outcome, 'not-arrived');
    assert.equal(result.status, 1, 'an edit nobody made passed the gate');
  });

  it('did not arrive when the edit landed and the calls did not get shorter', async () => {
    const { root, edit } = await planned();
    await writeFile(join(root, 'prompts', 'support.txt'), applyPlanEdit(edit, PROMPT, sha256).text);
    await writeFile(join(root, 'newer.jsonl'), log(2500, '09'));
    const { result, verified } = verify(root);
    assert.equal(verified.outcome, 'not-arrived');
    assert.equal(result.status, 1);
  });

  it('cannot tell, and fails the gate, when the file moved on', async () => {
    const { root } = await planned();
    await writeFile(join(root, 'prompts', 'support.txt'), `${PROMPT}\nOne more line.\n`);
    await writeFile(join(root, 'newer.jsonl'), log(1500, '09'));
    const { result, verified } = verify(root);
    assert.equal(verified.outcome, 'cannot-tell');
    assert.equal(verified.reason, 'file-changed');
    assert.equal(result.status, 1);
  });
});
