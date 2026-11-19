import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { PROVIDER_REVIEWED } from '@trazum/core';

import { volumeFor } from '../dist/base-cost.js';
import { commitOf } from '../dist/git.js';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum check --base <ref>` (#785): each changed prompt's tokens and cost
 * on the base branch and on the head, against a fixture repository with a
 * base commit and a head commit.
 *
 * The expected table is worked out by hand here, never read back from the
 * report. The token counts come from the estimator's rule for a word: one
 * token for a word of four letters ("word"), nothing for a space, and one
 * for a single newline. So `words(n)`, which is n - 1 words and a newline,
 * is n tokens. The price is claude-opus-5's input price in the catalogue,
 * $5 per million tokens, read on Anthropic's review date.
 *
 *   prompts/support.txt  1,000 -> 2,000 tokens, label support, 30,000 calls a month
 *     base: 1,000 x $5 / 1,000,000 = $0.005 a call, x 30,000 = $150.00 a month
 *     head: 2,000 x $5 / 1,000,000 = $0.010 a call, x 30,000 = $300.00 a month
 *     change: +$150.00 a month
 *   prompts/triage.txt   400 -> 200 tokens, label triage, no volume stated
 *     base: 400 x $5 / 1,000,000 = $0.002 a call; head $0.001; change -$0.001 a call
 *   prompts/old.txt      500 tokens, removed, no label
 *     base: 500 x $5 / 1,000,000 = $0.0025 a call; head absent
 *   prompts/new.txt      100 tokens, added, label fresh, 1,000 calls a month
 *     head: 100 x $5 / 1,000,000 = $0.0005 a call, x 1,000 = $0.50 a month
 *   prompts/same.txt     50 tokens on both sides: unchanged, not listed
 *   prompts/.drafts/x.txt  in a directory the walk skips: not a prompt on either side
 *
 *   With a stated volume: base $150.00, head $300.00 + $0.50 = $300.50,
 *   change +$150.50. A limit of $100 is breached; a limit of $200 is not.
 */

const words = (n) => `${'word '.repeat(n - 2)}word\n`;

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

const CONFIG = {
  usage: { model: 'claude-opus-5' },
  budgets: { 'prompts/**': 100000 },
  labels: { support: 'prompts/support.txt', triage: 'prompts/triage.txt', fresh: 'prompts/new.txt' },
  volumes: { support: 30000, fresh: 1000 },
};

/** A repository whose `main` is the base and whose `feature` is the head, checked out. */
async function fixture({ config = CONFIG } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-check-base-'));
  git(['init', '-q', '.'], root);
  git(['config', 'user.email', 'test@example.com'], root);
  git(['config', 'user.name', 'Test Person'], root);
  git(['config', 'commit.gpgsign', 'false'], root);
  git(['checkout', '-q', '-b', 'main'], root);
  await mkdir(join(root, 'prompts', '.drafts'), { recursive: true });
  await writeFile(join(root, 'prompts', 'support.txt'), words(1000));
  await writeFile(join(root, 'prompts', 'triage.txt'), words(400));
  await writeFile(join(root, 'prompts', 'old.txt'), words(500));
  await writeFile(join(root, 'prompts', 'same.txt'), words(50));
  await writeFile(join(root, 'prompts', '.drafts', 'x.txt'), words(300));
  await writeFile(join(root, 'trazum.config.json'), JSON.stringify(config));
  git(['add', '-A'], root);
  git(['commit', '-q', '-m', 'base'], root);

  git(['checkout', '-q', '-b', 'feature'], root);
  await writeFile(join(root, 'prompts', 'support.txt'), words(2000));
  await writeFile(join(root, 'prompts', 'triage.txt'), words(200));
  await rm(join(root, 'prompts', 'old.txt'));
  await rm(join(root, 'prompts', '.drafts', 'x.txt'));
  await writeFile(join(root, 'prompts', 'new.txt'), words(100));
  git(['add', '-A'], root);
  git(['commit', '-q', '-m', 'head'], root);
  return root;
}

const run = (args, cwd) =>
  spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: SPAWN_ENV, timeout: 60000 });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

/** Money compared to the hundredth of a cent, which is the finest figure printed. */
const close = (actual, expected, what) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);

describe('check --base: the cost of each changed prompt against the base branch', () => {
  it('gives the table worked out by hand', async () => {
    const root = await fixture();
    const result = run(['check', 'prompts', '--base', 'main', '--json'], root);
    assert.equal(result.status, 0, flat(result));
    const report = JSON.parse(result.stdout).againstBase;
    assert.equal(report.status, 'compared');
    assert.equal(report.sha, git(['rev-parse', 'main'], root).trim(), 'the base is the commit main names');

    const ids = report.rows.map((row) => row.id);
    assert.deepEqual(ids, ['prompts/new.txt', 'prompts/old.txt', 'prompts/support.txt', 'prompts/triage.txt']);
    assert.equal(report.unchanged, 1, 'same.txt is unchanged');
    const row = (id) => report.rows.find((r) => r.id === id);

    const support = row('prompts/support.txt');
    assert.equal(support.base.tokens, 1000, 'the base side was not read from the base commit');
    assert.equal(support.head.tokens, 2000);
    assert.equal(support.callsPerMonth, 30000);
    assert.deepEqual(support.labels, ['support']);
    close(support.base.monthlyUsd, 150, 'support base a month');
    close(support.head.monthlyUsd, 300, 'support head a month');
    close(support.monthlyChangeUsd, 150, 'support change a month');
    assert.equal(support.base.inputPerMTok, 5);
    assert.equal(support.head.inputPerMTok, 5);

    const triage = row('prompts/triage.txt');
    assert.equal(triage.base.tokens, 400);
    assert.equal(triage.head.tokens, 200);
    assert.equal(triage.callsPerMonth, null, 'a volume nobody stated was invented');
    assert.equal(triage.base.monthlyUsd, null, 'a prompt with no volume was given a month');
    assert.equal(triage.head.monthlyUsd, null);
    assert.equal(triage.monthlyChangeUsd, null);
    close(triage.base.perCallUsd, 0.002, 'triage base a call');
    close(triage.head.perCallUsd, 0.001, 'triage head a call');
    close(triage.perCallChangeUsd, -0.001, 'triage change a call');

    const old = row('prompts/old.txt');
    assert.equal(old.base.tokens, 500);
    assert.equal(old.head, null);
    assert.equal(old.callsPerMonth, null);
    close(old.base.perCallUsd, 0.0025, 'old base a call');

    const fresh = row('prompts/new.txt');
    assert.equal(fresh.base, null);
    assert.equal(fresh.head.tokens, 100);
    assert.equal(fresh.callsPerMonth, 1000);
    close(fresh.head.monthlyUsd, 0.5, 'new head a month');

    close(report.totals.baseUsd, 150, 'total base');
    close(report.totals.headUsd, 300.5, 'total head');
    close(report.totals.changeUsd, 150.5, 'total change');
    assert.equal(report.perCallOnly, 2);
    assert.equal(report.gate, null, 'no gate was asked for');
  });

  it('names the price behind every figure and the date it was read', async () => {
    const root = await fixture();
    const result = run(['check', 'prompts', '--base', 'main', '--markdown-out', 'report.md', '--json'], root);
    assert.equal(result.status, 0, flat(result));
    const report = JSON.parse(result.stdout).againstBase;
    assert.equal(report.price.model, 'claude-opus-5');
    assert.equal(report.price.provider, 'anthropic');
    assert.equal(report.price.readOn, PROVIDER_REVIEWED.anthropic, 'the date is the provider\'s review date');
    assert.equal(report.modelFrom, 'config');

    const markdown = await readFile(join(root, 'report.md'), 'utf8');
    const rows = markdown.split('\n').filter((line) => /^\| .* \| <code>prompts\//.test(line) && line.includes('→'));
    assert.equal(rows.length, 4, `expected four rows in the base table:\n${markdown}`);
    for (const line of rows) {
      assert.ok(line.includes('$5.00'), `a row without its price: ${line}`);
      assert.ok(line.includes(PROVIDER_REVIEWED.anthropic), `a row without the date its price was read: ${line}`);
    }
    // The figures, as the hand arithmetic above prints them.
    const support = rows.find((line) => line.includes('support.txt'));
    assert.match(support, /1,000 → 2,000 \| 30,000 \| \$150\.00 .* \| \$300\.00 .* \| \+\$150\.00 /);
    const triage = rows.find((line) => line.includes('triage.txt'));
    assert.match(triage, /400 → 200 \| [^|$0-9]+ \| \$0\.00200 [^|]* \| \$0\.00100 [^|]* \| -\$0\.00100 /);
    assert.ok(markdown.includes('$300.50') && markdown.includes('+$150.50'), 'the totals are missing');
  });

  it('fails the build when the monthly increase is over the limit, and only then', async () => {
    const root = await fixture();
    const over = run(['check', 'prompts', '--base', 'main', '--max-monthly-increase-usd', '100', '--json'], root);
    assert.equal(over.status, 1, flat(over));
    const breached = JSON.parse(over.stdout).againstBase.gate;
    assert.deepEqual(breached, { maxIncreaseUsd: 100, breached: true });

    const within = run(['check', 'prompts', '--base', 'main', '--max-monthly-increase-usd', '200', '--json'], root);
    assert.equal(within.status, 0, flat(within));
    assert.deepEqual(JSON.parse(within.stdout).againstBase.gate, { maxIncreaseUsd: 200, breached: false });

    // At the limit exactly is not over it.
    const at = run(['check', 'prompts', '--base', 'main', '--max-monthly-increase-usd', '150.5', '--json'], root);
    assert.equal(at.status, 0, flat(at));
  });

  it('reads one file against the base the same way', async () => {
    const root = await fixture();
    const result = run(['check', 'prompts/support.txt', '--base', 'main', '--json'], root);
    assert.equal(result.status, 0, flat(result));
    const report = JSON.parse(result.stdout).againstBase;
    assert.deepEqual(report.rows.map((row) => [row.id, row.base.tokens, row.head.tokens]), [['prompts/support.txt', 1000, 2000]]);
  });

  it('says the base is not in the checkout rather than reading the head in its place, and a gate on it fails', async () => {
    const root = await fixture();
    const missing = '0123456789abcdef0123456789abcdef01234567';
    const plain = run(['check', 'prompts', '--base', missing, '--json'], root);
    assert.equal(plain.status, 0, flat(plain));
    assert.deepEqual(JSON.parse(plain.stdout).againstBase, { status: 'unavailable', ref: missing, why: 'no-commit', gate: null });

    const gated = run(['check', 'prompts', '--base', missing, '--max-monthly-increase-usd', '1000', '--json'], root);
    assert.equal(gated.status, 1, `a gate that judged nothing passed: ${flat(gated)}`);
  });

  it('refuses a ref shaped like an option, and a gate with no base', async () => {
    const root = await fixture();
    const dashed = run(['check', 'prompts', '--base', '--upload-pack=x', '--json'], root);
    // The parser takes the next word as the value; git never sees it as an option.
    assert.equal(JSON.parse(dashed.stdout).againstBase.why, 'no-commit', flat(dashed));

    const gateOnly = run(['check', 'prompts', '--max-monthly-increase-usd', '5'], root);
    assert.equal(gateOnly.status, 1);
    assert.match(flat(gateOnly), /--base/);
  });
});

describe('the volume a prompt is priced at', () => {
  const labels = { a: 'prompts/one.txt', b: './prompts/one.txt', c: 'prompts/two.txt', d: 'src/app.ts' };

  it('adds up every label that sends the file, and gives none when one of them states none', () => {
    assert.deepEqual(volumeFor({ file: 'prompts/one.txt', embedded: false }, labels, { a: 100, b: 20 }, '/repo'), {
      calls: 120,
      labels: ['a', 'b'],
    });
    assert.equal(volumeFor({ file: 'prompts/one.txt', embedded: false }, labels, { a: 100 }, '/repo'), null);
    assert.equal(volumeFor({ file: 'prompts/three.txt', embedded: false }, labels, { a: 100 }, '/repo'), null);
  });

  it('gives a prompt marked inside a source file none, whatever its file states', () => {
    assert.equal(volumeFor({ file: 'src/app.ts', embedded: true }, labels, { d: 500 }, '/repo'), null);
  });
});

describe('the base ref never reaches git as an option', () => {
  it('refuses a ref that starts with a dash before running anything', () => {
    let spawned = 0;
    const spawn = () => {
      spawned++;
      return { status: 0, stdout: `${'a'.repeat(40)}\n`, stderr: '' };
    };
    assert.equal(commitOf('--upload-pack=touch /tmp/x', '/', spawn), null);
    assert.equal(commitOf('-x', '/', spawn), null);
    assert.equal(spawned, 0, 'git was run with a ref shaped like an option');
    assert.equal(commitOf('main', '/', spawn), 'a'.repeat(40));
  });
});

describe('volumes in trazum.config.json', () => {
  it('refuses a volume for a label that maps no prompt file', async () => {
    const root = await fixture({ config: { ...CONFIG, volumes: { nobody: 10 } } });
    const result = run(['check', 'prompts', '--base', 'main'], root);
    assert.equal(result.status, 1);
    assert.match(flat(result), /volumes\["nobody"\]/);
  });

  it('refuses a negative volume', async () => {
    const root = await fixture({ config: { ...CONFIG, volumes: { support: -1 } } });
    const result = run(['check', 'prompts', '--base', 'main'], root);
    assert.equal(result.status, 1);
    assert.match(flat(result), /volumes\["support"\]/);
  });
});
