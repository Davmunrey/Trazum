#!/usr/bin/env node
/**
 * Are the GitHub Environments GitHub enforces the ones this repository states?
 *
 *   npm run environments                    compare; exit 1 when they differ
 *   npm run environments -- --report        compare; exit 0 whatever it finds
 *   npm run environments -- apply           say what would change; change nothing
 *   npm run environments -- apply --yes     change it, then compare again
 *
 * `.github/environments.json` is the policy, the way
 * `.github/rulesets/main-branch.json` is for the branch (scripts/ruleset.mjs,
 * whose shape this follows). An environment is where a workflow job meets its
 * credentials and its approval: `release` holds the npm token and publishes,
 * `production` holds the Vercel token and promotes the web app. A reviewer
 * removed from either on the settings page would make publishing or
 * promoting a step nobody approves, and no pull request would show it.
 *
 * Per environment it compares the required reviewers, whether the person who
 * started a run may approve it, the wait timer, the branches and tags that
 * may use it, and the names of its secrets. **Names only.** A secret's value
 * is never read, written, printed or stated: GitHub does not hand one back,
 * and `apply` never sends one. A missing secret is reported with where to
 * add it; only the owner can.
 *
 * Reading goes through `gh api`. GitHub shows an environment and its branch
 * policies to anybody who can read the repository, and its secrets' names
 * only to an admin, so a run with the workflow's token says "not read" for
 * the secrets. Not read is not fine, and it is not a failure either.
 * Writing needs an admin's own token and happens only with `apply --yes`.
 *
 *   node scripts/environments.mjs --live live.json
 *
 * compares against a file instead of asking GitHub, which is how the tests
 * run it. The file maps each environment's name to `{ environment, policies,
 * secrets }`: what `GET .../environments/{name}`, `GET .../deployment-branch-policies`
 * and `GET .../secrets` answered, or null for not found and not read.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The policy, as a file a pull request can change and a reviewer can read. */
export const FILE = '.github/environments.json';

/** The stated policy, checked for the shape this script relies on. */
export function stated(root = ROOT) {
  const policy = JSON.parse(readFileSync(join(root, FILE), 'utf8'));
  for (const env of policy.environments) {
    if (!/^[A-Za-z0-9_-]+$/.test(env.name)) throw new Error(`${FILE}: an environment name that is not one: ${JSON.stringify(env.name)}`);
    if (!Array.isArray(env.reviewers) || env.reviewers.length === 0) throw new Error(`${FILE}: ${env.name} has no reviewer, so nothing is approved there`);
    if ((env.branches === null) !== (env.tags === null)) throw new Error(`${FILE}: ${env.name} limits branches or tags and not both; say [] for none`);
    for (const name of [...env.secrets, ...(env.optional_secrets ?? [])]) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`${FILE}: ${env.name} names a secret that is not a secret's name: ${JSON.stringify(name)}`);
    }
  }
  return policy;
}

const sorted = (list) => [...list].sort();
const show = (value) => (value === null ? 'any branch' : JSON.stringify(value));

/**
 * What GitHub answered for one environment, in the file's terms. `environment`
 * is the GET answer, `policies` the deployment branch policies (null when the
 * environment has none to list).
 */
export function liveTerms(environment, policies) {
  const rules = environment.protection_rules ?? [];
  const reviewing = rules.find((rule) => Array.isArray(rule.reviewers));
  const timer = rules.find((rule) => typeof rule.wait_timer === 'number');
  const policy = environment.deployment_branch_policy ?? null;
  const custom = policy?.custom_branch_policies === true;
  const named = (type) => sorted((policies?.branch_policies ?? []).filter((entry) => (entry.type ?? 'branch') === type).map((entry) => entry.name));
  return {
    reviewers: sorted((reviewing?.reviewers ?? []).map((entry) => entry.reviewer?.login ?? entry.reviewer?.slug ?? '?')),
    prevent_self_review: reviewing?.prevent_self_review ?? false,
    wait_timer: timer?.wait_timer ?? 0,
    protected_branches: policy?.protected_branches === true,
    branches: policy === null ? null : custom ? named('branch') : [],
    tags: policy === null ? null : custom ? named('tag') : [],
  };
}

/**
 * Where GitHub is not what the file states. `live` maps a name to
 * `{ environment, policies, secrets }`, any of which may be null.
 */
export function compare(policy, live) {
  const differences = [];
  const notRead = [];
  for (const env of policy.environments) {
    const found = live[env.name];
    if (found?.notRead === true || found?.policiesNotRead === true) {
      notRead.push(env.name);
      continue;
    }
    if (found === undefined || found === null || found.environment === null || found.environment === undefined) {
      differences.push({ where: env.name, stated: 'an environment', live: 'none of that name', fix: 'apply' });
      continue;
    }
    const terms = liveTerms(found.environment, found.policies ?? null);
    const want = {
      reviewers: sorted(env.reviewers),
      prevent_self_review: env.prevent_self_review,
      wait_timer: env.wait_timer,
      protected_branches: false,
      branches: env.branches === null ? null : sorted(env.branches),
      tags: env.tags === null ? null : sorted(env.tags),
    };
    for (const key of Object.keys(want)) {
      if (JSON.stringify(want[key]) !== JSON.stringify(terms[key])) {
        differences.push({ where: `${env.name}, ${key}`, stated: show(want[key]), live: show(terms[key]), fix: 'apply' });
      }
    }
    if (found.secrets === null || found.secrets === undefined) {
      notRead.push(`${env.name} secrets`);
      continue;
    }
    const names = (found.secrets.secrets ?? []).map((entry) => entry.name);
    for (const name of env.secrets) {
      if (!names.includes(name)) {
        differences.push({ where: `${env.name}, secret ${name}`, stated: 'set', live: 'missing', fix: `Settings, Environments, ${env.name}, Add environment secret: ${name}` });
      }
    }
    for (const name of names) {
      if (!env.secrets.includes(name) && !(env.optional_secrets ?? []).includes(name)) {
        differences.push({ where: `${env.name}, secret ${name}`, stated: 'not stated', live: 'set', fix: `state it in ${FILE} with what reads it, or remove it from the environment` });
      }
    }
  }
  return { differences, notRead };
}

/** The report a person reads, as lines. */
export function report({ differences, notRead }) {
  const lines = [];
  if (differences.length === 0) lines.push(`GitHub enforces the environments ${FILE} states.`);
  else {
    lines.push(`GitHub does not enforce the environments ${FILE} states. ${differences.length} difference(s):`, '');
    for (const entry of differences) {
      lines.push(`  ${entry.where}`);
      lines.push(`    stated:  ${entry.stated}`);
      lines.push(`    GitHub:  ${entry.live}`);
      if (entry.fix !== 'apply') lines.push(`    fix:     ${entry.fix}`);
    }
  }
  if (notRead.length > 0) {
    lines.push('', `Not read: ${notRead.join(', ')}. GitHub did not show them to the token this ran with, and shows an environment's secret names to an admin only. Not read is not fine: an admin reads them with \`npm run environments\`.`);
  }
  return lines;
}

/** What is sent to GitHub for one environment, reviewers already resolved to ids. */
export function body(env, reviewerIds) {
  return {
    wait_timer: env.wait_timer,
    prevent_self_review: env.prevent_self_review,
    reviewers: reviewerIds.map((id) => ({ type: 'User', id })),
    deployment_branch_policy: env.branches === null ? null : { protected_branches: false, custom_branch_policies: true },
  };
}

function gh(args, input) {
  return execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
}

/** The repository asked about: the flag, then the runner's, then package.json's. */
export function repositoryName(argv) {
  const flag = argv.includes('--repo') ? argv[argv.indexOf('--repo') + 1] : undefined;
  const url = new URL(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).repository.url.replace(/^git\+/, ''));
  const fromPackage = url.hostname === 'github.com' ? url.pathname.replace(/^\//, '').replace(/\.git$/, '') : undefined;
  const name = flag ?? process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY ?? fromPackage;
  if (name === undefined || !/^[\w.-]+\/[\w.-]+$/.test(name)) throw new Error(`no repository to ask about: pass --repo owner/name (got ${name})`);
  return name;
}

/**
 * `gh api` for a read: the answer, `null` for a 404, and `NOT_READ` for any
 * other refusal. GitHub answers 404 for an environment that does not exist,
 * and a run must not call one missing because its token was not shown it.
 */
const NOT_READ = Symbol('not read');
function maybe(path) {
  try {
    return JSON.parse(gh(['api', path]));
  } catch (error) {
    return /\(HTTP 404\)/.test(String(error.stderr ?? '')) ? null : NOT_READ;
  }
}

function read(argv, policy) {
  if (argv.includes('--live')) return { name: null, live: JSON.parse(readFileSync(argv[argv.indexOf('--live') + 1], 'utf8')) };
  const name = repositoryName(argv);
  const live = {};
  for (const env of policy.environments) {
    const base = `repos/${name}/environments/${env.name}`;
    const environment = maybe(base);
    if (environment === NOT_READ) {
      live[env.name] = { notRead: true };
      continue;
    }
    const custom = environment?.deployment_branch_policy?.custom_branch_policies === true;
    const policies = custom ? maybe(`${base}/deployment-branch-policies`) : null;
    const secrets = environment === null ? null : maybe(`${base}/secrets`);
    live[env.name] = {
      environment,
      policies: policies === NOT_READ ? null : policies,
      policiesNotRead: policies === NOT_READ,
      secrets: secrets === NOT_READ ? null : secrets,
    };
  }
  return { name, live };
}

function applyOne(name, env) {
  const ids = env.reviewers.map((login) => JSON.parse(gh(['api', `users/${login}`])).id);
  const base = `repos/${name}/environments/${env.name}`;
  gh(['api', '--method', 'PUT', base, '--input', '-'], JSON.stringify(body(env, ids)));
  if (env.branches === null) return;
  const existing = JSON.parse(gh(['api', `${base}/deployment-branch-policies`])).branch_policies ?? [];
  const want = [...env.branches.map((n) => ({ name: n, type: 'branch' })), ...env.tags.map((n) => ({ name: n, type: 'tag' }))];
  for (const entry of existing) {
    if (!want.some((w) => w.name === entry.name && w.type === (entry.type ?? 'branch'))) gh(['api', '--method', 'DELETE', `${base}/deployment-branch-policies/${entry.id}`]);
  }
  for (const w of want) {
    if (!existing.some((entry) => entry.name === w.name && (entry.type ?? 'branch') === w.type)) {
      gh(['api', '--method', 'POST', `${base}/deployment-branch-policies`, '--input', '-'], JSON.stringify(w));
    }
  }
}

function main(argv) {
  const policy = stated();
  const apply = argv[0] === 'apply';
  const { name, live } = read(argv, policy);
  const found = compare(policy, live);
  for (const line of report(found)) console.log(line);
  if (!apply) return found.differences.length > 0 && !argv.includes('--report') ? 1 : 0;
  const fixable = new Set(found.differences.filter((entry) => entry.fix === 'apply').map((entry) => entry.where.split(',')[0]));
  if (fixable.size === 0) return found.differences.length > 0 ? 1 : 0;
  if (name === null) throw new Error('apply talks to GitHub: it cannot be given a --live file');
  if (!argv.includes('--yes')) {
    console.log(`\nNothing was changed. To make ${name}'s environments ${[...fixable].join(', ')} the stated ones: npm run environments -- apply --yes`);
    return 1;
  }
  try {
    for (const env of policy.environments.filter((entry) => fixable.has(entry.name))) {
      applyOne(name, env);
      console.log(`Environment ${env.name} written.`);
    }
  } catch (error) {
    console.error(`\nGitHub refused the change:\n  ${String(error.stderr ?? error.message).trim()}\nWriting an environment needs an admin of ${name}, signed in to gh with their own token: gh auth status`);
    return 1;
  }
  console.log('\nRead again, after the change. Secrets are never written here:\n');
  const after = compare(policy, read(argv, policy).live);
  for (const line of report(after)) console.log(line);
  return after.differences.length > 0 ? 1 : 0;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`environments: ${String(error.stderr ?? error.message).trim()}`);
    process.exit(2);
  }
}
