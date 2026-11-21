import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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

/** The one job's own `permissions:` block as { scope: access }, comment lines skipped. */
function jobPermissions(text) {
  const block = /\n {4}permissions:\n((?: {6}(?:#.*|[a-z-]+: [a-z]+)\n)+)/.exec(text)?.[1];
  assert.ok(block, 'the job declares no permissions of its own');
  const lines = block.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
  return Object.fromEntries(lines.map((line) => line.split(': ')));
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

  it('writes to pull requests and issues and nothing else, from the job and not the file', () => {
    // On the job since #873: the top of the file grants read only.
    assert.match(text, /\npermissions:\n {2}contents: read\n\n/);
    const granted = jobPermissions(text);
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

/**
 * The Scorecard workflow publishes a result only from a workflow its API
 * accepts (#787). The rules are the action's README at the pinned commit,
 * "Workflow Restrictions": no top-level env or defaults, no write permission
 * at the top, `id-token: write` on this job alone, no env, defaults,
 * container or services on the job, an Ubuntu runner, and steps only from
 * five approved actions. A workflow that breaks one still runs and fails when
 * it publishes, so the README's badge goes stale without anything red here.
 */
describe('scorecard.yml is the shape the Scorecard API accepts a result from', () => {
  const text = read('.github/workflows/scorecard.yml');
  const job = text.slice(text.indexOf('\njobs:\n'));

  it('runs on a push to main and weekly, the triggers Scorecard supports, and never for a pull request', () => {
    assert.deepEqual(triggers(text), ['push', 'schedule']);
    assert.match(text, /\n {2}push:\n {4}branches: \['main'\]\n/);
    assert.doesNotMatch(text, /pull_request/);
  });

  it('has no top-level env or defaults, and only read access at the top', () => {
    assert.doesNotMatch(text, /^(env|defaults):/m);
    const top = /\npermissions:\n((?: {2}[a-z-]+: [a-z]+\n)+)/.exec(text)?.[1];
    assert.ok(top, 'no top-level permissions block');
    assert.deepEqual(top.trim().split('\n').map((line) => line.trim()), ['contents: read']);
  });

  it('is one job on an Ubuntu runner, with no env, defaults, container or services', () => {
    assert.equal(job.match(/^ {2}[a-z-]+:$/gm)?.length, 1, 'a second job: id-token: write may only be on the one that runs Scorecard');
    assert.match(job, /\n {4}runs-on: ubuntu-/);
    assert.doesNotMatch(job, /^ {4}(env|defaults|container|services):/m);
  });

  it('asks for the four permissions it uses and no more', () => {
    const block = /\n {4}permissions:\n((?: {6}(?:#.*|[a-z-]+: [a-z]+)\n)+)/.exec(job)?.[1];
    assert.ok(block, 'the job declares no permissions');
    const granted = block.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
    assert.deepEqual(granted.sort(), ['actions: read', 'contents: read', 'id-token: write', 'security-events: write']);
    assert.equal(text.match(/^\s+id-token: write$/gm)?.length, 1, 'id-token: write is granted somewhere else in the file');
  });

  it('uses only the actions the API approves, keeps no checkout token, and publishes', () => {
    const APPROVED = ['actions/checkout', 'actions/upload-artifact', 'github/codeql-action/upload-sarif', 'ossf/scorecard-action', 'step-security/harden-runner'];
    const used = [...job.matchAll(/^\s*- uses: ([^@\s]+)@/gm)].map((m) => m[1]);
    assert.ok(used.includes('ossf/scorecard-action'), 'the workflow does not run Scorecard');
    assert.deepEqual(used.filter((action) => !APPROVED.includes(action)), []);
    assert.equal(job.match(/^\s*- (?:uses|run|name):/gm)?.length, used.length, 'a step that is not an approved action');
    assert.match(job, /persist-credentials: false/);
    assert.match(job, /\n {10}publish_results: true\n/);
  });

  it('is not a check a merge waits for', () => {
    const ruleset = JSON.parse(read('.github/rulesets/main-branch.json'));
    const required = ruleset.rules
      .filter((rule) => rule.type === 'required_status_checks')
      .flatMap((rule) => rule.parameters.required_status_checks.map((check) => check.context));
    assert.ok(required.length > 0, 'the ruleset requires no checks, so this proves nothing');
    assert.ok(!required.some((context) => /scorecard/i.test(context)), 'Scorecard is a required check');
  });

  it('shows its result on the README and says in SECURITY.md what the score covers', () => {
    assert.ok(read('README.md').includes('https://api.scorecard.dev/projects/github.com/Davmunrey/Trazum/badge'), 'the README has no Scorecard badge');
    const security = read('SECURITY.md');
    assert.match(security, /scorecard\.yml/);
    assert.match(security, /does not/i);
  });
});

/**
 * What CI and the image install is pinned by hash, not by a tag or a version
 * somebody could move or republish (#874). OpenSSF Scorecard's first run on
 * main found the Dockerfile's `FROM node:22-alpine` and three `npm install
 * <name>@<version>` commands in workflows: every action was pinned by commit,
 * and those four were the rest.
 */
describe('everything CI and the image install is pinned by hash', () => {
  const TOOLS = ['acorn', 'bundle-analyzer', 'playwright-core'];

  it('every FROM in the Dockerfile names a digest', () => {
    const froms = read('Dockerfile').split('\n').filter((line) => /^FROM\s/i.test(line));
    assert.ok(froms.length > 0, 'the Dockerfile has no FROM line, so this checks nothing');
    const loose = froms.filter((line) => !/^FROM\s+\S+:\S+@sha256:[0-9a-f]{64}(\s|$)/.test(line));
    assert.deepEqual(loose, [], 'a base image is pinned by tag only');
  });

  it('no workflow installs a package by name: installs come from a lockfile with npm ci', () => {
    const offenders = [];
    for (const name of readdirSync(join(ROOT, '.github/workflows'))) {
      if (!/\.ya?ml$/.test(name)) continue;
      const code = read(`.github/workflows/${name}`).split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
      for (const [found] of code.matchAll(/\b(?:npm (?:install|i|add)|npx|pnpm (?:add|dlx)|yarn (?:add|dlx))\b[^\n]*/g)) offenders.push(`${name}: ${found.trim()}`);
    }
    assert.deepEqual(offenders, []);
  });

  it('each tool CI installs has a manifest of exact versions and a lockfile with a hash for every package', () => {
    for (const tool of TOOLS) {
      const manifest = JSON.parse(read(`.github/tools/${tool}/package.json`));
      assert.equal(manifest.private, true, `${tool} could be published`);
      const pins = Object.entries(manifest.dependencies ?? {});
      assert.ok(pins.length > 0, `${tool} names nothing`);
      for (const [pkg, version] of pins) assert.match(version, /^\d+\.\d+\.\d+$/, `${tool}: ${pkg} is not one exact version`);
      const lock = JSON.parse(read(`.github/tools/${tool}/package-lock.json`));
      for (const [pkg, version] of pins) assert.equal(lock.packages[`node_modules/${pkg}`]?.version, version, `${tool}: the lockfile resolves another ${pkg}`);
      const unhashed = Object.entries(lock.packages).filter(([path, entry]) => path !== '' && !/^sha512-/.test(entry.integrity ?? ''));
      assert.deepEqual(unhashed.map(([path]) => path), [], `${tool}: a package in the lockfile has no hash`);
    }
  });

  it('and Dependabot raises every pin, so none goes stale', () => {
    const dependabot = read('.github/dependabot.yml');
    for (const tool of TOOLS) assert.ok(dependabot.includes(`- /.github/tools/${tool}\n`), `Dependabot does not watch ${tool}`);
    assert.match(dependabot, /- package-ecosystem: docker\n {4}directory: \/\n/, 'Dependabot does not watch the Dockerfile');
  });

  it('in an npm entry of their own, apart from the root, whose updates a refusal there would otherwise hold back (#881)', () => {
    const entries = read('.github/dependabot.yml').split(/^ {2}- (?=package-ecosystem:)/m).slice(1);
    const npm = entries.filter((entry) => entry.startsWith('package-ecosystem: npm\n'));
    const root = npm.filter((entry) => /^ {4}directory: \/\n/m.test(entry));
    const tools = npm.filter((entry) => entry.includes('/.github/tools/'));
    assert.equal(root.length, 1, 'no npm entry watches the root alone');
    assert.doesNotMatch(root[0], /\.github\/tools/, 'the root shares an entry with the tools');
    assert.equal(tools.length, 1, 'the tools are not in one entry of their own');
    for (const tool of TOOLS) assert.ok(tools[0].includes(`- /.github/tools/${tool}\n`), `${tool} is not in the tools' entry`);
    const groups = (entry) => [...entry.matchAll(/^ {6}([a-z-]+):$/gm)].map((match) => match[1]);
    assert.deepEqual(groups(root[0]).filter((group) => groups(tools[0]).includes(group)), [], 'the root and the tools share a group');
  });
});

/**
 * An advisory the dependency review lets through is a decision, and a
 * decision is written down where it is taken (#874). GHSA-mrhx-c7xc-m3w5 is
 * in zod 3, which only the CI-only Codecov analyzer brings, and no 3.x is
 * patched; the owner accepted it on that ground. Each allowed advisory names
 * its package, says why, who accepted it and when it goes, and reaches no
 * lockfile but a CI tool's.
 */
describe('every advisory the dependency review allows is explained and kept out of what ships', () => {
  const text = read('.github/workflows/security.yml');
  const allowed = (/\n {10}allow-ghsas: ([^\n]+)\n/.exec(text)?.[1] ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  const comment = (/((?:\n {10}#[^\n]*)+)\n {10}allow-ghsas:/.exec(text)?.[1] ?? '');

  it('says, beside the list, why each one is allowed, who accepted it and when to remove it', () => {
    for (const id of allowed) {
      assert.match(id, /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
      assert.ok(comment.includes(id), `${id} is allowed without a word on why`);
    }
    if (allowed.length > 0) {
      assert.match(comment, /Accepted by the owner on \d{4}-\d{2}-\d{2} \(#\d+\)/);
      assert.match(comment, /Remove this when /);
    }
  });

  it('allows zod\'s advisory only while zod reaches no lockfile but the CI analyzer\'s', () => {
    if (!allowed.includes('GHSA-mrhx-c7xc-m3w5')) return;
    assert.doesNotMatch(read('package-lock.json'), /node_modules\/zod"/, 'zod is in the root lockfile, so the allowance covers code that ships');
    for (const tool of ['acorn', 'playwright-core']) {
      assert.doesNotMatch(read(`.github/tools/${tool}/package-lock.json`), /node_modules\/zod"/, `zod reached ${tool}`);
    }
    const zod = JSON.parse(read('.github/tools/bundle-analyzer/package-lock.json')).packages['node_modules/zod']?.version ?? '';
    assert.match(zod, /^3\./, 'zod in the analyzer is no longer 3.x: the allowance may be removed');
  });
});
