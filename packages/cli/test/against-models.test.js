import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The change by model — where the mix moved.
 *
 * A workload that keeps its name and switches from Haiku to Opus reads as
 * "chat grew" in the per-label drivers; only the model split can say the
 * reason is the model. Hand arithmetic throughout: 1M input tokens are $1.00
 * on Claude Haiku 4.5 and $5.00 on Claude Opus 5.
 */

const write = async (name, records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-mix-'));
  const path = join(dir, name);
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return path;
};

const call = (model, label = 'chat') => ({
  model,
  label,
  usage: { input_tokens: 1_000_000, output_tokens: 0 },
});

const run = (argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('the change by model', () => {
  it('names the mix move the label rows cannot see', async () => {
    const previous = await write('previous.jsonl', [call('claude-haiku-4-5')]);
    const now = await write('now.jsonl', [call('claude-opus-5')]);
    const result = run([now, '--against', previous]);
    assert.equal(result.status, 0);
    const text = flat(result);
    // The label driver reads "chat grew" — true, and not the reason.
    assert.match(text, /\+\$4\.00 chat \(\$1\.00 → \$5\.00\)/);
    // The model split says why: the same traffic on a dearer model.
    assert.match(text, /The same change, by model/);
    assert.match(text, /\+\$5\.00 claude-opus-5 \(new since the previous log\)/);
    assert.match(text, /-\$1\.00 claude-haiku-4-5 \(gone since the previous log\)/);
  });

  it('says nothing by model when only one model is involved', async () => {
    const previous = await write('previous.jsonl', [call('claude-opus-5')]);
    const now = await write('now.jsonl', [call('claude-opus-5'), call('claude-opus-5')]);
    const result = run([now, '--against', previous]);
    assert.equal(result.status, 0);
    // One model on both sides restates the totals line and says nothing new.
    assert.doesNotMatch(flat(result), /The same change, by model/);
  });

  it('carries both driver sets into --json, computed once', async () => {
    const previous = await write('previous.jsonl', [call('claude-haiku-4-5')]);
    const now = await write('now.jsonl', [call('claude-opus-5')]);
    const result = run([now, '--against', previous, '--json']);
    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout);
    assert.ok(Math.abs(report.against.deltaUsd - 4.0) < 1e-9);
    const opus = report.against.byModel.find((d) => d.key === 'claude-opus-5');
    const haiku = report.against.byModel.find((d) => d.key === 'claude-haiku-4-5');
    assert.equal(opus.was, null);
    assert.ok(Math.abs(opus.delta - 5.0) < 1e-9);
    assert.equal(haiku.now, null);
    assert.ok(Math.abs(haiku.delta - -1.0) < 1e-9);
    const chat = report.against.byLabel.find((d) => d.key === 'chat');
    assert.ok(Math.abs(chat.delta - 4.0) < 1e-9);
  });

  it('speaks Spanish', async () => {
    const previous = await write('previous.jsonl', [call('claude-haiku-4-5')]);
    const now = await write('now.jsonl', [call('claude-opus-5')]);
    const result = spawnSync(
      process.execPath,
      [CLI, 'profile', now, '--against', previous, '--locale', 'es'],
      { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
    );
    assert.match(flat(result), /El mismo cambio, por modelo/);
  });
});
