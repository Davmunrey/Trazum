import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

/**
 * Two workflows that do more than build and test, and that nothing read (#779).
 *
 * Every workflow is held by the generic checks for pinned actions and
 * permissions. These two act outside the repository: `pr-guide.yml` runs a
 * script fetched from another repository with write access to pull requests
 * and issues, and `mirror-to-n0.yml` force-pushes `main` to a second host with
 * a token in the URL. What makes each safe is held here, property by property.
 */

/** One step of a job, by its name, as the text between it and the next step. */
function step(text, name) {
  const start = text.indexOf(`- name: ${name}\n`);
  assert.notEqual(start, -1, `no step named "${name}"`);
  const next = text.indexOf('\n      - ', start + 1);
  return text.slice(start, next === -1 ? text.length : next);
}

/**
 * The top-level `permissions:` block as { scope: access }. A job may set its
 * own, which would replace this one for that job, so there must be no other.
 */
function permissions(text) {
  const block = /\npermissions:\n((?: {2}[a-z-]+: [a-z]+\n)+)/.exec(text)?.[1];
  assert.ok(block, 'no top-level permissions block');
  assert.equal(text.match(/^\s*permissions:/gm).length, 1, 'a job sets permissions of its own, which override the top-level block');
  return Object.fromEntries(block.trim().split('\n').map((line) => line.trim().split(': ')));
}

/** The shell a step runs: the lines of its `run: |` block, unindented, comments and blank lines kept. */
function script(stepText) {
  const at = stepText.indexOf('run: |\n');
  assert.notEqual(at, -1, 'the step has no run block');
  return stepText.slice(at + 'run: |\n'.length).split('\n').map((line) => line.replace(/^ {10}/, '')).join('\n');
}

/** The commands of a script: lines that are neither blank nor a comment. */
const commands = (shell) => shell.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));

/** The names of the top-level `on:` triggers. */
const triggers = (text) => [...(/\non:\n((?: {2}.*\n|\n)+)/.exec(text)?.[1] ?? '').matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);

describe('pr-guide.yml runs a fetched script only as the pin says', () => {
  const text = read('.github/workflows/pr-guide.yml');

  it('pins the script to a full commit and a full SHA-256', () => {
    assert.match(text, /\n {6}PR_GUIDE_COMMIT: [0-9a-f]{40}\n/);
    assert.match(text, /\n {6}PR_GUIDE_SHA256: [0-9a-f]{64}\n/);
  });

  it('checks the digest strictly in the step that fetches, and runs only when that step succeeded', () => {
    const fetch = step(text, 'Fetch the guide script at its pinned commit');
    assert.match(fetch, /\$\{PR_GUIDE_COMMIT\}\/scripts\/pr_guide\.py/);
    assert.match(fetch, /echo "\$\{PR_GUIDE_SHA256\} {2}\$RUNNER_TEMP\/pr_guide\.py" \| sha256sum --check --strict -/);
    // The check is the last command of the step, so a mismatch is the step's
    // outcome. Read as commands: a commented-out check is no check.
    assert.match(
      commands(script(fetch)).at(-1),
      /^echo "\$\{PR_GUIDE_SHA256\} {2}\$RUNNER_TEMP\/pr_guide\.py" \| sha256sum --check --strict -$/,
      'the digest check is not the last command the fetch step runs',
    );
    const run = step(text, 'Update the guide comment');
    assert.match(run, /\n {8}if: steps\.fetch\.outcome == 'success'\n/);
    assert.match(fetch, /\n {8}id: fetch\n/);
    // One command runs the fetched file, and it is in the guarded step.
    const runs = text.split('\n').filter((line) => /\bpython3?\b/.test(line));
    assert.deepEqual(runs.map((line) => line.trim()), ['run: python3 "$RUNNER_TEMP/pr_guide.py"']);
    assert.ok(run.includes(runs[0].trim()));
  });

  it('does not run on a pull request from a fork', () => {
    assert.match(text, /\n {4}if: github\.event_name == 'workflow_run' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository\n/);
    assert.doesNotMatch(text, /pull_request_target/);
  });

  it('cannot fail the job from either step', () => {
    for (const name of ['Fetch the guide script at its pinned commit', 'Update the guide comment']) {
      assert.match(step(text, name), /\n {8}continue-on-error: true\n/, name);
    }
  });

  it('writes to pull requests and issues and nothing else', () => {
    const granted = permissions(text);
    const writes = Object.entries(granted).filter(([, access]) => access === 'write').map(([scope]) => scope).sort();
    assert.deepEqual(writes, ['issues', 'pull-requests']);
    for (const [scope, access] of Object.entries(granted)) assert.ok(['read', 'write'].includes(access), `${scope}: ${access}`);
  });
});

describe('mirror-to-n0.yml pushes main and only main, and only when configured', () => {
  const text = read('.github/workflows/mirror-to-n0.yml');
  const secrets = ['N0_GITEA_HOST', 'N0_GITEA_USER', 'N0_GITEA_TOKEN'];

  it('does nothing unless all three secrets are set', () => {
    const check = step(text, 'Check for N0 credentials');
    for (const name of secrets) assert.ok(check.includes(`secrets.${name}`), `the check does not read ${name}`);
    // The check itself, run for each of the eight ways the three can be set or not.
    const work = mkdtempSync(join(tmpdir(), 'trazum-mirror-'));
    try {
      for (let mask = 0; mask < 8; mask += 1) {
        const output = join(work, `out-${mask}`);
        const env = { PATH: process.env.PATH, GITHUB_OUTPUT: output };
        ['HOST', 'USER', 'TOKEN'].forEach((name, bit) => { env[name] = mask & (1 << bit) ? `set-${name}` : ''; });
        const run = spawnSync('bash', ['-e', '-c', script(check)], { env, encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr);
        assert.equal(readFileSync(output, 'utf8').trim(), `configured=${mask === 7}`, `HOST, USER, TOKEN set as ${mask.toString(2).padStart(3, '0')}`);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
    for (const name of ['actions/checkout', 'Push to N0 Gitea over HTTPS']) {
      const at = text.indexOf(name);
      const own = text.slice(at, text.indexOf('\n      - ', at + 1) === -1 ? text.length : text.indexOf('\n      - ', at + 1));
      assert.match(own, /\n {8}if: steps\.creds\.outputs\.configured == 'true'\n/, `${name} runs without the credentials`);
    }
  });

  it('runs on a push to main and by hand, never for a pull request', () => {
    const on = `\n${/\non:\n([\s\S]*?)\n\n/.exec(text)?.[1] ?? ''}`;
    assert.deepEqual(triggers(text), ['push', 'workflow_dispatch']);
    assert.match(on, /\n {2}push:\n {4}branches: \[main\]\n/);
    assert.doesNotMatch(text, /pull_request/);
    assert.deepEqual(permissions(text), { contents: 'read' });
  });

  it('never prints or stores the URL that carries the token', () => {
    const push = step(text, 'Push to N0 Gitea over HTTPS');
    assert.doesNotMatch(text, /set -x|echo[^\n]*TOKEN|git remote add|git config[^\n]*url/);
    assert.doesNotMatch(push, /persist-credentials: true/);
    assert.match(text, /persist-credentials: false/);
    // The token reaches git as part of one argument, and nowhere else.
    assert.equal((text.match(/\$\{TOKEN\}/g) ?? []).length, 1);
  });

  it('pushes HEAD to main and nothing else', () => {
    const push = step(text, 'Push to N0 Gitea over HTTPS');
    const lines = push.split('\n').filter((line) => /\bgit push\b/.test(line));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /git push --force "https:\/\/\$\{USER\}:\$\{TOKEN\}@\$\{HOST\}\/\$\{USER\}\/trazum\.git" HEAD:main$/);
    assert.doesNotMatch(push, /--mirror|--all|--tags/);
  });
});
