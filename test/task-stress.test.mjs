import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { SPAWN_ENV } from '../packages/cli/test/env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
// The same probes can exercise packed installations without workspace symlinks.
const packageRoot = (name) => process.env.TRAZUM_STRESS_INSTALL_ROOT
  ? join(process.env.TRAZUM_STRESS_INSTALL_ROOT, 'node_modules/@trazum', name)
  : join(root, 'packages', name);
const entry = (name, file = 'index.js') => join(packageRoot(name), 'dist', file);
const { analyzeTask, compareTasks, parseTaskReport, MAX_INPUT_CHARS, BUNDLED_CATALOGUE } = await import(pathToFileURL(entry('core')));
const { buildServer, listen, MAX_BODY_BYTES } = await import(pathToFileURL(entry('cli', 'serve.js')));
const expectedVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const jsonl = (rows) => rows.map(JSON.stringify).join('\n');

function source(format, session, calls, oneGroup = false) {
  const rows = format === 'codex' ? [
    { type: 'session_meta', payload: { id: session } },
    { type: 'turn_context', payload: { model: 'gpt-4o' } },
  ] : [];
  const counters = (n) => ({ input_tokens: n * 100, cached_input_tokens: 0, output_tokens: n * 10, reasoning_output_tokens: 0, total_tokens: n * 110 });
  for (let n = 0; n < calls; n++) {
    const id = `${session}-${n}`;
    const args = { path: `SYNTHETIC_PRIVATE_PATH_${oneGroup ? 0 : Math.floor(n / 2)}` };
    if (format === 'claude-code') rows.push(
      { type: 'assistant', requestId: id, sessionId: session, timestamp: '2026-10-13T00:00:00Z',
        message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 100, output_tokens: 10 },
          content: [{ type: 'tool_use', id, name: 'Read', input: args }] } },
      { type: 'user', sessionId: session, message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'SYNTHETIC_PRIVATE_RESULT' }] } },
    );
    else rows.push(
      { type: 'event_msg', timestamp: '2026-10-13T00:00:00Z', payload: { type: 'token_count', info: { total_token_usage: counters(n + 1), last_token_usage: counters(1) } } },
      { type: 'response_item', payload: { type: 'function_call', call_id: id, name: 'read_file', arguments: JSON.stringify(args) } },
      { type: 'response_item', payload: { type: 'function_call_output', call_id: id, output: 'SYNTHETIC_PRIVATE_RESULT' } },
    );
  }
  return { format, text: jsonl(rows) };
}

function input(prefix = 'synthetic-stress') {
  const sources = Array.from({ length: 16 }, (_, i) => source(i % 2 ? 'codex' : 'claude-code', `${prefix}-${i}`, i === 0 ? 40 : 16, i === 0));
  const size = sources.reduce((sum, item) => sum + item.text.length, 0);
  assert.ok(size < MAX_INPUT_CHARS);
  sources[15].text += ' '.repeat(MAX_INPUT_CHARS - size);
  return { taskId: prefix, taskType: 'synthetic-stress', criterion: 'Synthetic checks pass.',
    outcome: 'accepted', assessor: 'synthetic-check', sources };
}

function run(name, args, cwd, stdin) {
  const result = spawnSync(process.execPath, [entry(name), ...args], {
    cwd, env: SPAWN_ENV, input: stdin, encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('dense task evidence stays bounded and never turns truncation into savings', { timeout: 30000 }, (t) => {
  const started = performance.now();
  const args = input();
  const report = analyzeTask(args);
  assert.equal(report.sources.length, 16);
  assert.equal(report.usage.records, 280);
  assert.equal(report.usage.totalTokens, 30_800);
  assert.equal(report.tools.calls, 280);
  assert.equal(report.tools.findings.length, 100);
  assert.equal(report.tools.findings[0].count, 40);
  assert.equal(report.tools.findings[0].occurrences.length, 20);
  assert.ok(report.coverage.gaps.includes('findings-truncated'));
  const encoded = JSON.stringify(report);
  assert.ok(encoded.length < MAX_INPUT_CHARS);
  assert.doesNotMatch(encoded, /SYNTHETIC_PRIVATE/);
  assert.deepEqual(parseTaskReport(encoded), report);
  const after = analyzeTask({ ...input('synthetic-later'), policyId: 'repeat-review-v1' });
  assert.equal(compareTasks(report, after).verdict, 'inconclusive');
  args.sources[15].text += ' ';
  assert.throws(() => analyzeTask(args), /Invalid task data/);
  t.diagnostic(`16 sources, 400000 characters, 280 calls: ${Math.round(performance.now() - started)} ms; report ${Buffer.byteLength(encoded)} bytes`);
});

test('CLI handles the source ceiling from actual files with core parity', { timeout: 30000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'trazum-task-stress-'));
  try {
    const args = input();
    const flags = ['task', 'analyze', '--id', args.taskId, '--type', args.taskType, '--criterion', args.criterion,
      '--outcome', args.outcome, '--assessor', args.assessor];
    args.sources.forEach((item, i) => {
      const path = join(directory, `synthetic-${i}.jsonl`);
      writeFileSync(path, item.text);
      flags.push(`--${item.format}`, path);
    });
    assert.deepEqual(JSON.parse(run('cli', flags, directory)), analyzeTask(args));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('MCP drains interleaved large valid and invalid requests without losing IDs or state', { timeout: 30000 }, (t) => {
  const args = input();
  const expected = analyzeTask(args);
  const requests = [
    { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'synthetic-stress', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    ...Array.from({ length: 16 }, (_, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: {
      name: 'analyze_task', arguments: i % 2 ? { ...args, unexpected: true } : args,
    } })),
  ];
  const responses = run('mcp', [], root, jsonl(requests) + '\n').trim().split('\n').map(JSON.parse);
  assert.equal(responses.length, 17);
  assert.equal(new Set(responses.map((item) => item.id)).size, 17);
  assert.equal(responses.find((item) => item.id === 0).result.serverInfo.version, expectedVersion);
  for (let i = 1; i <= 16; i++) {
    const response = responses.find((item) => item.id === i);
    assert.ok(response);
    assert.equal(response.error, undefined);
    if (i % 2 === 0) assert.equal(response.result.isError, true);
    else {
      assert.notEqual(response.result.isError, true);
      assert.deepEqual(JSON.parse(response.result.content[0].text).report, expected);
    }
  }
  t.diagnostic('16 queued MCP calls: 8 complete reports, 8 explicit refusals; server continues after errors');
});

test('local HTTP isolates concurrent imports and recovers after an oversized request', { timeout: 30000 }, async (t) => {
  const server = buildServer({ catalogue: BUNDLED_CATALOGUE,
    position: () => { throw new Error('Unexpected spending read'); }, measured: () => { throw new Error('Unexpected spending read'); } });
  const address = await listen(server, { port: 0 });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://${address}/usage/import`;
  const text = source('claude-code', 'synthetic-http', 400).text;
  const started = performance.now();
  await Promise.all(Array.from({ length: 24 }, async (_, i) => {
    const valid = i % 3 !== 0;
    const label = `synthetic-workload-${i}`;
    const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ format: valid ? 'claude-code' : 'unsupported', text, label }) });
    assert.equal(response.status, valid ? 200 : 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    if (valid) {
      assert.equal(body.records, 400);
      assert.ok(body.log.split('\n').filter(Boolean).every((line) => JSON.parse(line).label === label));
      assert.doesNotMatch(JSON.stringify(body), /SYNTHETIC_PRIVATE/);
    } else assert.equal(body.error, 'bad-request');
  }));
  const oversized = await fetch(url, { method: 'POST', body: ' '.repeat(MAX_BODY_BYTES + 1), signal: AbortSignal.timeout(20000) });
  assert.equal(oversized.status, 400);
  await oversized.text();
  const recovered = await fetch(url, { method: 'POST', body: JSON.stringify({ format: 'claude-code', text }), signal: AbortSignal.timeout(20000) });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).records, 400);
  t.diagnostic(`24 concurrent HTTP requests, 6400 imported usage records: ${Math.round(performance.now() - started)} ms; oversize refusal and subsequent recovery verified`);
});
