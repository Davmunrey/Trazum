import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `trazum route` — the loop the levers section could only point at.
 *
 * `profile` prices a route exactly and can say nothing about whether the cheaper
 * model still does the job, so it printed a figure and a homework assignment.
 * This runs the measurement. Nothing here spends a real call: every case stops at
 * the dry run, which is itself the property most worth pinning.
 */

const fixture = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-route-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(
    log,
    Array.from({ length: 400 }, () =>
      JSON.stringify({
        model: 'claude-opus-5',
        label: 'support-rag',
        usage: { input_tokens: 9000, output_tokens: 300 },
      }),
    ).join('\n') + '\n',
  );
  const prompt = join(dir, 'support.txt');
  await writeFile(prompt, 'You are a support agent. Answer using only the context.\n\n{{input}}\n');
  const cases = join(dir, 'cases.txt');
  await writeFile(cases, 'How do I reset my password?\nMy invoice is wrong.\nCan I change my plan?\n');
  return { log, prompt, cases };
};

const run = (argv, env = {}) =>
  spawnSync(process.execPath, [CLI, 'route', ...argv], {
    encoding: 'utf8',
    env: {
      ...SPAWN_ENV,
      TRAZUM_LLM_PROVIDER: 'anthropic',
      TRAZUM_LLM_API_KEY: 'not-a-real-key',
      TRAZUM_LLM_MODEL: 'claude-opus-5',
      ...env,
    },
    timeout: 30000,
  });

const flat = (r) => `${r.stdout}${r.stderr}`.replace(/\s+/g, ' ');

describe('measuring whether a route is safe', () => {
  it('names the slice, the candidate, and what the route is worth', async () => {
    /**
     * 400 calls of 9,000 input and 300 output on Opus 5 is $21.00; the same tokens
     * on Sonnet 5 at $2/$10 are $8.40. The route is worth $12.60,
     * and the command picks that slice out of the log on its own — the reader does
     * not have to know which workload to point it at.
     */
    const { log, prompt, cases } = await fixture();
    const result = run([log, '--prompt-file', prompt, '--cases', cases]);

    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /support-rag on Claude Opus 5 → Claude Sonnet 5/);
    assert.match(out, /worth \$12\.60 of this bill/);
  });

  it('spends nothing without --yes, and says exactly what it would spend', async () => {
    /**
     * Three cases is nine calls. A command that can spend somebody's money without
     * telling them first is a command they stop trusting, and this one names the
     * split as well: two per case on the expensive model to measure its variance,
     * one on the cheap one.
     */
    const { log, prompt, cases } = await fixture();
    const result = run([log, '--prompt-file', prompt, '--cases', cases]);
    const out = flat(result);

    assert.match(out, /will make 9 provider calls/);
    assert.match(out, /two per case on claude-opus-5/);
    assert.match(out, /one per case on claude-sonnet-5/);
    assert.match(out, /Nothing was called/);
    // The API key here is a fake. Reaching a provider would fail loudly, so a
    // clean exit is itself the proof that nothing was called.
    assert.equal(result.status, 0, result.stderr);
  });

  it('refuses without a prompt and cases, rather than guessing', async () => {
    // The log says which route is worth money and cannot say whether it works.
    const { log } = await fixture();
    const result = run([log]);
    assert.notEqual(result.status, 0);
    assert.match(flat(result), /--prompt-file and --cases are both required|--prompt and --cases are both required/);
  });

  it('says so plainly when no route on the log is worth measuring', async () => {
    /**
     * Haiku 4.5 is the bottom of its family. Running an evaluation to discover
     * there is nowhere cheaper to go would spend real money to learn nothing.
     */
    const dir = await mkdtemp(join(tmpdir(), 'trazum-route-'));
    const log = join(dir, 'usage.jsonl');
    await writeFile(
      log,
      Array.from({ length: 100 }, () =>
        JSON.stringify({ model: 'claude-haiku-4-5', label: 'classify', usage: { input_tokens: 500, output_tokens: 50 } }),
      ).join('\n') + '\n',
    );
    const { prompt, cases } = await fixture();
    const result = run([log, '--prompt-file', prompt, '--cases', cases]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result), /No route on this log clears 1% of the bill/);
  });

  it('points at itself from the profile, with a command that exists', async () => {
    /**
     * The levers section used to print `trazum eval --model <candidate>`, which
     * does not do what that sentence claims: `eval` runs against whatever
     * `TRAZUM_LLM_MODEL` says, and `--model` only prices the report. The reader was
     * sent to a measurement that never touched the candidate model.
     */
    const { log } = await fixture();
    const profile = spawnSync(process.execPath, [CLI, 'profile', log], {
      encoding: 'utf8',
      env: SPAWN_ENV,
      timeout: 30000,
    });
    const out = flat(profile);

    assert.match(out, /trazum route <log> --prompt-file <prompt> --cases <cases> --yes/);
    assert.doesNotMatch(out, /trazum eval .*--model claude-sonnet-5/, 'still names a command that cannot test a route');
  });
});

describe('when the slice is a mixture', () => {
  /**
   * A log with no labels merges every workload into one row: a 2,000-call
   * classifier and a 400-call RAG pipeline become a single slice worth a single
   * figure, and this command measures exactly **one** prompt against it.
   *
   * Attributing the verdict to money covering both is a number describing
   * something other than what was measured — the fault this repository keeps
   * finding in itself, in a new place. It cannot be detected from counts, so it is
   * stated rather than guessed at.
   */
  const mixed = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-mixed-'));
    const log = join(dir, 'usage.jsonl');
    await writeFile(
      log,
      [
        ...Array.from({ length: 2000 }, () =>
          JSON.stringify({ model: 'claude-opus-5', usage: { input_tokens: 180, output_tokens: 40 } }),
        ),
        ...Array.from({ length: 400 }, () =>
          JSON.stringify({ model: 'claude-opus-5', usage: { input_tokens: 9000, output_tokens: 300 } }),
        ),
      ].join('\n') + '\n',
    );
    return log;
  };

  it('says the figure may cover calls the measurement never touched', async () => {
    const { prompt, cases } = await fixture();
    const out = flat(run([await mixed(), '--prompt-file', prompt, '--cases', cases]));

    assert.match(out, /carry no label, so Trazum cannot tell whether they are all this prompt/);
    assert.match(out, /covers calls this measurement never touched/);
  });

  it('stays quiet when the slice is one named workload', async () => {
    // Nothing is ambiguous there, and a caveat on every run is a caveat nobody
    // reads on the run where it mattered.
    const { log, prompt, cases } = await fixture();
    const out = flat(run([log, '--prompt-file', prompt, '--cases', cases]));
    assert.doesNotMatch(out, /carry no label/);
  });
});

describe('a --label nothing carries', () => {
  it('gets the typo answer, not a verdict about calls the flag never selected', async () => {
    /**
     * The fall-through answer was "no route on this log clears 1% of the bill:
     * these calls are already on the cheapest model of their family" — two
     * falsehoods at once when the log had a 60% route under a different name,
     * and the actual problem was a misspelt flag.
     */
    const { log, prompt, cases } = await fixture();
    const result = run([log, '--prompt-file', prompt, '--cases', cases, '--label', 'does-not-exist']);

    assert.equal(result.status, 0, result.stderr);
    const out = flat(result);
    assert.match(out, /No call in this log carries the label "does-not-exist"/);
    assert.match(out, /The labels here are: support-rag/);
    assert.doesNotMatch(out, /already on the cheapest model/, 'asserted a verdict about unselected calls');
  });
});
