import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, after } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import {
  BUNDLED_CATALOGUE,
  gatewayDecision,
  guardSpend,
  indexUsage,
  judgeLimits,
  parseUsageLine,
  positionAt,
} from '../../core/dist/index.js';

/**
 * One policy, three doors — the sibling-agreement property, proved the hard
 * way.
 *
 * The 1.62 arc's lesson: two doors to the same value agreeing by coincidence
 * is a defect waiting for its input. So this suite pushes the SAME policy,
 * the SAME measured position and the SAME call through all three doors —
 * the gateway's decision, the spend guard's answer, and `serve`'s HTTP
 * response — and requires the judgement to match **field for field**. Then a
 * door is deliberately broken, twice, to show the property can fail: once by
 * forging a field, once by starting `serve` without its measured side.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const catalogue = BUNDLED_CATALOGUE;

/** Distinctive on purpose: the hygiene test greps every door's output for it. */
const SESSION = 'session-key-Xy77-never-printed';
const LABEL = 'chat';

// The call below estimates at $0.75 (100k input at $5/MTok + 10k output at
// $25/MTok) over $5.00 measured: 5.75 crosses 5.5 and nothing else.
const LIMITS = { dayUsd: 100, sessionUsd: 5.5, byLabel: { [LABEL]: 50 } };

/** $5 of opus input per record, timestamped now: today, this session, this label. */
const LOG_LINES = Array.from({ length: 1 }, () =>
  JSON.stringify({
    model: 'claude-opus-5',
    label: LABEL,
    session: SESSION,
    ts: new Date(Date.now() - 60_000).toISOString(),
    usage: { input_tokens: 1_000_000, output_tokens: 0 },
  }),
);

/** The proposed call: $0.75 more — crosses the session ceiling, nothing else. */
const CALL = { model: 'claude-opus-5', inputTokens: 100_000, outputTokens: 10_000 };

const records = () => LOG_LINES.map((line) => parseUsageLine(line)).filter((r) => r !== null);

/** The reference judgement: the judge itself, over the same measurement. */
const reference = () =>
  judgeLimits(LIMITS, positionAt(indexUsage(records(), { catalogue }), { label: LABEL, session: SESSION }), {
    ...CALL,
    label: LABEL,
    session: SESSION,
  }, { catalogue });

const started = [];
after(() => {
  for (const child of started) child.kill();
});

const serveIn = async (dir, args) => {
  const child = spawn(process.execPath, [CLI, 'serve', '--port', '0', ...args], {
    env: SPAWN_ENV,
    cwd: dir,
  });
  started.push(child);
  const where = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`server did not start: ${buffer}`)), 20000);
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const match = /127\.0\.0\.1:(\d+)/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.stderr.on('data', (chunk) => { buffer += chunk; });
  });
  return where;
};

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trazum-doors-'));
  await writeFile(join(dir, 'trazum.config.json'), JSON.stringify({ limits: LIMITS }));
  await writeFile(join(dir, 'usage.jsonl'), `${LOG_LINES.join('\n')}\n`);
  return dir;
};

/** Door one: the gateway's decision. */
const throughGateway = () =>
  gatewayDecision(
    {
      provider: 'anthropic',
      model: CALL.model,
      inputTokens: CALL.inputTokens,
      maxOutputTokens: CALL.outputTokens,
      label: LABEL,
      session: SESSION,
    },
    null,
    {
      catalogue,
      policy: { onCannotTell: 'fail-open' },
      limits: LIMITS,
      position: positionAt(indexUsage(records(), { catalogue }), { label: LABEL, session: SESSION }),
    },
  ).policy;

/** Door two: the spend guard's answer. */
const throughGuard = () =>
  guardSpend(
    {
      ...CALL,
      limits: LIMITS,
      position: positionAt(indexUsage(records(), { catalogue }), { label: LABEL, session: SESSION }),
      label: LABEL,
      session: SESSION,
    },
    { catalogue },
  ).policy;

/** Door three: `serve`, over real HTTP, measuring its own copy of the log. */
const throughServe = async (dir) => {
  const where = await serveIn(dir, ['--log', 'usage.jsonl']);
  const response = await fetch(`${where}/cost`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...CALL, label: LABEL, session: SESSION }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).policy;
};

describe('one policy, three doors', () => {
  it('all three doors carry the same judgement, field for field', async () => {
    const expected = reference();
    // The property being proved, stated first: the reference actually judged
    // something — three ceilings, all applicable, none refused.
    assert.equal(expected.judgements.length, 3);
    assert.equal(expected.verdict, 'over');

    const dir = await setup();
    assert.deepEqual(throughGateway(), expected, 'the gateway disagrees with the judge');
    assert.deepEqual(throughGuard(), expected, 'the spend guard disagrees with the judge');
    assert.deepEqual(await throughServe(dir), expected, 'serve disagrees with the judge');
  });

  it('is over because the session ceiling is over, and each door refuses accordingly', () => {
    const expected = reference();
    const session = expected.judgements.find((entry) => entry.scope === 'session');
    assert.equal(session.verdict, 'over');
    assert.equal(session.limitUsd, 5.5);
    assert.equal(session.restsOn, 'measured+estimated', 'it takes the call to cross, and it says so');

    const decision = gatewayDecision(
      {
        provider: 'anthropic',
        model: CALL.model,
        inputTokens: CALL.inputTokens,
        maxOutputTokens: CALL.outputTokens,
        label: LABEL,
        session: SESSION,
      },
      null,
      {
        catalogue,
        policy: { onCannotTell: 'fail-open' },
        limits: LIMITS,
        position: positionAt(indexUsage(records(), { catalogue }), { label: LABEL, session: SESSION }),
      },
    );
    assert.equal(decision.kind, 'refuse');
    assert.equal(decision.reason, 'limit-over');
    // The legible refusal: the limit, the measured spend and the scope, in
    // the sentence — an agent can log it and a person can audit it.
    assert.ok(decision.because.includes('$5.50'), decision.because);
    assert.ok(decision.because.includes('$5.00 measured'), decision.because);
    assert.ok(decision.because.includes("session's ceiling"), decision.because);

    const guard = guardSpend(
      {
        ...CALL,
        limits: LIMITS,
        position: positionAt(indexUsage(records(), { catalogue }), { label: LABEL, session: SESSION }),
        label: LABEL,
        session: SESSION,
      },
      { catalogue },
    );
    assert.equal(guard.verdict, 'no');
    assert.ok(guard.because.includes('$5.50'), guard.because);
  });

  it('no door ever echoes the session key', async () => {
    const dir = await setup();
    for (const [door, output] of [
      ['gateway', throughGateway()],
      ['guard', throughGuard()],
      ['serve', await throughServe(dir)],
    ]) {
      assert.ok(!JSON.stringify(output).includes(SESSION), `${door} echoes the session key`);
    }
    // The full guard answer too, not just its policy half.
    const whole = guardSpend(
      { ...CALL, limits: LIMITS, position: { dayUsd: 1, sessionUsd: 1, labelUsd: 1 }, label: LABEL, session: SESSION },
      { catalogue },
    );
    assert.ok(!JSON.stringify(whole).includes(SESSION), 'the guard answer echoes the session key');
  });

  it('a broken door is caught: a forged field fails the comparison', () => {
    /**
     * The property has to be able to fail, or "all three match" is a
     * sentence about deepEqual. A door that drifted by one field — here a
     * ceiling misread by a cent — must be caught by the exact comparison
     * the first test runs.
     */
    const expected = reference();
    const forged = structuredClone(expected);
    forged.judgements[0].limitUsd += 0.01;
    assert.throws(() => assert.deepEqual(forged, expected));
    const paraphrased = structuredClone(expected);
    delete paraphrased.judgements[2].window;
    assert.throws(() => assert.deepEqual(paraphrased, expected));
  });

  it('a door that lost its measured side is caught too', async () => {
    /**
     * The realistic breakage: `serve` started without `--log` still holds
     * the same policy but measures nothing, so its judgement says
     * cannot-tell where the others say over. The suite's comparison — the
     * same one as above — refuses the disagreement.
     */
    const dir = await setup();
    const blind = await (async () => {
      const where = await serveIn(dir, []);
      const response = await fetch(`${where}/cost`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...CALL, label: LABEL, session: SESSION }),
      });
      return (await response.json()).policy;
    })();
    assert.equal(blind.verdict, 'cannot-tell');
    assert.throws(() => assert.deepEqual(blind, reference()));
  });
});
