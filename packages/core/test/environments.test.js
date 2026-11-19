import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from '../../cli/test/env.mjs';
import { FILE, body, compare, liveTerms, report, stated } from '../../../scripts/environments.mjs';

/**
 * The GitHub Environments, as `.github/environments.json` states them.
 *
 * An environment is where a job meets its credentials and its approval:
 * `release` holds the npm token and publishes, `production` holds the Vercel
 * token and promotes the web app. A reviewer taken off either on the
 * settings page makes publishing or promoting a step nobody approves, and no
 * pull request shows it. So the file is the policy, `scripts/environments.mjs`
 * compares GitHub with it the way `ruleset.mjs` does for the branch, and
 * these tests hold the comparison and the file to the workflows that use it.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const policy = stated();
const env = (name) => policy.environments.find((entry) => entry.name === name);

/** What GitHub answers for an environment that is exactly the file's. */
function liveOf(entry, secrets = entry.secrets) {
  const custom = entry.branches !== null;
  return {
    environment: {
      name: entry.name,
      protection_rules: [
        { id: 1, type: 'required_reviewers', prevent_self_review: entry.prevent_self_review, reviewers: entry.reviewers.map((login) => ({ type: 'User', reviewer: { login, id: 7 } })) },
        ...(custom ? [{ id: 2, type: 'branch_policy' }] : []),
      ],
      deployment_branch_policy: custom ? { protected_branches: false, custom_branch_policies: true } : null,
    },
    policies: custom ? { total_count: 0, branch_policies: [...entry.branches.map((name) => ({ name, type: 'branch' })), ...entry.tags.map((name) => ({ name, type: 'tag' }))] } : null,
    secrets: { total_count: secrets.length, secrets: secrets.map((name) => ({ name })) },
  };
}
const allLive = () => Object.fromEntries(policy.environments.map((entry) => [entry.name, liveOf(entry)]));

describe('the file states the three environments, each with a reviewer', () => {
  it('names staging, production and release, and nothing in it is a credential', () => {
    assert.deepEqual(policy.environments.map((entry) => entry.name).sort(), ['production', 'release', 'staging']);
    for (const entry of policy.environments) {
      assert.ok(entry.reviewers.length > 0, `${entry.name} has nobody to approve`);
      assert.equal(entry.wait_timer, 0);
      assert.equal(typeof entry.why, 'string');
    }
    assert.doesNotMatch(read(FILE), /npm_[A-Za-z0-9]{20,}|\bprj_[A-Za-z0-9]{12,}|\bteam_[A-Za-z0-9]{12,}|ghp_|github_pat_/);
  });

  it('lets main alone into staging and production', () => {
    for (const name of ['staging', 'production']) {
      assert.deepEqual(env(name).branches, ['main'], name);
      assert.deepEqual(env(name).tags, [], name);
    }
  });

  it('declares every secret a job under an environment reads, on that environment', () => {
    const workflows = readdirSync(join(ROOT, '.github/workflows')).filter((name) => /\.ya?ml$/.test(name));
    let seen = 0;
    for (const name of workflows) {
      const text = read(`.github/workflows/${name}`).replace(/^\s*#.*$/gm, '');
      for (const job of text.split(/^ {2}(?=[a-z][a-z-]*:$)/m).slice(1)) {
        const environment = job.match(/^ {4}environment: ([a-z-]+)$/m)?.[1] ?? job.match(/^ {4}environment:\n {6}name: ([a-z-]+)$/m)?.[1];
        if (environment === undefined) continue;
        seen += 1;
        const declared = env(environment);
        assert.ok(declared, `${name} runs a job under ${environment}, which ${FILE} does not state`);
        for (const [, secret] of job.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)) {
          assert.ok([...declared.secrets, ...declared.optional_secrets].includes(secret), `${name} reads ${secret} under ${environment}, which ${FILE} does not list there`);
        }
      }
    }
    assert.ok(seen >= 2, 'no job under an environment was found: is this reading the workflows?');
  });
});

describe('GitHub is compared with the file, environment by environment', () => {
  it('finds nothing when GitHub has what the file states', () => {
    assert.deepEqual(compare(policy, allLive()), { differences: [], notRead: [] });
  });

  it('finds a reviewer taken off, a branch let in, a timer, and self-approval forbidden', () => {
    const live = allLive();
    live.production.environment.protection_rules = live.production.environment.protection_rules.filter((rule) => !rule.reviewers);
    live.staging.environment.deployment_branch_policy = null;
    live.staging.policies = null;
    live.release.environment.protection_rules.push({ id: 3, type: 'wait_timer', wait_timer: 30 });
    live.release.environment.protection_rules[0].prevent_self_review = true;
    const where = compare(policy, live).differences.map((entry) => entry.where).sort();
    assert.deepEqual(where, ['production, reviewers', 'release, prevent_self_review', 'release, wait_timer', 'staging, branches', 'staging, tags']);
  });

  it('finds an environment that is gone, and one limited to protected branches', () => {
    const live = allLive();
    live.staging = { environment: null, policies: null, secrets: null };
    live.production.environment.deployment_branch_policy = { protected_branches: true, custom_branch_policies: false };
    const where = compare(policy, live).differences.map((entry) => entry.where).sort();
    assert.deepEqual(where, ['production, branches', 'production, protected_branches', 'staging']);
  });

  it('finds a secret missing and one nobody stated, by name, and says only the owner adds one', () => {
    const live = allLive();
    live.production = liveOf(env('production'), ['VERCEL_PROJECT_ID', 'SOMETHING_ELSE']);
    const found = compare(policy, live).differences;
    assert.deepEqual(found.map((entry) => entry.where).sort(), ['production, secret SOMETHING_ELSE', 'production, secret VERCEL_TOKEN']);
    assert.match(found.find((entry) => entry.where.endsWith('VERCEL_TOKEN')).fix, /Add environment secret: VERCEL_TOKEN/);
    // An optional secret is neither missing when absent nor unstated when present.
    live.production = liveOf(env('production'), [...env('production').secrets, 'VERCEL_TEAM_ID']);
    assert.deepEqual(compare(policy, live).differences, []);
  });

  it('says what it was not shown, and does not call it fine or a failure', () => {
    const live = allLive();
    for (const name of Object.keys(live)) live[name].secrets = null;
    const found = compare(policy, live);
    assert.deepEqual(found.differences, []);
    assert.equal(found.notRead.length, 3);
    assert.match(report(found).join('\n'), /Not read: .*secrets.*Not read is not fine/);
  });

  it('reads reviewers, timer and policies off what GitHub answers', () => {
    const terms = liveTerms(liveOf(env('production')).environment, liveOf(env('production')).policies);
    assert.deepEqual(terms, { reviewers: ['Davmunrey'], prevent_self_review: false, wait_timer: 0, protected_branches: false, branches: ['main'], tags: [] });
  });

  it('sends reviewers as ids, and a branch policy only where the file limits one', () => {
    assert.deepEqual(body(env('production'), [7]), {
      wait_timer: 0,
      prevent_self_review: false,
      reviewers: [{ type: 'User', id: 7 }],
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
    });
    assert.equal(body(env('release'), [7]).deployment_branch_policy, null);
    assert.ok(!JSON.stringify(body(env('production'), [7])).includes('secret'), 'a secret would be sent');
  });
});

describe('the script, run against a file', () => {
  const run = (live, ...args) => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-environments-'));
    try {
      writeFileSync(join(dir, 'live.json'), JSON.stringify(live));
      return spawnSync(process.execPath, [join(ROOT, 'scripts/environments.mjs'), ...args, '--live', join(dir, 'live.json')], { cwd: ROOT, env: SPAWN_ENV, encoding: 'utf8' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('exits 0 when GitHub agrees, 1 when it does not, and 0 with --report', () => {
    assert.equal(run(allLive()).status, 0);
    const drifted = allLive();
    drifted.release.environment.protection_rules = [];
    const result = run(drifted);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /release, reviewers/);
    assert.equal(run(drifted, '--report').status, 0);
  });

  it('refuses to apply to a file', () => {
    const drifted = allLive();
    drifted.release.environment.protection_rules = [];
    const result = run(drifted, 'apply', '--yes');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /cannot be given a --live file/);
  });
});

describe('the weekly settings run reads the environments and can never write them', () => {
  const workflow = read('.github/workflows/settings.yml');
  it('compares them, reporting on a pull request and failing on the schedule', () => {
    assert.match(workflow, /if \[ "\$EVENT" = "pull_request" \]; then node scripts\/environments\.mjs --report; else node scripts\/environments\.mjs; fi/);
    for (const path of ['scripts/environments.mjs', FILE]) assert.ok(workflow.includes(`            ${path}\n`), path);
  });

  it('package.json has the command', () => {
    assert.equal(JSON.parse(read('package.json')).scripts.environments, 'node scripts/environments.mjs');
  });
});
