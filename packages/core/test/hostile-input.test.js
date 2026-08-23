import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE, answerCost, assemble, conform, guardSpend, optimize, profileUsage, rollUp } from '../dist/index.js';

/**
 * Hostile input, permanently.
 *
 * A stress session found six defects in an afternoon, all one shape: an input
 * nobody had tried, taken quietly. This file is that session as a fixture --
 * seeded and deterministic, so the same seed gives the same verdict on any
 * machine, and bounded, so it is a test and not a job.
 *
 * Three properties over the prompt fuzzer, and they are the product's own
 * promises: `optimize` never throws, never grows tokens, and is idempotent --
 * running it on its own output changes nothing. The third failed when this
 * was written (1 input in 4,000): `emphasis` stripped `IMPORTANT:` and left
 * two lines equal but for a space that `whitespace` had already stopped
 * looking at, so `duplicate-lines` missed the pair a second run caught.
 *
 * Every defect the session found is pinned below as its own case, because a
 * fuzzer's seed schedule shifts the moment an atom is added -- the named cases
 * are the part that cannot rotate away.
 */

/** Deterministic LCG: same seed, same corpus, any machine. */
const generator = (seed) => {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
};

const ATOMS = [
  'Please kindly note that ', 'in order to ', 'you should always ', 'IMPORTANT: ',
  '```js\nconst x = 1;\n```', '`inline code`', 'https://example.com/a?b=c&d=e',
  'l\u00ednea en espa\u00f1ol con acent\u00f3s', '\u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8\u3067\u3059\u3002',
  '\u0646\u0635 \u0639\u0631\u0628\u064a \u0645\u0646 \u0627\u0644\u064a\u0645\u064a\u0646',
  '\ud83c\udf89\ud83d\ude80 emoji run \ud83d\udd25', 'word '.repeat(50), '\t\ttabs\t\t', '   ', '\r\n\r\nCRLF\r\n',
  '- list item\n- list item\n- list item\n', '| a | b |\n|---|---|\n| 1 | 2 |\n',
  'Very very very important. ', 'REPEAT-BLOCK\nline one\nline two\n\nREPEAT-BLOCK\nline one\nline two\n',
  '\u0000null-byte', '\u200bzero-width\u200b', 'e\u0301 combining', '\ud835\udd66nicode math',
  'a'.repeat(3000), '\n\n\n\n\n\n', '<html><b>tags</b></html>', '{"json": true, "n": 1.5}',
  '-----BEGIN FAKE-----\nAAAA\n-----END FAKE-----', '\ud83d',
];

const prompts = (seed, iterations) => {
  const rnd = generator(seed);
  const out = [];
  for (let i = 0; i < iterations; i += 1) {
    const n = 1 + Math.floor(rnd() * 8);
    let text = '';
    for (let j = 0; j < n; j += 1) text += ATOMS[Math.floor(rnd() * ATOMS.length)] + (rnd() < 0.5 ? '\n' : ' ');
    out.push({ text, level: rnd() < 0.5 ? 'safe' : 'aggressive' });
  }
  return out;
};

describe('optimize over the hostile corpus', () => {
  const CORPUS = prompts(42, 1500);

  it('has a corpus worth the name', () => {
    assert.equal(CORPUS.length, 1500);
    // Short combinations collide (a one-atom text repeats), so the bar is
    // 'not degenerate' rather than 'all distinct'.
    assert.ok(new Set(CORPUS.map((entry) => entry.text)).size > 1200, 'the generator is producing repeats');
  });

  it('never throws, never grows tokens, and reaches its own fixed point', () => {
    const failures = [];
    for (const { text, level } of CORPUS) {
      let first;
      try {
        first = optimize(text, { level });
      } catch (error) {
        failures.push({ kind: 'threw', level, error: String(error.message).slice(0, 120) });
        continue;
      }
      if (first.tokensAfter > first.tokensBefore) {
        failures.push({ kind: 'grew', level, before: first.tokensBefore, after: first.tokensAfter });
        continue;
      }
      const second = optimize(first.optimized, { level });
      if (second.optimized !== first.optimized) {
        failures.push({ kind: 'not-idempotent', level, sample: JSON.stringify(text.slice(0, 80)) });
      }
    }
    assert.deepEqual(failures.slice(0, 5), [], `${failures.length} of ${CORPUS.length} inputs broke a property`);
  });

  it('still converges on the cascade the fuzzer found', () => {
    // The named case, pinned outside the seed schedule: emphasis strips the
    // prefix, whitespace has to run again for duplicate-lines to see the pair.
    const run = 'word '.repeat(48).trim();
    const text = `IMPORTANT:  ${run}\n${run}\n`;
    const first = optimize(text, { level: 'aggressive' });
    assert.equal(optimize(first.optimized, { level: 'aggressive' }).optimized, first.optimized);
    assert.ok(first.rules.some((rule) => rule.id === 'duplicate-lines'), 'the cascade was not caught in one call');
  });
});

describe('malformed logs are read, never thrown at', () => {
  const LINES = [
    '{"model":"claude-opus-5","usage":{"input_tokens":100,"output_tokens":10}}',
    '{"model":"claude-opus-5","usage":{"input_tokens":-100,"output_tokens":10}}',
    '{"model":"claude-opus-5","usage":{"input_tokens":1e309,"output_tokens":10}}',
    '{"model":"claude-opus-5","usage":{"input_tokens":"100","output_tokens":10}}',
    '{"model":123,"usage":{"input_tokens":100,"output_tokens":10}}',
    '{"model":"claude-opus-5","ts":"2026-13-45T99:99:99Z","usage":{"input_tokens":1,"output_tokens":1}}',
    '{"model":"claude-opus-5","session":42,"usage":{"input_tokens":1,"output_tokens":1}}',
    'not json at all', '[]', 'null', 'true', '42', '{"usage":{}}',
    '{"__proto__":{"polluted":1},"model":"claude-opus-5","usage":{"input_tokens":1,"output_tokens":1}}',
  ];

  it('profiles every mixture with finite, non-negative money', () => {
    const rnd = generator(7);
    for (let i = 0; i < 300; i += 1) {
      const n = 1 + Math.floor(rnd() * 12);
      const parts = [];
      for (let j = 0; j < n; j += 1) parts.push(LINES[Math.floor(rnd() * LINES.length)]);
      const report = profileUsage(parts.join('\n'), { catalogue: BUNDLED_CATALOGUE });
      assert.ok(Number.isFinite(report.total.totalUsd), 'a total went non-finite');
      assert.ok(report.total.totalUsd >= 0, 'a total went negative');
    }
    assert.equal({}.polluted, undefined, 'a log line reached Object.prototype');
  });

  it('conforms and rolls up hostile documents without throwing', () => {
    for (const doc of ['{}', '[]', 'null', '"str"', 'not json', '{"schemaVersion":"1"}']) {
      for (const contract of ['profile', 'prompt-draft', 'roll-up', undefined]) {
        conform(doc, contract === undefined ? {} : { contract });
      }
    }
    for (const contributors of [[], [{ name: 'a', text: 'not json' }], [{ name: 'a', text: '{}' }]]) {
      const merged = rollUp(contributors);
      assert.ok(Number.isFinite(merged.total.totalUsd));
    }
  });
});

describe('money is never negative, whatever the input', () => {
  it('refuses the token counts that priced a call below zero', () => {
    /**
     * The worst of the six: `spend_guard` took `outputTokens: -500`, priced
     * the call at -$0.0075, and said **yes** -- a negative estimate lowers the
     * projected spend, so an agent that lies about its output tokens buys
     * itself an approval. Refused in `answerCost`, where every door routes.
     */
    for (const request of [
      { model: 'claude-opus-5', inputTokens: 1000, outputTokens: -500 },
      { model: 'claude-opus-5', inputTokens: -1 },
      { model: 'claude-opus-5', inputTokens: Number.POSITIVE_INFINITY },
      { model: 'claude-opus-5', inputTokens: Number.NaN },
    ]) {
      assert.throws(() => answerCost(request, { catalogue: BUNDLED_CATALOGUE }), /non-negative finite/);
      assert.throws(() => guardSpend(request, { catalogue: BUNDLED_CATALOGUE }), /non-negative finite/);
    }
  });

  it('and still answers the honest ones', () => {
    const answer = guardSpend(
      { model: 'claude-opus-5', inputTokens: 1000, outputTokens: 500, consumedUsd: 5, limitUsd: 10 },
      { catalogue: BUNDLED_CATALOGUE },
    );
    assert.equal(answer.verdict, 'yes');
    assert.ok(answer.cost.call.estimatedUsd > 0);
  });

  it('treats a budget that is not a positive number as no budget', () => {
    // `-5` used to produce the verdict `over` -- a judgement against a limit
    // that cannot exist. `-5`, `Infinity` and `NaN` now land where they
    // belong: nothing to check against, said with its reason.
    const REQUIRED = { role: 'r', task: 't', inputs: 'i', 'output-shape': 'prose', model: 'claude-opus-5' };
    for (const budget of ['-5', '0', 'Infinity', 'NaN', 'banana']) {
      const { measured } = assemble({ ...REQUIRED, budget }, { callsPerMonth: 1000 });
      assert.equal(measured.cheap.verdict, 'cannot-tell', `budget ${budget} was judged`);
      assert.equal(measured.cheap.reason, 'no-budget');
    }
    const real = assemble({ ...REQUIRED, budget: '20' }, { callsPerMonth: 1000 });
    assert.equal(real.measured.cheap.verdict, 'within');
  });

  it('treats a volume that is not positive as not stated', () => {
    // `callsPerMonth: -100` priced a prompt at -$1.26 a month -- a number no
    // bill ever had.
    const REQUIRED = { role: 'r', task: 't', inputs: 'i', 'output-shape': 'prose', model: 'claude-opus-5' };
    for (const callsPerMonth of [-100, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { measured } = assemble(REQUIRED, { callsPerMonth });
      assert.ok(measured.cheap.monthlyUsd === null || measured.cheap.monthlyUsd >= 0, `callsPerMonth ${callsPerMonth} went negative`);
    }
  });
});
