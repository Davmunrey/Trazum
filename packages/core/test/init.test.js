import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, MIN_RATE_DAYS, profileUsage, proposeInit } from '../dist/index.js';

/**
 * The first five minutes.
 *
 * Every assertion here is really the same assertion in a different costume:
 * a key `init` cannot justify is a key `init` does not write. The interesting
 * cases are the ones where writing something would have been *easy* and would
 * have looked right — a provider default filled in for a missing model, a zero
 * hit rate on a log with no cache column, a monthly rate divided out of four
 * days. Each of those is a guess that reads as a decision six weeks later.
 */

const ON = new Date('2026-08-16T00:00:00Z');

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: ON,
  });

const HOST = { id: 'terminal', displayName: 'a terminal', billing: 'unknown', evidence: null };

const observe = (over = {}) => ({
  host: HOST,
  sightings: [],
  promptFiles: [],
  usage: [],
  measured: null,
  locale: null,
  existing: null,
  ...over,
});

const propose = (over) => proposeInit(observe(over), { catalogue: BUNDLED_CATALOGUE, on: ON });

/** `days` consecutive UTC days of `perDay` identical calls, starting 2026-01-01. */
const daily = (days, perDay, over = {}) => {
  const records = [];
  for (let d = 0; d < days; d += 1) {
    const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString();
    for (let i = 0; i < perDay; i += 1) {
      records.push({
        model: 'claude-opus-5',
        label: 'classify',
        timestamp: day,
        usage: { input_tokens: 20_000, output_tokens: 500 },
        ...over,
      });
    }
  }
  return records;
};

const declineFor = (proposal, key) => proposal.declined.filter((d) => d.key === key);
const justifiedFor = (proposal, key) => proposal.justified.filter((j) => j.key === key);

describe('proposeInit — a key with no evidence is not written', () => {
  it('writes nothing at all from nothing at all', () => {
    const proposal = propose({});
    assert.deepEqual(proposal.config, {});
    assert.equal(proposal.headline, null);
    assert.equal(proposal.noHeadline, 'nothing-measured');
  });

  it('never leaves a refusal bare', () => {
    // The rule the guard established in 1.45, applied to a file: every
    // declined key says which key and why, so "no provider written" is never
    // indistinguishable from a bug.
    const proposal = propose({});
    assert.ok(proposal.declined.length > 0);
    for (const decline of proposal.declined) {
      assert.ok(typeof decline.key === 'string' && decline.key.length > 0);
      assert.ok(typeof decline.why === 'string' && decline.why.length > 0);
    }
  });

  it('declines a model when the source names a provider and no model', () => {
    // `where` prints a provider default because a reader can see it is a
    // guess. A config file cannot: six weeks later it reads as a decision
    // somebody made, and every price in every report rests on it.
    const proposal = propose({
      sightings: [
        {
          file: 'src/app.ts',
          detection: {
            provider: 'openai',
            model: null,
            evidence: [{ kind: 'sdk-import', detail: "from 'openai'", line: 3, provider: 'openai' }],
            conflicts: [],
          },
        },
      ],
    });
    assert.equal(proposal.config.usage?.model, undefined);
    const [decline] = declineFor(proposal, 'usage.model');
    assert.equal(decline.why, 'provider-only');
    assert.equal(decline.provider, 'openai');
    assert.equal(decline.file, 'src/app.ts');
  });

  it('declines a model when two files disagree, and names both', () => {
    const conflicted = (file) => ({
      file,
      detection: {
        provider: null,
        model: null,
        evidence: [],
        conflicts: [{ kind: 'sdk-import', detail: "from 'openai'", line: 1, provider: 'openai' }],
      },
    });
    const proposal = propose({ sightings: [conflicted('a.ts'), conflicted('b.ts')] });
    const [decline] = declineFor(proposal, 'usage.model');
    assert.equal(decline.why, 'conflicting-evidence');
    assert.deepEqual(decline.files, ['a.ts', 'b.ts']);
  });

  it('takes a model from a literal in the source, with the line it came from', () => {
    const proposal = propose({
      sightings: [
        {
          file: 'src/app.ts',
          detection: {
            provider: 'anthropic',
            model: 'claude-haiku-4-5',
            evidence: [
              {
                kind: 'model-literal',
                detail: "model: 'claude-haiku-4-5'",
                line: 12,
                model: 'claude-haiku-4-5',
              },
            ],
            conflicts: [],
          },
        },
      ],
    });
    assert.equal(proposal.config.usage.model, 'claude-haiku-4-5');
    const [why] = justifiedFor(proposal, 'usage.model');
    assert.equal(why.from, 'source');
    assert.equal(why.line, 12);
    assert.equal(why.evidence, 'model-literal');
  });
});

describe('proposeInit — measurement beats detection, and is not policy', () => {
  it('prefers the measured model over the one imported in the source', () => {
    // An import says which SDK somebody installed. A log says which model was
    // billed. When they disagree, the bill is right.
    const proposal = propose({
      measured: profile(daily(MIN_RATE_DAYS, 4)),
      sightings: [
        {
          file: 'src/app.ts',
          detection: {
            provider: 'anthropic',
            model: 'claude-haiku-4-5',
            evidence: [{ kind: 'model-literal', detail: 'x', line: 1, model: 'claude-haiku-4-5' }],
            conflicts: [],
          },
        },
      ],
    });
    assert.equal(proposal.config.usage.model, 'claude-opus-5');
    assert.equal(justifiedFor(proposal, 'usage.model')[0].from, 'measured');
  });

  it('declines a model when no single one carries a majority of the bill', () => {
    // Three models at roughly a third of the bill each. Writing the largest
    // would price every prompt in the repository against a model two thirds
    // of the traffic never touches — a threshold this refuses to cross rather
    // than a tie it breaks.
    const measured = profile([
      ...daily(1, 10),
      ...daily(1, 25, { model: 'claude-sonnet-5' }),
      ...daily(1, 50, { model: 'claude-haiku-4-5' }),
    ]);
    const top = measured.byModel[0].breakdown.totalUsd / measured.total.totalUsd;
    assert.ok(top <= 0.5, `the fixture must have no majority model, top is ${top}`);

    const proposal = proposeInit(observe({ measured }), { catalogue: BUNDLED_CATALOGUE, on: ON });
    assert.equal(proposal.config.usage?.model, undefined);
    assert.equal(declineFor(proposal, 'usage.model')[0].why, 'no-evidence');
  });

  it('never writes a budget, and hands over the measured figure instead', () => {
    // A log says what your traffic was. A budget says what it may cost, and
    // no log answers that. "Measured plus twenty per cent" would be this tool
    // inventing a threshold and then grading somebody against it.
    const measured = profile(daily(MIN_RATE_DAYS, 4));
    const proposal = propose({ measured });
    assert.equal(proposal.config.spend, undefined);
    const [decline] = declineFor(proposal, 'spend.maxUsd');
    assert.equal(decline.why, 'a-budget-is-a-policy');
    assert.equal(decline.measuredUsd, measured.total.totalUsd);
    assert.equal(decline.days, MIN_RATE_DAYS);
  });

  it('never writes batchEligible in either direction', () => {
    // `false` would quietly delete the batch lever from every report this
    // config touches; `true` would sell a saving on latency nobody agreed to
    // give up. No log records the answer.
    const proposal = propose({ measured: profile(daily(MIN_RATE_DAYS, 4)) });
    assert.equal(proposal.config.usage.batchEligible, undefined);
    assert.equal(declineFor(proposal, 'usage.batchEligible')[0].why, 'only-you-know');
  });

  it('never maps a label to a prompt file', () => {
    // A wrong entry is worse than a missing one: `profile` would read the
    // wrong file and explain a cache verdict with the wrong prompt's
    // structure, confidently.
    const proposal = propose({
      measured: profile(daily(2, 3)),
      promptFiles: ['prompts/classify.txt'],
    });
    assert.equal(proposal.config.labels, undefined);
    assert.equal(declineFor(proposal, 'labels')[0].why, 'unprovable');
  });
});

describe('proposeInit — no series becomes a forecast', () => {
  it('states a monthly rate only once the span is long enough', () => {
    const proposal = propose({ measured: profile(daily(MIN_RATE_DAYS, 5)) });
    const [why] = justifiedFor(proposal, 'usage.callsPerMonth');
    assert.equal(why.days, MIN_RATE_DAYS);
    assert.equal(why.calls, MIN_RATE_DAYS * 5);
    // 5 a day over 28 days, stated as 30 days of the same: 150.
    assert.equal(proposal.config.usage.callsPerMonth, 150);
  });

  it('refuses to turn four days into a month, and says how few it had', () => {
    const proposal = propose({ measured: profile(daily(4, 5)) });
    assert.equal(proposal.config.usage?.callsPerMonth, undefined);
    const [decline] = declineFor(proposal, 'usage.callsPerMonth');
    assert.equal(decline.why, 'window-too-short');
    assert.equal(decline.days, 4);
    assert.equal(decline.calls, 20);
  });

  it('refuses a rate when some calls carry no clock at all', () => {
    // The quiet one. The calls are all there; they simply cannot be placed in
    // time. Dividing them by a span they were never proven to fall inside
    // makes the rate come out high and nobody can see why.
    const dated = daily(MIN_RATE_DAYS, 5);
    const undated = [
      { model: 'claude-opus-5', label: 'classify', usage: { input_tokens: 20_000, output_tokens: 500 } },
    ];
    const proposal = propose({ measured: profile([...dated, ...undated]) });
    assert.equal(proposal.config.usage?.callsPerMonth, undefined);
    const [decline] = declineFor(proposal, 'usage.callsPerMonth');
    assert.equal(decline.why, 'undated-calls');
    assert.equal(decline.undated, 1);
  });

  it('still averages the output of a single day, because an average is not a forecast', () => {
    const proposal = propose({ measured: profile(daily(1, 4)) });
    assert.equal(proposal.config.usage.avgOutputTokens, 500);
    assert.equal(justifiedFor(proposal, 'usage.avgOutputTokens')[0].calls, 4);
  });
});

describe('proposeInit — not recorded is not not-happened', () => {
  it('declines a hit rate when the log carries no cache column at all', () => {
    // Writing 0 would tell every later caching advisory that caching is doing
    // nothing — a finding invented out of a missing field.
    const proposal = propose({ measured: profile(daily(3, 4)) });
    assert.equal(proposal.config.usage?.cacheHitRate, undefined);
    assert.equal(declineFor(proposal, 'usage.cacheHitRate')[0].why, 'not-recorded');
  });

  it('computes a hit rate once the log actually records cache tokens', () => {
    const records = daily(3, 4, {
      usage: {
        input_tokens: 5_000,
        output_tokens: 500,
        cache_read_input_tokens: 15_000,
        cache_creation_input_tokens: 0,
      },
    });
    const proposal = propose({ measured: profile(records) });
    // 15k read against 5k fresh input: three quarters of what was sent came
    // from the cache.
    assert.equal(proposal.config.usage.cacheHitRate, 0.75);
    const [why] = justifiedFor(proposal, 'usage.cacheHitRate');
    assert.equal(why.cacheReadTokens, 3 * 4 * 15_000);
    assert.equal(why.inputTokens, 3 * 4 * 5_000);
  });

  it('separates a hit rate of zero from a log that never mentioned caching', () => {
    // Reads of zero *with writes recorded* is a measurement: the cache was
    // paid for and nothing read it. That is a real 0, and it is written.
    const records = daily(3, 4, {
      usage: {
        input_tokens: 5_000,
        output_tokens: 500,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 9_000,
      },
    });
    const proposal = propose({ measured: profile(records) });
    assert.equal(proposal.config.usage.cacheHitRate, 0);
    assert.equal(declineFor(proposal, 'usage.cacheHitRate').length, 0);
  });
});

describe('proposeInit — the headline', () => {
  it('names one finding, with the days behind it and measured provenance', () => {
    const proposal = propose({ measured: profile(daily(MIN_RATE_DAYS, 20)) });
    assert.ok(proposal.headline, 'a real Opus bill has a lever');
    assert.equal(proposal.noHeadline, null);
    assert.equal(proposal.headline.provenance, 'measured');
    assert.equal(proposal.headline.days, MIN_RATE_DAYS);
    assert.ok(proposal.headline.savingUsd > 0);
    // The combined figure is `combinedUsd`, computed by `billLevers` — never
    // the two levers added together.
    assert.equal(proposal.headline.savingUsd, proposal.headline.slice.combinedUsd);
  });

  it('says why there is no headline rather than printing nothing', () => {
    const proposal = propose({});
    assert.equal(proposal.headline, null);
    assert.equal(proposal.noHeadline, 'nothing-measured');
  });

  it('distinguishes an unpriceable log from an absent one', () => {
    const proposal = propose({
      measured: profile(daily(3, 2, { model: 'some-model-nobody-has-priced' })),
    });
    assert.equal(proposal.headline, null);
    assert.equal(proposal.noHeadline, 'nothing-could-be-priced');
  });
});

describe('proposeInit — what it would overwrite', () => {
  it('names every key it would replace in a config already there', () => {
    const proposal = propose({
      measured: profile(daily(MIN_RATE_DAYS, 5)),
      locale: 'es',
      existing: {
        path: 'trazum.config.json',
        config: { locale: 'en', usage: { model: 'claude-haiku-4-5', callsPerMonth: 10 } },
      },
    });
    assert.equal(proposal.overwrites.path, 'trazum.config.json');
    assert.deepEqual(proposal.overwrites.keys.sort(), [
      'locale',
      'usage.callsPerMonth',
      'usage.model',
    ]);
  });

  it('reports an empty overwrite list rather than null when a config exists but nothing collides', () => {
    // Null and "collides with nothing" are different sentences: one says
    // there is no file, the other says the file is safe.
    const proposal = propose({
      locale: 'es',
      existing: { path: 'trazum.config.json', config: { level: 'safe' } },
    });
    assert.deepEqual(proposal.overwrites, { path: 'trazum.config.json', keys: [] });
  });

  it('is null when there is no config to overwrite', () => {
    assert.equal(propose({ locale: 'es' }).overwrites, null);
  });
});

describe('proposeInit — the config it writes is a config', () => {
  it('writes extensions only when the walk found something the defaults miss', () => {
    const covered = propose({ promptFiles: ['a/one.txt', 'b/two.md'] });
    assert.equal(covered.config.extensions, undefined, 'a key that changes nothing is not written');

    const uncovered = propose({ promptFiles: ['a/one.txt', 'b/two.hbs'] });
    assert.deepEqual(uncovered.config.extensions, ['.hbs', '.txt']);
    assert.equal(justifiedFor(uncovered, 'extensions')[0].files, 2);
  });

  it('produces something the config parser accepts', async () => {
    // The whole point of the file is that it can be read back. A proposal
    // that serialises to something `parseConfig` rejects is a first run that
    // ends in an error on the second command.
    const { parseConfig } = await import('../dist/index.js');
    const proposal = propose({
      measured: profile(daily(MIN_RATE_DAYS, 5)),
      locale: 'es',
      promptFiles: ['a/one.hbs'],
    });
    const round = parseConfig(JSON.stringify(proposal.config, null, 2));
    assert.deepEqual(round, proposal.config);
  });
});
