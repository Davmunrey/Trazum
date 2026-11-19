import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from '../../cli/test/env.mjs';
import { CREDENTIALS_FILE, WARN_DAYS, npmTokenStanding, recordedNpmTokenExpiry } from '../../../scripts/npm-token-expiry.mjs';

/**
 * The two scripts that keep a release from being cut with something left
 * behind, and the repository from going stale between commits.
 *
 * `prepare-release.mjs` exists because the steps it runs were a checklist a
 * person followed by hand, and the Action pin, the last of them, was missed
 * through two releases until the docs-pin guard held five pull requests red.
 * One test runs it in dry-run mode on the repository itself: it must name
 * every file that moves in lockstep and write none of them. Another runs it
 * for real on a copy, with a dependency planted at the current version,
 * because the first version of the lockfile step was a text replacement and
 * would have moved jiti, which sat at 2.7.0 the day 2.7.0 was cut.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const script = (name, ...args) =>
  spawnSync(process.execPath, [join(ROOT, 'scripts', name), ...args], { cwd: ROOT, env: SPAWN_ENV, encoding: 'utf8', timeout: 60000 });
const current = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const [major, minor, patch] = current.split('.').map(Number);
const nextPatch = `${major}.${minor}.${patch + 1}`;

describe('prepare-release', () => {
  it('names every file that moves in lockstep, and writes none of them in a dry run', () => {
    const before = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
    const result = script('prepare-release.mjs', nextPatch, '--dry-run');
    assert.equal(result.status, 0, result.stderr);
    for (const path of [
      'package.json', 'packages/core/package.json', 'packages/cli/package.json', 'packages/mcp/package.json',
      'packages/tokenizer-openai/package.json', 'apps/web/package.json', 'apps/vscode/package.json',
      'packages/mcp/server.json', 'packages/mcp/src/index.ts', 'plugin/.claude-plugin/plugin.json',
      'gemini-extension.json', 'docs/agents.md', 'package-lock.json', 'CHANGELOG.md', 'RELEASES.md',
      // #784: the release's pricing dataset, with the changelog and schema beside it.
      `apps/web/public/datasets/pricing/${nextPatch}.json`, 'apps/web/public/datasets/pricing/changelog.json',
    ]) {
      assert.ok(result.stderr.includes(`would change ${path} (`), `${path} would be left at ${current}`);
    }
    assert.match(result.stderr, /Dry run: nothing written/);
    const after = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(after, before, 'a dry run wrote to the working tree');
  });

  it('moves Trazum\'s own lockfile entries and never a dependency that shares the version', () => {
    const manifests = [
      'package.json', 'packages/core/package.json', 'packages/cli/package.json', 'packages/mcp/package.json',
      'packages/tokenizer-openai/package.json', 'apps/web/package.json', 'apps/vscode/package.json',
      'plugin/.claude-plugin/plugin.json',
    ];
    const dataset = 'apps/web/public/datasets/pricing';
    const files = [...manifests, 'packages/mcp/server.json', 'packages/mcp/src/index.ts', 'gemini-extension.json', 'docs/agents.md', 'package-lock.json', 'CHANGELOG.md', 'RELEASES.md', `${dataset}/${current}.json`];
    const dir = mkdtempSync(join(tmpdir(), 'trazum-release-'));
    try {
      for (const path of files) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        copyFileSync(join(ROOT, path), join(dir, path));
      }
      const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
      lock.packages['node_modules/planted-dependency'] = { version: current, license: 'MIT' };
      writeFileSync(join(dir, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
      // No tags in the copy, so the pin step says so and leaves the documents alone.
      execFileSync('git', ['init', '-q'], { cwd: dir, env: SPAWN_ENV });

      const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'prepare-release.mjs'), nextPatch], {
        cwd: dir, env: { ...SPAWN_ENV, PREPARE_RELEASE_ROOT: dir }, encoding: 'utf8', timeout: 60000,
      });
      assert.equal(result.status, 0, result.stderr);

      const after = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
      assert.equal(after.packages['node_modules/planted-dependency'].version, current, 'a dependency sharing the version was moved');
      assert.equal(after.version, nextPatch);
      for (const key of ['', 'packages/core', 'packages/cli', 'packages/mcp', 'packages/tokenizer-openai', 'apps/web', 'apps/vscode']) {
        assert.equal(after.packages[key].version, nextPatch, `lockfile entry ${key || '(root)'}`);
      }
      for (const key of ['packages/cli', 'packages/mcp', 'apps/web', 'apps/vscode']) {
        assert.equal(after.packages[key].dependencies['@trazum/core'], nextPatch, `${key} still pins core ${current}`);
      }
      for (const path of manifests) {
        assert.equal(JSON.parse(readFileSync(join(dir, path), 'utf8')).version, nextPatch, path);
      }
      assert.equal(readFileSync(join(dir, 'packages/mcp/server.json'), 'utf8').split(`"version": "${nextPatch}"`).length - 1, 2);
      assert.ok(readFileSync(join(dir, 'packages/mcp/src/index.ts'), 'utf8').includes(`version: '${nextPatch}'`), 'the MCP handshake version was left behind');
      // #774: the Gemini CLI extension and the install table move with the release, and name no version but the new one.
      const gemini = JSON.parse(readFileSync(join(dir, 'gemini-extension.json'), 'utf8'));
      assert.equal(gemini.version, nextPatch, 'gemini-extension.json was left behind');
      assert.deepEqual(gemini.mcpServers.trazum.args, ['-y', `@trazum/mcp@${nextPatch}`], 'the extension starts the previous server');
      const agents = readFileSync(join(dir, 'docs/agents.md'), 'utf8');
      assert.ok(agents.includes(`claude mcp add trazum -- npx -y @trazum/mcp@${nextPatch}`), 'the install table in docs/agents.md was left behind');
      assert.ok(!agents.includes(`@trazum/mcp@${current}`), 'the install table still names the previous version');
      const changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
      // Plain text, not a pattern built from the version: nothing to escape.
      const heading = `\n## Unreleased\n\nNo changes yet.\n\n## ${nextPatch} — `;
      const at = changelog.indexOf(heading);
      assert.ok(at >= 0, 'the changelog has no fresh Unreleased above the new version');
      assert.match(changelog.slice(at + heading.length, at + heading.length + 11), /^\d{4}-\d{2}-\d{2}\n$/);
      assert.ok(readFileSync(join(dir, 'RELEASES.md'), 'utf8').includes(`**All four packages are on npm at ${nextPatch}**`));
      // #784: the dataset of the new version, compared with the one published before it, and the old one untouched.
      const written = JSON.parse(readFileSync(join(dir, dataset, `${nextPatch}.json`), 'utf8'));
      assert.equal(written.version, nextPatch);
      assert.equal(written.changes.since, current, 'the new document is not compared with the last published one');
      assert.equal(readFileSync(join(dir, dataset, `${current}.json`), 'utf8'), readFileSync(join(ROOT, dataset, `${current}.json`), 'utf8'), 'a published version was rewritten');
      const datasets = JSON.parse(readFileSync(join(dir, dataset, 'changelog.json'), 'utf8'));
      assert.deepEqual(datasets.versions.map((entry) => entry.version), [nextPatch, current]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * 2.7.10 was prepared, reviewed and merged on a day the npm token no longer
   * worked, and a merged release that cannot upload leaves `main` naming a
   * version npm does not have. The script reads the recorded expiry before it
   * plans anything.
   */
  const lockstep = [
    'package.json', 'packages/core/package.json', 'packages/cli/package.json', 'packages/mcp/package.json',
    'packages/tokenizer-openai/package.json', 'apps/web/package.json', 'apps/vscode/package.json',
    'plugin/.claude-plugin/plugin.json', 'packages/mcp/server.json', 'packages/mcp/src/index.ts',
    'gemini-extension.json', 'docs/agents.md', 'package-lock.json', 'CHANGELOG.md', 'RELEASES.md',
  ];
  const prepareOnCopy = (expires, ...args) => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-release-'));
    try {
      for (const path of lockstep) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        copyFileSync(join(ROOT, path), join(dir, path));
      }
      mkdirSync(dirname(join(dir, CREDENTIALS_FILE)), { recursive: true });
      writeFileSync(join(dir, CREDENTIALS_FILE), JSON.stringify({ npmToken: { expires } }));
      execFileSync('git', ['init', '-q'], { cwd: dir, env: SPAWN_ENV });
      const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'prepare-release.mjs'), nextPatch, ...args], {
        cwd: dir, env: { ...SPAWN_ENV, PREPARE_RELEASE_ROOT: dir }, encoding: 'utf8', timeout: 60000,
      });
      return { ...result, version: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('refuses to prepare a release the npm token is recorded as unable to upload', () => {
    const refused = prepareOnCopy(daysFromNow(-1));
    assert.equal(refused.status, 1, refused.stderr);
    assert.match(refused.stderr, /^prepare-release: npm token: recorded as expiring on \d{4}-\d{2}-\d{2}, which has come/m);
    assert.match(refused.stderr, /leave main naming a version npm does not have/);
    assert.equal(refused.version, current, 'it refused and moved the version anyway');
    assert.doesNotMatch(refused.stderr, /^changed /m, 'it refused after writing');
    assert.doesNotMatch(refused.stderr, /at file:\/\//, 'the refusal printed a stack trace');

    // A date that is not one protects nothing, so it stops the release too.
    const nonsense = prepareOnCopy('2027-02-31');
    assert.equal(nonsense.status, 1);
    assert.match(nonsense.stderr, /is not a real YYYY-MM-DD date/);
    assert.equal(nonsense.version, current);
  });

  it('says in a dry run what a real run would refuse, and still shows the plan', () => {
    const dry = prepareOnCopy(daysFromNow(-1), '--dry-run');
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stderr, /^A real run would stop here: npm token: recorded as expiring on/m);
    assert.match(dry.stderr, /would change package\.json \(/);
    assert.equal(dry.version, current);
  });

  it('prepares the release and names the token among what is still yours, when the date is near or unknown', () => {
    const near = prepareOnCopy(daysFromNow(5));
    assert.equal(near.status, 0, near.stderr);
    assert.equal(near.version, nextPatch);
    assert.match(near.stderr, /^ {2}- npm token: expires \d{4}-\d{2}-\d{2}, [45] day\(s\) left: renew it/m);

    const unknown = prepareOnCopy(null);
    assert.equal(unknown.status, 0, unknown.stderr);
    assert.match(unknown.stderr, /^ {2}- npm token: no expiry date in/m);

    // A token with months left is not on the list: the list is for what needs doing.
    const fine = prepareOnCopy(daysFromNow(60));
    assert.equal(fine.status, 0, fine.stderr);
    assert.equal(fine.version, nextPatch);
    assert.doesNotMatch(fine.stderr, /npm token/);
  });

  it('refuses a version that is not newer, and one that is not a version', () => {
    const older = script('prepare-release.mjs', current, '--dry-run');
    assert.equal(older.status, 1);
    assert.ok(older.stderr.includes(`${current} is not newer than the current`), older.stderr);
    const nonsense = script('prepare-release.mjs', 'next', '--dry-run');
    assert.equal(nonsense.status, 1);
    assert.match(nonsense.stderr, /is not a version/);
    assert.doesNotMatch(older.stderr + nonsense.stderr, /at file:\/\//, 'a refusal printed a stack trace');
  });
});

/**
 * The date the npm token stops uploading releases, written down by a person.
 *
 * 2.7.10's release pull request merged on 2026-11-17, the job ran five minutes
 * of checks, and the first upload answered `E404 Not Found - PUT`. Nothing in
 * the repository knew when the token would stop working, so `main` named a
 * version npm did not have and nothing had warned. The date now lives in
 * `.github/release-credentials.json`, the weekly run goes red two weeks ahead
 * of it, and a release is not prepared past it.
 */
const DAY = 86_400_000;
const at = (date) => Date.parse(`${date}T00:00:00Z`);
const daysFromNow = (days) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

/** A directory holding only a credentials record, with `expires` as given. */
const recorded = (expires) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-credentials-'));
  mkdirSync(dirname(join(dir, CREDENTIALS_FILE)), { recursive: true });
  writeFileSync(join(dir, CREDENTIALS_FILE), typeof expires === 'string' && expires.startsWith('{') ? expires : JSON.stringify({ npmToken: { expires } }));
  return dir;
};

describe('the npm token\'s expiry', () => {
  it('counts the days to a recorded date, and warns two weeks ahead', () => {
    const now = at('2027-01-01') + 9 * 3_600_000; // nine in the morning, UTC
    const far = npmTokenStanding('2027-02-15', now);
    assert.equal(far.status, 'ok');
    assert.equal(far.daysLeft, 45);
    assert.equal(far.text, 'npm token: expires 2027-02-15, 45 day(s) left');

    // Fourteen whole days ahead is still quiet at nine in the morning; the next day is not.
    assert.equal(WARN_DAYS, 14);
    assert.equal(npmTokenStanding('2027-01-16', now).status, 'ok');
    const soon = npmTokenStanding('2027-01-15', now);
    assert.equal(soon.status, 'soon');
    assert.equal(soon.daysLeft, 14);
    assert.match(soon.text, /expires 2027-01-15, 14 day\(s\) left: renew it and record the new date/);
    assert.equal(npmTokenStanding('2027-01-02', now).daysLeft, 1, 'fifteen hours left is one day, not none');
  });

  it('counts the token as gone from the first minute of the day npm named', () => {
    // npm names a day and no hour. The early reading never promises a credential that is not there.
    assert.equal(npmTokenStanding('2027-01-15', at('2027-01-15') - 1).status, 'soon');
    const gone = npmTokenStanding('2027-01-15', at('2027-01-15'));
    assert.equal(gone.status, 'expired');
    assert.match(gone.text, /recorded as expiring on 2027-01-15, which has come: no release can upload/);
    assert.equal(npmTokenStanding('2027-01-15', at('2027-03-01')).status, 'expired');
  });

  it('calls a date nobody recorded unrecorded, never fine', () => {
    for (const nothing of [null, undefined]) {
      const standing = npmTokenStanding(nothing, at('2027-01-01'));
      assert.equal(standing.status, 'unrecorded');
      assert.match(standing.text, /no expiry date in \.github\/release-credentials\.json, so nothing warns/);
    }
  });

  it('refuses a date that is not one, the thirty-first of February included', () => {
    // Date.parse reads 2027-02-31 as the third of March and says nothing.
    for (const wrong of ['2027-02-31', '2027-13-01', '2027-2-5', '15/02/2027', 'next spring', '', 20270215, true, {}]) {
      assert.equal(npmTokenStanding(wrong, at('2027-01-01')).status, 'invalid', `${JSON.stringify(wrong)} was read as a date`);
    }
    assert.equal(npmTokenStanding('2028-02-29', at('2027-01-01')).status, 'ok', 'a real leap day was refused');
  });

  it('reads the date from the record, and nothing from a record that is not there', () => {
    assert.equal(recordedNpmTokenExpiry(recorded('2027-02-15')), '2027-02-15');
    assert.equal(recordedNpmTokenExpiry(recorded(null)), null);
    assert.equal(recordedNpmTokenExpiry(recorded('{}')), null);
    assert.equal(recordedNpmTokenExpiry(mkdtempSync(join(tmpdir(), 'trazum-credentials-'))), null, 'a missing file is not an error');
    assert.throws(() => recordedNpmTokenExpiry(recorded('{ not json')), /release-credentials\.json is not JSON/);
  });

  it('this repository\'s record holds a date or null, and never a credential', () => {
    const text = readFileSync(join(ROOT, CREDENTIALS_FILE), 'utf8');
    const record = JSON.parse(text);
    assert.deepEqual(Object.keys(record).sort(), ['about', 'npmToken']);
    assert.deepEqual(Object.keys(record.npmToken), ['expires']);
    assert.notEqual(npmTokenStanding(record.npmToken.expires).status, 'invalid', 'the recorded expiry is not a date');
    // The date is public. The token is not, and this file is the tempting place to paste it.
    assert.doesNotMatch(text, /npm_[A-Za-z0-9]{20,}/, 'token material in the credentials record');
  });

  it('turns the weekly run red before the date, and only notes a date nobody recorded', () => {
    const fresh = (dir, ...args) =>
      spawnSync(process.execPath, [join(ROOT, 'scripts', 'freshness.mjs'), ...args], {
        cwd: ROOT, env: { ...SPAWN_ENV, FRESHNESS_CREDENTIALS_ROOT: dir }, encoding: 'utf8', timeout: 60000,
      });

    const soon = fresh(recorded(daysFromNow(5)));
    assert.match(soon.stdout, /^OVERDUE {2}npm token: expires \d{4}-\d{2}-\d{2}, [45] day\(s\) left: renew it/m);
    assert.equal(soon.status, 1, 'a token five days from expiry did not fail the scheduled run');
    assert.equal(fresh(recorded(daysFromNow(5)), '--report').status, 0, 'report mode failed');

    assert.match(fresh(recorded(daysFromNow(-1)), '--report').stdout, /^OVERDUE {2}npm token: recorded as expiring on/m);
    assert.match(fresh(recorded('2027-02-31'), '--report').stdout, /^OVERDUE {2}npm token: the expiry .* is not a real YYYY-MM-DD date/m);
    assert.match(fresh(recorded(daysFromNow(60)), '--report').stdout, /^ok {7}npm token: expires \d{4}-\d{2}-\d{2}, (59|60) day\(s\) left$/m);
    // Unknown is said, as a note: it is not a deadline, and it is not a pass either.
    assert.match(fresh(recorded(null), '--report').stdout, /^note {5}npm token: no expiry date in/m);
    // And the real record is on the report, whatever it holds.
    assert.match(script('freshness.mjs', '--report').stdout, /^(ok {7}|note {5}|OVERDUE {2})npm token: /m);
  });
});

describe('freshness', () => {
  it('reports every provider\'s price review and never fails in report mode', () => {
    const result = script('freshness.mjs', '--report');
    assert.equal(result.status, 0, result.stderr);
    for (const provider of ['anthropic', 'openai', 'google', 'deepseek', 'mistral', 'moonshot', 'xai']) {
      assert.match(result.stdout, new RegExp(`prices: ${provider} read \\d{4}-\\d{2}-\\d{2}`), `${provider} is missing`);
    }
  });

  it('is wired into CI: reported on every run, failing only on the weekly schedule', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    assert.match(ci, /schedule:\s*\n\s*- cron: '[^']+'/, 'CI has no weekly schedule');
    assert.match(ci, /if \[ "\$EVENT" = "schedule" \]; then node scripts\/freshness\.mjs; else node scripts\/freshness\.mjs --report; fi/);
    // The event name reaches the script through the environment, never spliced into it.
    assert.match(ci, /EVENT: \$\{\{ github\.event_name \}\}/);
  });
});
