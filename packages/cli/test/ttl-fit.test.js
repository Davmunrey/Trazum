import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The clock on screen: the span line, and whether the cache TTL fits the gaps.
 *
 * The core arithmetic is pinned in `packages/core/test/ttl-fit.test.js`; these
 * assert what a reader actually sees — including the states whose absence would
 * read as "fine".
 */

const logOf = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-ttl-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return path;
};

const run = (path, extra = []) =>
  spawnSync(process.execPath, [CLI, 'profile', path, ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

const T0 = Date.parse('2026-08-01T10:00:00Z');
const turn = (session, offsetMs, writes = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  session,
  ts: new Date(T0 + offsetMs).toISOString(),
  usage: { input_tokens: 500, output_tokens: 50, ...writes },
});
const writes5m = (tokens) => ({
  cache_creation_input_tokens: tokens,
  cache_creation: { ephemeral_5m_input_tokens: tokens, ephemeral_1h_input_tokens: 0 },
});
const writes1h = (tokens) => ({
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: tokens },
});

describe('the span line', () => {
  it('states the period and refuses to extrapolate from it', async () => {
    const result = run(
      await logOf([turn('a', 0), turn('a', 13 * 86_400_000)]),
    );
    const out = flat(result);
    assert.match(out, /covers 2026-08-01 → 2026-08-14 \(13\.0 days\)/);
    assert.match(out, /stated, never extrapolated/);
    // The span alone must not conjure a monthly figure anywhere.
    assert.ok(!/\/month|per month/.test(out), 'a monthly figure appeared from a span');
  });

  it('says when only part of the log carries a clock', async () => {
    const result = run(
      await logOf([
        turn('a', 0),
        { model: 'claude-opus-5', usage: { input_tokens: 100, output_tokens: 10 } },
      ]),
    );
    assert.match(flat(result), /Only 1 of 2 calls carry a timestamp/);
  });

  it('prints no span at all for a log with no clock — absent, not zero days', async () => {
    const result = run(
      await logOf([{ model: 'claude-opus-5', usage: { input_tokens: 100, output_tokens: 10 } }]),
    );
    assert.ok(!/covers .* days/.test(flat(result)));
  });
});

describe('whether the TTL fits the gaps, on screen', () => {
  it('names the expiring writes and both honest ways out', async () => {
    const result = run(
      await logOf([
        turn('a', 0, writes5m(10_000)),
        turn('a', 9 * 60_000, writes5m(10_000)),
        turn('a', 18 * 60_000, writes5m(10_000)),
      ]),
    );
    const out = flat(result);
    assert.match(out, /median of 9m apart and the 5-minute entry is gone/);
    assert.match(out, /1-hour TTL costs 2x input to write and would survive/);
  });

  it('says even the hour is too short when the gaps outlive both TTLs', async () => {
    const result = run(
      await logOf([
        turn('a', 0, writes5m(10_000)),
        turn('a', 2 * 3_600_000, writes5m(10_000)),
        turn('a', 4 * 3_600_000, writes5m(10_000)),
      ]),
    );
    assert.match(flat(result), /no cache entry lives that long/);
  });

  it('prices the overlong TTL exactly: the same tokens at the other rate', async () => {
    const result = run(
      await logOf([
        turn('a', 0, writes1h(1_000_000)),
        turn('a', 30_000, writes1h(1_000_000)),
        turn('a', 60_000, writes1h(1_000_000)),
      ]),
    );
    const out = flat(result);
    // 3M tokens × $5/MTok × (2.0 − 1.25) = $11.25, by hand.
    assert.match(out, /pay the 1-hour rate/);
    assert.match(out, /\$11\.25 cheaper on this log/);
  });

  it('reports gaps between the two TTLs as unsettled when the log kept quiet', async () => {
    const result = run(
      await logOf([
        turn('a', 0, { cache_creation_input_tokens: 10_000 }),
        turn('a', 20 * 60_000, { cache_creation_input_tokens: 10_000 }),
      ]),
    );
    assert.match(flat(result), /did not record which these writes were/);
  });

  it('clears the TTL by name when it fits, instead of staying silent', async () => {
    const result = run(
      await logOf([
        turn('a', 0, writes5m(10_000)),
        turn('a', 30_000, writes5m(10_000)),
        turn('a', 60_000, writes5m(10_000)),
      ]),
    );
    assert.match(flat(result), /inside the lifetime these writes use/);
  });

  it('says "could not be measured" over writes with no clock — not nothing', async () => {
    const result = run(
      await logOf([
        {
          model: 'claude-opus-5',
          label: 'chat',
          usage: { input_tokens: 500, output_tokens: 50, cache_creation_input_tokens: 10_000 },
        },
      ]),
    );
    assert.match(flat(result), /could not be measured — it needs both "session" and "ts"/);
  });

  it('never prints the session key in the fit lines', async () => {
    const secret = 'sess-CUSTOMER-77';
    const result = run(
      await logOf([
        turn(secret, 0, writes5m(10_000)),
        turn(secret, 9 * 60_000, writes5m(10_000)),
        turn(secret, 18 * 60_000, writes5m(10_000)),
      ]),
    );
    assert.ok(!flat(result).includes(secret));
  });

  it('carries the fit into --json, verdict and exact figure included', async () => {
    const result = run(
      await logOf([
        turn('a', 0, writes1h(1_000_000)),
        turn('a', 30_000, writes1h(1_000_000)),
        turn('a', 60_000, writes1h(1_000_000)),
      ]),
      ['--json'],
    );
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.cacheTtlFit[0].verdict, 'overlong-ttl');
    assert.equal(parsed.cacheTtlFit[0].overpayUsd.toFixed(2), '11.25');
    assert.equal(parsed.span.calls, 3);
  });

  it('renders the whole story in Spanish too', async () => {
    const result = run(
      await logOf([
        turn('a', 0, writes5m(10_000)),
        turn('a', 9 * 60_000, writes5m(10_000)),
        turn('a', 18 * 60_000, writes5m(10_000)),
      ]),
      ['--locale', 'es'],
    );
    const out = flat(result);
    assert.match(out, /mediana de 9m/);
    assert.match(out, /caducan antes de que el siguiente turno las lea/);
    assert.match(out, /abarca 2026-08-01/);
  });
});
