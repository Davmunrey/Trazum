import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The linter's configuration, held to what `CONTRIBUTING.md` says about it.
 *
 * The linter itself runs as its own step, in `npm run verify` and in CI. What
 * a linter cannot check is its own configuration: that it still runs on the
 * whole repository, that a warning still fails, and that every rule somebody
 * switched off, and every line somebody excused, says why. A rule turned off
 * with no reason is indistinguishable, a year later, from a rule turned off
 * because it was inconvenient that afternoon.
 */

const ROOT = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const config = read('biome.jsonc');
const manifest = JSON.parse(read('package.json'));

describe('the linter runs on everything, and a warning fails', () => {
  it('is one command, over the whole repository, that fails on a warning', () => {
    assert.equal(manifest.scripts.lint, 'biome lint --error-on-warnings .');
  });

  it('is the first thing verify does, and a step of CI before the build', () => {
    assert.match(manifest.scripts.verify, /^npm run lint && npm run build && /);
    const ci = read('.github/workflows/ci.yml');
    const lint = ci.indexOf('        run: npm run lint\n');
    assert.notEqual(lint, -1, 'CI no longer runs the linter');
    assert.ok(lint < ci.indexOf('        run: npm run build\n'), 'the linter should not wait for a build it does not need');
  });

  it('is pinned to one exact version, the one its schema names', () => {
    const version = manifest.devDependencies['@biomejs/biome'];
    assert.match(version, /^\d+\.\d+\.\d+$/, 'a range lets a new rule fail a pull request that changed nothing');
    assert.ok(config.includes(`"$schema": "https://biomejs.dev/schemas/${version}/schema.json"`));
  });

  it('excludes only what is not this repository\'s to edit, and what git ignores', () => {
    assert.match(config, /"files": \{ "includes": \["\*\*", "!\.claude\/skills\/synced"\] \}/);
    assert.match(config, /"vcs": \{ "enabled": true, "clientKind": "git", "useIgnoreFile": true \}/);
  });

  it('lints and does not format', () => {
    assert.match(config, /"formatter": \{ "enabled": false \}/);
    assert.match(config, /"assist": \{ "enabled": false \}/);
  });
});

describe('nothing is switched off without saying why', () => {
  const lines = config.split('\n');

  it('has a comment directly above every rule that is off, or above the group of them it explains', () => {
    const unexplained = [];
    lines.forEach((line, index) => {
      if (!/^\s*"[A-Za-z]+": "off",?$/.test(line)) return;
      // Walk up past other switched-off rules: one comment may explain several in a row.
      let above = index - 1;
      while (above >= 0 && /^\s*"[A-Za-z]+": "off",?$/.test(lines[above])) above -= 1;
      if (!/^\s*\/\//.test(lines[above] ?? '')) unexplained.push(line.trim());
    });
    assert.deepEqual(unexplained, []);
  });

  it('switches off whole groups only for a reason given at the top', () => {
    const groupsOff = [...config.matchAll(/"([a-z0-9]+)": \{ "preset": "none" \}/g)].map((match) => match[1]);
    assert.deepEqual(groupsOff, ['style']);
    assert.match(config.slice(0, config.indexOf('{')), /The style group is off/);
  });

  it('counts the rules that are off, so adding one is a decision somebody sees', () => {
    const off = lines.filter((line) => /^\s*"[A-Za-z]+": "off",?$/.test(line)).length;
    assert.equal(off, 16, 'a rule was switched off or back on: say which and why in the pull request, then change this number');
  });

  it('names an open issue for every rule that is off until something else is done', () => {
    for (const [, issue] of config.matchAll(/#(\d+)/g)) {
      assert.ok(Number(issue) > 0);
    }
    // The three React rules wait for #696; the file must still say so while they are off.
    for (const rule of ['noArrayIndexKey', 'useExhaustiveDependencies', 'noComponentHookFactories']) {
      if (config.includes(`"${rule}": "off"`)) assert.match(config, /#696/, rule);
    }
  });
});

describe('a line excused from a rule says why, in a sentence', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((path) => /\.(?:ts|tsx|js|mjs|css|html)$/.test(path) && !path.startsWith('.claude/skills/synced/'));
  const excuses = [];
  for (const path of tracked) {
    const text = read(path);
    for (const match of text.matchAll(/biome-ignore(?:-all)? (lint\/[A-Za-z0-9]+\/[A-Za-z]+)(?::\s*([^\n]*?))?\s*(?:\*\/\}?)?$/gm)) {
      excuses.push({ path, rule: match[1], reason: (match[2] ?? '').trim() });
    }
  }

  it('finds the excuses it is checking', () => {
    assert.ok(excuses.length >= 6, `only ${excuses.length} found: has the comment's form changed?`);
  });

  it('gives each a reason long enough to be one', () => {
    const thin = excuses.filter((excuse) => excuse.reason.length < 40);
    assert.deepEqual(thin, []);
  });

  it('never excuses a whole file', () => {
    for (const path of tracked) {
      if (path === 'packages/core/test/lint.test.js') continue;
      assert.equal(read(path).includes('biome-ignore-all'), false, path);
    }
  });
});
