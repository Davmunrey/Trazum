import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * `--what-if <model>`: these exact calls at another model's rates.
 *
 * Hand arithmetic: 200k input tokens are $1.00 on Claude Opus 5 ($5/MTok) and
 * $0.20 on Claude Haiku 4.5 ($1/MTok). Haiku's context window is 200k tokens,
 * which is what makes the refusal testable — a 250k-token call cannot run
 * there at any price.
 *
 * What is being tested is mostly what the section refuses to say: no saving
 * for a call that would fail, no difference computed over money already on the
 * target, and never the figure without the assumption beside it.
 */

const HAIKU = 'claude-haiku-4-5';

const call = (over = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  usage: { input_tokens: 200_000, output_tokens: 0 },
  ...over,
});

const run = async (records, argv = ['--what-if', HAIKU]) => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-whatif-'));
  const log = join(dir, 'usage.jsonl');
  await writeFile(log, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return spawnSync(process.execPath, [CLI, 'profile', log, ...argv], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    timeout: 30000,
  });
};

const flat = (result) => `${result.stdout}${result.stderr}`.replace(/\s+/g, ' ');

describe('trazum profile --what-if', () => {
  it('prices the same tokens on the named model', async () => {
    const out = flat(await run([call()]));
    assert.match(out, /These exact calls on Claude Haiku 4\.5/);
    assert.match(out, /\$1\.00 of movable spend would have been \$0\.2000/);
    assert.match(out, /difference of \$0\.8000/);
  });

  it('says it is multiplication and not advice, before the figure', async () => {
    const out = flat(await run([call()]));
    const caveat = out.indexOf('multiplication, not advice');
    const figure = out.indexOf('of movable spend');
    assert.ok(caveat > 0, 'the assumption never printed');
    assert.ok(caveat < figure, 'the assumption printed after the figure it qualifies');
    assert.match(out, /says nothing about whether that model could do the work/);
  });

  it('refuses to price a call the target could not have accepted', async () => {
    // 250k input tokens against a 200k window: that call fails, it does not
    // get cheaper, and pricing it would report a saving for a failure.
    const out = flat(await run([call({ label: 'huge', usage: { input_tokens: 250_000, output_tokens: 0 } })]));
    assert.match(out, /huge cannot move/);
    assert.match(out, /largest call carries 250,000 input tokens/);
    assert.match(out, /Those calls would fail, not cost less/);
    // And no total was printed from it.
    assert.doesNotMatch(out, /of movable spend would have been/);
  });

  it('keeps spend already on the target out of the difference, and says so', async () => {
    const out = flat(
      await run([
        call(),
        call({ model: HAIKU, label: 'cheap', usage: { input_tokens: 200_000, output_tokens: 0 } }),
      ]),
    );
    // $1.00 on Opus moves; the $0.20 already on Haiku does not.
    assert.match(out, /\$1\.00 of movable spend would have been \$0\.2000/);
    assert.match(out, /Already on that model: 1 call worth \$0\.2000/);
  });

  it('reports a move in the expensive direction as expensive', async () => {
    const out = flat(await run([call({ model: HAIKU })], ['--what-if', 'claude-fable-5']));
    // $0.20 on Haiku is $2.00 on Fable 5 ($10/MTok).
    assert.match(out, /\$0\.2000 of movable spend would have been \$2\.00/);
    assert.match(out, /That direction costs more/);
  });

  it('names the calls it could not compare, since they have no current price', async () => {
    const out = flat(await run([call(), { model: 'ft:acme-internal', usage: { input_tokens: 900_000 } }]));
    assert.match(out, /Excluded: 1 call whose model has no price here \(ft:acme-internal\)/);
  });

  it('errors on a model the catalogue does not price', async () => {
    // A flag that silently does nothing is worse than a missing feature: the
    // reader asked a question and got a report with no answer in it.
    const result = await run([call()], ['--what-if', 'gpt-imaginary']);
    assert.notEqual(result.status, 0);
    assert.match(flat(result), /--what-if does not know "gpt-imaginary"/);
  });

  it('says nothing at all when the flag was not passed', async () => {
    const out = flat(await run([call()], []));
    assert.doesNotMatch(out, /These exact calls on/);
  });

  it('carries the comparison into --json with its caveat attached', async () => {
    const result = await run([call()], ['--what-if', HAIKU, '--json']);
    assert.equal(result.status, 0, result.stderr);
    const { whatIf } = JSON.parse(result.stdout);
    assert.equal(whatIf.target.id, HAIKU);
    assert.equal(whatIf.sameTokensAssumed, true);
    assert.ok(Math.abs(whatIf.currentUsd - 1) < 1e-9, String(whatIf.currentUsd));
    assert.ok(Math.abs(whatIf.targetUsd - 0.2) < 1e-9, String(whatIf.targetUsd));
    assert.ok(Math.abs(whatIf.deltaUsd + 0.8) < 1e-9, String(whatIf.deltaUsd));
  });

  it('flags cache traffic the target could not grant, on every surface', async () => {
    // 400-token calls with cache reads against Haiku's 4,096-token cache
    // minimum: no entry could form, and the standard row flatters the move.
    const tiny = call({ usage: { input_tokens: 100, cache_read_input_tokens: 300, output_tokens: 0 } });
    const text = await run([tiny, tiny], ['--what-if', HAIKU]);
    assert.equal(text.status, 0, text.stderr);
    const out = `${text.stdout}${text.stderr}`.replace(/\s+/g, ' ');
    assert.match(out, /cache traffic could not exist there/);
    assert.match(out, /4,096-token cache minimum/);
    assert.match(out, /the row above flatters the move/);

    // The JSON carries the same caveat inside the slice, so a consumer
    // cannot print the discounted figure without the correction beside it.
    const json = await run([tiny, tiny], ['--what-if', HAIKU, '--json']);
    const { whatIf } = JSON.parse(json.stdout);
    const [slice] = whatIf.slices;
    assert.equal(slice.cacheBeyondTarget.minTokens, 4096);
    assert.ok(slice.cacheBeyondTarget.noCacheUsd > slice.targetUsd);
  });

  it('states the move batched on the target, hedged, on text and JSON alike', async () => {
    const moved = call({ usage: { input_tokens: 100_000, output_tokens: 10_000 } });
    const text = await run([moved, moved], ['--what-if', HAIKU]);
    const out = `${text.stdout}${text.stderr}`.replace(/\s+/g, ' ');
    assert.match(out, /Batch API takes the moved bill from \$0\.3000 to \$0\.1500/);
    assert.match(out, /Whether they can wait is not in the log/);

    const json = await run([moved, moved], ['--what-if', HAIKU, '--json']);
    const { whatIf } = JSON.parse(json.stdout);
    assert.ok(Math.abs(whatIf.batchOnTarget.targetUsd - 0.15) < 1e-9);
  });

  it('applies the same window as the report it compares', async () => {
    // A windowed bill compared against an unwindowed repricing would state a
    // difference over calls the report above does not contain.
    const result = await run(
      [
        call({ ts: '2026-08-01T10:00:00Z' }),
        call({ ts: '2026-08-09T10:00:00Z' }),
      ],
      ['--since', '2026-08-05', '--what-if', HAIKU, '--json'],
    );
    assert.equal(result.status, 0, result.stderr);
    const { whatIf, total } = JSON.parse(result.stdout);
    assert.ok(Math.abs(total.totalUsd - 1) < 1e-9, String(total.totalUsd));
    assert.ok(Math.abs(whatIf.currentUsd - 1) < 1e-9, String(whatIf.currentUsd));
  });
});
