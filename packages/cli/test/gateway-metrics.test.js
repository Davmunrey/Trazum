import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE } from '@trazum/core';
import { GatewayMetrics, MAX_SERIES_KEYS, buildMetricsServer } from '../dist/gateway-metrics.js';
import { buildGateway, listenGateway } from '../dist/gateway-server.js';
import { priceGatewayUsage } from '../dist/gateway-spend.js';
import { SPAWN_ENV } from './env.mjs';

/**
 * `trazum gateway --metrics-port`: what the gateway counted, as Prometheus
 * scrapes it.
 *
 * Wired the way `commandGateway` wires it, so each test drives a real call
 * through the proxy against a stub provider and then reads the scrape port.
 * The figures it must show are the ones the gateway already had: the
 * provider's counts, the list-rate cost the live budget charges, and the calls
 * it refused, forwarded free or could not measure.
 */

const PROMPT = 'synthetic prompt text that must never reach a metric';
const body = (extra = {}) => JSON.stringify({
  model: 'claude-opus-5', max_tokens: 1,
  messages: [{ role: 'user', content: PROMPT }],
  ...extra,
});
const answer = (usage = { input_tokens: 200_000, output_tokens: 0 }) => () =>
  new Response(JSON.stringify({ usage }), { headers: { 'content-type': 'application/json' } });

async function setup(t, overrides = {}) {
  const metrics = new GatewayMetrics('anthropic', 1_700_000_000_000);
  const server = buildGateway({
    provider: 'anthropic', catalogue: BUNDLED_CATALOGUE,
    policy: { onCannotTell: 'fail-open' },
    liveBudget: true,
    standing: () => ({ limitUsd: 100, consumedUsd: 0, provenance: 'measured', asOfMs: Date.now() }),
    record: (call) => metrics.measured(call, priceGatewayUsage(BUNDLED_CATALOGUE, call.model, call, Date.now())),
    unmeasured: (cause) => metrics.unmeasured(cause),
    count: (event) => metrics.count(event),
    note: () => {},
    fetchImpl: async () => answer()(),
    ...overrides,
  });
  const url = await listenGateway(server, { port: 0 });
  const scrapeServer = buildMetricsServer(metrics);
  const scrapeUrl = await listenGateway(scrapeServer, { port: 0 });
  t.after(() => {
    for (const s of [server, scrapeServer]) { s.closeAllConnections(); s.close(); }
  });
  return {
    url,
    scrapeUrl,
    post: (request = body(), path = '/v1/messages') => fetch(`${url}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: request,
    }),
    scrape: async () => (await fetch(`${scrapeUrl}/metrics`)).text(),
  };
}

/** Every sample in the text, as `{name, labels, value}`. */
function samples(text) {
  return text.split('\n').filter((line) => line !== '' && !line.startsWith('#')).map((line) => {
    const match = /^([a-zA-Z_][a-zA-Z0-9_]*)(\{(.*)\})? (\S+)$/.exec(line);
    assert.ok(match, `not a sample line, or one with a timestamp: ${line}`);
    const labels = {};
    for (const pair of (match[3] ?? '').matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) {
      labels[pair[1]] = pair[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return { name: match[1], labels, value: Number(match[4]) };
  });
}

const find = (all, name, where = {}) =>
  all.filter((s) => s.name === name && Object.entries(where).every(([k, v]) => s.labels[k] === v));

describe('the gateway scrape port', () => {
  it('counts a measured call, its tokens, and its cost at the rate the live budget charges', async (t) => {
    const g = await setup(t);
    assert.equal((await g.post(body({ metadata: { trazum_label: 'nightly' } }))).status, 200);
    const all = samples(await g.scrape());

    const calls = find(all, 'trazum_gateway_calls_measured_total', { trazum_model: 'claude-opus-5', trazum_label: 'nightly' });
    assert.deepEqual(calls.map((s) => s.value), [1]);
    assert.equal(find(all, 'trazum_gateway_tokens_total', { kind: 'input', trazum_label: 'nightly' })[0].value, 200_000);
    assert.equal(find(all, 'trazum_gateway_tokens_total', { kind: 'output', trazum_label: 'nightly' })[0].value, 0);

    // The same figure `gateway-live-budget.test.js` sees the budget charged:
    // 200,000 input tokens of claude-opus-5 come to $1.
    const cost = find(all, 'trazum_gateway_cost_usd_total', { trazum_label: 'nightly' });
    assert.deepEqual(cost.map((s) => s.value), [1]);
    assert.equal(cost[0].labels.trazum_cost_basis, 'api-equivalent');
    assert.deepEqual(find(all, 'trazum_gateway_calls_unpriced_total'), []);
  });

  it('keeps a call it cannot price out of every cost sample', async (t) => {
    const g = await setup(t);
    assert.equal((await g.post(body({ model: 'a-model-nobody-prices' }))).status, 200);
    const all = samples(await g.scrape());
    assert.deepEqual(find(all, 'trazum_gateway_calls_unpriced_total', { trazum_model: 'a-model-nobody-prices' }).map((s) => s.value), [1]);
    assert.deepEqual(find(all, 'trazum_gateway_cost_usd_total'), []);
  });

  it('counts a refusal by its reason, and not as a measured call', async (t) => {
    const g = await setup(t, {
      standing: () => ({ limitUsd: 1, consumedUsd: 1, provenance: 'measured', asOfMs: Date.now() }),
    });
    const refused = await g.post();
    assert.equal(refused.status, 402);
    // The reason the 402 body gave, not a second account of it.
    const { reason } = await refused.json();
    const all = samples(await g.scrape());
    assert.deepEqual(find(all, 'trazum_gateway_calls_refused_total').map((s) => `${s.labels.reason}=${s.value}`), [`${reason}=1`]);
    assert.deepEqual(find(all, 'trazum_gateway_calls_measured_total'), []);
  });

  it('shows every unmeasured cause at zero, then counts the one that happened', async (t) => {
    const g = await setup(t, { fetchImpl: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) });
    const before = samples(await g.scrape());
    assert.deepEqual(
      find(before, 'trazum_gateway_calls_unmeasured_total').map((s) => `${s.labels.cause}=${s.value}`).sort(),
      ['no-usage-event=0', 'no-usage-in-body=0', 'stream-broke=0'],
    );
    assert.equal((await g.post()).status, 200);
    const after = samples(await g.scrape());
    assert.equal(find(after, 'trazum_gateway_calls_unmeasured_total', { cause: 'no-usage-in-body' })[0].value, 1);
    assert.deepEqual(find(after, 'trazum_gateway_cost_usd_total'), []);
  });

  it('counts a free path apart from what spends', async (t) => {
    const g = await setup(t);
    assert.equal((await g.post(body(), '/v1/messages/count_tokens')).status, 200);
    const all = samples(await g.scrape());
    assert.deepEqual(find(all, 'trazum_gateway_calls_free_total', { path: '/v1/messages/count_tokens' }).map((s) => s.value), [1]);
    assert.deepEqual(find(all, 'trazum_gateway_calls_measured_total'), []);
  });

  it('counts an unreachable provider, which is not a refusal', async (t) => {
    const g = await setup(t, { fetchImpl: async () => { throw new Error('synthetic outage'); } });
    assert.equal((await g.post()).status, 502);
    const all = samples(await g.scrape());
    assert.equal(find(all, 'trazum_gateway_upstream_unreachable_total')[0].value, 1);
    assert.deepEqual(find(all, 'trazum_gateway_calls_refused_total'), []);
  });

  it('counts an unreachable provider on a free path too', async (t) => {
    const g = await setup(t, { fetchImpl: async () => { throw new Error('synthetic outage'); } });
    assert.equal((await g.post(body(), '/v1/messages/count_tokens')).status, 502);
    const all = samples(await g.scrape());
    assert.equal(find(all, 'trazum_gateway_upstream_unreachable_total')[0].value, 1);
    assert.deepEqual(find(all, 'trazum_gateway_calls_free_total'), []);
  });

  it('carries no prompt, no session and no timestamp', async (t) => {
    const g = await setup(t);
    await g.post(body({ metadata: { trazum_label: 'nightly', trazum_session: 'synthetic-session-id' } }));
    const text = await g.scrape();
    assert.doesNotMatch(text, /synthetic prompt/);
    assert.doesNotMatch(text, /synthetic-session-id/);
    // `samples` refuses any line with a third field, which is where a timestamp goes.
    assert.ok(samples(text).length > 0);
  });

  it('escapes a label the caller wrote', async (t) => {
    const g = await setup(t);
    const label = 'a "quoted" \\ label\nwith a break';
    await g.post(body({ metadata: { trazum_label: label } }));
    const text = await g.scrape();
    assert.ok(text.includes('trazum_label="a \\"quoted\\" \\\\ label\\nwith a break"'), text);
    assert.equal(find(samples(text), 'trazum_gateway_calls_measured_total', { trazum_label: label })[0].value, 1);
  });

  it('serves GET /metrics as Prometheus text and nothing else', async (t) => {
    const g = await setup(t);
    const ok = await fetch(`${g.scrapeUrl}/metrics`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'text/plain; version=0.0.4; charset=utf-8');
    assert.ok((await ok.text()).endsWith('\n'));
    assert.equal((await fetch(`${g.scrapeUrl}/v1/messages`, { method: 'POST', body: body() })).status, 404);
    assert.equal((await fetch(`${g.scrapeUrl}/metrics`, { method: 'POST', body: '' })).status, 405);
  });

  it('refuses a page that rebound its hostname to loopback', async (t) => {
    const g = await setup(t);
    const { port } = new URL(g.scrapeUrl);
    const status = await new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path: '/metrics', headers: { host: `attacker.example:${port}` } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.notEqual(status, 200);
  });
});

describe('the label set is bounded', () => {
  it('drops a new series past the limit and says how many', () => {
    const metrics = new GatewayMetrics('anthropic', 0);
    const call = (label) => ({
      model: 'claude-opus-5', label, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, substituted: false,
    });
    for (let i = 0; i < MAX_SERIES_KEYS + 5; i++) metrics.measured(call(`label-${i}`), 0);
    const all = samples(metrics.text());
    assert.equal(find(all, 'trazum_gateway_calls_measured_total').length, MAX_SERIES_KEYS);
    // Five calls, each left out whole: no token, cost or call sample for any of them.
    assert.equal(find(all, 'trazum_gateway_calls_dropped_total')[0].value, 5);
    assert.equal(find(all, 'trazum_gateway_tokens_total', { kind: 'input' }).length, MAX_SERIES_KEYS);
    assert.equal(find(all, 'trazum_gateway_cost_usd_total').length, MAX_SERIES_KEYS);
    // An existing series still counts.
    metrics.measured(call('label-0'), 0);
    assert.equal(find(samples(metrics.text()), 'trazum_gateway_calls_measured_total', { trazum_label: 'label-0' })[0].value, 2);
  });

  it('says when the counters began', () => {
    const all = samples(new GatewayMetrics('openai', 1_700_000_000_000).text());
    assert.deepEqual(find(all, 'trazum_gateway_start_time_seconds', { trazum_provider: 'openai' }).map((s) => s.value), [1_700_000_000]);
  });
});

describe('docs/grafana/trazum-gateway.json', () => {
  it('queries only metrics and labels the scrape port writes, and says its money is API-equivalent', () => {
    // Every figure once, so every metric the module can write is in the text.
    const metrics = new GatewayMetrics('anthropic', 0);
    metrics.measured({ model: 'm', label: 'l', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, substituted: false }, 1);
    metrics.measured({ model: 'n', label: null, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, substituted: true }, null);
    metrics.unmeasured('stream-broke');
    for (const event of [
      { kind: 'refused', reason: 'call-would-cross' },
      { kind: 'substituted', from: 'm', to: 'n' },
      { kind: 'free', path: '/v1/models' },
      { kind: 'unreachable' },
    ]) metrics.count(event);
    const all = samples(metrics.text());
    const names = new Set(all.map((s) => s.name));
    const labels = new Set(all.flatMap((s) => Object.keys(s.labels)));

    const dashboard = JSON.parse(readFileSync(new URL('../../../docs/grafana/trazum-gateway.json', import.meta.url), 'utf8'));
    const exprs = dashboard.panels.flatMap((panel) => (panel.targets ?? []).map((target) => target.expr));
    assert.ok(exprs.length >= 6, 'the dashboard has fewer queries than it was built with');
    for (const expr of exprs) {
      for (const [metric] of expr.matchAll(/\btrazum_[a-z_]+\b/g)) {
        if (labels.has(metric) && !names.has(metric)) continue;
        assert.ok(names.has(metric), `the dashboard queries ${metric}, which the scrape port does not write: ${expr}`);
      }
      for (const [, by] of expr.matchAll(/\bby \(([^)]*)\)/g)) {
        for (const label of by.split(',').map((l) => l.trim())) assert.ok(labels.has(label), `the dashboard groups by ${label}, which no sample has: ${expr}`);
      }
    }
    for (const panel of dashboard.panels.filter((p) => p.fieldConfig?.defaults?.unit === 'currencyUSD')) {
      assert.match(`${panel.title} ${panel.description}`, /API-equivalent/, `a money panel does not say what its money is: ${panel.title}`);
    }
  });
});

describe('trazum gateway --metrics-port', () => {
  it('refuses a port that is not one, by its own name, before anything listens', () => {
    const home = mkdtempSync(join(tmpdir(), 'trazum-gateway-metrics-'));
    const run = spawnSync(process.execPath, [
      new URL('../dist/index.js', import.meta.url).pathname,
      'gateway', 'anthropic', '--on-cannot-tell', 'fail-open', '--metrics-port', 'abc',
    ], { encoding: 'utf8', cwd: home, env: { ...SPAWN_ENV, HOME: home }, timeout: 30000 });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /--metrics-port is "abc"/);
    assert.doesNotMatch(run.stdout, /Gateway on/);
  });
});
