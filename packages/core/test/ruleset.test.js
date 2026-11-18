import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SPAWN_ENV } from '../../cli/test/env.mjs';
import { ADMIN_ONLY, FILE, SETTINGS, TOP, body, canonical, compare, compareSettings, report, settingsBody } from '../../../scripts/ruleset.mjs';

/**
 * The comparison between the branch ruleset this repository states and the
 * one GitHub enforces, and the workflow that runs it every week.
 *
 * The file was always tested: the job names in it, the merge method. What
 * GitHub actually enforced was never read, and on 2026-11-18 it was found to
 * be an older copy. `scripts/ruleset.mjs` reads it. What can go wrong with a
 * comparison is that it agrees too easily, and what can go wrong with the
 * workflow is that it learns to write. Both are held here, without a network:
 * the live side is a file, the way the script takes it with `--ruleset`.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const stated = JSON.parse(read(FILE));

/** What GitHub answers for a ruleset that is exactly the file, with the fields it adds. */
function live(change = () => {}) {
  const copy = structuredClone(stated);
  const answer = { id: 7, node_id: 'RRS_x', source_type: 'Repository', source: 'o/r', _links: {}, current_user_can_bypass: 'never', ...copy };
  change(answer);
  return answer;
}
const rule = (ruleset, type) => ruleset.rules.find((entry) => entry.type === type);
const wanted = Object.fromEntries(SETTINGS.map((setting) => [setting.key, setting.want]));

describe('the live ruleset is compared with the file, rule by rule', () => {
  it('finds nothing when GitHub enforces the file', () => {
    assert.deepEqual(compare(stated, live()), { differences: [], unstated: [], notRead: [] });
  });

  it('does not mind the order GitHub lists things in', () => {
    const shuffled = live((answer) => {
      answer.rules.reverse();
      rule(answer, 'required_status_checks').parameters.required_status_checks.reverse();
    });
    assert.deepEqual(compare(stated, shuffled).differences, []);
    assert.deepEqual(canonical({ b: [2, 1], a: 1 }), { a: 1, b: [1, 2] });
  });

  it('names the required check GitHub does not require', () => {
    // The drift found on 2026-11-18: the file required `PR readiness`, the
    // live copy did not, and nothing said so.
    const drifted = live((answer) => {
      const checks = rule(answer, 'required_status_checks').parameters;
      checks.required_status_checks = checks.required_status_checks.filter((check) => check.context !== 'PR readiness');
    });
    const [found, ...rest] = compare(stated, drifted).differences;
    assert.deepEqual(rest, []);
    assert.equal(found.where, 'rule required_status_checks, required_status_checks');
    assert.deepEqual(found.onlyStated, ['{"context":"PR readiness"}']);
    assert.deepEqual(found.onlyLive, []);
  });

  it('names the merge method GitHub allows and the file does not', () => {
    const drifted = live((answer) => {
      rule(answer, 'pull_request').parameters.allowed_merge_methods = ['merge', 'squash'];
    });
    const [found] = compare(stated, drifted).differences;
    assert.equal(found.where, 'rule pull_request, allowed_merge_methods');
    assert.deepEqual(found.onlyLive, ['"merge"']);
  });

  it('finds a rule that is stated and not enforced, and one enforced and not stated', () => {
    const missing = live((answer) => {
      answer.rules = answer.rules.filter((entry) => entry.type !== 'required_linear_history');
    });
    assert.deepEqual(compare(stated, missing).differences, [{ where: 'rule required_linear_history', stated: 'enforced', live: 'not enforced' }]);
    const extra = live((answer) => {
      answer.rules.push({ type: 'required_signatures' });
    });
    assert.deepEqual(compare(stated, extra).differences, [{ where: 'rule required_signatures', stated: 'not stated', live: 'enforced' }]);
  });

  it('finds a ruleset that is switched off, aimed elsewhere, or that somebody may bypass', () => {
    for (const [key, value] of [
      ['enforcement', 'disabled'],
      ['enforcement', 'evaluate'],
      ['name', 'Protect main (old)'],
      ['conditions', { ref_name: { include: ['refs/heads/release'], exclude: [] } }],
      ['bypass_actors', [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }]],
    ]) {
      const changed = live((answer) => {
        answer[key] = value;
      });
      assert.deepEqual(compare(stated, changed).differences.map((found) => found.where), [key], `${key} = ${JSON.stringify(value)}`);
    }
    assert.deepEqual(TOP, ['name', 'target', 'enforcement', 'conditions', 'bypass_actors']);
  });

  it('finds a single parameter that was loosened', () => {
    for (const [type, key, value] of [
      ['pull_request', 'required_review_thread_resolution', false],
      ['pull_request', 'require_code_owner_review', false],
      ['required_status_checks', 'strict_required_status_checks_policy', false],
      ['code_scanning', 'code_scanning_tools', [{ tool: 'CodeQL', security_alerts_threshold: 'high_or_higher', alerts_threshold: 'all' }]],
      ['code_quality', 'severity', 'errors'],
    ]) {
      const changed = live((answer) => {
        rule(answer, type).parameters[key] = value;
      });
      assert.deepEqual(compare(stated, changed).differences.map((found) => found.where), [`rule ${type}, ${key}`]);
    }
  });

  it('prints a parameter the file is silent about, and does not judge it', () => {
    const more = live((answer) => {
      rule(answer, 'pull_request').parameters.required_reviewers = [];
      rule(answer, 'required_status_checks').parameters.do_not_enforce_on_create = false;
    });
    assert.deepEqual(compare(stated, more), {
      differences: [],
      notRead: [],
      unstated: [
        { where: 'rule pull_request, required_reviewers', live: '[]' },
        { where: 'rule required_status_checks, do_not_enforce_on_create', live: 'false' },
      ],
    });
  });

  it('who may bypass, left out of the answer, is not read: neither empty nor a difference', () => {
    // Measured on 2026-11-18 on a runner: the workflow's token got a ruleset
    // with no `bypass_actors` field, where an admin's got `[]`. Comparing the
    // absence with `[]` would fail every Monday for something nobody changed.
    const shown = live((answer) => {
      delete answer.bypass_actors;
    });
    const found = compare(stated, shown);
    assert.deepEqual(found.differences, []);
    assert.deepEqual(found.notRead, ['bypass_actors']);
    const lines = report({ ruleset: found, settings: { differences: [], notRead: ['allow_merge_commit'] } }).join('\n');
    assert.match(lines, /Not read: bypass_actors, allow_merge_commit\. /);
    assert.deepEqual(ADMIN_ONLY, ['bypass_actors']);
  });

  it('any other field left out is a difference: only what was measured is excused', () => {
    for (const key of TOP.filter((name) => !ADMIN_ONLY.includes(name))) {
      const shown = live((answer) => {
        delete answer[key];
      });
      const found = compare(stated, shown);
      assert.deepEqual(found.differences.map((entry) => entry.where), [key]);
      assert.deepEqual(found.notRead, []);
    }
  });

  it('says so when GitHub has no ruleset of that name', () => {
    const { differences } = compare(stated, null);
    assert.equal(differences.length, 1);
    assert.match(differences[0].live, /none of that name/);
  });
});

describe('the merge settings the ruleset leans on', () => {
  it('finds each one that is not what the ruleset needs, with why', () => {
    for (const setting of SETTINGS) {
      const { differences, notRead } = compareSettings({ ...wanted, [setting.key]: !setting.want });
      assert.deepEqual(notRead, []);
      assert.deepEqual(differences.map((found) => [found.where, found.why]), [[`setting ${setting.key}`, setting.why]]);
    }
    assert.deepEqual(compareSettings(wanted), { differences: [], notRead: [] });
  });

  it('a setting the token was not shown is not read, which is neither fine nor a failure', () => {
    const { differences, notRead } = compareSettings({ full_name: 'o/r' });
    assert.deepEqual(differences, []);
    assert.deepEqual(notRead, SETTINGS.map((setting) => setting.key));
    const lines = report({ ruleset: { differences: [], unstated: [], notRead: [] }, settings: { differences, notRead } }).join('\n');
    assert.match(lines, /Not read: allow_squash_merge, /);
    assert.match(lines, /Not read is not fine/);
  });

  it('are the ones the file implies, each with a reason a person can read', () => {
    // Squash is the only method in the file, and linear history is required:
    // so the two other buttons are off and squash is on.
    assert.deepEqual(rule(stated, 'pull_request').parameters.allowed_merge_methods, ['squash']);
    assert.ok(rule(stated, 'required_linear_history'));
    assert.equal(wanted.allow_squash_merge, true);
    assert.equal(wanted.allow_merge_commit, false);
    assert.equal(wanted.allow_rebase_merge, false);
    // A branch must be current with main, so the button that makes it so is on.
    assert.equal(rule(stated, 'required_status_checks').parameters.strict_required_status_checks_policy, true);
    assert.equal(wanted.allow_update_branch, true);
    // Sign-off is checked on every commit, so the browser adds it.
    assert.match(read('.github/workflows/dco.yml'), /Signed-off-by/);
    assert.equal(wanted.web_commit_signoff_required, true);
    for (const setting of SETTINGS) assert.ok(setting.why.length >= 60, `${setting.key} has no reason worth reading`);
    assert.equal(new Set(SETTINGS.map((setting) => setting.key)).size, SETTINGS.length);
  });
});

describe('applying changes what the file states and nothing else', () => {
  const drifted = live((answer) => {
    const pr = rule(answer, 'pull_request').parameters;
    pr.allowed_merge_methods = ['merge', 'squash'];
    pr.require_extra_approval_for_unattributed_changes = true;
    answer.rules.push({ type: 'required_signatures' });
  });
  const sent = body(stated, drifted);

  it('sends a ruleset that compares equal to the file', () => {
    assert.deepEqual(compare(stated, sent).differences, []);
    assert.deepEqual(rule(sent, 'pull_request').parameters.allowed_merge_methods, ['squash']);
    assert.equal(rule(sent, 'required_signatures'), undefined);
  });

  it('keeps a parameter the file is silent about as GitHub has it', () => {
    assert.equal(rule(sent, 'pull_request').parameters.require_extra_approval_for_unattributed_changes, true);
  });

  it('sends only what a ruleset is made of, not what GitHub wrapped it in', () => {
    assert.deepEqual(Object.keys(sent).sort(), [...TOP, 'rules'].sort());
    for (const entry of sent.rules) assert.deepEqual(Object.keys(entry).filter((key) => key !== 'type' && key !== 'parameters'), []);
  });

  it('can create the ruleset when GitHub has none', () => {
    assert.deepEqual(compare(stated, body(stated, null)).differences, []);
  });

  it('sends only the settings that are wrong', () => {
    assert.deepEqual(settingsBody({ ...wanted, allow_merge_commit: true }), { allow_merge_commit: false });
    assert.deepEqual(settingsBody(wanted), {});
    assert.deepEqual(settingsBody({}), {}, 'a setting that was not read is not written blind');
  });
});

describe('the command, given files in place of GitHub', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-ruleset-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const file = (name, value) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(value));
    return path;
  };
  const same = file('same.json', live());
  const drifted = file('drifted.json', live((answer) => {
    answer.enforcement = 'disabled';
  }));
  const settings = file('settings.json', wanted);
  const wrong = file('wrong.json', { ...wanted, allow_merge_commit: true });
  const run = (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts/ruleset.mjs'), ...args], { cwd: ROOT, env: SPAWN_ENV, encoding: 'utf8', timeout: 20_000 });

  it('exits 0 and says so when the two agree', () => {
    const result = run('--ruleset', same, '--repository', settings);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`^GitHub enforces what ${FILE.replaceAll('.', '\\.')} states\\.$`, 'm'));
  });

  it('exits 1 on a ruleset that differs, and on a setting that does', () => {
    const ruleset = run('--ruleset', drifted, '--repository', settings);
    assert.equal(ruleset.status, 1);
    assert.match(ruleset.stdout, /1 difference\(s\)/);
    assert.match(ruleset.stdout, /stated: {2}"active"\n {4}GitHub: {2}"disabled"/);
    assert.equal(run('--ruleset', same, '--repository', wrong).status, 1);
  });

  it('with --report prints the same and exits 0, which is what a pull request gets', () => {
    const result = run('--ruleset', drifted, '--repository', settings, '--report');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /1 difference\(s\)/);
  });

  it('does not fail on settings it was not shown', () => {
    const result = run('--ruleset', same, '--repository', file('bare.json', { full_name: 'o/r' }));
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Not read: /);
  });

  it('refuses to apply to a file', () => {
    const result = run('apply', '--yes', '--ruleset', drifted, '--repository', settings);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /apply talks to GitHub/);
  });
});

/**
 * A stand-in for `gh`, first on the PATH: it answers the three reads from
 * files in its directory, writes down every call, and takes a write, refuses
 * it (the file `refuse`) or accepts it and does nothing (the file `ignore`).
 * So the whole of `apply` runs here, with nothing sent anywhere.
 */
const STAND_IN = `#!/usr/bin/env node
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const at = (name) => join(__dirname, name);
const args = process.argv.slice(2);
const method = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET';
const path = args.find((arg) => arg.startsWith('repos/'));
const sent = method === 'GET' ? '' : readFileSync(0, 'utf8');
appendFileSync(at('calls.log'), JSON.stringify({ method, path, sent: sent === '' ? null : JSON.parse(sent) }) + '\\n');
if (method !== 'GET' && existsSync(at('refuse'))) {
  process.stderr.write('gh: Resource not accessible by personal access token (HTTP 403)\\n');
  process.exit(1);
}
if (method !== 'GET' && existsSync(at('ignore'))) process.exit(0);
const ruleset = existsSync(at('ruleset.json')) ? JSON.parse(readFileSync(at('ruleset.json'), 'utf8')) : null;
if (path === 'repos/o/r/rulesets' && method === 'GET') process.stdout.write(JSON.stringify(ruleset === null ? [] : [{ id: ruleset.id, name: ruleset.name }]));
else if (path === 'repos/o/r/rulesets' && method === 'POST') writeFileSync(at('ruleset.json'), JSON.stringify({ id: 9, ...JSON.parse(sent) }));
else if (path === 'repos/o/r/rulesets/7' && method === 'GET') process.stdout.write(JSON.stringify(ruleset));
else if (path === 'repos/o/r/rulesets/7' && method === 'PUT') writeFileSync(at('ruleset.json'), JSON.stringify({ id: 7, ...JSON.parse(sent) }));
else if (path === 'repos/o/r/rulesets/9' && method === 'GET') process.stdout.write(JSON.stringify(ruleset));
else if (path === 'repos/o/r' && method === 'GET') process.stdout.write(readFileSync(at('repo.json'), 'utf8'));
else if (path === 'repos/o/r' && method === 'PATCH') writeFileSync(at('repo.json'), JSON.stringify({ ...JSON.parse(readFileSync(at('repo.json'), 'utf8')), ...JSON.parse(sent) }));
else { process.stderr.write('stand-in gh: unexpected ' + method + ' ' + path + '\\n'); process.exit(1); }
`;

describe('the command, against a stand-in for gh', () => {
  const dirs = [];
  after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });
  /** A GitHub in a directory: the 2026-11-18 drift unless told otherwise. */
  function github({ ruleset = 'drifted', refuse = false, ignore = false } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-gh-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'gh'), STAND_IN);
    chmodSync(join(dir, 'gh'), 0o755);
    if (ruleset === 'drifted') {
      writeFileSync(join(dir, 'ruleset.json'), JSON.stringify(live((answer) => {
        const checks = rule(answer, 'required_status_checks').parameters;
        checks.required_status_checks = checks.required_status_checks.filter((check) => check.context !== 'PR readiness');
        checks.do_not_enforce_on_create = false;
        rule(answer, 'pull_request').parameters.allowed_merge_methods = ['merge', 'squash'];
      })));
    }
    writeFileSync(join(dir, 'repo.json'), JSON.stringify({ ...wanted, full_name: 'o/r', allow_merge_commit: true, allow_update_branch: false }));
    if (refuse) writeFileSync(join(dir, 'refuse'), '');
    if (ignore) writeFileSync(join(dir, 'ignore'), '');
    const env = { ...SPAWN_ENV, PATH: `${dir}${delimiter}${SPAWN_ENV.PATH ?? process.env.PATH}`, GH_REPO: '', GITHUB_REPOSITORY: '' };
    return {
      run: (...args) => spawnSync(process.execPath, [join(ROOT, 'scripts/ruleset.mjs'), ...args, '--repo', 'o/r'], { cwd: ROOT, env, encoding: 'utf8', timeout: 20_000 }),
      calls: () => (existsSync(join(dir, 'calls.log')) ? readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : []),
      state: () => ({ ruleset: JSON.parse(readFileSync(join(dir, 'ruleset.json'), 'utf8')), repo: JSON.parse(readFileSync(join(dir, 'repo.json'), 'utf8')) }),
    };
  }
  const writes = (calls) => calls.filter((call) => call.method !== 'GET');

  it('reads the ruleset and the settings, and exits 1 on the drift', () => {
    const hub = github();
    const result = hub.run();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /4 difference\(s\)/);
    assert.match(result.stdout, /only in the file: {2}\{"context":"PR readiness"\}/);
    assert.match(result.stdout, /only on GitHub: {4}"merge"/);
    assert.deepEqual(writes(hub.calls()), []);
  });

  it('apply without --yes says what differs and writes nothing', () => {
    const hub = github();
    const result = hub.run('apply');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Nothing was changed\. To change o\/r so that it enforces the file: npm run ruleset -- apply --yes/);
    assert.deepEqual(writes(hub.calls()), []);
  });

  it('apply --yes writes the ruleset and the settings, reads again, and exits 0', () => {
    const hub = github();
    const result = hub.run('apply', '--yes');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const sent = writes(hub.calls());
    assert.deepEqual(sent.map((call) => [call.method, call.path]), [['PUT', 'repos/o/r/rulesets/7'], ['PATCH', 'repos/o/r']]);
    assert.deepEqual(sent[1].sent, { allow_merge_commit: false, allow_update_branch: true });
    assert.equal(sent[0].sent.id, undefined);
    const { ruleset, repo } = hub.state();
    assert.deepEqual(compare(stated, ruleset).differences, []);
    assert.equal(rule(ruleset, 'required_status_checks').parameters.do_not_enforce_on_create, false, 'a parameter the file is silent about was changed');
    assert.deepEqual(compareSettings(repo).differences, []);
    assert.match(result.stdout, /Read again, after the change:\n\nGitHub enforces what /);
  });

  it('a refused write changes nothing, says who can do it, and exits 1', () => {
    const hub = github({ refuse: true });
    const before = hub.state();
    const result = hub.run('apply', '--yes');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /GitHub refused the change/);
    assert.match(result.stderr, /HTTP 403/);
    assert.match(result.stderr, /needs an admin of o\/r/);
    assert.deepEqual(hub.state(), before);
    assert.doesNotMatch(result.stdout, /Read again/);
  });

  it('a write GitHub accepted and did not make is found by reading again, and exits 1', () => {
    // An answer of 200 is not the change. What is judged is the second reading.
    const hub = github({ ignore: true });
    const result = hub.run('apply', '--yes');
    assert.equal(writes(hub.calls()).length, 2);
    assert.match(result.stdout, /Read again, after the change:\n\nGitHub does not enforce what /);
    assert.equal(result.status, 1);
  });

  it('creates the ruleset when GitHub has none of that name', () => {
    const hub = github({ ruleset: 'none' });
    assert.match(hub.run().stdout, /none of that name/);
    const result = hub.run('apply', '--yes');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(writes(hub.calls()).map((call) => [call.method, call.path]), [['POST', 'repos/o/r/rulesets'], ['PATCH', 'repos/o/r']]);
  });

  it('writes nothing when there is nothing to change', () => {
    const hub = github();
    hub.run('apply', '--yes');
    const before = hub.calls().length;
    const result = hub.run('apply', '--yes');
    assert.equal(result.status, 0);
    assert.deepEqual(writes(hub.calls().slice(before)), []);
  });
});

describe('writing happens in one place, behind one flag', () => {
  const script = read('scripts/ruleset.mjs');

  it('every write to GitHub comes after the check for --yes', () => {
    const gate = script.indexOf("if (!argv.includes('--yes'))");
    assert.ok(gate > 0, 'the --yes gate is gone');
    const writes = [...script.matchAll(/'--method', '(POST|PUT|PATCH|DELETE)'/g)];
    assert.deepEqual(writes.map((match) => match[1]), ['POST', 'PUT', 'PATCH']);
    for (const write of writes) assert.ok(write.index > gate, `${write[1]} is reachable without --yes`);
    // And the gate returns: it is not a message printed on the way to writing.
    assert.match(script.slice(gate, gate + 400), /Nothing was changed[^\n]+\n\s+return 1;/);
  });

  it('reads the ruleset again after writing, and judges that', () => {
    assert.match(script, /Read again, after the change/);
    const written = script.indexOf("'--method', 'PATCH'");
    assert.ok(script.indexOf('const again = read(argv, stated);') > written);
  });

  it('asks GitHub through gh with arguments, never through a shell', () => {
    assert.match(script, /execFileSync\('gh', args,/);
    assert.doesNotMatch(script, /\bexecSync\(|shell: true/);
  });
});

describe('the workflow reads every week and can never write', () => {
  const workflow = read('.github/workflows/settings.yml');
  const runs = [...workflow.matchAll(/^\s+run: \|\n((?:\s{10,}.*\n?)+)/gm)].map((match) => match[1]);

  it('runs on a schedule, and fails there', () => {
    assert.match(workflow, /^ {2}schedule:\n(?: {4}#.*\n)* {4}- cron: '\d+ \d+ \* \* 1'$/m);
    assert.equal(runs.length, 1);
    assert.match(runs[0], /if \[ "\$EVENT" = "pull_request" \]; then node scripts\/ruleset\.mjs --report; else node scripts\/ruleset\.mjs; fi/);
  });

  it('never applies', () => {
    const code = workflow.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
    assert.doesNotMatch(code, /\bapply\b/);
    assert.doesNotMatch(code, /--yes/);
  });

  it('has a token that can read and nothing more, and no secret', () => {
    const permissions = [...workflow.matchAll(/^\s*permissions:\n((?:\s+[a-z-]+: [a-z]+\n)+)/gm)].map((match) => match[1].trim().split('\n').map((line) => line.trim()));
    assert.deepEqual(permissions, [['contents: read'], ['contents: read']]);
    assert.doesNotMatch(workflow, /secrets\./);
    assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
    assert.match(workflow, /persist-credentials: false/);
  });

  it('is not a required check: it judges GitHub, not a pull request', () => {
    const [, job] = workflow.match(/^ {4}name: (.+)$/m) ?? [];
    assert.ok(job);
    const required = rule(stated, 'required_status_checks').parameters.required_status_checks.map((check) => check.context);
    assert.ok(!required.includes(job));
  });

  it('checks out the three files the script reads', () => {
    for (const path of ['scripts/ruleset.mjs', FILE, 'package.json']) assert.ok(workflow.includes(`            ${path}\n`), path);
  });
});

describe('the documents say what the command does', () => {
  it('package.json has the command', () => {
    assert.equal(JSON.parse(read('package.json')).scripts.ruleset, 'node scripts/ruleset.mjs');
  });

  it('SECURITY.md no longer says nothing syncs the ruleset, and gives the command', () => {
    const security = read('SECURITY.md');
    assert.doesNotMatch(security, /nothing syncs it/);
    assert.ok(security.includes('npm run ruleset -- apply --yes'));
    assert.ok(security.includes('npm run ruleset'));
    // Each setting is named in the paragraph that lists them, and that
    // paragraph is bounded by its own first words and the blank line after
    // it: `web_commit_signoff_required` is also named further down, and a
    // search of the whole file would be satisfied by that.
    const start = security.indexOf('The merge settings the ruleset leans on');
    assert.ok(start > 0, 'the paragraph that lists the settings is gone');
    const listed = security.slice(start, security.indexOf('\n\n', start));
    for (const setting of SETTINGS) assert.ok(listed.includes(`\`${setting.key}\``), `SECURITY.md does not list ${setting.key}`);
    // What the weekly run is not shown is said, by name, where an admin will read it.
    for (const key of ADMIN_ONLY) assert.ok(security.includes(`\`${key}\``), `SECURITY.md does not say ${key} is not read by the weekly run`);
    assert.match(security, /not read/);
  });
});
