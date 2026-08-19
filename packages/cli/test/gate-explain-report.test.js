import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * A failing gate carries its own next step. $1.00 = 200k input tokens on
 * Claude Opus 5, as everywhere in this suite.
 */

const call = (label, usd, extra = {}) => ({
  model: 'claude-opus-5',
  label,
  ts: '2026-08-01T09:00:00Z',
  usage: { input_tokens: usd * 200_000, output_tokens: 0 },
  ...extra,
});

const write = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-gateexp-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return path;
};

const run = (argv) =>
  spawnSync(process.execPath, [CLI, 'profile', ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

/** $10.00 of rag against $2.00 of chat: an obvious largest contributor. */
const lopsided = () => [call('rag', 10), call('chat', 2)];

describe('a failing gate explains itself', () => {
  it('names the slice holding the money and the lever the report priced', async () => {
    const result = run([await write(lopsided()), '--max-usd', '8']);
    assert.equal(result.status, 1);
    const out = flat(result);
    assert.match(out, /Most of it is rag on claude-opus-5: \$10\.00, 83\.3% of the bill/);
    assert.match(out, /would save .* on rag by/);
    assert.match(out, /enough to cover the \$4\.00 this is over by/);
    // It points; it does not recommend.
    assert.match(out, /yours to judge; the figure is arithmetic, not advice/);
  });

  it('says a lever short of the overage is part of the answer, not all of it', async () => {
    const result = run([await write(lopsided()), '--max-usd', '1']);
    assert.equal(result.status, 1);
    assert.match(flat(result), /short of the \$11\.00 this is over by, so it is part of the answer/);
  });

  it('states how much room a tight pass had, and stays quiet on a wide one', async () => {
    const log = await write(lopsided());
    // $12.00 against $12.50: 4% left, under the tenth this calls tight.
    const tight = run([log, '--max-usd', '12.5']);
    assert.equal(tight.status, 0);
    assert.match(flat(tight), /Passed with 4\.0% of the budget left/);

    const wide = run([log, '--max-usd', '100']);
    assert.equal(wide.status, 0);
    assert.doesNotMatch(flat(wide), /of the budget left/);
  });

  it('explains the day and conversation gates too, without repeating the day’s own line', async () => {
    const day = run([await write(lopsided()), '--max-day-usd', '8']);
    assert.equal(day.status, 1);
    const dayOut = flat(day);
    assert.match(dayOut, /would save .* on rag by/);
    // The day gate already names its own biggest label; saying it twice reads
    // as the same sentence repeated.
    assert.doesNotMatch(dayOut, /Most of it is rag on claude-opus-5/);

    const session = run([
      await write([call('agent', 10, { session: 'a' }), call('chat', 1, { session: 'b' })]),
      '--max-session-usd',
      '5',
    ]);
    assert.equal(session.status, 1);
    const sessionOut = flat(session);
    assert.match(sessionOut, /Most of it is agent on claude-opus-5/);
    assert.ok(!sessionOut.includes('"a"'), 'a session key leaked into the explanation');
  });

  it('puts the verdict in the markdown summary, where CI readers look', async () => {
    // The report reached the run summary and the reason the build was red did
    // not — the reader had to open the raw log for the one sentence that
    // mattered, which is the same failure this whole feature exists to fix.
    const { mkdtemp: mk, readFile } = await import('node:fs/promises');
    const dir = await mk(join(tmpdir(), 'trazum-gatemd-'));
    const out = join(dir, 'report.md');
    const result = run([await write(lopsided()), '--max-usd', '8', '--markdown-out', out]);
    assert.equal(result.status, 1);
    const md = await readFile(out, 'utf8');
    assert.match(md, /> ❌ \*\*FAILED — this log spent \$12\.00/);
    // One mark, on the verdict: the lines under it explain it and are not
    // themselves failures.
    assert.equal((md.match(/❌/g) ?? []).length, 1);
    assert.match(md, /> Most of it is rag on claude-opus-5/);
    // No terminal escape sequences and no hanging indent from the wrap.
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(md, /\u001b\[/);
    assert.doesNotMatch(md, /That is {2,}where/);
  });

  it('states a passing verdict in the summary without shouting', async () => {
    const { mkdtemp: mk, readFile } = await import('node:fs/promises');
    const dir = await mk(join(tmpdir(), 'trazum-gatemdok-'));
    const out = join(dir, 'report.md');
    const result = run([await write(lopsided()), '--max-usd', '100', '--markdown-out', out]);
    assert.equal(result.status, 0);
    const md = await readFile(out, 'utf8');
    assert.match(md, /_Within budget: \$12\.00 spent against --max-usd \$100\.00\._/);
    assert.doesNotMatch(md, /❌/);
  });

  it('speaks Spanish', async () => {
    const result = spawnSync(
      process.execPath,
      [CLI, 'profile', await write(lopsided()), '--max-usd', '8', '--locale', 'es'],
      { encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 },
    );
    assert.match(flat(result), /La mayor parte es rag en claude-opus-5/);
    assert.match(flat(result), /lo juzgas tú; la cifra es aritmética, no consejo/);
  });
});
