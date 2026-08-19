import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `--from-log`: the multiplication stops guessing. The saving is still
 * `token delta × usage`, but usage comes measured from a log instead of typed
 * into a config — and the rendering names which half is which.
 */

const PROMPT =
  'Please could you kindly summarise the following text for me, thank you very much.\n'
  + 'It is very important to note that you should basically be concise.\n';

const call = (day, over = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  ts: `${day}T09:00:00Z`,
  usage: { input_tokens: 100_000, cache_read_input_tokens: 100_000, output_tokens: 500 },
  ...over,
});

const setup = async (records, config = null) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-fromlog-'));
  const prompt = join(dir, 'prompt.txt');
  await writeFile(prompt, PROMPT);
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  let configPath;
  if (config !== null) {
    configPath = join(dir, 'trazum.config.json');
    await writeFile(configPath, JSON.stringify(config));
  }
  return { dir, prompt, log, configPath };
};

// `-o /dev/null` forces the report path: without a TTY the command prints
// only the optimized prompt, which is right for pipes and useless to assert on.
const run = (argv, cwd) =>
  spawnSync(process.execPath, [CLI, 'optimize', ...argv, '-o', '/dev/null'], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
    ...(cwd ? { cwd } : {}),
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('optimize --from-log', () => {
  it('measures the usage and says so, scaled only past the week floor', async () => {
    // Two calls over ten days: the rate is 6/month and the arithmetic shows.
    const { prompt, log } = await setup([call('2026-08-01'), call('2026-08-11')]);
    const out = flat(run([prompt, '--from-log', log, '--label', 'chat']));
    assert.match(out, /2 calls measured over 10\.0 days — 6\/month at that rate/);
    assert.match(out, /500 output tokens per call, measured/);
    assert.match(out, /saving .*\/month/);
  });

  it('refuses to scale a span under a week, and prices the period instead', async () => {
    // Two days is less than one weekly cycle: a Tuesday with a multiplier is
    // not a monthly figure, and nothing below may say "month".
    const { prompt, log } = await setup([call('2026-08-01'), call('2026-08-03')]);
    const out = flat(run([prompt, '--from-log', log, '--label', 'chat']));
    assert.match(out, /2 calls measured over 2\.0 days/);
    assert.match(out, /over the measured period/);
    assert.match(out, /Not scaled to a month: 2\.0 days is under the week/);
    assert.doesNotMatch(out, /saving .*\/month/);
  });

  it('implies --cost: a billed log is proof of a metered API', async () => {
    // The sandbox looks like a subscription host, which normally suppresses
    // the money. A usage log with billed counts is evidence to the contrary.
    const { prompt, log } = await setup([call('2026-08-01'), call('2026-08-11')]);
    const out = flat(run([prompt, '--from-log', log, '--label', 'chat']));
    assert.match(out, /Cost with Claude Opus 5/);
  });

  it('reads the label from the config map, and refuses ambiguity by name', async () => {
    // Label paths are relative to the project, as the config validator
    // requires, so the command runs from the temp directory.
    const { dir, log } = await setup([call('2026-08-01'), call('2026-08-11')]);
    const config = join(dir, 'trazum.config.json');
    await writeFile(config, JSON.stringify({ labels: { chat: 'prompt.txt' } }));
    const out = flat(run(['prompt.txt', '--from-log', log, '--config', config], dir));
    assert.match(out, /2 calls measured/);

    await writeFile(config, JSON.stringify({ labels: { chat: 'prompt.txt', also: 'prompt.txt' } }));
    const ambiguous = run(['prompt.txt', '--from-log', log, '--config', config], dir);
    assert.equal(ambiguous.status, 1);
    assert.match(flat(ambiguous), /mapped to more than one label .*chat, also.*Pass --label/);
  });

  it('refuses typed figures beside measured ones — a contradiction, not a preference', async () => {
    const { prompt, log } = await setup([call('2026-08-01')]);
    for (const extra of [['--calls', '5000'], ['--output-tokens', '900'], ['--cache-hit-rate', '0.9'], ['--model', 'claude-haiku-4-5']]) {
      const result = run([prompt, '--from-log', log, '--label', 'chat', ...extra]);
      assert.equal(result.status, 1, extra.join(' '));
      assert.match(flat(result), /merging a measurement with a guess produces a number that is neither/);
    }
  });

  it('refuses an empty label naming the ones with traffic, never a $0 saving', async () => {
    const { prompt, log } = await setup([call('2026-08-01')]);
    const result = run([prompt, '--from-log', log, '--label', 'nope']);
    assert.equal(result.status, 1);
    const out = flat(result);
    assert.match(out, /No priced call in this log carries the label "nope"/);
    assert.match(out, /Labels with traffic: chat/);
  });

  it('names the chosen model and its share when the label ran on several', async () => {
    const { prompt, log } = await setup([
      call('2026-08-01', { usage: { input_tokens: 2_000_000, output_tokens: 0 } }),
      call('2026-08-11', { model: 'claude-haiku-4-5', usage: { input_tokens: 200_000, output_tokens: 0 } }),
    ]);
    const out = flat(run([prompt, '--from-log', log, '--label', 'chat']));
    assert.match(out, /ran on 2 models; the figures use claude-opus-5, which carried 98% of its spend/);
  });

  it('says when output was never measured rather than pricing $0 as an assumption', async () => {
    const { prompt, log } = await setup([
      call('2026-08-01', { usage: { input_tokens: 200_000, output_tokens: 0 } }),
      call('2026-08-11', { usage: { input_tokens: 200_000, output_tokens: 0 } }),
    ]);
    assert.match(flat(run([prompt, '--from-log', log, '--label', 'chat'])), /\$0 measured — not \$0 assumed/);
  });

  it('speaks Spanish', async () => {
    const { prompt, log } = await setup([call('2026-08-01'), call('2026-08-11')]);
    const out = flat(run([prompt, '--from-log', log, '--label', 'chat', '--locale', 'es']));
    assert.match(out, /2 llamadas medidas en 10\.0 días — 6\/mes a ese ritmo/);
  });
});
