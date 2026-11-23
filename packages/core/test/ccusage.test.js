import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  PROVIDER_REVIEWED,
  SHAPE_COMMAND,
  ccusageCoverage,
  ccusageRecords,
  ccusageRowsCut,
  claudeCodeRecords,
  compareCcusage,
  looksLikeCcusage,
  parseUsageLine,
  profileUsage,
  receiptFrom,
  usageShapesOf,
} from '../dist/index.js';

/**
 * ccusage's JSON report, read as a usage log (#786).
 *
 * The fixtures are not written from a description of ccusage. Each is what
 * ccusage 20.0.51 printed when run on the two synthetic sessions beside them;
 * `fixtures/ccusage/README.md` has the version, the digests and the exact
 * commands. The same eleven turns appear in every report, cut by day, month
 * or session, focused on Claude Code or across every agent, so the bill of
 * every one of them is the same figure, worked out by hand below.
 *
 * Three faults this file exists to catch, each planted and seen to fail
 * before the pull request that added it: ccusage's dollar figure used to
 * price, a day's total counted as one call, and a project path written out.
 */

const FIXTURES = new URL('./fixtures/ccusage/', import.meta.url);
const read = (name) => readFileSync(new URL(name, FIXTURES), 'utf8');
const REPORTS = readdirSync(FIXTURES).filter((name) => name.endsWith('.json')).sort();
const SESSIONS = [
  'sessions/projects/-home-dana-acme-payroll/5b1d2c3e-0a4f-4c1e-9d2a-7e6f8a9b0c1d.jsonl',
  'sessions/projects/-home-dana-side-project/9c8b7a6f-5e4d-4c3b-8a29-1f0e9d8c7b6a.jsonl',
];

const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? 'figure'}: ${actual}, worked out by hand as ${expected}`);
const lines = (records) => records.map((record) => JSON.stringify(record)).join('\n');
const bill = (records) => profileUsage(lines(records), { catalogue: BUNDLED_CATALOGUE });

/*
  The figure, by hand, from the catalogue's rows (asserted below, so a price
  that moves fails here before it moves the answer). Per million tokens:

  claude-opus-5-5           $4 in, $20 out; cache read 0.05x = $0.20,
                            5-minute write 1.25x = $5, 1-hour write 2x;
                            fast mode $8 / $40, the same multipliers on top
  claude-sonnet-5-5         $2 in, $10 out; 5-minute write 1.25x = $2.50
  claude-sonnet-4-20250514  $3 in, $15 out, one rate at any length
  claude-haiku-5-5          $0.10 / $0.50 for a request up to 100,000 input
                            tokens, $0.50 / $2.50 over it
  claude-haiku-4-5          $1 in, $5 out (the report's id is its alias)
  claude-3-7-sonnet         not in the catalogue

  The records, as the daily report holds them:

  opus 5.5, 2026-10-31   1,500 in x $4 = 0.006, 2,300 out x $20 = 0.046,
                         20,000 5m writes x $5 = 0.1, 20,000 reads x $0.20 = 0.004
                                                                       = 0.156
  opus 5.5 fast, 11-02   2,000 in x $8 = 0.016, 1,000 out x $40 = 0.04,
                         10,000 1h writes x $16 = 0.16                 = 0.216
  opus 5.5, 11-02        500 in x $4 = 0.002, 2,000 out x $20 = 0.04,
                         10,000 reads x $0.20 = 0.002                  = 0.044
  sonnet 5.5, 11-02      4,000 in x $2 = 0.008, 600 out x $10 = 0.006,
                         8,000 5m writes x $2.50 = 0.02                = 0.034
  sonnet 4, 11-03        250,000 in x $3 = 0.75, 1,000 out x $15 = 0.015
                                                                       = 0.765
  haiku 5.5, 11-03       one row of 120,000 input tokens: three requests of
                         40,000, which the row does not say. Over the line, so
                         the dearer rate: 120,000 x $0.50 = 0.06,
                         1,500 out x $2.50 = 0.00375                   = 0.06375
                         and at the cheaper rate 0.012 + 0.00075       = 0.01275
  haiku 4.5, 11-03       3,000 in x $1 = 0.003, 200 out x $5 = 0.001  = 0.004
  sonnet 3.7, 11-03      unpriced, and out of the total

  Total: 0.156 + 0.216 + 0.044 + 0.034 + 0.765 + 0.06375 + 0.004 = 1.28275

  ccusage's own total for the same rows is 1.38625: it prices Sonnet 4's
  tokens past 200,000 at a long-context rate, Haiku 5.5 request by request,
  and Sonnet 3.7 at its own price.
*/
const HAND = {
  total: 1.28275,
  byName: {
    'claude-opus-5-5': 0.156 + 0.044,
    'claude-opus-5-5-fast': 0.216,
    'claude-sonnet-5-5': 0.034,
    'claude-sonnet-4-20250514': 0.765,
    'claude-haiku-5-5': 0.06375,
    'claude-haiku-4-5-20251001': 0.004,
  },
  haikuFloor: 0.01275,
};
const CCUSAGE_TOTAL = 1.38625;
const PATHS = ['-home-dana-acme-payroll', '-home-dana-side-project', 'acme-payroll', 'side-project', 'home-dana', '/home/dana'];
const SESSION_IDS = ['5b1d2c3e-0a4f-4c1e-9d2a-7e6f8a9b0c1d', '9c8b7a6f-5e4d-4c3b-8a29-1f0e9d8c7b6a'];

describe('the hand-worked figure rests on the catalogue as it stands', () => {
  it('reads the rates above from the catalogue, and the date they were read', () => {
    const row = (id) => BUNDLED_CATALOGUE.byId.get(id);
    const opus = row('claude-opus-5-5');
    assert.deepEqual([opus.inputPerMTok, opus.outputPerMTok], [4, 20]);
    assert.deepEqual([opus.multipliers.cacheRead, opus.multipliers.cacheWrite5m, opus.multipliers.cacheWrite1h], [0.05, 1.25, 2]);
    assert.deepEqual(opus.tiers.find((tier) => tier.id === 'fast'), { id: 'fast', when: { kind: 'speed', speed: 'fast' }, inputPerMTok: 8, outputPerMTok: 40 });
    const sonnet = row('claude-sonnet-5-5');
    assert.deepEqual([sonnet.inputPerMTok, sonnet.outputPerMTok, sonnet.multipliers.cacheWrite5m], [2, 10, 1.25]);
    const sonnet4 = row('claude-sonnet-4-20250514');
    assert.deepEqual([sonnet4.inputPerMTok, sonnet4.outputPerMTok, sonnet4.tiers], [3, 15, undefined]);
    const haiku = row('claude-haiku-5-5');
    assert.deepEqual([haiku.inputPerMTok, haiku.outputPerMTok], [0.1, 0.5]);
    assert.deepEqual(haiku.tiers[0].when, { kind: 'input-tokens-above', tokens: 100_000 });
    assert.deepEqual([haiku.tiers[0].inputPerMTok, haiku.tiers[0].outputPerMTok], [0.5, 2.5]);
    const haiku45 = row('claude-haiku-4-5-20251001');
    assert.deepEqual([haiku45.id, haiku45.inputPerMTok, haiku45.outputPerMTok], ['claude-haiku-4-5', 1, 5]);
    assert.equal(row('claude-3-7-sonnet-20250219'), undefined);
    assert.equal(PROVIDER_REVIEWED.anthropic, '2026-11-16');
  });
});

describe('every report ccusage wrote is claimed, and by nothing else', () => {
  it('has the fixtures it says it has', () => {
    assert.deepEqual(REPORTS, [
      'claude-daily-instances.json',
      'claude-daily-no-cost.json',
      'claude-daily.json',
      'claude-monthly.json',
      'claude-session.json',
      'claude-weekly.json',
      'daily-sections.json',
      'daily.json',
      'monthly.json',
      'session.json',
      'weekly.json',
    ]);
  });

  for (const name of REPORTS) {
    it(`${name} is ccusage's, and from-ccusage is what reads it`, () => {
      const text = read(name);
      assert.equal(looksLikeCcusage(text), true);
      assert.deepEqual(usageShapesOf(text), ['ccusage']);
    });
  }

  it('names a command that exists for the reasons', () => {
    assert.equal(SHAPE_COMMAND.ccusage, 'from-ccusage');
  });

  it('claims no Claude Code session, which it was written from', () => {
    for (const session of SESSIONS) assert.equal(looksLikeCcusage(read(session)), false);
  });
});

describe('the fixture prices to the figure worked out by hand', () => {
  const kinds = {
    'claude-daily-instances.json': ['daily', 4, false],
    'claude-daily-no-cost.json': ['daily', 3, false],
    'claude-daily.json': ['daily', 3, false],
    'claude-monthly.json': ['monthly', 2, false],
    'claude-session.json': ['session', 2, false],
    'claude-weekly.json': ['weekly', 2, false],
    'daily-sections.json': ['daily', 3, true],
    'daily.json': ['daily', 3, true],
    'monthly.json': ['monthly', 2, true],
    'session.json': ['session', 2, true],
    'weekly.json': ['weekly', 2, true],
  };
  for (const name of REPORTS) {
    it(`${name}: ${HAND.total}, whichever way ccusage cut the same turns`, () => {
      const conversion = ccusageRecords(read(name));
      const [report, rows, unified] = kinds[name];
      assert.equal(conversion.unparseable, 0);
      assert.equal(conversion.report, report);
      assert.equal(conversion.rows, rows);
      assert.equal(conversion.unified, unified);
      const priced = bill(conversion.records);
      near(priced.total.totalUsd, HAND.total, `${name} total`);
      assert.deepEqual(priced.unpricedModels, ['claude-3-7-sonnet-20250219']);
      assert.equal(priced.skippedLines.length, 0, 'a record the converter wrote did not parse');
    });
  }

  it('prices each model as worked out, beside what ccusage said for it', () => {
    const rows = compareCcusage(ccusageRecords(read('claude-daily.json')));
    const by = Object.fromEntries(rows.map((row) => [row.name, row]));
    for (const [name, usd] of Object.entries(HAND.byName)) near(by[name].trazumUsd, usd, name);
    near(by['claude-haiku-5-5'].trazumFloorUsd, HAND.haikuFloor, 'Haiku 5.5 at the cheaper rate');
    for (const row of rows) if (row.trazumUsd !== null) assert.equal(row.reviewedOn, '2026-11-16', row.name);
    // ccusage's figures as it printed them, on their own side.
    near(by['claude-sonnet-4-20250514'].ccusageUsd, 0.9149999999999999, 'ccusage on Sonnet 4');
    near(by['claude-haiku-5-5'].ccusageUsd, 0.012750000000000001, 'ccusage on Haiku 5.5');
    near(by['claude-3-7-sonnet-20250219'].ccusageUsd, 0.0045000000000000005, 'ccusage on Sonnet 3.7');
    near(by['claude-sonnet-4-20250514'].differenceUsd, 0.765 - 0.9149999999999999, 'the difference on Sonnet 4');
    // Where both agree, they are said to.
    assert.deepEqual(
      rows.filter((row) => row.agrees).map((row) => row.name).sort(),
      ['claude-haiku-4-5-20251001', 'claude-opus-5-5', 'claude-opus-5-5-fast', 'claude-sonnet-5-5'],
    );
  });

  it('agrees with the bill of the sessions themselves, model by model, except where a row cannot say', () => {
    const perCall = bill(SESSIONS.flatMap((session) => claudeCodeRecords(read(session), {}).records));
    const fromReport = bill(ccusageRecords(read('claude-daily.json')).records);
    const usd = (report) => Object.fromEntries(report.byModel.map((row) => [row.model, row.breakdown.totalUsd]));
    const calls = usd(perCall);
    const rows = usd(fromReport);
    for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001']) {
      near(rows[model], calls[model], model);
    }
    // The three Haiku 5.5 requests were each under the line: what the row's floor says.
    near(calls['claude-haiku-5-5'], HAND.haikuFloor, 'Haiku 5.5, request by request');
    near(rows['claude-haiku-5-5'], HAND.byName['claude-haiku-5-5'], 'Haiku 5.5, from the row');
  });
});

describe("ccusage's dollar figure is never used to price", () => {
  it('writes no dollar figure into a record', () => {
    for (const name of REPORTS) {
      for (const record of ccusageRecords(read(name)).records) {
        assert.deepEqual(Object.keys(record).filter((key) => !['model', 'ts', 'label', 'requests', 'usage'].includes(key)), [], name);
        assert.doesNotMatch(JSON.stringify(record), /cost|usd/i, name);
      }
    }
  });

  it('bills the catalogue figure, not the report total ccusage printed', () => {
    const conversion = ccusageRecords(read('claude-daily.json'));
    near(conversion.reportedUsd, CCUSAGE_TOTAL, "ccusage's total, as it printed it");
    near(bill(conversion.records).total.totalUsd, HAND.total);
  });

  it('prices the same with ccusage --no-cost, which prints no dollar figure at all', () => {
    const conversion = ccusageRecords(read('claude-daily-no-cost.json'));
    assert.equal(conversion.reportedUsd, null);
    const rows = compareCcusage(conversion);
    assert.ok(rows.every((row) => row.ccusageUsd === null && row.differenceUsd === null && !row.agrees));
    near(bill(conversion.records).total.totalUsd, HAND.total);
  });

  it('leaves a model the catalogue does not price unpriced, never at ccusage figure', () => {
    const row = compareCcusage(ccusageRecords(read('claude-daily.json'))).find((r) => r.name === 'claude-3-7-sonnet-20250219');
    assert.equal(row.trazumUsd, null);
    assert.equal(row.reviewedOn, null);
    assert.equal(row.differenceUsd, null);
  });
});

describe('a row is a total, never a call', () => {
  it('says every record sums requests it does not count', () => {
    for (const name of REPORTS) {
      const { records } = ccusageRecords(read(name));
      assert.ok(records.length > 0, name);
      for (const record of records) {
        assert.equal(record.requests, null, `${name}: a row was written as one call`);
        assert.equal(parseUsageLine(JSON.stringify(record)).requests, null, `${name}: the log reader took it as one call`);
      }
    }
  });

  it('bills the Haiku 5.5 day at the dearer rate and says so, because a day is not one prompt', () => {
    const conversion = ccusageRecords(read('claude-daily.json'));
    const receipt = receiptFrom(bill(conversion.records), BUNDLED_CATALOGUE);
    const ceiling = receipt.gaps.find((gap) => gap.kind === 'tier-ceiling');
    assert.ok(ceiling, 'the row was priced as if it were one request of 120,000 tokens');
    assert.deepEqual(ceiling.models, ['claude-haiku-5-5']);
    near(ceiling.ceilingUsd, HAND.byName['claude-haiku-5-5']);
    near(ceiling.floorUsd, HAND.haikuFloor);
  });

  it('carries no session, so no session reads as one turn the size of its whole', () => {
    for (const name of ['claude-session.json', 'session.json']) {
      for (const record of ccusageRecords(read(name)).records) assert.equal(parseUsageLine(JSON.stringify(record)).session, null, name);
    }
  });

  it('dates a session at its last activity, and counts the ones that ran across days', () => {
    const conversion = ccusageRecords(read('claude-session.json'));
    assert.deepEqual([...new Set(conversion.records.map((record) => record.ts))].sort(), ['2026-11-02T10:10:00.000Z', '2026-11-03T11:00:00.000Z']);
    assert.equal(conversion.sessionsAcrossDays, 2);
    // The unified session report keeps only the last activity, in metadata.
    assert.deepEqual([...new Set(ccusageRecords(read('session.json')).records.map((record) => record.ts))].sort(), ['2026-11-02T10:10:00.000Z', '2026-11-03T11:00:00.000Z']);
  });

  it('dates a week at its start, Sunday in the focused report and Monday in the one across every agent', () => {
    assert.deepEqual([...new Set(ccusageRecords(read('claude-weekly.json')).records.map((r) => r.ts))], ['2026-10-25T00:00:00.000Z', '2026-11-01T00:00:00.000Z']);
    assert.deepEqual([...new Set(ccusageRecords(read('weekly.json')).records.map((r) => r.ts))], ['2026-10-26T00:00:00.000Z', '2026-11-02T00:00:00.000Z']);
  });

  it('dates a day or a month at its start', () => {
    assert.deepEqual([...new Set(ccusageRecords(read('claude-daily.json')).records.map((r) => r.ts))], ['2026-10-31T00:00:00.000Z', '2026-11-02T00:00:00.000Z', '2026-11-03T00:00:00.000Z']);
    assert.deepEqual([...new Set(ccusageRecords(read('monthly.json')).records.map((r) => r.ts))].sort(), ['2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z']);
  });
});

describe('a project path never crosses unless the person labels it', () => {
  it('has reports that name projects, so the guard below is watching something', () => {
    for (const name of ['claude-daily-instances.json', 'claude-session.json']) {
      for (const path of ['-home-dana-acme-payroll', '-home-dana-side-project']) assert.ok(read(name).includes(path), `${name} names no ${path}`);
    }
  });

  for (const name of REPORTS) {
    it(`${name}: no project folder and no session id in anything the conversion returns`, () => {
      const out = JSON.stringify(ccusageRecords(read(name)));
      for (const path of [...PATHS, ...SESSION_IDS]) assert.ok(!out.includes(path), `${name} leaked ${path}`);
    });
  }

  it('labels the rows a rule names with the label the person wrote, and only those', () => {
    const rules = [{ project: '-home-dana-acme-payroll', label: 'payroll' }];
    for (const [name, labelled, unruled] of [['claude-daily-instances.json', 2, 2], ['claude-session.json', 1, 1]]) {
      const conversion = ccusageRecords(read(name), { labelByProject: rules });
      assert.equal(conversion.labelledByProject, labelled, name);
      assert.equal(conversion.unruledProject, unruled, name);
      const labels = new Set(conversion.records.map((record) => record.label));
      assert.deepEqual([...labels].sort(), ['payroll', undefined].sort(), name);
      const out = JSON.stringify(conversion);
      for (const path of PATHS) assert.ok(!out.includes(path), `${name} leaked ${path} with a rule given`);
    }
  });

  it('falls back to --label for a project no rule names', () => {
    const conversion = ccusageRecords(read('claude-daily-instances.json'), {
      label: 'mine',
      labelByProject: [{ project: '-home-dana-side-project', label: 'side' }],
    });
    assert.deepEqual([...new Set(conversion.records.map((record) => record.label))].sort(), ['mine', 'side']);
  });

  it('says a mapping did nothing when the report names no project', () => {
    const conversion = ccusageRecords(read('claude-daily.json'), { labelByProject: [{ project: '-home-dana-acme-payroll', label: 'payroll' }] });
    assert.equal(conversion.projectNotGrouped, true);
    assert.ok(conversion.records.every((record) => record.label === undefined));
  });
});

describe('what the report says, read the way ccusage wrote it', () => {
  it('reads a -fast name as fast mode on the model, with the 1-hour writes split out', () => {
    const fast = ccusageRecords(read('claude-daily.json')).records.find((record) => record.usage.speed === 'fast');
    assert.deepEqual(fast, {
      model: 'claude-opus-5-5',
      ts: '2026-11-02T00:00:00.000Z',
      requests: null,
      usage: {
        input_tokens: 2000,
        output_tokens: 1000,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 10000,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 10000 },
        speed: 'fast',
      },
    });
  });

  it('leaves out a -fast model with no fast rate, rather than price it at the standard one', () => {
    const text = read('claude-daily.json').replaceAll('"claude-sonnet-5-5"', '"claude-sonnet-5-5-fast"');
    const conversion = ccusageRecords(text);
    assert.equal(conversion.fastUnpriced, 1);
    assert.deepEqual(conversion.fastUnpricedModels, ['claude-sonnet-5-5-fast']);
    assert.ok(!conversion.records.some((record) => record.model === 'claude-sonnet-5-5'));
  });

  it('assumes nothing about a write lifetime ccusage did not give', () => {
    const text = read('claude-daily.json').replaceAll(/"cacheCreation1hTokens": \d+,\n\s*/g, '');
    const conversion = ccusageRecords(text);
    assert.equal(conversion.writeTtlUnsplit, 3);
    assert.ok(conversion.records.every((record) => record.usage.cache_creation === undefined));
    assert.equal(bill(conversion.records).total.assumedWriteTtlCalls, 3);
  });

  it('reads one report of several, and names the others it did not add', () => {
    const conversion = ccusageRecords(read('daily-sections.json'));
    assert.equal(conversion.report, 'daily');
    assert.deepEqual(conversion.sectionsLeftAside, ['monthly', 'session']);
    near(bill(conversion.records).total.totalUsd, HAND.total, 'three reports of one usage, counted once');
  });

  it('names the agents a report across every agent read', () => {
    assert.deepEqual(ccusageRecords(read('daily.json')).agents, ['claude']);
    assert.deepEqual(ccusageRecords(read('claude-daily.json')).agents, []);
  });

  it('counts what it cannot read instead of pricing it as nothing', () => {
    const report = JSON.parse(read('claude-daily.json'));
    report.daily[0].modelBreakdowns.push({ modelName: '', inputTokens: 5, outputTokens: 5, cacheCreationTokens: 0, cacheReadTokens: 0, cost: 0 });
    report.daily[1].modelBreakdowns[0].inputTokens = 1.5;
    report.daily.push({ date: 'yesterday', inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 2, totalCost: 0, modelsUsed: [], modelBreakdowns: [] });
    report.daily.push({ date: '2026-11-04', inputTokens: 7, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 10, totalCost: 0, modelsUsed: [], modelBreakdowns: [] });
    const conversion = ccusageRecords(JSON.stringify(report));
    assert.equal(conversion.unnamedModel, 1);
    assert.equal(conversion.unreadable, 1);
    assert.equal(conversion.undatedRows, 1);
    assert.equal(conversion.rowsWithoutBreakdown, 1);
    assert.equal(conversion.unsplitTokens, 2, 'totalTokens beyond the four counts');
  });

  it('refuses what is not a ccusage report', () => {
    for (const text of ['not json', '[]', '{"data": []}', '{"totals": {}}']) {
      assert.equal(ccusageRecords(text).unparseable, 1, text);
      assert.equal(ccusageRecords(text).records.length, 0, text);
    }
  });
});

/*
  A row is a total over a stretch of time and does not say how it was spread
  across it. A bill reads each record's date as an instant, so a window edge or
  a split by day, week or month inside a row would bill the whole row on one
  side of it: a month on its first day. The spans say what each row covers, and
  `ccusageRowsCut` finds the rows a cut falls inside, for the bill to refuse.
*/
describe('a row covers its whole period, and a cut inside one is found', () => {
  const at = (iso) => Date.parse(iso);
  const spansOf = (name) => ccusageRecords(read(name)).spans;

  it('spans a day, a week and a month from its start to the start of the next', () => {
    assert.deepEqual(spansOf('claude-monthly.json'), [
      { fromMs: at('2026-10-01T00:00:00Z'), toMs: at('2026-11-01T00:00:00Z'), atMs: at('2026-10-01T00:00:00Z') },
      { fromMs: at('2026-11-01T00:00:00Z'), toMs: at('2026-12-01T00:00:00Z'), atMs: at('2026-11-01T00:00:00Z') },
    ]);
    assert.deepEqual(spansOf('claude-weekly.json').map((span) => [span.fromMs, span.toMs]), [
      [at('2026-10-25T00:00:00Z'), at('2026-11-01T00:00:00Z')],
      [at('2026-11-01T00:00:00Z'), at('2026-11-08T00:00:00Z')],
    ]);
    assert.deepEqual(spansOf('claude-daily.json').map((span) => span.toMs - span.fromMs), [86_400_000, 86_400_000, 86_400_000]);
  });

  it('spans a session from its first activity to its last, and knows when the start is not given', () => {
    assert.deepEqual(spansOf('claude-session.json').map((span) => [span.fromMs, span.atMs]).sort((a, b) => a[1] - b[1]), [
      [at('2026-10-31T09:00:00Z'), at('2026-11-02T10:10:00Z')],
      [at('2026-11-02T14:00:00Z'), at('2026-11-03T11:00:00Z')],
    ]);
    // The report across every agent names a session's last activity only.
    assert.ok(spansOf('session.json').every((span) => span.fromMs === null));
  });

  it('finds a window edge inside a month, and none on its edges', () => {
    const spans = spansOf('claude-monthly.json');
    assert.deepEqual(ccusageRowsCut(spans, { sinceMs: at('2026-11-01T00:00:00Z'), untilMs: at('2026-11-06T00:00:00Z') }), { rows: 1, startUnknown: 0 });
    assert.deepEqual(ccusageRowsCut(spans, { sinceMs: at('2026-11-10T00:00:00Z') }), { rows: 1, startUnknown: 0 });
    assert.deepEqual(ccusageRowsCut(spans, { sinceMs: at('2026-11-01T00:00:00Z'), untilMs: at('2026-12-01T00:00:00Z') }), { rows: 0, startUnknown: 0 });
    // A day's edges never fall inside a day.
    assert.equal(ccusageRowsCut(spansOf('claude-daily.json'), { sinceMs: at('2026-11-02T00:00:00Z'), untilMs: at('2026-11-03T00:00:00Z') }).rows, 0);
  });

  it('finds a split by day, week or month that a row would not fit inside', () => {
    assert.equal(ccusageRowsCut(spansOf('claude-monthly.json'), { unit: 'day' }).rows, 2);
    assert.equal(ccusageRowsCut(spansOf('claude-monthly.json'), { unit: 'week' }).rows, 2);
    assert.equal(ccusageRowsCut(spansOf('claude-monthly.json'), { unit: 'month' }).rows, 0);
    // Sunday to Saturday is never one ISO week, which runs Monday to Sunday.
    assert.equal(ccusageRowsCut(spansOf('claude-weekly.json'), { unit: 'week' }).rows, 2);
    assert.equal(ccusageRowsCut(spansOf('weekly.json'), { unit: 'week' }).rows, 0);
    // The week of 2026-10-26 ends on 2026-11-01.
    assert.equal(ccusageRowsCut(spansOf('weekly.json'), { unit: 'month' }).rows, 1);
    assert.equal(ccusageRowsCut(spansOf('claude-daily.json'), { unit: 'day' }).rows, 0);
    // Both sessions ran across midnight.
    assert.equal(ccusageRowsCut(spansOf('claude-session.json'), { unit: 'day' }).rows, 2);
  });

  it('counts a session whose start is not known as cut by any edge at or before its end', () => {
    assert.deepEqual(ccusageRowsCut(spansOf('session.json'), { sinceMs: at('2026-11-01T00:00:00Z') }), { rows: 2, startUnknown: 2 });
    assert.deepEqual(ccusageRowsCut(spansOf('session.json'), { sinceMs: at('2026-11-04T00:00:00Z') }), { rows: 0, startUnknown: 0 });
    assert.deepEqual(ccusageRowsCut(spansOf('session.json'), { unit: 'month' }), { rows: 2, startUnknown: 2 });
  });

  it('covers from the first row start to the last moment of the last row, inside a window', () => {
    assert.deepEqual(ccusageCoverage(spansOf('claude-monthly.json')), { fromMs: at('2026-10-01T00:00:00Z'), toMs: at('2026-12-01T00:00:00Z') - 1 });
    assert.deepEqual(
      ccusageCoverage(spansOf('claude-monthly.json'), { sinceMs: at('2026-11-01T00:00:00Z'), untilMs: at('2026-12-01T00:00:00Z') }),
      { fromMs: at('2026-11-01T00:00:00Z'), toMs: at('2026-12-01T00:00:00Z') - 1 },
    );
    assert.equal(ccusageCoverage(spansOf('claude-monthly.json'), { sinceMs: at('2027-01-01T00:00:00Z') }), null);
  });

  it('returns no span for a row that became no record', () => {
    const report = JSON.parse(read('claude-daily.json'));
    for (const breakdown of report.daily[0].modelBreakdowns) {
      breakdown.inputTokens = 0;
      breakdown.outputTokens = 0;
      breakdown.cacheCreationTokens = 0;
      breakdown.cacheReadTokens = 0;
    }
    const conversion = ccusageRecords(JSON.stringify(report));
    assert.equal(conversion.spans.length, 2);
    assert.ok(conversion.spans.every((span) => span.atMs > at('2026-10-31T00:00:00Z')));
  });
});
