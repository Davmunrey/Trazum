import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, billOtlpInput, dayIsClosed, toBillOtlpMetrics, toOtlpMetrics } from '../dist/index.js';

/**
 * OTLP/HTTP JSON, and the two encoding rules that fail silently.
 *
 * A payload with the wrong JSON types is not rejected loudly by a collector — it
 * is accepted and charted wrong, or dropped without a line in any log. So most of
 * what follows asserts *types*, which is unusual for this repository and is the
 * point: the correctness here is in the wire format, not the arithmetic.
 *
 * The arithmetic is `doctor`'s, already tested where it lives. This module only
 * re-encodes it.
 */

const AT = 1_786_000_000_000; // a fixed instant; the payload is half timestamps

const INPUT = {
  prompts: [
    { path: 'prompts/big.txt', tokens: 560, overBudget: true, budgeted: true },
    { path: 'prompts/ok.txt', tokens: 12, overBudget: false, budgeted: true },
    { path: 'other/loose.txt', tokens: 40, overBudget: false, budgeted: false },
  ],
  findings: [
    { id: 'model-downgrade', prompts: 3, monthlyUsd: 4912.4 },
    { id: 'below-cache-minimum', prompts: 3, monthlyUsd: null },
  ],
  model: 'claude-opus-5',
  callsPerMonth: 50_000,
};

const metricsOf = (payload) => payload.resourceMetrics[0].scopeMetrics[0].metrics;
const byName = (payload, name) => metricsOf(payload).find((m) => m.name === name);

describe('the encoding rules a collector will not complain about', () => {
  it('writes every 64-bit integer as a string', () => {
    /**
     * `timeUnixNano` and `asInt` are `int64` in the protobuf. A JSON number cannot
     * hold one exactly, so the JSON mapping specifies strings — and a collector
     * that reads `1786000000000000000` as a double loses the last digits of every
     * timestamp it stores.
     */
    const payload = toOtlpMetrics(INPUT, AT);
    for (const metric of metricsOf(payload)) {
      for (const point of metric.gauge.dataPoints) {
        assert.equal(
          typeof point.timeUnixNano,
          'string',
          `${metric.name}: timeUnixNano is a ${typeof point.timeUnixNano}`,
        );
        assert.match(point.timeUnixNano, /^\d+$/);
        if ('asInt' in point) {
          assert.equal(typeof point.asInt, 'string', `${metric.name}: asInt is a number`);
          assert.match(point.asInt, /^-?\d+$/);
        }
      }
    }
  });

  it('writes money as a double, keeping the cents', () => {
    // `asInt` here would report $4,912.40 as 4912 and the chart would look fine.
    const money = byName(toOtlpMetrics(INPUT, AT), 'trazum.advisory.monthly_usd');
    const point = money.gauge.dataPoints.find(
      (p) => p.attributes[0].value.stringValue === 'model-downgrade',
    );

    assert.equal(typeof point.asDouble, 'number');
    assert.equal(point.asDouble, 4912.4);
    assert.equal('asInt' in point, false, 'a point carries both asInt and asDouble');
  });

  it('gives every point exactly one value', () => {
    for (const metric of metricsOf(toOtlpMetrics(INPUT, AT))) {
      for (const point of metric.gauge.dataPoints) {
        const has = ['asInt', 'asDouble'].filter((k) => k in point);
        assert.equal(has.length, 1, `${metric.name}: ${has.length} value fields`);
      }
    }
  });

  it('is stable for a given instant, so two runs can be compared', () => {
    assert.deepEqual(toOtlpMetrics(INPUT, AT), toOtlpMetrics(INPUT, AT));
    assert.notDeepEqual(toOtlpMetrics(INPUT, AT), toOtlpMetrics(INPUT, AT + 1000));
  });

  it('converts milliseconds to nanoseconds', () => {
    const point = metricsOf(toOtlpMetrics(INPUT, AT))[0].gauge.dataPoints[0];
    assert.equal(point.timeUnixNano, '1786000000000000000');
    assert.equal(BigInt(point.timeUnixNano) / 1_000_000n, BigInt(AT));
  });
});

describe('what the payload says about itself', () => {
  it('records the scenario the money was priced through', () => {
    // A dollar figure whose model and call volume are not stored beside it is a
    // number nobody can check three months later.
    const attrs = toOtlpMetrics(INPUT, AT).resourceMetrics[0].resource.attributes;
    const find = (key) => attrs.find((a) => a.key === key);

    assert.equal(find('service.name').value.stringValue, 'trazum');
    assert.equal(find('trazum.model').value.stringValue, 'claude-opus-5');
    assert.equal(find('trazum.calls_per_month').value.intValue, '50000');
  });

  it('reports over-budget per prompt, so a dashboard can name the offender', () => {
    const metric = byName(toOtlpMetrics(INPUT, AT), 'trazum.prompt.over_budget');
    const points = Object.fromEntries(
      metric.gauge.dataPoints.map((p) => [p.attributes[0].value.stringValue, p.asInt]),
    );

    assert.equal(points['prompts/big.txt'], '1');
    assert.equal(points['prompts/ok.txt'], '0');
    assert.equal(
      'other/loose.txt' in points,
      false,
      'an unbudgeted prompt was reported as within budget',
    );
  });

  it('counts the unbudgeted prompts rather than naming them', () => {
    // Names would be a series per path that appears and vanishes as budgets are
    // added, which is noise. The count is the thing that should trend to zero.
    const metric = byName(toOtlpMetrics(INPUT, AT), 'trazum.prompts.unbudgeted');
    assert.equal(metric.gauge.dataPoints.length, 1);
    assert.equal(metric.gauge.dataPoints[0].asInt, '1');
    assert.deepEqual(metric.gauge.dataPoints[0].attributes, []);
  });

  it('keeps an advisory that carries no money out of the money metric', () => {
    const payload = toOtlpMetrics(INPUT, AT);
    const money = byName(payload, 'trazum.advisory.monthly_usd');
    const counts = byName(payload, 'trazum.advisory.prompts');

    assert.equal(money.gauge.dataPoints.length, 1, 'a null figure reached the money series');
    assert.equal(counts.gauge.dataPoints.length, 2, 'the unpriced advisory vanished entirely');
  });

  it('omits a metric with no points rather than emitting an empty series', () => {
    // A collector charting an empty series draws nothing; a zero draws a flat line
    // that says something false.
    const payload = toOtlpMetrics({ ...INPUT, prompts: [], findings: [] }, AT);
    const names = metricsOf(payload).map((m) => m.name);

    assert.equal(names.includes('trazum.prompt.tokens'), false);
    assert.equal(names.includes('trazum.advisory.monthly_usd'), false);
    // The unbudgeted count is always meaningful, including at zero.
    assert.equal(names.includes('trazum.prompts.unbudgeted'), true);
  });

  it('gives every metric a unit and a description', () => {
    for (const metric of metricsOf(toOtlpMetrics(INPUT, AT))) {
      assert.ok(metric.unit.length > 0, `${metric.name} has no unit`);
      assert.ok(metric.description.length > 20, `${metric.name} has no real description`);
    }
  });
});

/**
 * The bill's payload, from rows built by hand.
 *
 * `bill --otlp-out` round-trips against the receipt in the CLI's own suite;
 * what is held here is the encoder and the rule for a day that is still open,
 * on inputs small enough to check by eye.
 */
const DAY = 86_400_000;
const NOON = Date.parse('2026-09-03T12:00:00Z');

const ROW = {
  day: '2026-09-01',
  project: 'api',
  model: 'claude-opus-5',
  agent: 'Claude Code',
  calls: 2,
  inputTokens: 1500,
  cacheReadTokens: 4000,
  cacheWriteTokens: 0,
  outputTokens: 300,
  usd: 0.017,
};
const BILL = {
  priced: [ROW],
  unpriced: [{ ...ROW, model: 'mystery', calls: 1, usd: undefined }],
  open: { days: ['2026-09-03'], calls: 1, usd: 0.03, tokens: 2000, unpricedCalls: 0 },
  undated: { calls: 0, usd: 0, tokens: 0, unpricedCalls: 0 },
  measuredAtMs: NOON,
};

describe('dayIsClosed', () => {
  it('closes a day only once its last millisecond has passed', () => {
    const midnight = Date.parse('2026-09-02T00:00:00Z');
    assert.equal(dayIsClosed('2026-09-01', midnight - 1), false);
    assert.equal(dayIsClosed('2026-09-01', midnight), true);
    assert.equal(dayIsClosed('2026-09-03', NOON), false, 'today is still being measured');
  });

  it('keeps a day open when the window cuts it at either end', () => {
    const day = '2026-09-01';
    const start = Date.parse(`${day}T00:00:00Z`);
    assert.equal(dayIsClosed(day, NOON, start, start + DAY), true);
    assert.equal(dayIsClosed(day, NOON, start + 1, undefined), false, 'a window that starts inside the day');
    assert.equal(dayIsClosed(day, NOON, undefined, start + DAY - 1), false, 'a window that ends inside the day');
  });
});

describe('toBillOtlpMetrics', () => {
  const payload = toBillOtlpMetrics(BILL);
  const metrics = payload.resourceMetrics[0].scopeMetrics[0].metrics;
  const named = (name) => metrics.find((m) => m.name === name);
  const attr = (point, key) => point.attributes.find((a) => a.key === key)?.value.stringValue;

  it('writes cost as a double with the basis on it, and counts as strings', () => {
    const [cost] = named('trazum.bill.cost').gauge.dataPoints;
    assert.equal(cost.asDouble, 0.017);
    assert.equal('asInt' in cost, false);
    assert.equal(attr(cost, 'trazum.cost.basis'), 'api-equivalent');
    assert.equal(named('trazum.bill.calls').gauge.dataPoints[0].asInt, '2');
    assert.equal(cost.timeUnixNano, `${Date.parse('2026-09-01T00:00:00Z')}000000`);
  });

  it('splits tokens by kind, so the four add to the row', () => {
    const points = named('trazum.bill.tokens').gauge.dataPoints;
    const byType = Object.fromEntries(points.map((p) => [attr(p, 'trazum.token.type'), p.asInt]));
    assert.deepEqual(byType, { input: '1500', cache_read: '4000', cache_write: '0', output: '300' });
  });

  it('keeps the unpriced model out of the money metric and out of any dollar figure', () => {
    assert.equal(named('trazum.bill.cost').gauge.dataPoints.length, 1);
    for (const name of ['trazum.bill.unpriced.calls', 'trazum.bill.unpriced.tokens']) {
      for (const point of named(name).gauge.dataPoints) {
        assert.equal(attr(point, 'trazum.model'), 'mystery');
        assert.equal('asDouble' in point, false);
      }
    }
  });

  it('omits project and agent when the row has none, rather than writing an empty string', () => {
    const bare = toBillOtlpMetrics({ ...BILL, priced: [{ ...ROW, project: null, agent: null }], unpriced: [] });
    const [point] = bare.resourceMetrics[0].scopeMetrics[0].metrics[0].gauge.dataPoints;
    assert.deepEqual(
      point.attributes.map((a) => a.key),
      ['trazum.day', 'trazum.model', 'trazum.cost.basis'],
    );
  });

  it('names what it left out, and writes it at zero when nothing was', () => {
    const attrs = Object.fromEntries(
      payload.resourceMetrics[0].resource.attributes.map((a) => [a.key, Object.values(a.value)[0]]),
    );
    assert.equal(attrs['trazum.bill.open_days'], '2026-09-03');
    assert.equal(attrs['trazum.bill.open_calls'], '1');
    assert.equal(attrs['trazum.bill.open_cost_usd'], 0.03);
    assert.equal(attrs['trazum.bill.measured_at'], '2026-09-03T12:00:00.000Z');
    assert.equal(attrs['trazum.bill.undated_calls'], '0');
  });
});

describe('billOtlpInput', () => {
  const catalogue = BUNDLED_CATALOGUE;
  const line = (ts, label, input) =>
    JSON.stringify({ model: 'claude-opus-5', ...(ts ? { ts } : {}), ...(label ? { label } : {}), usage: { input_tokens: input, output_tokens: 0 } });
  const sources = [
    { agent: null, lines: [line('2026-09-01T01:00:00Z', 'a', 1000), line('2026-09-03T01:00:00Z', 'a', 1000), line(null, 'a', 1000), 'not json'] },
  ];

  it('files today under open, a clockless call under undated, and the rest as closed rows', () => {
    const input = billOtlpInput(sources, { catalogue, nowMs: NOON });
    assert.deepEqual(input.priced.map((r) => [r.day, r.calls]), [['2026-09-01', 1]]);
    assert.deepEqual(input.open.days, ['2026-09-03']);
    assert.equal(input.open.calls, 1);
    assert.equal(input.undated.calls, 1);
    // 1,000 input tokens at $5 per million.
    assert.ok(Math.abs(input.priced[0].usd - 0.005) < 1e-12);
  });

  it('leaves out of the window what profileUsage leaves out, so the totals agree', () => {
    const since = Date.parse('2026-09-02T00:00:00Z');
    const input = billOtlpInput(sources, { catalogue, nowMs: NOON, sinceMs: since });
    assert.equal(input.priced.length, 0);
    assert.equal(input.undated.calls, 0, 'a clockless call under a window is excluded, as the bill excludes it');
    assert.equal(input.open.calls, 1);
  });
});
