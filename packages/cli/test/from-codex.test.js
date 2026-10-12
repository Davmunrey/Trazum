import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const cli = new URL('../dist/index.js', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: SPAWN_ENV });
const count = { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 120 };
const fixture = [
  { type: 'session_meta', payload: { id: 'synthetic-session', cwd: 'SYNTHETIC_PRIVATE_PATH' } },
  { type: 'turn_context', payload: { model: 'gpt-5-mini', instructions: 'SYNTHETIC_SECRET' } },
  { timestamp: '2026-10-12T10:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: count, last_token_usage: count } } },
];
const text = fixture.map((entry) => JSON.stringify(entry)).join('\n');

it('converts explicit Codex paths and bill detects the same input without sending prompt text', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-codex-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'rollout.jsonl');
  writeFileSync(path, text);
  const converted = run('from-codex', path, '--label', 'synthetic-work');
  assert.equal(converted.status, 0, converted.stderr);
  const record = JSON.parse(converted.stdout);
  assert.equal(record.label, 'synthetic-work');
  assert.equal(record.usage.input_tokens, 60);
  assert.ok(!(converted.stdout + converted.stderr).includes('SYNTHETIC_SECRET'));
  assert.ok(!(converted.stdout + converted.stderr).includes('SYNTHETIC_PRIVATE_PATH'));
  assert.match(converted.stderr, /not your subscription invoice/);
  const billed = run('bill', path);
  assert.equal(billed.status, 0, billed.stderr);
  assert.match(billed.stderr, /codex/);
  const receipt = JSON.parse(billed.stdout);
  assert.equal(receipt.total.calls, 1);
  assert.ok(receipt.total.usd > 0);
  assert.equal(receipt.importEvidence[0].basis, 'api-equivalent-telemetry');
  assert.equal(receipt.importEvidence[0].complete, true);
  const partial = join(dir, 'partial.jsonl');
  writeFileSync(partial, text + '\n' + JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: {} } }));
  const partialReceipt = JSON.parse(run('bill', partial).stdout);
  assert.equal(partialReceipt.importEvidence[0].complete, false);
  assert.equal(partialReceipt.importEvidence[0].unsupported, 1);
  const html = join(dir, 'bill.html');
  const displayed = run('bill', path, '--table', '--html-out', html);
  assert.equal(displayed.status, 0, displayed.stderr);
  assert.match(displayed.stdout.replace(/\s+/g, ' '), /subscription you paid the plan/);
  assert.match(readFileSync(html, 'utf8'), /API-equivalent/);
});

it('reads directories, writes normalized output, and refuses absent or un-attributable inputs', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-codex-dir-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'rollout.jsonl'), text);
  const out = join(dir, 'usage.txt');
  const converted = run('from-codex', dir, '-o', out);
  assert.equal(converted.status, 0, converted.stderr);
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).model, 'gpt-5-mini');
  const unrecognized = join(dir, 'unrecognized.txt');
  writeFileSync(unrecognized, 'not a rollout');
  const failed = run('from-codex', unrecognized);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /No attributable Codex usage/);
  assert.equal(failed.stdout, '');
  assert.notEqual(run('from-codex').status, 0);
});
