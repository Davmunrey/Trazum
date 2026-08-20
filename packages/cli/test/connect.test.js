import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { connectorFor } from '@trazum/core';
import { fetchProviderUsage, findCredential, redact } from '../dist/connect.js';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The fetch half of the connector.
 *
 * Every test here injects `fetch`, so the suite never touches a network and
 * never needs a credential — the same property that lets the core half be
 * tested against fixtures.
 */

const ANTHROPIC = connectorFor('anthropic');
const OPENAI = connectorFor('openai');

const bucket = (day) => ({
  starting_at: `2026-08-${String(day).padStart(2, '0')}T00:00:00Z`,
  ending_at: `2026-08-${String(day + 1).padStart(2, '0')}T00:00:00Z`,
  results: [
    { model: 'claude-opus-5', uncached_input_tokens: 200_000, output_tokens: 0 },
  ],
});

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const run = (args, env = {}) =>
  spawnSync(process.execPath, [CLI, 'connect', ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, ...env },
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('the credential', () => {
  it('is found by the documented variables, in order, and never returned to a printer', () => {
    const found = findCredential(ANTHROPIC, { ANTHROPIC_ADMIN_KEY: 'sk-ant-admin-secret-value' });
    assert.equal(found.source.variable, 'ANTHROPIC_ADMIN_KEY');
    // The caller gets the *name* of the variable, never the value, so an error
    // handler that prints "source" cannot leak a key.
    assert.equal(Object.keys(found.source).join(), 'variable');

    // The first documented variable wins over the fallback.
    const preferred = findCredential(ANTHROPIC, {
      TRAZUM_ANTHROPIC_ADMIN_KEY: 'first',
      ANTHROPIC_ADMIN_KEY: 'second',
    });
    assert.equal(preferred.source.variable, 'TRAZUM_ANTHROPIC_ADMIN_KEY');

    assert.equal(findCredential(ANTHROPIC, {}), null);
    // A variable set to whitespace is not a credential.
    assert.equal(findCredential(ANTHROPIC, { ANTHROPIC_ADMIN_KEY: '   ' }), null);
  });

  it('is redacted from anything on its way to a terminal, ours and theirs', () => {
    const key = 'sk-ant-admin-01ABCDEFGHIJKLMNOP';
    assert.equal(redact(`failed with ${key}`, key), 'failed with [redacted]');
    // A key we do not hold — quoted back by somebody else's error body.
    assert.match(redact('upstream said sk-ant-api03-QQQQQQQQQQQQ is invalid'), /\[redacted\]/);
    assert.match(redact('Authorization: Bearer abcdef0123456789'), /Bearer \[redacted\]/);
    assert.doesNotMatch(redact(`token ${key}`, key), /ABCDEFGH/);
  });
});

describe('fetchProviderUsage', () => {
  it('pulls a window, prices nothing, and reports which variable it borrowed', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, headers: init.headers });
      return jsonResponse({ data: [bucket(1)], has_more: false });
    };
    const result = await fetchProviderUsage({
      descriptor: ANTHROPIC,
      fromMs: Date.UTC(2026, 7, 1),
      toMs: Date.UTC(2026, 7, 3),
      env: { ANTHROPIC_ADMIN_KEY: 'sk-ant-admin-key' },
      fetchImpl,
    });
    assert.equal(result.source.variable, 'ANTHROPIC_ADMIN_KEY');
    assert.equal(result.pull.buckets.length, 1);
    assert.equal(result.pull.gaps.length, 0);
    // The endpoint is compiled in, never taken from the caller.
    assert.match(calls[0].url, /^https:\/\/api\.anthropic\.com\//);
    assert.equal(calls[0].headers['anthropic-version'], '2023-06-01');
  });

  it('follows the cursor and stops when the provider says there is no more', async () => {
    let page = 0;
    const fetchImpl = async () => {
      page += 1;
      return page < 3
        ? jsonResponse({ data: [bucket(page)], has_more: true, next_page: `p${page}` })
        : jsonResponse({ data: [bucket(page)], has_more: false });
    };
    const result = await fetchProviderUsage({
      descriptor: ANTHROPIC,
      fromMs: Date.UTC(2026, 7, 1),
      toMs: Date.UTC(2026, 7, 5),
      env: { ANTHROPIC_ADMIN_KEY: 'k'.repeat(20) },
      fetchImpl,
    });
    assert.equal(result.pages, 3);
    assert.equal(result.pull.buckets.length, 3);
    assert.equal(result.pull.gaps.length, 0);
  });

  it('returns what arrived when the provider rate-limits, with the gap named', async () => {
    let page = 0;
    const fetchImpl = async () => {
      page += 1;
      return page === 1
        ? jsonResponse({ data: [bucket(1)], has_more: true, next_page: 'p1' })
        : jsonResponse({ error: 'slow down' }, 429);
    };
    const result = await fetchProviderUsage({
      descriptor: ANTHROPIC,
      fromMs: Date.UTC(2026, 7, 1),
      toMs: Date.UTC(2026, 7, 30),
      env: { ANTHROPIC_ADMIN_KEY: 'k'.repeat(20) },
      fetchImpl,
    });
    // The half that arrived is kept — throwing it away would lose measured spend.
    assert.equal(result.pull.buckets.length, 1);
    const gap = result.pull.gaps.find((g) => g.kind === 'rate-limited');
    assert.ok(gap, 'the rate limit is named, never a silently short bill');
    assert.match(gap.detail, /stops early/);
  });

  it('names a cursor the provider promised and did not serve', async () => {
    const fetchImpl = async () => jsonResponse({ data: [bucket(1)], has_more: true });
    const result = await fetchProviderUsage({
      descriptor: ANTHROPIC,
      fromMs: Date.UTC(2026, 7, 1),
      toMs: Date.UTC(2026, 7, 3),
      env: { ANTHROPIC_ADMIN_KEY: 'k'.repeat(20) },
      fetchImpl,
    });
    assert.equal(result.pull.gaps[0].kind, 'cursor-expired');
  });

  it('explains a rejected credential by naming the key kind, never the key', async () => {
    const key = 'sk-ant-admin-0123456789ABCDEF';
    const fetchImpl = async () => jsonResponse({ error: `key ${key} is not an admin key` }, 403);
    await assert.rejects(
      fetchProviderUsage({
        descriptor: ANTHROPIC,
        fromMs: Date.UTC(2026, 7, 1),
        toMs: Date.UTC(2026, 7, 3),
        env: { ANTHROPIC_ADMIN_KEY: key },
        fetchImpl,
      }),
      (error) => {
        assert.match(error.message, /Admin API key/);
        assert.doesNotMatch(error.message, /0123456789ABCDEF/);
        return true;
      },
    );
  });

  it('redacts credential material quoted back inside an error body', async () => {
    const key = 'sk-ant-admin-SECRETSECRETSECRET';
    const fetchImpl = async () => new Response(`bad request for ${key}`, { status: 400 });
    await assert.rejects(
      fetchProviderUsage({
        descriptor: ANTHROPIC,
        fromMs: Date.UTC(2026, 7, 1),
        toMs: Date.UTC(2026, 7, 3),
        env: { ANTHROPIC_ADMIN_KEY: key },
        fetchImpl,
      }),
      (error) => {
        assert.doesNotMatch(error.message, /SECRETSECRET/);
        assert.match(error.message, /\[redacted\]/);
        return true;
      },
    );
  });

  it('refuses to run at all without a credential, naming what to set', async () => {
    await assert.rejects(
      fetchProviderUsage({
        descriptor: OPENAI,
        fromMs: Date.UTC(2026, 7, 1),
        toMs: Date.UTC(2026, 7, 3),
        env: {},
        fetchImpl: async () => {
          throw new Error('must not be called');
        },
      }),
      /TRAZUM_OPENAI_ADMIN_KEY/,
    );
  });
});

describe('trazum connect', () => {
  it('says what it would call, with no credential and nothing sent', () => {
    const result = run(['anthropic', '--dry-run', '--since', '2026-08-01', '--until', '2026-08-31']);
    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /Would read Anthropic usage from 2026-08-01 to 2026-09-01/);
    assert.match(out, /TRAZUM_ANTHROPIC_ADMIN_KEY/);
    assert.match(out, /Nothing was sent and no credential was needed/);
  });

  it('refuses a missing provider and an unknown one, naming what exists', () => {
    const bare = run([]);
    assert.equal(bare.status, 1);
    assert.match(flat(bare), /Available: anthropic, openai/);

    const unknown = run(['bedrock']);
    assert.equal(unknown.status, 1);
    assert.match(flat(unknown), /no connector for "bedrock"/);
  });

  it('refuses to run without a credential, naming the variable and the key kind', () => {
    const result = run(['anthropic'], { TRAZUM_ANTHROPIC_ADMIN_KEY: '', ANTHROPIC_ADMIN_KEY: '' });
    assert.equal(result.status, 1);
    const out = flat(result);
    assert.match(out, /never stores it/);
    assert.match(out, /Admin API key/);
  });

  it('prices a payload somebody already has, with no credential and no network', async () => {
    const { mkdtemp, writeFile, readFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'trazum-connect-'));
    const payload = join(dir, 'usage.json');
    await writeFile(
      payload,
      JSON.stringify({
        data: [
          {
            starting_at: '2026-08-01T00:00:00Z',
            ending_at: '2026-08-02T00:00:00Z',
            results: [
              // $10.00 of input, $2.50 of output on Claude Opus 5.
              { model: 'claude-opus-5', uncached_input_tokens: 2_000_000, output_tokens: 100_000 },
              { model: 'nobody-prices-this', uncached_input_tokens: 900_000, output_tokens: 0 },
            ],
          },
        ],
      }),
    );

    const out = join(dir, 'report.json');
    const result = run(['anthropic', '--payload', payload, '--out', out]);
    assert.equal(result.status, 0, result.stderr);
    const flatOut = flat(result);
    assert.match(flatOut, /Anthropic · 2026-08-01 → 2026-08-02 · \$12\.50/);
    // The unpriced model keeps its tokens and contributes no money.
    assert.match(flatOut, /nobody-prices-this is not in the price catalogue/);
    // The restricted report says what it cannot answer, every time.
    assert.match(flatOut, /Findings this source cannot support/);
    assert.match(flatOut, /no call count here and no per-call average/);

    const saved = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.total.calls, null, 'an unknown count is null, never zero');
    assert.ok(Math.abs(saved.total.totalUsd - 12.5) < 1e-9);
    assert.equal(saved.unpricedModels[0].model, 'nobody-prices-this');
    // The variable a credential would have come from, not a credential.
    assert.equal(saved.pulledFrom, payload);
  });

  it('is a contract: the doc and the document promise each other every top-level field', async () => {
    const { mkdtemp, writeFile, readFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const doc = await readFile(new URL('../../../docs/json-output.md', import.meta.url).pathname, 'utf8');
    const start = doc.indexOf('## The connected report document');
    const end = doc.indexOf('## The cost answer document');
    const section = doc.slice(start, end === -1 ? undefined : end);
    const promised = new Set(
      [...section.matchAll(/^\| `([a-zA-Z]+)(?:\[\])?`/gm)].map((m) => m[1]),
    );
    const dir = await mkdtemp(join(tmpdir(), 'trazum-connect-'));
    const payload = join(dir, 'usage.json');
    await writeFile(
      payload,
      JSON.stringify({
        data: [
          {
            starting_at: '2026-08-01T00:00:00Z',
            ending_at: '2026-08-02T00:00:00Z',
            results: [{ model: 'claude-opus-5', uncached_input_tokens: 200_000, output_tokens: 0 }],
          },
        ],
      }),
    );
    const result = run(['anthropic', '--payload', payload, '--json']);
    assert.equal(result.status, 0, result.stderr);
    const emitted = Object.keys(JSON.parse(result.stdout));
    assert.deepEqual(emitted.filter((k) => !promised.has(k)), [], 'fields emitted with no line in docs/json-output.md');
    assert.deepEqual([...promised].filter((k) => !emitted.includes(k)), [], 'fields promised by docs/json-output.md and not emitted');
  });

  it('speaks Spanish', () => {
    const result = run(['anthropic', '--dry-run', '--locale', 'es']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /No se envió nada y no hizo falta ninguna credencial/);
  });
});
