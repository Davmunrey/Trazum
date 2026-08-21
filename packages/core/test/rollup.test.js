import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE, conform, profileUsage, rollUp } from '@trazum/core';

/**
 * The roll-up: several people's profile documents, one bill, and every
 * contributor's blind spots still attached to the contributor that has them.
 *
 * Hand figures throughout, as everywhere in this suite: Claude Opus 5 at
 * $5/MTok input makes 200k input tokens $1.00.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = (file) => readFileSync(join(here, '..', 'src', file), 'utf8');

const call = (over = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  usage: { input_tokens: 200_000, output_tokens: 0 },
  ...over,
});

/** A profile document, exactly as `trazum profile --json` writes one. */
const document = (records) =>
  JSON.stringify(
    {
      schemaVersion: 1,
      ...profileUsage(records.map((record) => JSON.stringify(record)).join('\n'), {
        catalogue: BUNDLED_CATALOGUE,
      }),
    },
    null,
    2,
  );

const from = (entries) => rollUp(entries.map(([name, records]) => ({ name, text: document(records) })));

describe('rollUp: the merge', () => {
  it('sums two contributors into one bill', () => {
    const merged = from([
      ['laptop', [call(), call()]],
      ['ci', [call()]],
    ]);
    assert.equal(merged.contributors.length, 2);
    assert.ok(Math.abs(merged.total.totalUsd - 3) < 1e-9);
    assert.equal(merged.total.calls, 3);
    assert.equal(merged.rejected.length, 0);
  });

  it('merges per label and per model, largest bill first', () => {
    const merged = from([
      ['a', [call({ label: 'chat' }), call({ label: 'batch' })]],
      ['b', [call({ label: 'chat' })]],
    ]);
    assert.deepEqual(
      merged.byLabel.map((row) => row.label),
      ['chat', 'batch'],
    );
    assert.ok(Math.abs(merged.byLabel[0].breakdown.totalUsd - 2) < 1e-9);
    assert.equal(merged.byModel.length, 1);
    assert.equal(merged.byModel[0].model, 'claude-opus-5');
  });

  it('keeps a label and a model apart when either contains the separator a key would join on', () => {
    // The first implementation keyed the pair as `${label} ${model}` and split
    // it back on the space. `deep research claude-opus-5` and
    // `deep research claude-opus-5` are the same string whether the label is
    // "deep" and the model "research claude-opus-5" or the other way round —
    // so two different workloads merged into one row, silently, and only for
    // labels somebody wrote with a space in.
    const merged = rollUp([
      {
        name: 'a',
        text: JSON.stringify({
          schemaVersion: 1,
          total: {},
          byLabel: [],
          byModel: [],
          byLabelAndModel: [
            { label: 'deep research', model: 'claude-opus-5', breakdown: { totalUsd: 1, calls: 1 } },
            { label: 'deep', model: 'research claude-opus-5', breakdown: { totalUsd: 2, calls: 1 } },
          ],
          unpricedModels: [],
          skippedLines: [],
          span: null,
        }),
      },
    ]);
    assert.equal(merged.byLabelAndModel.length, 2);
    assert.deepEqual(
      merged.byLabelAndModel.map((row) => [row.label, row.model, row.breakdown.totalUsd]),
      [
        ['deep', 'research claude-opus-5', 2],
        ['deep research', 'claude-opus-5', 1],
      ],
    );
  });

  it('takes the maximum call input, never the sum — no call ever had the sum', () => {
    const merged = from([
      ['small', [call({ usage: { input_tokens: 100_000, output_tokens: 0 } })]],
      ['large', [call({ usage: { input_tokens: 300_000, output_tokens: 0 } })]],
    ]);
    assert.equal(merged.total.maxCallInputTokens, 300_000);
  });

  it('merges the days, oldest first, and sums each day per model', () => {
    const merged = from([
      ['a', [call({ ts: '2026-08-02T09:00:00Z' }), call({ ts: '2026-08-01T09:00:00Z' })]],
      ['b', [call({ ts: '2026-08-01T11:00:00Z' })]],
    ]);
    assert.deepEqual(
      merged.spendByDay.map((day) => day.day),
      ['2026-08-01', '2026-08-02'],
    );
    assert.ok(Math.abs(merged.spendByDay[0].usd - 2) < 1e-9);
    assert.equal(merged.spendByDay[0].contributors, 2);
    assert.equal(merged.spendByDay[0].byModel[0].calls, 2);
  });

  it('spans the earliest start to the latest end', () => {
    const merged = from([
      ['a', [call({ ts: '2026-08-01T00:00:00Z' })]],
      ['b', [call({ ts: '2026-08-20T00:00:00Z' })]],
    ]);
    assert.equal(new Date(merged.span.fromMs).toISOString(), '2026-08-01T00:00:00.000Z');
    assert.equal(new Date(merged.span.toMs).toISOString(), '2026-08-20T00:00:00.000Z');
    assert.equal(merged.span.calls, 2);
  });

  it('sums field coverage and the outcome tally', () => {
    const merged = from([
      ['a', [call({ trazum_outcome: 'resolved' }), call()]],
      ['b', [call({ trazum_outcome: 'resolved' })]],
    ]);
    assert.equal(merged.fieldCoverage.parsed, 3);
    assert.equal(merged.outcomeTally.recorded, 2);
    assert.equal(merged.outcomeTally.byValue[0].value, 'resolved');
    assert.equal(merged.outcomeTally.byValue[0].calls, 2);
  });
});

describe('rollUp: what it refuses', () => {
  it('cannot see overlap between contributors, and says so every time there is more than one', () => {
    const two = from([
      ['a', [call()]],
      ['b', [call()]],
    ]);
    assert.ok(two.cannotSay.includes('overlap-invisible'));

    // One contributor cannot overlap with anybody, so the caveat would be
    // noise — and a caveat that is always present is a caveat nobody reads.
    const one = from([['a', [call()]]]);
    assert.equal(one.cannotSay.includes('overlap-invisible'), false);
  });

  it("refuses a day's dearest label once two contributors share the day", () => {
    const alone = from([['a', [call({ ts: '2026-08-01T09:00:00Z', label: 'chat' })]]]);
    assert.equal(alone.spendByDay[0].topLabel, 'chat');
    assert.ok(alone.spendByDay[0].topLabelUsd > 0);

    const shared = from([
      ['a', [call({ ts: '2026-08-01T09:00:00Z', label: 'chat' })]],
      ['b', [call({ ts: '2026-08-01T10:00:00Z', label: 'batch' })]],
    ]);
    assert.equal(shared.spendByDay[0].topLabel, null);
    // Absence is null, never zero: 0 would be a day whose dearest label cost
    // nothing, which is a measurement.
    assert.equal(shared.spendByDay[0].topLabelUsd, null);
    assert.ok(shared.cannotSay.includes('day-top-label-unknown'));
    const finding = shared.notMerged.find((entry) => entry.finding.includes('dearest label'));
    assert.deepEqual(finding.presentIn, ['a', 'b']);
  });

  it('names the per-record findings it cannot reconstruct, with who had one', () => {
    const merged = from([
      [
        'a',
        [
          // A conversation is only *growth* when the turns grow, which is the
          // whole finding — three identical turns are three calls.
          call({ session: 's1', ts: '2026-08-01T09:00:00Z', usage: { input_tokens: 1_000, output_tokens: 100 } }),
          call({ session: 's1', ts: '2026-08-01T09:00:10Z', usage: { input_tokens: 5_000, output_tokens: 100 } }),
          call({ session: 's1', ts: '2026-08-01T09:00:20Z', usage: { input_tokens: 20_000, output_tokens: 100 } }),
        ],
      ],
      ['b', [call()]],
    ]);
    const growth = merged.notMerged.find((entry) => entry.finding === 'conversation growth');
    assert.ok(growth !== undefined, 'conversation growth must be named as unmerged');
    assert.deepEqual(growth.presentIn, ['a']);
    assert.ok(growth.because.length > 0, 'a refusal never arrives bare');
  });

  it('flags mismatched spans, and a contributor with no clock at all', () => {
    const uneven = from([
      ['month', [call({ ts: '2026-08-01T00:00:00Z' }), call({ ts: '2026-08-30T00:00:00Z' })]],
      ['days', [call({ ts: '2026-08-01T00:00:00Z' }), call({ ts: '2026-08-02T00:00:00Z' })]],
    ]);
    assert.ok(uneven.cannotSay.includes('mismatched-spans'));

    const clockless = from([
      ['dated', [call({ ts: '2026-08-01T00:00:00Z' })]],
      ['undated', [call()]],
    ]);
    assert.ok(clockless.cannotSay.includes('contributor-without-clock'));
    assert.ok(clockless.cannotSay.includes('mismatched-spans'));
    const gap = clockless.contributors[1].gaps.find((entry) => entry.kind === 'no-clock');
    assert.ok(gap !== undefined);
  });
});

describe('rollUp: contributions it will not merge', () => {
  it('rejects a document that is not a profile, with the reason, and merges nothing of it', () => {
    const merged = rollUp([
      { name: 'good', text: document([call()]) },
      { name: 'bad', text: JSON.stringify({ schemaVersion: 1, actions: [] }) },
    ]);
    assert.equal(merged.contributors.length, 1);
    assert.equal(merged.rejected.length, 1);
    assert.equal(merged.rejected[0].name, 'bad');
    assert.ok(merged.rejected[0].because.length > 0);
    assert.ok(merged.cannotSay.includes('contribution-rejected'));
    // The one that did conform is still there, whole.
    assert.ok(Math.abs(merged.total.totalUsd - 1) < 1e-9);
  });

  it('rejects unreadable text rather than throwing on it', () => {
    const merged = rollUp([{ name: 'broken', text: 'not json at all' }]);
    assert.equal(merged.contributors.length, 0);
    assert.equal(merged.rejected.length, 1);
    assert.ok(merged.cannotSay.includes('contribution-rejected'));
  });

  it('merges an identical contribution and states it, rather than silently discarding money', () => {
    const text = document([call()]);
    const merged = rollUp([
      { name: 'laptop', text },
      { name: 'backup', text },
    ]);
    // Merged, like a duplicate line inside one log: the report states the
    // count and the money and stops.
    assert.ok(Math.abs(merged.total.totalUsd - 2) < 1e-9);
    assert.deepEqual(merged.identicalContributions.groups, [['laptop', 'backup']]);
    assert.ok(Math.abs(merged.identicalContributions.usd - 1) < 1e-9);
    assert.ok(merged.cannotSay.includes('identical-contributions'));
  });

  it('drops a numeric field it cannot classify, and names it', () => {
    const base = JSON.parse(document([call()]));
    base.total.someRatioFromTomorrow = 0.5;
    const merged = rollUp([{ name: 'future', text: JSON.stringify(base) }]);
    assert.ok(merged.cannotSay.includes('unknown-fields-dropped'));
    assert.equal(merged.total.someRatioFromTomorrow, undefined);
    const finding = merged.notMerged.find((entry) => entry.finding.includes('someRatioFromTomorrow'));
    assert.ok(finding !== undefined, 'an unknown numeric field must be named, not silently dropped');
  });
});

describe('rollUp: gaps stay with the contributor that has them', () => {
  it('keeps unpriced calls on the machine they came from', () => {
    const merged = from([
      ['clean', [call(), call(), call()]],
      ['odd', [call({ model: 'a-model-nobody-prices' })]],
    ]);
    const clean = merged.contributors.find((contributor) => contributor.name === 'clean');
    const odd = merged.contributors.find((contributor) => contributor.name === 'odd');
    assert.equal(clean.gaps.some((gap) => gap.kind === 'unpriced-calls'), false);
    const gap = odd.gaps.find((entry) => entry.kind === 'unpriced-calls');
    assert.equal(gap.calls, 1);
    // Money is null rather than 0: an unpriced call has no dollar figure, and
    // 0 would say it was free.
    assert.equal(gap.usd, null);
    assert.deepEqual(merged.unpricedModels, ['a-model-nobody-prices']);
  });

  it('names unreadable lines without merging their positions', () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      ...profileUsage([JSON.stringify(call()), 'this line is not json'].join('\n'), {
        catalogue: BUNDLED_CATALOGUE,
      }),
    });
    const merged = rollUp([{ name: 'noisy', text }]);
    const gap = merged.contributors[0].gaps.find((entry) => entry.kind === 'unreadable-lines');
    assert.ok(gap !== undefined);
    // A line number is an offset into a file only that contributor has.
    assert.equal(/line \d+/.test(JSON.stringify(merged.spendByDay)), false);
    assert.ok(gap.detail.includes('1 line'));
  });

  it('names a contributor with no sessions and no labels', () => {
    const merged = rollUp([
      { name: 'bare', text: document([{ model: 'claude-opus-5', usage: { input_tokens: 1000, output_tokens: 0 } }]) },
    ]);
    const kinds = merged.contributors[0].gaps.map((gap) => gap.kind);
    assert.ok(kinds.includes('no-sessions'));
    assert.ok(kinds.includes('no-labels'));
  });
});

describe('the roll-up as a contract', () => {
  it('is recognised as a roll-up rather than as a profile', () => {
    // A roll-up carries byLabelAndModel too, so detection that tested the
    // profile first would accept every roll-up as a profile and never apply
    // the two refusals only a roll-up has to carry.
    const merged = rollUp([
      { name: 'a', text: document([call()]) },
      { name: 'b', text: document([call({ label: 'batch' })]) },
    ]);
    const report = conform(JSON.stringify(merged));
    assert.equal(report.contract, 'roll-up');
    assert.equal(report.conforms, true, JSON.stringify(report.problems));
  });

  it('fails a roll-up of two contributors that does not carry overlap-invisible', () => {
    const merged = rollUp([
      { name: 'a', text: document([call()]) },
      { name: 'b', text: document([call()]) },
    ]);
    // Broken deliberately: an assertion that only ever sees this repository's
    // own good output can never fire.
    merged.cannotSay = merged.cannotSay.filter((caveat) => caveat !== 'overlap-invisible');
    const report = conform(JSON.stringify(merged), { contract: 'roll-up' });
    assert.equal(report.conforms, false);
    assert.ok(report.problems.some((problem) => problem.detail.includes('overlap')));
  });

  it('fails a roll-up that rejected a contribution and does not say so', () => {
    const merged = rollUp([
      { name: 'a', text: document([call()]) },
      { name: 'bad', text: '{}' },
    ]);
    merged.cannotSay = merged.cannotSay.filter((caveat) => caveat !== 'contribution-rejected');
    const report = conform(JSON.stringify(merged), { contract: 'roll-up' });
    assert.equal(report.conforms, false);
    assert.ok(report.problems.some((problem) => problem.detail.includes('contributed nothing')));
  });
});

describe('the merge classifies every field it is handed', () => {
  /** Field names of an interface, read out of the source that declares it. */
  const fieldsOf = (file, name) => {
    const text = src(file);
    const start = text.indexOf(`export interface ${name} {`);
    assert.notEqual(start, -1, `${name} must still be declared in ${file}`);
    let depth = 0;
    let end = start;
    for (let index = text.indexOf('{', start); index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      if (text[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    const body = text.slice(start, end);
    // Only fields declared at the top level of the interface, and only the
    // numeric ones — a merge has nothing to decide about a string.
    return [...body.matchAll(/^ {2}(\w+): number;/gm)].map((match) => match[1]);
  };

  /** A `const NAME = [...] as const;` list, read out of rollup.ts. */
  const listOf = (name) => {
    const text = src('rollup.ts');
    const match = text.match(new RegExp(`const ${name} = \\[([^\\]]*)\\] as const;`));
    assert.ok(match, `${name} must still be a literal list in rollup.ts`);
    return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  };

  it('classifies every numeric field of a breakdown as a sum or a maximum', () => {
    const declared = fieldsOf('usage.ts', 'UsageBreakdown');
    const classified = new Set([...listOf('BREAKDOWN_SUM'), ...listOf('BREAKDOWN_MAX')]);
    assert.ok(declared.length > 10, 'the breakdown fields must have been read, not matched to nothing');
    const missing = declared.filter((field) => !classified.has(field));
    assert.deepEqual(
      missing,
      [],
      `unclassified breakdown fields would vanish from every merged bill: ${missing.join(', ')}`,
    );
  });

  it('classifies every counter of a coverage tally', () => {
    const declared = fieldsOf('usage.ts', 'FieldCoverage');
    const classified = new Set(listOf('COVERAGE_FIELDS'));
    assert.ok(declared.length > 4);
    const missing = declared.filter((field) => !classified.has(field));
    assert.deepEqual(missing, [], `unclassified coverage counters: ${missing.join(', ')}`);
  });

  it('would notice a field that stopped being classified', () => {
    // The guard above only ever sees a classified list, so it can never fire
    // on this repository's own source. Handed the known-bad shape directly, it
    // must.
    const declared = ['calls', 'aFieldNobodyClassified'];
    const classified = new Set(['calls']);
    assert.deepEqual(declared.filter((field) => !classified.has(field)), ['aFieldNobodyClassified']);
  });
});
