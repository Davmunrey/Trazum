import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from '../../cli/test/env.mjs';

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
      'package-lock.json', 'CHANGELOG.md', 'RELEASES.md',
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
    const files = [...manifests, 'packages/mcp/server.json', 'packages/mcp/src/index.ts', 'package-lock.json', 'CHANGELOG.md', 'RELEASES.md'];
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
      assert.match(readFileSync(join(dir, 'packages/mcp/src/index.ts'), 'utf8'), new RegExp(`version: '${nextPatch.replace(/\./g, '\\.')}'`));
      const changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
      assert.match(changelog, new RegExp(`\\n## Unreleased\\n\\nNo changes yet\\.\\n\\n## ${nextPatch.replace(/\./g, '\\.')} — \\d{4}-\\d{2}-\\d{2}\\n`));
      assert.ok(readFileSync(join(dir, 'RELEASES.md'), 'utf8').includes(`**All four packages are on npm at ${nextPatch}**`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a version that is not newer, and one that is not a version', () => {
    const older = script('prepare-release.mjs', current, '--dry-run');
    assert.equal(older.status, 1);
    assert.match(older.stderr, new RegExp(`${current.replace(/\./g, '\\.')} is not newer than the current`));
    const nonsense = script('prepare-release.mjs', 'next', '--dry-run');
    assert.equal(nonsense.status, 1);
    assert.match(nonsense.stderr, /is not a version/);
    assert.doesNotMatch(older.stderr + nonsense.stderr, /at file:\/\//, 'a refusal printed a stack trace');
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
