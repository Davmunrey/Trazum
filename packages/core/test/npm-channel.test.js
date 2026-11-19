import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from '../../cli/test/env.mjs';
import { CHANNELS, baseOf, channelOf, decideChannel, recordedVersion } from '../../../scripts/npm-channel.mjs';
import { latestMovedTo, tagFor, waitingFor } from '../../../scripts/npm-serves.mjs';

/**
 * Two npm channels: `latest`, which every `npm install` resolves, and `next`,
 * which nobody gets without asking for it.
 *
 * `npm publish` with no `--tag` moves `latest` to whatever it uploads,
 * prerelease or not, and a version is spent for good 72 hours later. So the
 * channel is decided once, by `scripts/npm-channel.mjs`, from the version and
 * the run, and `release.yml` reads that answer at every place it matters: the
 * `--tag` of each upload, the tag the wait for npm asks about, and the gate of
 * everything that only a release on `latest` does (the GitHub release, the
 * files attached to it, the MCP registry listing). These tests hold the
 * script to its table and the workflow to reading it.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const release = readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8');
const code = (text) => text.replace(/^\s*#.*$/gm, '');
const jobs = code(release).split(/^ {2}(?=[a-z][a-z-]*:$)/m);
const job = (name) => jobs.find((candidate) => candidate.startsWith(`${name}:`));
const steps = (text) => text.split(/^ {6}- /m).slice(1);

describe('the channel a version publishes to', () => {
  it('is latest for a release and next for a next prerelease, and nothing else has one', () => {
    assert.deepEqual(CHANNELS, ['latest', 'next']);
    for (const version of ['3.0.1', '0.0.1', '10.20.30']) assert.equal(channelOf(version), 'latest', version);
    for (const version of ['3.1.0-next.1', '3.1.0-next.12', '4.0.0-next.0']) assert.equal(channelOf(version), 'next', version);
    // Every other shape is refused, so none of them can fall through to `latest`.
    for (const version of ['3.1.0-rc.1', '3.1.0-beta.1', '3.1.0-next', '3.1.0-next.x', '3.1.0-next.1+build', '3.1.0+build', 'v3.1.0', '3.1', '', undefined, null]) {
      assert.throws(() => channelOf(version), /channel|not a version/, String(version));
    }
  });

  it('reads, on a next\'s tree, the release the record describes, and on a release\'s tree its own version', () => {
    // The newest released heading of CHANGELOG.md, worked out from the file here rather than asked of the function.
    const newest = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8').split('\n').find((line) => /^## \d+\.\d+\.\d+/.test(line)).split(' ')[1];
    assert.equal(recordedVersion('99.0.0-next.3'), newest);
    assert.equal(recordedVersion('99.0.0'), '99.0.0');
    assert.throws(() => recordedVersion('99.0.0-rc.1'));
  });

  it('knows which release a next leads up to', () => {
    assert.equal(baseOf('3.1.0-next.2'), '3.1.0');
    assert.equal(baseOf('3.0.1'), '3.0.1');
    assert.throws(() => baseOf('3.1.0-rc.1'));
  });

  it('never publishes a prerelease from main, and never a version its tag does not name', () => {
    // A merge to main publishes with no further step, so main carries releases only.
    assert.equal(decideChannel({ version: '3.0.2', event: 'push', ref: 'refs/heads/main' }), 'latest');
    assert.throws(() => decideChannel({ version: '3.1.0-next.1', event: 'push', ref: 'refs/heads/main' }), /prerelease/);

    // A tag publishes exactly what it names, on that version's channel.
    assert.equal(decideChannel({ version: '3.1.0-next.1', event: 'push', ref: 'refs/tags/v3.1.0-next.1' }), 'next');
    assert.equal(decideChannel({ version: '3.1.0', event: 'push', ref: 'refs/tags/v3.1.0' }), 'latest');
    // The two crossings: a stable tag over prerelease manifests, a prerelease tag over stable ones.
    assert.throws(() => decideChannel({ version: '3.1.0-next.1', event: 'push', ref: 'refs/tags/v3.1.0' }), /the tag is v3\.1\.0/);
    assert.throws(() => decideChannel({ version: '3.1.0', event: 'push', ref: 'refs/tags/v3.1.0-next.1' }), /the tag is v3\.1\.0-next\.1/);

    // Any other push publishes nothing.
    assert.throws(() => decideChannel({ version: '3.0.2', event: 'push', ref: 'refs/heads/next/3.1.0' }), /publishes nothing/);

    // A dry run is told the channel it would publish to, from any branch.
    assert.equal(decideChannel({ version: '3.1.0-next.1', event: 'workflow_dispatch', ref: 'refs/heads/next/3.1.0' }), 'next');
  });

  it('is written to the step output as one of two words, and a refusal fails the step', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-channel-'));
    try {
      const output = join(dir, 'output');
      const run = (ref) =>
        spawnSync(process.execPath, [join(ROOT, 'scripts/npm-channel.mjs')], {
          cwd: ROOT,
          env: { ...SPAWN_ENV, GITHUB_OUTPUT: output, GITHUB_EVENT_NAME: 'push', GITHUB_REF: ref },
          encoding: 'utf8',
        });
      const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
      const ok = run(`refs/tags/v${version}`);
      assert.equal(ok.status, 0, ok.stdout);
      assert.equal(readFileSync(output, 'utf8'), `channel=${channelOf(version)}\n`);

      const refused = run('refs/tags/v0.0.0-next.1');
      assert.equal(refused.status, 1);
      assert.match(refused.stdout, /^::error::the tag is v0\.0\.0-next\.1/m);
      assert.equal(readFileSync(output, 'utf8'), `channel=${channelOf(version)}\n`, 'a refusal still wrote a channel');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('release.yml reads the channel wherever latest could move', () => {
  const decide = job('decide');
  const releaseJob = job('release');

  it('decides it first, on every run, outside the environment that holds the token', () => {
    assert.ok(decide, 'the decide job is gone');
    const channel = steps(decide).find((step) => /node scripts\/npm-channel\.mjs/.test(step));
    assert.ok(channel, 'nothing decides the channel');
    assert.match(channel, /^\s*id: channel$/m);
    assert.doesNotMatch(channel, /^\s*if:/m, 'the channel is decided only on some runs, so others publish with no --tag');
    assert.match(decide, /^ {6}channel: \$\{\{ steps\.channel\.outputs\.channel \}\}$/m, 'decide does not hand the channel on');
    assert.doesNotMatch(decide, /environment:/);
  });

  it('runs the publishing job only on one of the two channels', () => {
    const gate = releaseJob.match(/^ {4}if: (.+)$/m)?.[1] ?? '';
    assert.match(gate, /^\(needs\.decide\.outputs\.channel == 'latest' \|\| needs\.decide\.outputs\.channel == 'next'\) && \(/, gate);
  });

  it('passes the channel as --tag to every upload, and has no upload without it', () => {
    // A tag pattern anyone could see and not a coincidence: every line that publishes.
    const lines = release.split('\n').filter((line) => /npm publish\b/.test(line) && !line.trimStart().startsWith('#') && !/^\s*echo/.test(line));
    assert.equal(lines.length, 4, 'four packages publish');
    for (const line of lines) assert.match(line, /^\s*run: npm publish --provenance --access public --tag "\$NPM_DIST_TAG"$/, line);
    const uploads = steps(releaseJob).filter((step) => /run: npm publish/.test(step));
    assert.equal(uploads.length, 4);
    for (const step of uploads) {
      assert.match(step, /^ {10}NPM_DIST_TAG: \$\{\{ needs\.decide\.outputs\.channel \}\}$/m, step.split('\n')[0]);
    }
  });

  it('waits for npm on the tag it published to', () => {
    const wait = steps(releaseJob).find((step) => /node scripts\/npm-serves\.mjs/.test(step));
    assert.ok(wait, 'nothing waits for npm to serve the release');
    assert.match(wait, /NPM_DIST_TAG: \$\{\{ needs\.decide\.outputs\.channel \}\}/);
  });

  it('makes a GitHub release, attaches files and lists on the MCP registry only for latest', () => {
    const latest = "needs.decide.outputs.channel == 'latest'";
    for (const name of ['Publish the GitHub release', 'Publish the GitHub release and the tag (from main)']) {
      const step = steps(releaseJob).find((candidate) => candidate.startsWith(`name: ${name}\n`));
      assert.ok(step, `${name} is gone`);
      assert.ok(step.match(/^\s*if: (.+)$/m)?.[1].includes(latest), `${name} would run for a next`);
    }
    for (const name of ['assets', 'mcp-registry']) {
      const gate = job(name)?.match(/^ {4}if: (.+)$/m)?.[1] ?? '';
      assert.ok(gate.includes(latest), `the ${name} job would run for a next: ${gate}`);
    }
  });

  it('is triggered by a next tag too, so a next goes through the same gate as a release', () => {
    // GitHub's tag filter: `*` matches anything but `/`.
    const pattern = release.match(/^ {4}tags: \['([^']+)'\]$/m)?.[1];
    assert.equal(pattern, 'v*.*.*');
    // Escape every regular-expression character first, then turn the glob's
    // `*` (now `\*`) into "anything but a slash".
    const escaped = pattern.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');
    const glob = new RegExp(`^${escaped.replaceAll('\\*', '[^/]*')}$`);
    assert.ok(glob.test('v3.1.0-next.1'));
    assert.ok(glob.test('v3.1.0'));
  });
});

describe('the wait for npm, on the next channel', () => {
  const registry = (tags, tarball = true) => async (url) => {
    if (url.endsWith('/dist-tags')) return { ok: true, json: async () => tags };
    return { ok: tarball };
  };

  it('asks about the tag the release published to', async () => {
    assert.equal(await waitingFor('@trazum/core', '3.1.0-next.1', registry({ latest: '3.0.1', next: '3.1.0-next.1' }), 'next'), null);
    assert.match(await waitingFor('@trazum/core', '3.1.0-next.1', registry({ latest: '3.0.1' }), 'next'), /served at nothing, waiting for 3\.1\.0-next\.1 on next/);
    // A next that reached latest and not next is still not served on next.
    assert.match(await waitingFor('@trazum/core', '3.1.0-next.1', registry({ latest: '3.1.0-next.1' }), 'next'), /on next/);
  });

  it('says when a prerelease reached latest', async () => {
    assert.equal(await latestMovedTo('@trazum/core', '3.1.0-next.1', registry({ latest: '3.1.0-next.1', next: '3.1.0-next.1' })), true);
    assert.equal(await latestMovedTo('@trazum/core', '3.1.0-next.1', registry({ latest: '3.0.1', next: '3.1.0-next.1' })), false);
  });

  it('refuses to wait for a version under a tag that is not its channel', () => {
    const packages = (version) => [{ name: '@trazum/core', version }, { name: '@trazum/cli', version }];
    assert.equal(tagFor(packages('3.1.0-next.1'), 'next'), 'next');
    assert.equal(tagFor(packages('3.0.1'), 'latest'), 'latest');
    assert.throws(() => tagFor(packages('3.1.0-next.1'), 'latest'), /belongs on next/);
    assert.throws(() => tagFor(packages('3.0.1'), 'next'), /belongs on latest/);
    assert.throws(() => tagFor(packages('3.0.1'), 'beta'), /NPM_DIST_TAG/);
  });

  it('fails at once, not after the timeout, when latest moved', () => {
    const source = readFileSync(join(ROOT, 'scripts/npm-serves.mjs'), 'utf8');
    const main = source.slice(source.indexOf('async function main()'));
    const moved = main.indexOf('latestMovedTo(name, version)');
    assert.ok(moved !== -1, 'the wait never asks whether latest moved');
    assert.ok(main.indexOf('process.exit(1)', moved) < main.indexOf('pending.delete(name)'), 'a moved latest is waited out');
  });
});
