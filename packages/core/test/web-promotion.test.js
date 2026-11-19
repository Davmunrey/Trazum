import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from '../../cli/test/env.mjs';
import { ACTIONS, act, apiMayBe, check, deploymentRef, refusal } from '../../../scripts/promote-web.mjs';

/**
 * Production for the web app is a staged build promoted by a person.
 *
 * Every merge to main is built by Vercel as a production deployment that is
 * not assigned the production domains: staging. `promote-web.yml` is the
 * button that assigns them to one such build, under the `production`
 * environment, whose approval is the button's lock. These tests hold the
 * three things that make that true: the script refuses any deployment that
 * is not a staged production build of this project (a preview would be
 * rebuilt with production variables, a build nobody looked at), the token
 * goes to Vercel and nowhere else, and the workflow cannot run outside the
 * environment or from another branch than main.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const PROJECT = 'prj_test';
const ENV = { VERCEL_TOKEN: 'token-for-tests', VERCEL_PROJECT_ID: PROJECT, VERCEL_API: 'http://127.0.0.1:9' };
const deployment = (fields = {}) => ({
  id: 'dpl_staged0001',
  url: 'trazum-abc123def-team.vercel.app',
  projectId: PROJECT,
  readyState: 'READY',
  target: 'production',
  readySubstate: 'STAGED',
  ...fields,
});

/** Vercel's API as far as the script asks it, recording every request. */
function vercel({ found = deployment(), last = null, promoteStatus = 201, jobs = ['in-progress', 'succeeded'] } = {}) {
  const requests = [];
  let polled = 0;
  let sent = null;
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    requests.push({ method: options.method, path: u.pathname, query: Object.fromEntries(u.searchParams), auth: options.headers?.authorization });
    const json = (status, body) => ({ status, text: async () => JSON.stringify(body) });
    if (options.method === 'GET' && u.pathname.startsWith('/v13/deployments/')) return found === null ? json(404, {}) : json(200, found);
    if (options.method === 'GET' && u.pathname === `/v9/projects/${PROJECT}`) {
      if (sent === null) return json(200, { lastAliasRequest: last });
      const status = jobs[Math.min(polled, jobs.length - 1)];
      polled += 1;
      return json(200, { lastAliasRequest: { ...sent, jobStatus: status } });
    }
    if (options.method === 'POST') {
      const type = u.pathname.includes('/promote/') ? 'promote' : 'rollback';
      sent = { type, toDeploymentId: u.pathname.split('/').at(-1) };
      return json(type === 'promote' ? promoteStatus : 201, {});
    }
    return json(500, {});
  };
  return { fetchImpl, requests };
}

describe('what may be promoted, and what production may go back to', () => {
  it('names a deployment by id or by its vercel.app address, and nothing else', () => {
    assert.equal(deploymentRef('dpl_89qyp1cskzkLrVicDaZoDbjyHuDJ'), 'dpl_89qyp1cskzkLrVicDaZoDbjyHuDJ');
    assert.equal(deploymentRef('https://trazum-abc123def-team.vercel.app/'), 'trazum-abc123def-team.vercel.app');
    assert.equal(deploymentRef(' trazum-abc123def-team.vercel.app '), 'trazum-abc123def-team.vercel.app');
    for (const bad of ['trazum.example.com', 'x.vercel.app.example.com', 'http://x.vercel.app', '../v9/projects', 'dpl_', 'x.vercel.app/../../v1', '', undefined]) {
      assert.throws(() => deploymentRef(bad), /not a deployment/, String(bad));
    }
  });

  it('promotes a staged production build of this project, and nothing else', () => {
    assert.equal(refusal('promote', deployment(), PROJECT), null);
    // A preview: promoting it makes Vercel rebuild it with production variables.
    assert.match(refusal('promote', deployment({ target: null }), PROJECT), /preview/);
    assert.match(refusal('promote', deployment({ target: 'staging' }), PROJECT), /preview/);
    // One that served production already, which Vercel promotes once.
    assert.match(refusal('promote', deployment({ readySubstate: 'PROMOTED' }), PROJECT), /not STAGED/);
    assert.match(refusal('promote', deployment({ readyState: 'ERROR' }), PROJECT), /ERROR, not READY/);
    assert.match(refusal('promote', deployment({ projectId: 'prj_other' }), PROJECT), /another Vercel project/);
    assert.match(refusal('deploy', deployment(), PROJECT), /not one of promote, rollback/);
    assert.deepEqual(ACTIONS, ['promote', 'rollback']);
  });

  it('rolls back only to a production build that has served production', () => {
    assert.equal(refusal('rollback', deployment({ readySubstate: 'PROMOTED' }), PROJECT), null);
    assert.match(refusal('rollback', deployment(), PROJECT), /not PROMOTED/);
    assert.match(refusal('rollback', deployment({ target: null, readySubstate: 'PROMOTED' }), PROJECT), /preview/);
  });

  it('writes no word from the network into a refusal but the API\'s own state words', () => {
    assert.match(refusal('promote', deployment({ readyState: 'pwned`$(id)`' }), PROJECT), /unknown, not READY/);
  });
});

describe('the promotion itself', () => {
  it('reads, promotes, and waits for Vercel to say it succeeded', async () => {
    const { fetchImpl, requests } = vercel();
    const logged = [];
    const result = await act('promote', 'trazum-abc123def-team.vercel.app', { env: ENV, fetchImpl, log: (line) => logged.push(line), intervalMs: 1 });
    assert.equal(result.id, 'dpl_staged0001');
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(
      requests.map((r) => `${r.method} ${r.path}`),
      [
        'GET /v13/deployments/trazum-abc123def-team.vercel.app',
        `GET /v9/projects/${PROJECT}`,
        `POST /v10/projects/${PROJECT}/promote/dpl_staged0001`,
        `GET /v9/projects/${PROJECT}`,
        `GET /v9/projects/${PROJECT}`,
      ],
    );
    for (const r of requests) assert.equal(r.auth, 'Bearer token-for-tests');
    assert.equal(requests[1].query.rollbackInfo, 'true');
    assert.ok(!logged.join('\n').includes('token-for-tests'), 'the token was logged');
  });

  it('changes nothing when the deployment is not one it may promote', async () => {
    for (const found of [deployment({ target: null }), deployment({ readySubstate: 'PROMOTED' }), null]) {
      const { fetchImpl, requests } = vercel({ found });
      await assert.rejects(act('promote', 'dpl_staged0001', { env: ENV, fetchImpl, log: () => {}, intervalMs: 1 }), /refusing|answered 404/);
      assert.ok(requests.every((r) => r.method === 'GET'), 'a refused promotion still sent a write');
    }
  });

  it('fails when Vercel refuses or its job fails, and says production is as it was', async () => {
    const busy = vercel({ promoteStatus: 409 });
    await assert.rejects(act('promote', 'dpl_staged0001', { env: ENV, fetchImpl: busy.fetchImpl, log: () => {}, intervalMs: 1 }), /409.*another promotion/);
    const failed = vercel({ jobs: ['failed'] });
    await assert.rejects(act('promote', 'dpl_staged0001', { env: ENV, fetchImpl: failed.fetchImpl, log: () => {}, intervalMs: 1 }), /job ended failed/);
    const slow = vercel({ jobs: ['in-progress'] });
    await assert.rejects(act('promote', 'dpl_staged0001', { env: ENV, fetchImpl: slow.fetchImpl, log: () => {}, intervalMs: 1, timeoutMs: 20 }), /had not finished/);
  });

  it('rolls back through the rollback endpoint, and says staging stays off after', async () => {
    const { fetchImpl, requests } = vercel({ found: deployment({ readySubstate: 'PROMOTED', id: 'dpl_earlier0001' }) });
    const result = await act('rollback', 'dpl_earlier0001', { env: ENV, fetchImpl, log: () => {}, intervalMs: 1 });
    assert.ok(requests.some((r) => r.method === 'POST' && r.path === `/v1/projects/${PROJECT}/rollback/dpl_earlier0001`));
    assert.match(result.warnings.join(' '), /turns off auto-assignment/);
  });

  it('warns that a promotion after a rollback turns auto-assignment back on', async () => {
    const { fetchImpl } = vercel({ last: { type: 'rollback', toDeploymentId: 'dpl_earlier0001', jobStatus: 'succeeded' } });
    const result = await act('promote', 'dpl_staged0001', { env: ENV, fetchImpl, log: () => {}, intervalMs: 1 });
    assert.match(result.warnings.join(' '), /Auto-assign Custom Production Domains/);
  });

  it('asks on behalf of the team only when one is set', async () => {
    const { fetchImpl, requests } = vercel();
    await check('promote', 'dpl_staged0001', { env: { ...ENV, VERCEL_TEAM_ID: 'team_test' }, fetchImpl });
    assert.equal(requests[0].query.teamId, 'team_test');
    const without = vercel();
    await check('promote', 'dpl_staged0001', { env: ENV, fetchImpl: without.fetchImpl });
    assert.equal(without.requests[0].query.teamId, undefined);
  });
});

describe('the token goes to Vercel and nowhere else', () => {
  it('accepts Vercel\'s API and this machine, and no other host', () => {
    assert.equal(apiMayBe('https://api.vercel.com'), true);
    assert.equal(apiMayBe('http://127.0.0.1:4000'), true);
    for (const bad of ['https://api.vercel.com.example.org', 'http://api.vercel.com', 'https://example.com', 'https://api.vercel.com@example.com', 'not a url']) {
      assert.equal(apiMayBe(bad), false, bad);
    }
  });

  it('refuses before any request when pointed elsewhere, and never prints the token', () => {
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts/promote-web.mjs'), 'check', 'promote', 'dpl_staged0001'], {
      cwd: ROOT,
      env: { ...SPAWN_ENV, ...ENV, VERCEL_API: 'https://example.com' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /::error::VERCEL_API names a host that is not Vercel's API/);
    assert.ok(!`${result.stdout}${result.stderr}`.includes('token-for-tests'));
  });
});

describe('promote-web.yml', () => {
  const workflow = read('.github/workflows/promote-web.yml');
  const code = workflow.replace(/^\s*#.*$/gm, '');
  const steps = code.split(/^ {6}- /m).slice(1);

  it('is started by hand and by nothing else', () => {
    const triggers = code.slice(code.indexOf('\non:\n'), code.indexOf('\npermissions:'));
    assert.match(triggers, /^ {2}workflow_dispatch:$/m);
    assert.doesNotMatch(triggers, /^ {2}(push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch):/m);
  });

  it('runs only under the production environment, and only from main', () => {
    assert.match(code, /^ {4}environment:\n {6}name: production$/m);
    assert.match(code, /^ {4}if: github\.ref == 'refs\/heads\/main'$/m);
    assert.equal((code.match(/^ {2}[a-z][a-z-]*:$/gm) ?? []).filter((line) => line !== '  workflow_dispatch:' && line !== '  production:').length, 0, 'a second job runs beside the one behind the approval');
  });

  it('declares read-only permissions at the top and on the job', () => {
    assert.match(code, /^permissions:\n {2}contents: read$/m);
    assert.match(code, /^ {4}permissions:\n {6}contents: read$/m);
    assert.doesNotMatch(code, /: write$/m);
  });

  it('hands the token only to this repository\'s script, and the form\'s inputs only through the environment', () => {
    const holders = steps.filter((step) => /secrets\./.test(step));
    assert.equal(holders.length, 2, 'the steps holding the Vercel token changed');
    for (const step of holders) {
      const run = step.match(/^ {8}run: (.+)$/m)?.[1];
      assert.match(run, /^node scripts\/promote-web\.mjs (check )?"\$ACTION" "\$DEPLOYMENT"$/, run);
      assert.doesNotMatch(step, /^\s*uses:/m);
    }
    assert.doesNotMatch(code.split('\n').filter((line) => /^\s*run:/.test(line)).join('\n'), /\$\{\{/, 'a value is spliced into a shell line');
    assert.ok(code.indexOf('promote-web.mjs check') < code.indexOf('run: node scripts/promote-web.mjs "$ACTION"'), 'it acts before it reads');
  });

  it('names no Vercel identifier or credential in the repository', () => {
    const files = [
      '.github/workflows/promote-web.yml',
      '.github/environments.json',
      'scripts/promote-web.mjs',
      ...readdirSync(join(ROOT, '.github/workflows')).map((name) => `.github/workflows/${name}`),
    ];
    for (const path of files) {
      const text = read(path);
      assert.doesNotMatch(text, /\bprj_[A-Za-z0-9]{12,}|\bteam_[A-Za-z0-9]{12,}|\bvercel_[A-Za-z0-9]{20,}/, `${path} holds a Vercel identifier or token`);
    }
    for (const [, name, value] of code.matchAll(/^\s*(VERCEL_[A-Z_]+): (.+)$/gm)) {
      assert.equal(value, `\${{ secrets.${name} }}`, `${name} is not read from the secret of the same name`);
    }
  });
});
