#!/usr/bin/env node
/**
 * What in this repository goes stale by itself, measured against today.
 *
 *   node scripts/freshness.mjs           # report; exit 1 when something is overdue
 *   node scripts/freshness.mjs --report  # report only, always exit 0
 *
 * Three things here are true on the day they are written and false some
 * weeks later without a single commit touching them, which is exactly the
 * kind of failure nobody sees until a stranger does:
 *
 * - **Provider prices.** Each provider's rates were read on a date
 *   (`PROVIDER_REVIEWED`), and past `STALE_PRICING_DAYS` the CLI warns every
 *   user. Overdue here means the warning is already on someone's screen.
 * - **The Action pin.** The docs tell readers to pin a release commit, and the
 *   guard in security.test.js allows one release of lag. Two releases behind
 *   is the state that held every pull request red for three weeks in
 *   October 2026, found by a contributor instead of the owner.
 * - **Unreleased work.** Changes merged but not on npm are invisible to
 *   everybody who installs with npx. Reported, never a failure: when to cut a
 *   release is a decision, not a deadline.
 *
 * The scheduled CI run calls this weekly, so an overdue item fails on main,
 * where GitHub notifies the owner, before it fails on somebody's pull request.
 * Reads the built `@trazum/core` (run `npm run build` first) and git; no network.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const reportOnly = process.argv.includes('--report');
const core = await import(pathToFileURL(join(ROOT, 'packages/core/dist/index.js')).href);
const now = Date.now();
const DAY = 86_400_000;

const lines = [];
let overdue = 0;
const say = (status, text) => {
  if (status === 'overdue') overdue += 1;
  lines.push(`${status === 'overdue' ? 'OVERDUE' : status === 'note' ? 'note   ' : 'ok     '}  ${text}`);
};

// 1. Prices, per provider.
for (const [provider, reviewed] of Object.entries(core.PROVIDER_REVIEWED)) {
  const days = Math.floor((now - Date.parse(`${reviewed}T00:00:00Z`)) / DAY);
  const left = core.STALE_PRICING_DAYS - days;
  say(
    days > core.STALE_PRICING_DAYS ? 'overdue' : 'ok',
    `prices: ${provider} read ${reviewed}, ${days} day(s) ago${days > core.STALE_PRICING_DAYS ? `: past the ${core.STALE_PRICING_DAYS}-day line, re-read its pricing page` : `, ${left} day(s) before users are warned`}`,
  );
}

// 2. The Action pin against the tags.
const parse = (version) => version.split('.').map(Number);
const newer = (a, b) => {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const tags = git('tag', '--list', 'v*')
  .split('\n')
  .map((tag) => tag.trim().slice(1))
  .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
  .sort((a, b) => (newer(parse(a), parse(b)) ? -1 : 1));
if (tags.length === 0) {
  say('note', 'Action pin: no v* tag in this clone (git fetch --tags), so the pin was not checked');
} else {
  const pinned = new Set();
  for (const path of git('ls-files', '*.md').split('\n')) {
    if (path === '' || path === 'CHANGELOG.md' || path === 'RELEASES.md') continue;
    for (const match of readFileSync(join(ROOT, path), 'utf8').matchAll(/Davmunrey\/Trazum@[0-9a-f]{40} {2}# (\d+\.\d+\.\d+)/g)) {
      pinned.add(match[1]);
    }
  }
  for (const version of pinned) {
    const behind = tags.filter((tag) => newer(parse(tag), parse(version))).length;
    say(
      behind > 1 ? 'overdue' : 'ok',
      `Action pin: ${version}, ${behind} release(s) behind ${tags[0]}${behind > 1 ? ': run node scripts/prepare-release.mjs --pin-only' : ''}`,
    );
  }
}

// 3. Merged but not released.
if (tags.length > 0) {
  const since = git('rev-list', '--count', `v${tags[0]}..HEAD`).trim();
  say('note', `${since} commit(s) on this branch since v${tags[0]}${Number(since) > 0 ? ': not on npm until the next release' : ''}`);
}

const text = lines.join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Freshness\n\n\`\`\`\n${text}\n\`\`\`\n`);
}
if (overdue > 0 && !reportOnly) {
  console.error(`\n${overdue} item(s) overdue.`);
  process.exit(1);
}
