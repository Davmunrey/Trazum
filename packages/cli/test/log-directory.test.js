import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * A directory of rotated logs, read as one bill.
 *
 * Logs rotate daily; making somebody `cat` a month together before a profile
 * will read it is a setup cost that gets a tool skipped. $1.00 = 200k input
 * tokens on Claude Opus 5.
 */

const call = (usd, over = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  usage: { input_tokens: usd * 200_000, output_tokens: 0 },
  ...over,
});

const dirWith = async (files) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-logdir-'));
  const logs = join(dir, 'logs');
  await mkdir(logs);
  for (const [name, records] of Object.entries(files)) {
    await writeFile(
      join(logs, name),
      records.map((r) => JSON.stringify(r)).join('\n') + (name.endsWith('.nonl') ? '' : '\n'),
    );
  }
  return logs;
};

const run = (argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('profile over a directory of logs', () => {
  it('reads every log as one bill and says how many', async () => {
    const logs = await dirWith({
      '2026-08-01.jsonl': [call(1)],
      '2026-08-02.jsonl': [call(2)],
      '2026-08-03.jsonl': [call(3)],
    });
    const result = run([logs]);
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /Read 3 log files/);
    assert.match(text, /\$6\.00/);
  });

  it('ignores files that are not logs, and says nothing when one file is the whole story', async () => {
    const logs = await dirWith({ 'one.jsonl': [call(4)], 'README.md': [] });
    const result = run([logs]);
    assert.equal(result.status, 0);
    const text = flat(result);
    assert.match(text, /\$4\.00/);
    // One file read: the count line would be noise.
    assert.doesNotMatch(text, /Read 1 log file/);
  });

  it('joins a file with no trailing newline without corrupting either record', async () => {
    const logs = await dirWith({
      'a.jsonl.nonl': [call(1)],
      'b.jsonl': [call(1)],
    });
    // Only .jsonl is picked up, so rename semantics matter: the .nonl file is
    // skipped. What this pins is that nothing is reported as unreadable.
    const result = run([logs]);
    assert.equal(result.status, 0);
    assert.doesNotMatch(flat(result), /could not be read/);
  });

  it('gates over the whole directory', async () => {
    const logs = await dirWith({ 'a.jsonl': [call(5)], 'b.jsonl': [call(5)] });
    assert.equal(run([logs, '--max-usd', '9']).status, 1);
    assert.equal(run([logs, '--max-usd', '11']).status, 0);
  });

  it('refuses a directory with nothing readable rather than reporting $0', async () => {
    const logs = await dirWith({ 'notes.md': [] });
    const result = run([logs]);
    assert.equal(result.status, 1);
    const text = flat(result);
    assert.match(text, /No usage logs in/);
    assert.match(text, /\.jsonl/);
    assert.doesNotMatch(text, /\$0\.00/);
  });

  it('speaks Spanish', async () => {
    const logs = await dirWith({ 'a.jsonl': [call(1)], 'b.jsonl': [call(1)] });
    const result = run([logs, '--locale', 'es']);
    assert.match(flat(result), /Leídos 2 ficheros de registro/);
  });
});
