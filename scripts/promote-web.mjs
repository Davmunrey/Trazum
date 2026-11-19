#!/usr/bin/env node
/**
 * Put a staged build of the web app on the production domains, or put an
 * earlier one back.
 *
 *   node scripts/promote-web.mjs check promote  <deployment>   may this be promoted?
 *   node scripts/promote-web.mjs check rollback <deployment>   may production go back to this?
 *   node scripts/promote-web.mjs promote  <deployment>
 *   node scripts/promote-web.mjs rollback <deployment>
 *
 * `<deployment>` is a Vercel deployment id (`dpl_...`) or its generated
 * `*.vercel.app` address. Run by `.github/workflows/promote-web.yml`, under
 * the `production` environment, whose approval is the button.
 *
 * **How staging works here.** The Vercel project builds every merge to main
 * as a production deployment with "Auto-assign Custom Production Domains"
 * turned off, so the build is *staged*: it serves its own URL and not the
 * production domains, until it is promoted. Promotion assigns the domains to
 * that very build without rebuilding it (vercel.com/docs/deployments/promoting-a-deployment,
 * read 2026-11-19). What was looked at on staging is what goes live.
 *
 * **So a promotion is refused unless the deployment is a staged production
 * build of this project.** A preview deployment can be promoted too, and
 * Vercel then *rebuilds* it with the production environment variables
 * (vercel.com/docs/deployments/environments, read 2026-11-19): a build
 * nobody has looked at. A deployment that already served production is not
 * promoted either: Vercel refuses that and says to roll back to it instead,
 * which is the other mode. Both facts are read from the deployment
 * (`target`, `readyState`, `readySubstate`, `projectId`), as
 * `GET /v13/deployments/{idOrUrl}` documents them.
 *
 * **A rollback turns staging off, and the next promotion turns it back on
 * for good.** After a rollback Vercel stops assigning production domains
 * automatically, and promoting any deployment afterwards "restores
 * auto-assignment of production domains" (vercel.com/docs/instant-rollback,
 * read 2026-11-19): every later merge would go straight to production. The
 * promotion still goes ahead, because it is how a rolled-back project
 * recovers, and the job ends on a warning naming the toggle to turn off
 * again. Whether the toggle is off cannot be read from the API this script
 * uses, so it is said rather than checked.
 *
 * The token goes to Vercel's API and nowhere else. `VERCEL_API` can be
 * pointed at this machine for the tests; any other host is refused before a
 * request is made, because a credential that follows an environment variable
 * to another host is the worst thing this file could do. The token is never
 * printed, and nothing that arrived over the network is written to a step
 * output.
 *
 * Environment: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` and, when the project
 * belongs to a team, `VERCEL_TEAM_ID`, all secrets of the `production`
 * environment. None of them is in this repository.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ACTIONS = Object.freeze(['promote', 'rollback']);

const API = 'https://api.vercel.com';

/** Whether the token may be sent to `base`: Vercel's API, or this machine for the tests. */
export function apiMayBe(base) {
  let url;
  try {
    url = new URL(base);
  } catch {
    return false;
  }
  if (url.origin === API) return true;
  return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
}

/**
 * The deployment as the API names it, or a refusal. An id, or a generated
 * address on `vercel.app`, given with or without `https://`. Anything else is
 * refused: the value comes from a person typing into a form, and it becomes
 * part of a URL that carries the production token.
 */
export function deploymentRef(input) {
  const text = String(input ?? '').trim();
  if (/^dpl_[A-Za-z0-9]{8,64}$/.test(text)) return text;
  const host = text.replace(/^https:\/\//, '').replace(/\/$/, '');
  if (/^[a-z0-9](?:[a-z0-9-]{0,62})\.vercel\.app$/.test(host)) return host;
  throw new Error(`not a deployment: ${JSON.stringify(text.slice(0, 80))}. Give its id (dpl_...) or its *.vercel.app address.`);
}

/** A state word from the API, or `unknown`: nothing else from the network reaches the log. */
const word = (value) => (typeof value === 'string' && /^[A-Z_]{1,20}$/.test(value) ? value : 'unknown');

/**
 * Why `deployment` may not be the target of `action`, or `null` when it may.
 * Every reason names what was found, so the refusal says what to pick instead.
 */
export function refusal(action, deployment, projectId) {
  if (!ACTIONS.includes(action)) return `"${action}" is not one of ${ACTIONS.join(', ')}`;
  if (deployment.projectId !== projectId) return 'it belongs to another Vercel project than VERCEL_PROJECT_ID';
  if (deployment.readyState !== 'READY') return `its build is ${word(deployment.readyState)}, not READY`;
  if (deployment.target !== 'production') {
    return 'it is a preview deployment. Promoting one makes Vercel rebuild it with production variables, which is a build nobody has looked at. Promote the staged production build of the same commit from main';
  }
  if (action === 'promote' && deployment.readySubstate !== 'STAGED') {
    return `it is ${word(deployment.readySubstate)}, not STAGED: it has served production before, and Vercel promotes a deployment once. Roll back to it instead`;
  }
  if (action === 'rollback' && deployment.readySubstate !== 'PROMOTED') {
    return `it is ${word(deployment.readySubstate)}, not PROMOTED: only a deployment that has served production can be rolled back to`;
  }
  return null;
}

function settings(env = process.env) {
  const base = env.VERCEL_API ?? API;
  if (!apiMayBe(base)) throw new Error('VERCEL_API names a host that is not Vercel\'s API: the token is not sent there');
  if (!env.VERCEL_TOKEN) throw new Error('no VERCEL_TOKEN: it is a secret of the production environment');
  if (!env.VERCEL_PROJECT_ID) throw new Error('no VERCEL_PROJECT_ID: it is a secret of the production environment');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(env.VERCEL_PROJECT_ID)) throw new Error('VERCEL_PROJECT_ID is not a project id');
  if (env.VERCEL_TEAM_ID && !/^[A-Za-z0-9_-]{1,64}$/.test(env.VERCEL_TEAM_ID)) throw new Error('VERCEL_TEAM_ID is not a team id');
  return { base, token: env.VERCEL_TOKEN, projectId: env.VERCEL_PROJECT_ID, teamId: env.VERCEL_TEAM_ID || null };
}

async function call(config, method, path, query = {}, fetchImpl = fetch) {
  const url = new URL(path, config.base);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  if (config.teamId) url.searchParams.set('teamId', config.teamId);
  const response = await fetchImpl(url, {
    method,
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

/** Read the deployment and say whether `action` may target it. Throws the refusal. */
export async function check(action, input, { env = process.env, fetchImpl = fetch } = {}) {
  const config = settings(env);
  const ref = deploymentRef(input);
  const { status, json } = await call(config, 'GET', `/v13/deployments/${encodeURIComponent(ref)}`, {}, fetchImpl);
  if (status !== 200 || json === null) throw new Error(`Vercel answered ${status} for that deployment: it does not exist, or the token cannot see it`);
  const why = refusal(action, json, config.projectId);
  if (why !== null) throw new Error(`refusing to ${action} to that deployment: ${why}.`);
  if (typeof json.id !== 'string' || !/^dpl_[A-Za-z0-9]+$/.test(json.id)) throw new Error('Vercel answered a deployment without an id');
  return { config, id: json.id, url: typeof json.url === 'string' && /^[a-z0-9-]{1,63}\.vercel\.app$/.test(json.url) ? json.url : null };
}

/** The last promotion or rollback of the project, as `rollbackInfo=true` documents it. */
async function lastAliasRequest(config, fetchImpl) {
  const { status, json } = await call(config, 'GET', `/v9/projects/${encodeURIComponent(config.projectId)}`, { rollbackInfo: 'true' }, fetchImpl);
  if (status !== 200) return null;
  return json?.lastAliasRequest ?? null;
}

/**
 * Promote or roll back, then wait for Vercel's job to finish. A job is
 * treated as stale after three minutes (vercel.com/docs/instant-rollback), so
 * that is how long this waits by default.
 */
export async function act(action, input, { env = process.env, fetchImpl = fetch, log = console.log, intervalMs = 5000, timeoutMs = 180_000 } = {}) {
  const { config, id, url } = await check(action, input, { env, fetchImpl });
  const before = await lastAliasRequest(config, fetchImpl);
  const afterRollback = action === 'promote' && before?.type === 'rollback';

  const path = action === 'promote'
    ? `/v10/projects/${encodeURIComponent(config.projectId)}/promote/${encodeURIComponent(id)}`
    : `/v1/projects/${encodeURIComponent(config.projectId)}/rollback/${encodeURIComponent(id)}`;
  const query = action === 'rollback' ? { description: 'Rolled back from promote-web.yml' } : {};
  const sent = await call(config, 'POST', path, query, fetchImpl);
  if (sent.status !== 200 && sent.status !== 201 && sent.status !== 202) {
    throw new Error(`Vercel refused the ${action} with ${sent.status}. Production is as it was.${sent.status === 409 ? ' 409: another promotion or rollback is still running; wait and run this again.' : ''}`);
  }
  log(`${action === 'promote' ? 'Promoting' : 'Rolling back to'} ${url ?? id}.`);

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await lastAliasRequest(config, fetchImpl);
    const ours = job?.toDeploymentId === id && job?.type === action;
    if (ours && job.jobStatus === 'succeeded') break;
    if (ours && (job.jobStatus === 'failed' || job.jobStatus === 'skipped')) {
      throw new Error(`Vercel's ${action} job ended ${job.jobStatus === 'failed' ? 'failed' : 'skipped'}. Check the project's production deployment in the dashboard.`);
    }
    if (Date.now() >= deadline) throw new Error(`Vercel's ${action} job had not finished after ${Math.round(timeoutMs / 1000)}s. Check the project's production deployment in the dashboard.`);
    await new Promise((done) => setTimeout(done, intervalMs));
  }
  log(`Production now serves ${url ?? id}.`);

  const warnings = [];
  if (action === 'rollback') {
    warnings.push('Vercel turns off auto-assignment of production domains after a rollback, so merges to main stay staged. The next promotion turns it back on: see the warning that promotion prints.');
  }
  if (afterRollback) {
    warnings.push('This promotion followed a rollback, and Vercel has turned auto-assignment of production domains back on: every merge to main would now go straight to production. Turn it off again: Vercel project, Settings, Environments, Production, Branch Tracking, "Auto-assign Custom Production Domains".');
  }
  return { id, warnings };
}

async function main(argv) {
  try {
    if (argv[0] === 'check') {
      const { id } = await check(argv[1], argv[2]);
      console.log(`${id} may be the target of ${argv[1]}.`);
      return 0;
    }
    if (ACTIONS.includes(argv[0])) {
      const { warnings } = await act(argv[0], argv[1]);
      for (const warning of warnings) console.log(`::warning::${warning}`);
      return 0;
    }
    console.error('usage: promote-web.mjs check <promote|rollback> <deployment> | promote <deployment> | rollback <deployment>');
    return 2;
  } catch (error) {
    console.log(`::error::${error.message}`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) process.exit(await main(process.argv.slice(2)));
