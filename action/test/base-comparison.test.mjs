import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { renderCheckMarkdown } from '../../packages/cli/dist/markdown.js';
import { getCliMessages } from '../../packages/cli/dist/i18n/index.js';
import { postComment } from '../post-comment.mjs';

/**
 * The Action's half of #785: on a pull request the check step hands the
 * CLI the base commit, and the monthly increase gate is refused where it
 * could judge nothing.
 *
 * The step's own script is run, with bash, against a stand-in for the CLI
 * that writes down the arguments it was given. Reading the YAML for a
 * pattern would pass a script that never ran; this runs it.
 */

const action = readFileSync(new URL('../../action.yml', import.meta.url), 'utf8');
const steps = action.split(/\n {4}- name: /).slice(1);
const check = steps.find((step) => step.startsWith('Check the budget'));
const script = (() => {
  const at = check.indexOf('      run: |\n');
  assert.ok(at > 0, 'the check step has no run block');
  return check
    .slice(at + '      run: |\n'.length)
    .split('\n')
    .map((line) => line.replace(/^ {8}/, ''))
    .join('\n');
})();

/** Runs the check step with these inputs, as their environment variables. */
function runStep(env) {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-action-base-'));
  const cliDir = join(dir, 'packages', 'cli', 'dist');
  mkdirSync(cliDir, { recursive: true });
  const argvFile = join(dir, 'argv.json');
  writeFileSync(
    join(cliDir, 'index.js'),
    `require('node:fs').writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));\n`,
  );
  writeFileSync(join(dir, 'package.json'), '{"type":"commonjs"}');
  const output = join(dir, 'output');
  writeFileSync(output, '');
  const blank = Object.fromEntries(
    [...check.matchAll(/^ {8}(TRAZUM_[A-Z_]+):/gm)].map((match) => [match[1], '']),
  );
  const result = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      ...blank,
      TRAZUM_PLAN_PULL_REQUEST: 'false',
      TRAZUM_ACTION_PATH: dir,
      RUNNER_TEMP: dir,
      GITHUB_OUTPUT: output,
      ...env,
    },
  });
  let argv = null;
  try {
    argv = JSON.parse(readFileSync(argvFile, 'utf8'));
  } catch {
    argv = null;
  }
  return { result, argv, outcome: /outcome=(\d+)/.exec(readFileSync(output, 'utf8'))?.[1] ?? null };
}

const SHA = '0123456789abcdef0123456789abcdef01234567';

describe('the check step on a pull request', () => {
  it('declares the base commit from the event, as a bare environment assignment', () => {
    assert.match(check, /^ {8}TRAZUM_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}$/m);
    assert.match(check, /^ {8}TRAZUM_MAX_MONTHLY_INCREASE_USD: \$\{\{ inputs\.max-monthly-increase-usd \}\}$/m);
  });

  it('hands the CLI the base commit, and the limit when one is set', () => {
    const { argv, outcome } = runStep({ TRAZUM_TARGET: 'prompts', TRAZUM_BASE_SHA: SHA, TRAZUM_MAX_MONTHLY_INCREASE_USD: '25' });
    assert.equal(outcome, '0');
    assert.ok(argv, 'the CLI was not run');
    assert.equal(argv[0], 'check');
    assert.deepEqual(argv.slice(argv.indexOf('--base'), argv.indexOf('--base') + 2), ['--base', SHA]);
    assert.deepEqual(
      argv.slice(argv.indexOf('--max-monthly-increase-usd'), argv.indexOf('--max-monthly-increase-usd') + 2),
      ['--max-monthly-increase-usd', '25'],
    );
  });

  it('compares without a limit when the base commit is in the checkout', () => {
    const present = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const { argv } = runStep({ TRAZUM_TARGET: 'prompts', TRAZUM_BASE_SHA: present });
    assert.ok(argv?.includes('--base'), `the base in the checkout was not compared: ${argv?.join(' ')}`);
  });

  it('says nothing about the base when it is not in the checkout and no limit asked for it', () => {
    const { argv } = runStep({ TRAZUM_TARGET: 'prompts', TRAZUM_BASE_SHA: SHA });
    assert.ok(argv !== null && !argv.includes('--base'), `a shallow checkout was handed a base it does not hold: ${argv?.join(' ')}`);
  });

  it('adds no base off a pull request', () => {
    const { argv } = runStep({ TRAZUM_TARGET: 'prompts' });
    assert.ok(argv, 'the CLI was not run');
    assert.ok(!argv.includes('--base'), `a base appeared from nowhere: ${argv.join(' ')}`);
    assert.ok(!argv.includes('--max-monthly-increase-usd'));
  });

  it('refuses the limit off a pull request, and with a usage log, without running the CLI', () => {
    const offPr = runStep({ TRAZUM_TARGET: 'prompts', TRAZUM_MAX_MONTHLY_INCREASE_USD: '25' });
    assert.equal(offPr.outcome, '1');
    assert.equal(offPr.argv, null);

    const withLog = runStep({ TRAZUM_USAGE_LOG: 'usage.jsonl', TRAZUM_BASE_SHA: SHA, TRAZUM_MAX_MONTHLY_INCREASE_USD: '25' });
    assert.equal(withLog.outcome, '1');
    assert.equal(withLog.argv, null);

    for (const mode of [{ TRAZUM_WEEKLY_SUMMARY: 'issue' }, { TRAZUM_PLAN_PULL_REQUEST: 'true' }]) {
      const mixed = runStep({ TRAZUM_USAGE_LOG: 'usage.jsonl', TRAZUM_MAX_MONTHLY_INCREASE_USD: '25', ...mode });
      assert.equal(mixed.outcome, '1', `${Object.keys(mode)[0]} with the limit was not refused`);
      assert.equal(mixed.argv, null);
    }
  });
});

describe('the base table reaches the pull request as one comment', () => {
  it('is posted once and updated in place on the next push', async () => {
    const t = getCliMessages('en');
    const report = renderCheckMarkdown({
      target: 'prompts',
      verdicts: [{ path: 'prompts/a.txt', tokens: 2000, maxTokens: 5000, pattern: 'prompts/**', optimizedTokens: null }],
      level: 'safe',
      tokenSource: 'heuristic',
      band: 6,
      truncated: false,
      againstBase: {
        status: 'compared',
        ref: SHA,
        sha: SHA,
        price: { model: 'claude-opus-5', displayName: 'Claude Opus 5', provider: 'anthropic', overlaid: false, readOn: '2026-11-16', promoUntil: null },
        modelFrom: 'config',
        rows: [
          {
            id: 'prompts/a.txt',
            base: { tokens: 1000, inputPerMTok: 5, perCallUsd: 0.005, monthlyUsd: 150 },
            head: { tokens: 2000, inputPerMTok: 5, perCallUsd: 0.01, monthlyUsd: 300 },
            callsPerMonth: 30000,
            labels: ['a'],
            perCallChangeUsd: 0.005,
            monthlyChangeUsd: 150,
          },
        ],
        unchanged: 0,
        totals: { baseUsd: 150, headUsd: 300, changeUsd: 150 },
        perCallOnly: 0,
        gate: null,
      },
      t,
    });

    const store = new Map();
    const requests = [];
    const fetchImpl = async (url, init = {}) => {
      const method = init.method ?? 'GET';
      requests.push(method);
      const reply = (status, value) => ({ ok: status < 300, status, json: async () => value, text: async () => '' });
      if (method === 'GET') return reply(200, [...store.values()]);
      if (method === 'POST') {
        const id = store.size + 1;
        store.set(id, { id, body: JSON.parse(init.body).body, user: { type: 'Bot' } });
        return reply(201, { id });
      }
      const id = Number(url.split('/').pop());
      store.set(id, { ...store.get(id), body: JSON.parse(init.body).body });
      return reply(200, { id });
    };
    const post = () =>
      postComment({
        env: {
          GITHUB_API_URL: 'https://api.example',
          GITHUB_REPOSITORY: 'owner/repo',
          GITHUB_EVENT_PATH: '/event.json',
          TRAZUM_GITHUB_TOKEN: 'tok',
          TRAZUM_BODY_PATH: '/report.md',
          TRAZUM_MARKER_KEY: 'default',
          TRAZUM_OUTCOME: '0',
        },
        fetchImpl,
        readFileImpl: async (path) => (path === '/event.json' ? JSON.stringify({ pull_request: { number: 7 } }) : report),
      });

    assert.equal((await post()).action, 'created');
    assert.equal((await post()).action, 'updated');
    assert.equal(store.size, 1, 'a second push added a second comment');
    assert.equal(requests.filter((method) => method === 'POST').length, 1);
    assert.ok(store.get(1).body.includes('$150.00'), 'the base table did not reach the comment');
  });
});
