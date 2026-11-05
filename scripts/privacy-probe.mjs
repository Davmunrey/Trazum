#!/usr/bin/env node
/**
 * The privacy probe: a pasted log never leaves the browser.
 *
 *   npm run build:web
 *   cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
 *   PORT=3123 HOSTNAME=127.0.0.1 node apps/web/.next/standalone/apps/web/server.js &
 *   node scripts/privacy-probe.mjs --url http://127.0.0.1:3123 \
 *     --chrome /usr/bin/google-chrome --playwright /tmp/pw/node_modules/playwright-core
 *
 * The server is the standalone build the Dockerfile ships, served the way the
 * Dockerfile serves it; `next start` does not support that output.
 *
 * It opens the web app's Bill tab in a real browser, waits for the page to
 * settle, pastes a usage log whose label, session and an ignored field carry
 * unique marker strings, presses "Read the bill", waits until the report shows
 * the marked label, and records every request the page made from the first
 * byte to the last. `privacy-probe-judge.mjs` then decides whether the page
 * kept its promise; the rules are written there.
 *
 * Why it exists. In November 2026 REA, a reverse engineering tool that had
 * never seen this source, checked the production page this way and found the
 * promise kept and one defect beside it (a 503 on every visit). That was one
 * audit on one day. This is the same check on every pull request, against the
 * page that pull request would deploy, so the next change that sends a log
 * somewhere fails the build instead of waiting for the next audit.
 *
 * What it needs and does not bring: a Chrome-family browser and
 * `playwright-core`, both passed in. CI installs `playwright-core` at a pinned
 * version with `--ignore-scripts` into a temporary directory and uses the
 * runner's Chrome, so neither becomes a dependency of anything this repository
 * publishes.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { judgePrivacy } from './privacy-probe-judge.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const base = new URL(flag('url', 'http://127.0.0.1:3123'));
const chrome = flag('chrome', process.env.CHROME_PATH);
const playwrightPath = flag('playwright', process.env.PLAYWRIGHT_CORE_PATH);
const timeoutMs = Number(flag('timeout-ms', '60000'));

if (!chrome || !playwrightPath) {
  console.error('privacy-probe: pass --chrome <executable> and --playwright <path to playwright-core>.');
  process.exit(2);
}

const { chromium } = createRequire(join(playwrightPath, 'package.json'))('./index.js');

/** Unique per run, so a marker cannot match something already on the page. */
const run = Date.now().toString(36);
const markers = {
  label: `trazum-probe-label-${run}`,
  session: `trazum-probe-session-${run}`,
  prompt: `trazum-probe-prompt-${run}`,
};
const log = [0, 30]
  .map((seconds, i) =>
    JSON.stringify({
      ts: new Date(Date.UTC(2026, 10, 1, 10, 0, seconds)).toISOString(),
      model: 'claude-opus-5',
      label: markers.label,
      session: markers.session,
      prompt: markers.prompt,
      usage: { input_tokens: 120_000 + i * 30_000, output_tokens: 800, cache_read_input_tokens: 40_000 },
    }),
  )
  .join('\n');

/** The server may still be starting: ask until it answers, then stop asking. */
async function waitForServer() {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(base, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`no answer from ${base.origin} within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

await waitForServer();

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  // Root in a container cannot have Chrome's sandbox; a CI runner is not root and keeps it.
  chromiumSandbox: typeof process.getuid === 'function' ? process.getuid() !== 0 : true,
});

/** @type {import('./privacy-probe-judge.mjs').ObservedRequest[]} */
const requests = [];
let phase = 'load';
let verdict;
try {
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block' });
  const page = await context.newPage();
  const byRequest = new Map();
  page.on('request', (request) => {
    const entry = {
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      body: request.postData(),
      phase,
      status: null,
      failure: null,
    };
    byRequest.set(request, entry);
    requests.push(entry);
  });
  page.on('response', (response) => {
    const entry = byRequest.get(response.request());
    if (entry) entry.status = response.status();
  });
  page.on('requestfailed', (request) => {
    const entry = byRequest.get(request);
    if (entry) entry.failure = request.failure()?.errorText ?? 'failed';
  });

  const start = new URL('/?tab=bill', base);
  await page.goto(start.href, { waitUntil: 'networkidle', timeout: timeoutMs });

  const box = page.getByRole('textbox', { name: 'Usage log to analyse' });
  await box.waitFor({ state: 'visible', timeout: timeoutMs });

  phase = 'read';
  await box.fill(log);
  await page.getByRole('button', { name: 'Read the bill' }).click();
  // The report names the workload: seeing the marked label proves the bill was
  // read and rendered here, so a clean record is a clean read and not an idle page.
  // Exact and visible, because the pasted text in the box contains the label too.
  await page
    .getByText(markers.label, { exact: true })
    .filter({ visible: true })
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs });
  await page.waitForTimeout(1500);

  verdict = judgePrivacy(requests, { origin: base.origin, markers: Object.values(markers) });
} finally {
  await browser.close();
}

console.log(JSON.stringify({ origin: base.origin, ...verdict }, null, 2));
if (!verdict.ok) {
  console.error(`privacy-probe: the page broke its promise ${verdict.problems.length} time(s).`);
  process.exit(1);
}
console.error(`privacy-probe: ${verdict.summary.requests} request(s), none carrying the log, none elsewhere, none while the bill was read.`);
