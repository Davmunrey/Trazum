import assert from 'node:assert/strict';
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
