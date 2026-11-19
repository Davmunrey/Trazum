import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from './env.mjs';

/**
 * `bill --otlp-out`: the bill as OpenTelemetry metrics, in a file.
 *
 * The claim worth holding is the round trip: add up what the payload says and
 * get what `bill`'s own receipt says. The receipt is `bill`'s JSON document
 * (`--out`), the figures a reader checks a bill against, so a payload that
 * drifts from it is wrong whatever it looks like.
 *
 * Every expected figure is worked out by hand beside its fixture, from the
 * catalogue's rates (claude-opus-5 $5 in and $25 out per million, cache reads
 * at a tenth of input; claude-sonnet-5-5 $2 in and $10 out), and never copied
 * from what the command printed.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const CLAUDE_EXAMPLE = new URL('../../../examples/claude-projects', import.meta.url).pathname;

const run = (args) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, CLAUDE_CONFIG_DIR: '', CODEX_HOME: '', GEMINI_CLI_HOME: '' },
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });

const record = (model, ts, label, usage) =>
  JSON.stringify({ model, ...(ts ? { ts } : {}), ...(label ? { label } : {}), usage });

/**
 * A log of two closed days, and one unpriced model.
 *
 * - 2026-09-01, api, opus: 1,000 in + 200 out; then 500 in + 100 out + 4,000
 *   cache read. $0.005 + $0.005 = $0.010; $0.0025 + $0.0025 + $0.002 = $0.007.
 * - 2026-09-02, web, sonnet: 2,000 in + 300 out = $0.004 + $0.003 = $0.007.
 * - 2026-09-02, web, a model the catalogue does not know: 700 in + 70 out.
 */
const CLOSED = [
  record('claude-opus-5', '2026-09-01T10:00:00Z', 'api', { input_tokens: 1000, output_tokens: 200 }),
  record('claude-opus-5', '2026-09-01T11:00:00Z', 'api', { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 4000 }),
  record('claude-sonnet-5-5', '2026-09-02T10:00:00Z', 'web', { input_tokens: 2000, output_tokens: 300 }),
  record('mystery-model-9', '2026-09-02T12:00:00Z', 'web', { input_tokens: 700, output_tokens: 70 }),
];

function workspace(lines) {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-otlp-'));
  const log = join(dir, 'usage.jsonl');
  writeFileSync(log, `${lines.join('\n')}\n`);
  return { dir, log, payloadPath: join(dir, 'metrics.json'), receiptPath: join(dir, 'receipt.json') };
}

/** Runs `bill`, and returns the payload and the receipt it wrote beside each other. */
function bill(lines, extra = []) {
  const w = workspace(lines);
  const result = run(['bill', w.log, '--otlp-out', w.payloadPath, '-o', w.receiptPath, ...extra]);
  assert.equal(result.status, 0, result.stderr);
  return {
    ...w,
    result,
    payload: JSON.parse(readFileSync(w.payloadPath, 'utf8')),
    receipt: JSON.parse(readFileSync(w.receiptPath, 'utf8')),
  };
}

const resourceOf = (payload) =>
  Object.fromEntries(
    payload.resourceMetrics[0].resource.attributes.map((a) => [a.key, Object.values(a.value)[0]]),
  );
const metricsOf = (payload) => payload.resourceMetrics[0].scopeMetrics[0].metrics;
const pointsOf = (payload, name) => metricsOf(payload).find((m) => m.name === name)?.gauge.dataPoints ?? [];
const attrOf = (point, key) => point.attributes.find((a) => a.key === key)?.value.stringValue;

/** What the payload adds up to, closed days and the excluded part kept apart. */
function totalsOf(payload) {
  const resource = resourceOf(payload);
  const cost = pointsOf(payload, 'trazum.bill.cost').reduce((sum, p) => sum + p.asDouble, 0);
  const calls = pointsOf(payload, 'trazum.bill.calls').reduce((sum, p) => sum + Number(p.asInt), 0);
  const tokens = pointsOf(payload, 'trazum.bill.tokens').reduce((sum, p) => sum + Number(p.asInt), 0);
  return {
    cost: cost + resource['trazum.bill.open_cost_usd'] + resource['trazum.bill.undated_cost_usd'],
    calls: calls + Number(resource['trazum.bill.open_calls']) + Number(resource['trazum.bill.undated_calls']),
    tokens: tokens + Number(resource['trazum.bill.open_tokens']) + Number(resource['trazum.bill.undated_tokens']),
    closedCost: cost,
  };
}

/** The same three, from the receipt `bill` wrote. */
function receiptTotals(receipt) {
  return {
    cost: receipt.total.usd,
    calls: receipt.total.calls,
    tokens: receipt.lines.reduce(
      (sum, l) => sum + l.inputTokens + l.cacheReadTokens + l.cacheWriteTokens + l.outputTokens,
      0,
    ),
  };
}

describe('bill --otlp-out round-trips to the bill', () => {
  it('adds up to the totals the bill prints, for a fixture of closed days', () => {
    const { payload, receipt } = bill(CLOSED);
    const got = totalsOf(payload);
    const want = receiptTotals(receipt);

    // $0.010 + $0.007 + $0.007, worked out above the fixture.
    assert.ok(Math.abs(want.cost - 0.024) < 1e-9, `the receipt itself moved: ${want.cost}`);
    assert.ok(Math.abs(got.cost - want.cost) < 1e-9, `payload ${got.cost} is not the bill ${want.cost}`);
    assert.equal(got.calls, want.calls);
    assert.equal(got.tokens, want.tokens);
    assert.equal(got.calls, 3, 'three priced calls');
    // 1000+200 + 500+100+4000 + 2000+300 tokens.
    assert.equal(got.tokens, 8100);
  });

  it('adds up by model and by project too, not only in total', () => {
    const { payload, receipt } = bill(CLOSED);
    const cost = pointsOf(payload, 'trazum.bill.cost');
    for (const line of receipt.lines) {
      const mine = cost.filter((p) => attrOf(p, 'trazum.model') === line.model && attrOf(p, 'trazum.project') === line.label);
      assert.ok(mine.length > 0, `${line.label}/${line.model} is missing from the payload`);
      const sum = mine.reduce((s, p) => s + p.asDouble, 0);
      assert.ok(Math.abs(sum - line.usd) < 1e-9, `${line.label}/${line.model}: ${sum} against ${line.usd}`);
    }
  });

  it('carries what could not be priced as its own metric, with no dollars', () => {
    const { payload, receipt } = bill(CLOSED);
    const gap = receipt.gaps.find((g) => g.kind === 'unpriced');
    const calls = pointsOf(payload, 'trazum.bill.unpriced.calls');
    const tokens = pointsOf(payload, 'trazum.bill.unpriced.tokens');

    assert.equal(calls.reduce((s, p) => s + Number(p.asInt), 0), gap.calls);
    assert.equal(attrOf(calls[0], 'trazum.model'), 'mystery-model-9');
    assert.equal(tokens.reduce((s, p) => s + Number(p.asInt), 0), gap.inputTokens + gap.outputTokens);
    // The unknown model's money appears nowhere: not as a zero, not at all.
    for (const point of [...calls, ...tokens]) assert.equal('asDouble' in point, false);
    assert.equal(
      pointsOf(payload, 'trazum.bill.cost').some((p) => attrOf(p, 'trazum.model') === 'mystery-model-9'),
      false,
    );
  });

  it('puts the day, project and model on every point, and the cost basis on every cost point', () => {
    const { payload } = bill(CLOSED);
    for (const metric of metricsOf(payload)) {
      for (const point of metric.gauge.dataPoints) {
        assert.match(attrOf(point, 'trazum.day') ?? '', /^\d{4}-\d{2}-\d{2}$/, `${metric.name}: no day`);
        assert.ok(attrOf(point, 'trazum.model'), `${metric.name}: no model`);
        assert.ok(attrOf(point, 'trazum.project'), `${metric.name}: no project`);
        if (metric.name === 'trazum.bill.cost') {
          assert.equal(attrOf(point, 'trazum.cost.basis'), 'api-equivalent', 'a cost point does not say what it is');
        }
      }
    }
    assert.ok(pointsOf(payload, 'trazum.bill.cost').length > 0);
  });

  it('follows doctor\'s encoding: 64-bit integers as strings, money as a double', () => {
    const { payload } = bill(CLOSED);
    for (const metric of metricsOf(payload)) {
      for (const point of metric.gauge.dataPoints) {
        assert.equal(typeof point.timeUnixNano, 'string');
        assert.match(point.timeUnixNano, /^\d+$/);
        const has = ['asInt', 'asDouble'].filter((k) => k in point);
        assert.equal(has.length, 1, `${metric.name}: ${has.length} value fields`);
        if (metric.name === 'trazum.bill.cost') assert.equal(typeof point.asDouble, 'number');
        else assert.equal(typeof point.asInt, 'string');
      }
    }
    // 2026-09-01T00:00:00Z, in nanoseconds, written out by hand.
    const first = pointsOf(payload, 'trazum.bill.cost').find((p) => attrOf(p, 'trazum.day') === '2026-09-01');
    assert.equal(first.timeUnixNano, '1788220800000000000');
  });

  it('names an agent for a coding agent\'s sessions and none for a plain log', () => {
    const w = workspace(CLOSED);
    const result = run(['bill', CLAUDE_EXAMPLE, '--otlp-out', w.payloadPath, '-o', w.receiptPath]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(readFileSync(w.payloadPath, 'utf8'));
    const receipt = JSON.parse(readFileSync(w.receiptPath, 'utf8'));
    const cost = pointsOf(payload, 'trazum.bill.cost');

    assert.ok(cost.length > 0);
    assert.ok(cost.every((p) => attrOf(p, 'trazum.agent') === 'Claude Code'), 'a session point has no agent');
    assert.ok(Math.abs(totalsOf(payload).cost - receipt.total.usd) < 1e-9);

    const plain = bill(CLOSED);
    assert.ok(pointsOf(plain.payload, 'trazum.bill.cost').every((p) => attrOf(p, 'trazum.agent') === undefined));
  });
});

describe('a day still being measured is not written as a closed one', () => {
  const today = new Date().toISOString().slice(0, 10);
  const OPEN = record('claude-opus-5', `${today}T00:00:01Z`, 'api', { input_tokens: 1000, output_tokens: 1000 });

  it('leaves today out of every metric and says so in the resource', () => {
    const { payload, receipt } = bill([...CLOSED, OPEN]);
    const days = metricsOf(payload).flatMap((m) => m.gauge.dataPoints.map((p) => attrOf(p, 'trazum.day')));
    const resource = resourceOf(payload);

    assert.equal(days.includes(today), false, 'today was written as a closed day');
    assert.equal(resource['trazum.bill.open_days'], today);
    assert.equal(resource['trazum.bill.open_calls'], '1');
    // 1,000 in at $5 per million + 1,000 out at $25 per million = $0.005 + $0.025.
    assert.ok(Math.abs(resource['trazum.bill.open_cost_usd'] - 0.03) < 1e-9);
    assert.equal(resource['trazum.bill.open_tokens'], '2000');
    // And the bill is still whole: the series plus the open day.
    assert.ok(Math.abs(totalsOf(payload).cost - receipt.total.usd) < 1e-9);
    assert.equal(totalsOf(payload).calls, receipt.total.calls);
  });

  it('says there is nothing open as a zero, not by leaving the attribute out', () => {
    const resource = resourceOf(bill(CLOSED).payload);
    assert.equal(resource['trazum.bill.open_days'], '');
    assert.equal(resource['trazum.bill.open_calls'], '0');
    assert.equal(resource['trazum.bill.open_cost_usd'], 0);
    assert.equal(resource['trazum.bill.undated_calls'], '0');
  });

  it('treats a day the window cuts as open: a part of a day is not a day', () => {
    // The window ends at noon on 2026-09-02, so that day holds half of itself.
    const { payload, receipt } = bill(CLOSED, ['--until', '2026-09-02T11:00:00Z']);
    const days = pointsOf(payload, 'trazum.bill.cost').map((p) => attrOf(p, 'trazum.day'));

    assert.deepEqual([...new Set(days)], ['2026-09-01']);
    assert.equal(resourceOf(payload)['trazum.bill.open_days'], '2026-09-02');
    assert.ok(Math.abs(totalsOf(payload).cost - receipt.total.usd) < 1e-9);
    assert.equal(totalsOf(payload).calls, receipt.total.calls);
  });

  it('keeps a window that ends on a day boundary closed', () => {
    const { payload } = bill(CLOSED, ['--since', '2026-09-01', '--until', '2026-09-02']);
    const days = new Set(pointsOf(payload, 'trazum.bill.cost').map((p) => attrOf(p, 'trazum.day')));
    assert.deepEqual([...days].sort(), ['2026-09-01', '2026-09-02'], 'a bare --until day means the whole of it, so it is closed');
    assert.equal(resourceOf(payload)['trazum.bill.open_days'], '');
  });

  it('counts a call with no clock apart from the series, and the totals still agree', () => {
    const { payload, receipt } = bill([...CLOSED, record('claude-opus-5', null, null, { input_tokens: 100, output_tokens: 100 })]);
    const resource = resourceOf(payload);

    assert.equal(resource['trazum.bill.undated_calls'], '1');
    // 100 in at $5 per million + 100 out at $25 per million = $0.0005 + $0.0025.
    assert.ok(Math.abs(resource['trazum.bill.undated_cost_usd'] - 0.003) < 1e-9);
    assert.ok(Math.abs(totalsOf(payload).cost - receipt.total.usd) < 1e-9);
  });
});

describe('bill --otlp-out writes a file and nothing else', () => {
  it('writes nothing without the flag', () => {
    const w = workspace(CLOSED);
    const result = run(['bill', w.log, '-o', w.receiptPath]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(w.payloadPath), false);
  });

  it('does not fail the bill when the file cannot be written', () => {
    const w = workspace(CLOSED);
    const result = run(['bill', w.log, '--otlp-out', join(w.log, 'nope.json'), '-o', w.receiptPath]);
    assert.equal(result.status, 0);
    assert.match(result.stderr, /Could not write/);
    assert.ok(existsSync(w.receiptPath), 'the bill itself was not written');
  });

  it('leaves the receipt on stdout alone', () => {
    const w = workspace(CLOSED);
    const plain = run(['bill', w.log, '--receipt']);
    const withFile = run(['bill', w.log, '--receipt', '--otlp-out', w.payloadPath]);
    assert.equal(withFile.stdout, plain.stdout);
  });
});
