import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from './env.mjs';

/**
 * `bill --prom-out`: the bill in the Prometheus text format, for the node
 * exporter's textfile collector (#844).
 *
 * The claim is the same as `--otlp-out`'s, and held the same way: add the
 * samples up and get the bill. The text is written from the OTLP payload, so
 * the second claim is that each OTLP point is one sample with the same value
 * and the same attributes as labels. And the Grafana dashboard in
 * `docs/grafana/trazum-bill.json` reads only metrics and labels this file
 * writes: a dashboard querying a name the exposition does not have draws an
 * empty panel, not an error.
 *
 * Expected figures are worked out by hand beside the fixture, from the
 * catalogue's rates (claude-opus-5 $5 in and $25 out per million, cache reads
 * at a tenth of input; claude-sonnet-5-5 $2 in and $10 out).
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const DASHBOARD = new URL('../../../docs/grafana/trazum-bill.json', import.meta.url).pathname;

const run = (args) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, CLAUDE_CONFIG_DIR: '', CODEX_HOME: '', GEMINI_CLI_HOME: '' },
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });

const record = (model, ts, label, usage) => JSON.stringify({ model, ts, label, usage });

/**
 * Two closed days and one unpriced model, and a project whose name needs escaping.
 *
 * - 2026-09-01, api, opus: 1,000 in + 200 out = $0.010; 500 in + 100 out +
 *   4,000 cache read = $0.0025 + $0.0025 + $0.002 = $0.007.
 * - 2026-09-02, `we"b\x`, sonnet: 2,000 in + 300 out = $0.004 + $0.003 = $0.007.
 * - 2026-09-02, `we"b\x`, a model the catalogue does not know: 700 in + 70 out.
 */
const PROJECT = 'we"b\\x';
const LOG = [
  record('claude-opus-5', '2026-09-01T10:00:00Z', 'api', { input_tokens: 1000, output_tokens: 200 }),
  record('claude-opus-5', '2026-09-01T11:00:00Z', 'api', { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 4000 }),
  record('claude-sonnet-5-5', '2026-09-02T10:00:00Z', PROJECT, { input_tokens: 2000, output_tokens: 300 }),
  record('mystery-model-9', '2026-09-02T12:00:00Z', PROJECT, { input_tokens: 700, output_tokens: 70 }),
];

/** Runs `bill` with both outputs, and returns the text, the OTLP payload and the receipt. */
function bill() {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-prom-'));
  const log = join(dir, 'usage.jsonl');
  writeFileSync(log, `${LOG.join('\n')}\n`);
  const [prom, otlp, receipt] = ['bill.prom', 'metrics.json', 'receipt.json'].map((name) => join(dir, name));
  const result = run(['bill', log, '--prom-out', prom, '--otlp-out', otlp, '-o', receipt]);
  assert.equal(result.status, 0, result.stderr);
  return {
    result,
    text: readFileSync(prom, 'utf8'),
    payload: JSON.parse(readFileSync(otlp, 'utf8')),
    receipt: JSON.parse(readFileSync(receipt, 'utf8')),
  };
}

/** A label set, read back the way Prometheus reads it: `\\`, `\"` and `\n` unescaped. */
function parseLabels(body) {
  const labels = {};
  const pattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"(?:,|$)/gy;
  let match;
  let read = 0;
  while ((match = pattern.exec(body)) !== null) {
    labels[match[1]] = match[2].replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c));
    read = pattern.lastIndex;
  }
  assert.equal(read, body.length, `labels not read to the end: ${body}`);
  return labels;
}

/**
 * The exposition, parsed and checked as Prometheus would: each name valid, a
 * HELP and a TYPE before any sample of a metric and once only, each sample
 * `name{labels} value` with no timestamp.
 */
function parse(text) {
  assert.ok(text.endsWith('\n'), 'the exposition does not end with a line break');
  const samples = [];
  const declared = new Map();
  for (const line of text.slice(0, -1).split('\n')) {
    const meta = /^# (HELP|TYPE) ([a-zA-Z_][a-zA-Z0-9_]*) (.*)$/.exec(line);
    if (meta !== null) {
      const seen = declared.get(meta[2]) ?? new Set();
      assert.ok(!seen.has(meta[1]), `${meta[1]} twice for ${meta[2]}`);
      seen.add(meta[1]);
      declared.set(meta[2], seen);
      if (meta[1] === 'TYPE') assert.equal(meta[3], 'gauge');
      continue;
    }
    const sample = /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\{(.*)\})? (\S+)$/.exec(line);
    assert.ok(sample !== null, `not a sample, or a sample with a timestamp: ${line}`);
    assert.deepEqual([...(declared.get(sample[1]) ?? [])].sort(), ['HELP', 'TYPE'], `${sample[1]} has a sample before its HELP and TYPE`);
    samples.push({ name: sample[1], labels: parseLabels(sample[2] ?? ''), value: Number(sample[3]) });
  }
  return samples;
}

const of = (samples, name) => samples.filter((s) => s.name === name);
const sum = (samples) => samples.reduce((total, s) => total + s.value, 0);

describe('bill --prom-out', () => {
  it('adds up to the bill, and is the OTLP payload sample for point', () => {
    const { text, payload, receipt } = bill();
    const samples = parse(text);
    const cost = of(samples, 'trazum_bill_cost_usd');

    // $0.010 + $0.007 + $0.007, worked out above the fixture.
    assert.ok(Math.abs(receipt.total.usd - 0.024) < 1e-9, `the receipt itself moved: ${receipt.total.usd}`);
    assert.ok(Math.abs(sum(cost) - receipt.total.usd) < 1e-9, `the samples add to ${sum(cost)}, the bill to ${receipt.total.usd}`);
    // 1000+200 + 500+100+4000 + 2000+300 tokens; three priced calls.
    assert.equal(sum(of(samples, 'trazum_bill_tokens')), 8100);
    assert.equal(sum(of(samples, 'trazum_bill_calls')), 3);

    for (const metric of payload.resourceMetrics[0].scopeMetrics[0].metrics) {
      const name = metric.name.replace(/\./g, '_') + (metric.unit === 'USD' ? '_usd' : '');
      const mine = of(samples, name);
      assert.equal(mine.length, metric.gauge.dataPoints.length, `${name}: ${mine.length} samples for ${metric.gauge.dataPoints.length} points`);
      metric.gauge.dataPoints.forEach((point, i) => {
        assert.equal(mine[i].value, Number(point.asDouble ?? point.asInt), `${name}, point ${i}`);
        for (const attribute of point.attributes) {
          assert.equal(mine[i].labels[attribute.key.replace(/\./g, '_')], Object.values(attribute.value)[0], `${name}, point ${i}: ${attribute.key}`);
        }
      });
    }
  });

  it('says every cost is API-equivalent, and keeps what could not be priced out of every cost', () => {
    const samples = parse(bill().text);
    for (const sample of of(samples, 'trazum_bill_cost_usd')) {
      assert.equal(sample.labels.trazum_cost_basis, 'api-equivalent', 'a cost sample that does not say what it is');
      assert.notEqual(sample.labels.trazum_model, 'mystery-model-9', 'an unpriced model in a cost sample');
    }
    const unpriced = of(samples, 'trazum_bill_unpriced_calls');
    assert.deepEqual(unpriced.map((s) => [s.labels.trazum_model, s.value]), [['mystery-model-9', 1]]);
    assert.equal(sum(of(samples, 'trazum_bill_unpriced_tokens')), 770);
  });

  it('a project name with a quote and a backslash comes back whole', () => {
    const samples = parse(bill().text);
    assert.ok(
      of(samples, 'trazum_bill_cost_usd').some((s) => s.labels.trazum_project === PROJECT),
      'the project with a quote and a backslash in its name did not survive the escaping',
    );
  });

  it('what a day still being measured held is a gauge of its own, and is zero here', () => {
    const samples = parse(bill().text);
    for (const name of ['trazum_bill_open_calls', 'trazum_bill_open_cost_usd', 'trazum_bill_undated_calls']) {
      assert.deepEqual(of(samples, name).map((s) => s.value), [0], `${name} is not one sample at zero`);
    }
    const [info] = of(samples, 'trazum_info');
    assert.equal(info.value, 1);
    assert.equal(info.labels.trazum_bill_open_days, '');
    // The instant the run judged "closed" against is a number, not a label: a label that changes on every write
    // starts a new series on every write.
    assert.equal(info.labels.trazum_bill_measured_at, undefined, 'the instant is a label, a new series on every write');
    const [measured] = of(samples, 'trazum_bill_measured_at_seconds');
    assert.ok(Math.abs(measured.value - Date.now() / 1000) < 600, `measured at ${measured.value}, not around now`);
  });

  it('the Grafana dashboard reads only metrics and labels the exposition writes', () => {
    const samples = parse(bill().text);
    const names = new Set(samples.map((s) => s.name));
    const labels = new Set(samples.flatMap((s) => Object.keys(s.labels)));
    const dashboard = JSON.parse(readFileSync(DASHBOARD, 'utf8'));
    const exprs = dashboard.panels.flatMap((panel) => (panel.targets ?? []).map((target) => target.expr));
    assert.ok(exprs.length >= 4, 'the dashboard has fewer queries than it was built with');
    for (const expr of exprs) {
      for (const [metric] of expr.matchAll(/\btrazum_[a-z_]+\b/g)) {
        if (labels.has(metric) && !names.has(metric)) continue;
        assert.ok(names.has(metric), `the dashboard queries ${metric}, which the exposition does not write: ${expr}`);
      }
      for (const [, by] of expr.matchAll(/\bby \(([^)]*)\)/g)) {
        for (const label of by.split(',').map((l) => l.trim())) assert.ok(labels.has(label), `the dashboard groups by ${label}, which no sample has: ${expr}`);
      }
    }
    // Every panel that shows money says it is API-equivalent.
    for (const panel of dashboard.panels.filter((p) => (p.targets ?? []).some((t) => /cost_usd/.test(t.expr)))) {
      assert.match(`${panel.title} ${panel.description ?? ''}`, /API-equivalent/, `${panel.title} shows money and does not say what it is`);
    }
  });

  it('is refused beside --timezone, as every output that cuts days in UTC is', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-prom-'));
    const log = join(dir, 'usage.jsonl');
    writeFileSync(log, `${LOG.join('\n')}\n`);
    const result = run(['bill', log, '--prom-out', join(dir, 'bill.prom'), '--timezone', 'Europe/Madrid']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--prom-out/);
  });
});
