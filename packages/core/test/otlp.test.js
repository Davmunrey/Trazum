import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toOtlpMetrics } from '../dist/index.js';

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
