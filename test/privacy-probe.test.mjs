import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { judgePrivacy } from '../scripts/privacy-probe-judge.mjs';

/**
 * The privacy probe's verdict, without a browser.
 *
 * The probe itself needs Chrome and a running build, so it runs in CI as its
 * own step. What decides pass or fail is a pure function of the request
 * record, and each rule is held here against the shape of the break it exists
 * to catch.
 */

const ORIGIN = 'http://127.0.0.1:3123';
const MARKERS = ['probe-label-x1', 'probe-session-x1', 'probe-prompt-x1'];
const request = (over = {}) => ({
  url: `${ORIGIN}/`,
  method: 'GET',
  headers: { accept: 'text/html' },
  body: null,
  phase: 'load',
  status: 200,
  failure: null,
  ...over,
});
const judge = (requests) => judgePrivacy(requests, { origin: ORIGIN, markers: MARKERS });

describe('the privacy probe passes a page that keeps the log to itself', () => {
  it('accepts its own page, its own code and its own API on load', () => {
    const verdict = judge([
      request(),
      request({ url: `${ORIGIN}/_next/static/chunks/app.js` }),
      request({ url: `${ORIGIN}/api/write`, method: 'POST', body: '{"answers":{},"locale":"en"}' }),
      request({ url: `${ORIGIN}/_next/static/chunks/bill.js`, phase: 'read' }),
      request({ url: 'data:image/svg+xml,<svg/>', phase: 'read', status: null }),
    ]);
    assert.deepEqual(verdict.problems, []);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.summary.duringRead, 2);
  });
});

describe('the privacy probe fails each way the promise can break', () => {
  it('a marker in a body, a URL or a header', () => {
    for (const leak of [
      request({ url: `${ORIGIN}/api/x`, method: 'POST', body: '{"label":"probe-label-x1"}' }),
      request({ url: `${ORIGIN}/api/x?s=probe-session-x1` }),
      request({ url: `${ORIGIN}/api/x`, headers: { 'x-context': 'probe-prompt-x1' } }),
    ]) {
      const verdict = judge([leak]);
      assert.equal(verdict.ok, false);
      assert.match(verdict.problems[0], /marker probe-[a-z]+-x1 left the page/);
    }
  });

  it('a request to any other origin, even one carrying nothing', () => {
    const verdict = judge([request({ url: 'https://analytics.example/collect' })]);
    assert.equal(verdict.ok, false);
    assert.match(verdict.problems.join('\n'), /another origin/);
  });

  it('a request while the bill is read that is not the page fetching its own code', () => {
    for (const asked of [
      request({ url: `${ORIGIN}/api/bill`, method: 'POST', phase: 'read', body: '{}' }),
      request({ url: `${ORIGIN}/api/shares`, phase: 'read' }),
      request({ url: `${ORIGIN}/_next/static/chunks/x.js`, method: 'POST', phase: 'read' }),
    ]) {
      const verdict = judge([asked]);
      assert.equal(verdict.ok, false, asked.url);
      assert.match(verdict.problems.join('\n'), /reading the bill made a request/);
    }
  });

  it('a same-origin request answered 400 or worse, or failing outright', () => {
    // The defect the REA audit found: a share list asked for on every visit, answered 503.
    assert.match(judge([request({ url: `${ORIGIN}/api/shares`, status: 503 })]).problems[0], /answered 503/);
    assert.match(judge([request({ status: null, failure: 'net::ERR_ABORTED' })]).problems[0], /failed/);
  });
});

describe('the probe starts reading only once the page has started', () => {
  /**
   * `networkidle` is 500 ms after the last request, and a busy runner hydrated
   * later than that: the session check, the optimizer's settings and the
   * writer's first question went out after reading had begun, and the probe
   * failed a commit whose other run passed. The page now says when every
   * first-render effect has run, and the probe waits for that. Each half is
   * useless without the other, so both are read here.
   */
  const app = readFileSync(new URL('../apps/web/components/App.tsx', import.meta.url), 'utf8');
  const probe = readFileSync(new URL('../scripts/privacy-probe.mjs', import.meta.url), 'utf8');
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

  it("the app's last effect marks the page started", () => {
    const body = app.slice(app.indexOf('export function App('));
    const effects = [...body.matchAll(/useEffect\(/g)].map((match) => match.index);
    const marker = body.indexOf("document.documentElement.dataset.started = 'true'");
    assert.ok(marker !== -1, 'App no longer marks the page started');
    assert.ok(effects.length > 1, 'App has no effects: has it moved?');
    assert.ok(effects.at(-1) < marker, 'an effect after the marker runs after the page says it has started');
    assert.ok(marker - effects.at(-1) < 200, 'the marker is not inside the last effect');
  });

  it('the probe waits for it, and for quiet, before reading', () => {
    const read = probe.indexOf("phase = 'read'");
    const started = probe.indexOf(`html[data-started="true"]`);
    const quiet = probe.indexOf('pending.size > 0');
    assert.ok(read !== -1 && started !== -1 && quiet !== -1, 'the probe has changed shape');
    assert.ok(started < read && quiet < read, 'the probe starts reading before the page has started');
  });

  it('and CI runs it on a slowed page, where a probe without the wait fails every time', () => {
    assert.match(ci, /node scripts\/privacy-probe\.mjs[^]*?--cpu-throttle [2-9]\d*/);
  });
});
