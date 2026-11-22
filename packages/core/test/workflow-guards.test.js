import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

/**
 * A workflow that does more than build and test, and that nothing read (#779).
 *
 * Every workflow is held by the generic checks for pinned actions and
 * permissions. This one acts outside the repository: `pr-guide.yml` runs a
 * script fetched from another repository with write access to pull requests
 * and issues. What makes it safe is held here, property by property.
 */

/** One step of a job, by its name, as the text between it and the next step. */
function step(text, name) {
  const start = text.indexOf(`- name: ${name}\n`);
  assert.notEqual(start, -1, `no step named "${name}"`);
  const next = text.indexOf('\n      - ', start + 1);
  return text.slice(start, next === -1 ? text.length : next);
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

  it('fails when the API refuses the result, and reads no cache another run wrote', () => {
    // From scorecard-action v2.6.0 a refused result only warns unless asked
    // to fail; a refused result is a score that stopped moving.
    assert.match(job, /\n {10}fail_on_publish_error: true\n/, 'a refused result would only warn');
    assert.match(text, /^cache-mode: none$/m, 'the workflow may read a cache another run wrote');
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
    assert.ok(read('README.md').includes('https://api.scorecard.dev/projects/github.com/TrazumAPP/Trazum/badge'), 'the README has no Scorecard badge');
    const security = read('SECURITY.md');
    assert.match(security, /scorecard\.yml/);
    assert.match(security, /does not/i);
  });

  // The Best Practices badges are the project's own answers, so SECURITY.md has to say
  // so next to it (#912).
  it('shows the OpenSSF Best Practices badges on the README and says in SECURITY.md that they are self-certified', () => {
    const readme = read('README.md');
    assert.ok(readme.includes('[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/16992/badge)](https://www.bestpractices.dev/projects/16992)'), 'the README has no Best Practices badge');
    assert.ok(readme.includes('[![OpenSSF Baseline](https://www.bestpractices.dev/projects/16992/baseline)](https://www.bestpractices.dev/projects/16992)'), 'the README has no Baseline badge');
    const security = read('SECURITY.md');
    assert.match(security, /\[OpenSSF Best Practices\]\(https:\/\/www\.bestpractices\.dev\/projects\/16992\)/u, 'SECURITY.md does not name the Best Practices badges');
    assert.match(security, /bestpractices\.dev does not verify them/u, 'SECURITY.md does not say the Baseline answers are the project\'s own');
  });
});

/**
 * What CI and the image install is pinned by hash, not by a tag or a version
 * somebody could move or republish (#874). OpenSSF Scorecard's first run on
 * main found the Dockerfile's `FROM node:22-alpine` and three `npm install
 * <name>@<version>` commands in workflows: every action was pinned by commit,
 * and those four were the rest.
 */
/**
 * The image builds from what the Dockerfile copies, and nothing ran the build
 * (#932). At 3.0.4 it copied scripts that import three others it did not
 * copy, and a package whose tsconfig extends a root file it did not copy, so
 * `docker build` failed and no check said so. CI now builds the image; these
 * say, without Docker, that the copies are closed under what the build reads.
 */
describe('the image the web app runs in', () => {
  it('upgrades its system packages before it drops to the unprivileged user (L-11)', () => {
    const dockerfile = read('Dockerfile');
    const runtime = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));
    const upgrade = runtime.search(/^RUN apk upgrade --no-cache$/m);
    assert.ok(upgrade > -1, 'the runtime stage does not run apk upgrade --no-cache');
    assert.ok(upgrade < runtime.search(/^USER /m), 'apk upgrade runs after USER, where it has no right to');
  });
});

describe('the Dockerfile copies everything the build it runs reads', () => {
  const dockerfile = read('Dockerfile');
  const copied = new Set();
  for (const [, sources] of dockerfile.matchAll(/^COPY (?!--from)(.+) \S+$/gm)) {
    for (const source of sources.split(/\s+/)) copied.add(source.replace(/\/$/, ''));
  }
  const isCopied = (path) => [...copied].some((source) => path === source || path.startsWith(`${source}/`));

  it('every script it copies has its own relative imports copied too', () => {
    const scripts = [...copied].filter((path) => /^scripts\/[\w-]+\.mjs$/.test(path));
    assert.ok(scripts.length > 0, 'the Dockerfile copies no script, so this checks nothing');
    const missing = [];
    for (const script of scripts) {
      for (const [, name] of read(script).matchAll(/(?:from |import\()'\.\/([\w-]+\.mjs)'/g)) {
        if (!isCopied(`scripts/${name}`)) missing.push(`${script} imports scripts/${name}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it('every tsconfig a copied package extends is copied', () => {
    const packages = [...copied].filter((path) => /^(?:packages|apps)\/[\w-]+$/.test(path));
    assert.ok(packages.length > 0, 'the Dockerfile copies no package, so this checks nothing');
    const missing = [];
    for (const dir of packages) {
      let config;
      try {
        config = JSON.parse(read(`${dir}/tsconfig.json`));
      } catch {
        continue;
      }
      if (typeof config.extends !== 'string' || !config.extends.startsWith('.')) continue;
      const target = join(dir, config.extends).replaceAll('\\', '/');
      if (!isCopied(target)) missing.push(`${dir}/tsconfig.json extends ${target}`);
    }
    assert.deepEqual(missing, []);
  });

  it('CI builds the image on every pull request', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.match(ci, /^ {6}- run: docker build /m, 'no CI job runs docker build');
  });
});

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
      const manifest = JSON.parse(read(`tools/${tool}/package.json`));
      assert.equal(manifest.private, true, `${tool} could be published`);
      const pins = Object.entries(manifest.dependencies ?? {});
      assert.ok(pins.length > 0, `${tool} names nothing`);
      for (const [pkg, version] of pins) assert.match(version, /^\d+\.\d+\.\d+$/, `${tool}: ${pkg} is not one exact version`);
      const lock = JSON.parse(read(`tools/${tool}/package-lock.json`));
      for (const [pkg, version] of pins) assert.equal(lock.packages[`node_modules/${pkg}`]?.version, version, `${tool}: the lockfile resolves another ${pkg}`);
      const unhashed = Object.entries(lock.packages).filter(([path, entry]) => path !== '' && !/^sha512-/.test(entry.integrity ?? ''));
      assert.deepEqual(unhashed.map(([path]) => path), [], `${tool}: a package in the lockfile has no hash`);
    }
  });

  it('and Dependabot raises every pin, so none goes stale', () => {
    const dependabot = read('.github/dependabot.yml');
    for (const tool of TOOLS) assert.ok(dependabot.includes(`- /tools/${tool}\n`), `Dependabot does not watch ${tool}`);
    assert.match(dependabot, /- package-ecosystem: docker\n {4}directory: \/\n/, 'Dependabot does not watch the Dockerfile');
  });

  it('in an npm entry of their own, apart from the root, whose updates a refusal there would otherwise hold back (#881)', () => {
    const entries = read('.github/dependabot.yml').split(/^ {2}- (?=package-ecosystem:)/m).slice(1);
    const npm = entries.filter((entry) => entry.startsWith('package-ecosystem: npm\n'));
    const root = npm.filter((entry) => /^ {4}directory: \/\n/m.test(entry));
    const tools = npm.filter((entry) => entry.includes('/tools/'));
    assert.equal(root.length, 1, 'no npm entry watches the root alone');
    assert.doesNotMatch(root[0], /\/tools\//, 'the root shares an entry with the tools');
    assert.equal(tools.length, 1, 'the tools are not in one entry of their own');
    for (const tool of TOOLS) assert.ok(tools[0].includes(`- /tools/${tool}\n`), `${tool} is not in the tools' entry`);
    const groups = (entry) => [...entry.matchAll(/^ {6}([a-z-]+):$/gm)].map((match) => match[1]);
    assert.deepEqual(groups(root[0]).filter((group) => groups(tools[0]).includes(group)), [], 'the root and the tools share a group');
    // One group of the tools' own that takes every dependency: without it the
    // analyzer's lockfile alone could open a pull request per package.
    assert.equal(groups(tools[0]).length, 1, 'the tools have no group of their own, or more than one');
    assert.match(tools[0], /^ {8}patterns: \['\*'\]$/m, 'the tools\' group does not take every dependency');
  });

  it('and outside .github/, where GitHub refuses the pull requests Dependabot opens (#886)', () => {
    // With the tools in an entry of their own the refusal stayed with them,
    // on the only directories under .github/ (run 44933577919).
    const watched = [...read('.github/dependabot.yml').matchAll(/^ {4}directory: (\S+)$|^ {6}- (\/\S*)$/gm)].map((m) => m[1] ?? m[2]);
    assert.ok(watched.length > 0, 'Dependabot watches no directory');
    assert.deepEqual(watched.filter((dir) => dir.startsWith('/.github/')), [], 'Dependabot watches a directory under .github/');
    // node_modules is skipped: it is never committed, and a clone that ran
    // `npm ci` under the old path still holds one there until it is deleted.
    const manifests = readdirSync(join(ROOT, '.github'), { recursive: true })
      .filter((file) => !/(^|\/)node_modules(\/|$)/.test(file))
      .filter((file) => /(^|\/)package(-lock)?\.json$/.test(file));
    assert.deepEqual(manifests, [], 'a package manifest lives under .github/');
  });
});

/**
 * An advisory the dependency review lets through is a decision, and a
 * decision is written down where it is taken (#874). GHSA-mrhx-c7xc-m3w5, in
 * the zod 3 the CI-only Codecov analyzer brought, was allowed on that ground
 * until #905 overrode zod to a patched 4.x; none is allowed now. Each allowed advisory names
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
      assert.doesNotMatch(read(`tools/${tool}/package-lock.json`), /node_modules\/zod"/, `zod reached ${tool}`);
    }
    const zod = JSON.parse(read('tools/bundle-analyzer/package-lock.json')).packages['node_modules/zod']?.version ?? '';
    assert.match(zod, /^3\./, 'zod in the analyzer is no longer 3.x: the allowance may be removed');
  });
});

/**
 * The Node major CI tests on, the one the contributor guide names and the one
 * the image ships are one number (#883). Dependabot raised the image alone to
 * a major CI never ran (#878); this holds them together, so a bump of one is a
 * red build until the others follow.
 */
describe('CI, the contributor guide and the image name one Node major', () => {
  it('every setup-node, CONTRIBUTING.md and every FROM agree', () => {
    const named = [];
    for (const name of readdirSync(join(ROOT, '.github/workflows')).filter((file) => file.endsWith('.yml'))) {
      const text = read(`.github/workflows/${name}`);
      // Every setup-node names its version one way, a bare major: a range, an
      // `.x`, `lts/*` or a `node-version-file` would read as no number at all.
      const setups = (text.match(/uses: actions\/setup-node@/g) ?? []).length;
      const versions = [...text.matchAll(/^\s*node-version: '?(\d+)'?$/gm)];
      assert.equal(versions.length, setups, `${name}: ${setups} setup-node step(s), ${versions.length} naming a bare major`);
      assert.doesNotMatch(text, /node-version-file:/, `${name} reads the Node version from a file this test does not read`);
      for (const match of versions) named.push([`.github/workflows/${name}`, match[1]]);
    }
    assert.ok(named.length > 0, 'no workflow sets up Node');
    const guide = /^Node (\d+)\. No global installs needed\.$/m.exec(read('CONTRIBUTING.md'));
    assert.ok(guide, 'CONTRIBUTING.md no longer names the Node major');
    named.push(['CONTRIBUTING.md', guide[1]]);
    const dockerfile = read('Dockerfile');
    const stages = dockerfile.match(/^FROM .*$/gm) ?? [];
    const images = [...dockerfile.matchAll(/^FROM node:(\d+)-alpine@sha256:[0-9a-f]{64}(?: AS \w+)?$/gm)];
    assert.ok(images.length > 0, 'the Dockerfile builds on no node image');
    assert.equal(images.length, stages.length, `a stage builds on another image or variant: ${stages.join(' | ')}`);
    for (const image of images) named.push(['Dockerfile', image[1]]);
    const majors = new Set(named.map(([, major]) => major));
    assert.equal(majors.size, 1, `more than one Node major: ${named.map(([file, major]) => `${file} ${major}`).join(', ')}`);
  });
});
