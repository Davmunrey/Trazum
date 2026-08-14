import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum profile` — the only command that reads what was charged rather than
 * what a file would cost.
 *
 * It exists because the rest of the CLI can only see the smallest line item: on
 * an ordinary support prompt the rules recover about 1% of the monthly figure
 * while output alone was 87% of it.
 */

const logOf = async (records) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-profile-'));
  const path = join(dir, 'usage.jsonl');
  await writeFile(
    path,
    records.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n',
  );
  return path;
};

const run = (path, extra = []) =>
  spawnSync(process.execPath, [CLI, 'profile', ...(path ? [path] : []), ...extra], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });

/**
 * Output with its line wrapping flattened.
 *
 * Every prose message here is wrapped to the terminal width, so a phrase that
 * reads as one sentence on screen contains a newline and two spaces in the middle
 * of it. Asserting on the raw string means a test that passes or fails depending
 * on where a word happened to land — which is what happened to the first version
 * of the no-argument case.
 */
const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

const call = (over = {}) => ({
  model: 'claude-opus-5',
  usage: { input_tokens: 1000, output_tokens: 200 },
  ...over,
});

describe('profiling a usage log', () => {
  it('reports the bill and how it splits', async () => {
    const result = run(await logOf([call(), call(), call()]));
    assert.equal(result.status, 0, result.stderr);
    const out = result.stdout;

    assert.match(out, /3 calls/, 'the call count is missing');
    assert.match(out, /\$/, 'no money in a report about money');
    for (const part of ['Input', 'Output', 'Cache reads', 'Cache writes']) {
      assert.match(out, new RegExp(part), `${part} is not broken out`);
    }
  });

  it('prints every part, including the zero ones', async () => {
    /**
     * A row missing because it was zero reads as a row somebody forgot — and
     * "your cache writes are zero" is a finding, not an absence. It is how you
     * see at a glance that caching is off.
     */
    const result = run(await logOf([call()]));
    assert.match(result.stdout, /Cache writes\s+\$0/, 'a zero row was hidden');
  });

  it('says which part of the bill to argue with, once', async () => {
    /**
     * The line the command exists for. It printed twice in the first version when
     * output was both the largest part and over half — the same fact in adjacent
     * lines, which reads as a bug because it was one.
     */
    const result = run(
      await logOf(
        Array.from({ length: 5 }, () =>
          call({ usage: { input_tokens: 500, output_tokens: 4000 } }),
        ),
      ),
    );
    const matches = result.stdout.match(/is [\d.]+% of this bill/g) ?? [];
    assert.equal(matches.length, 1, `the headline claim printed ${matches.length} times`);
    assert.match(flat(result), /low ceiling/, 'it does not say what to do about output');
  });

  it('keeps an unpriced model out of the totals and says so', async () => {
    /**
     * The fault this repository keeps finding in itself: a total that silently
     * omits calls is wrong in the flattering direction. A production log will
     * contain models the catalogue does not know.
     */
    const result = run(
      await logOf([
        call(),
        { model: 'somebodys-finetune', usage: { input_tokens: 900_000, output_tokens: 90_000 } },
      ]),
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /not in these totals/, 'the omission is silent');
    assert.match(result.stdout, /somebodys-finetune/, 'the unknown model is not named');
    assert.match(flat(result), /--pricing/, 'it does not say how to include it');
    assert.match(result.stdout, /1 call is/, 'the singular is wrong or the count is missing');
  });

  it('reads a log with torn lines instead of dying on them', async () => {
    // Real logs have torn lines. Throwing makes the tool unusable on real data.
    const result = run(await logOf([call(), '{ torn', call()]));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 calls/);
    assert.match(result.stdout, /1 line could not be read/);
  });

  it('says what to do when pointed at nothing', async () => {
    // The first thing somebody types is the command with no argument, and the
    // format is the whole barrier to using it.
    const result = run(null);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /usage\.jsonl/, 'it does not show the shape of the argument');
    assert.match(flat(result), /never contains prompt text/, 'it does not say what it will not read');
  });

  it('reports an empty log as empty rather than as zero dollars', async () => {
    const result = run(await logOf([]));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No usage records/);
  });

  it('--json prints the report and nothing else', async () => {
    // Machine-readable means machine-readable. A stray heading makes it unparseable.
    const result = run(await logOf([call()]), ['--json']);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.total.calls, 1);
    assert.ok(Array.isArray(parsed.byLabel));
    assert.ok(Array.isArray(parsed.unpricedModels));
  });

  it('prices the bill whatever host Trazum happens to run on', async () => {
    /**
     * Every other report suppresses money on a subscription host, because a saving
     * quoted to somebody on a flat plan is money that does not exist. This log is a
     * record of metered API calls somebody was already billed for — the bill exists
     * wherever Trazum is running, so the host has no bearing on it.
     */
    const path = await logOf([call()]);
    const inClaudeCode = spawnSync(process.execPath, [CLI, 'profile', path], {
      encoding: 'utf8',
      env: { ...SPAWN_ENV, CLAUDECODE: '1' },
      timeout: 30000,
    });

    assert.equal(inClaudeCode.status, 0, inClaudeCode.stderr);
    assert.match(inClaudeCode.stdout, /\$/, 'a real bill was hidden because of where Trazum runs');
  });
});
