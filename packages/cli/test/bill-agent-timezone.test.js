import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * `bill --agent` and `bill --timezone` (#826).
 *
 * Every call here is Sonnet 5.5 at $2 per million input tokens with no output,
 * so a call of 1,000,000 tokens is $2.00, of 500,000 $1.00 and of 250,000 $0.50.
 *
 * The clock fixture, with the day each call falls on in UTC and in Madrid
 * (CET, UTC+1, in November; CEST, UTC+2, in October):
 *
 *   2026-10-31T23:30:00Z  $0.50  UTC 2026-10-31, Madrid 2026-11-01 (a month apart)
 *   2026-11-18T23:30:00Z  $2.00  UTC 2026-11-18, Madrid 2026-11-19
 *   2026-11-19T10:00:00Z  $1.00  UTC 2026-11-19, Madrid 2026-11-19
 *   2026-11-19T23:30:00Z  $0.50  UTC 2026-11-19, Madrid 2026-11-20
 *   2026-11-22T23:30:00Z  $0.50  UTC Sunday 2026-11-22 (ISO 2026-W47), Madrid Monday 2026-11-23 (2026-W48)
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const GEMINI_EXAMPLE = new URL('../../../examples/gemini-tmp', import.meta.url).pathname;
const CLAUDE_EXAMPLE = new URL('../../../examples/claude-projects', import.meta.url).pathname;
const GOLDEN = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const run = (args, env = {}) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, TRAZUM_LOCALE: 'en', CLAUDE_CONFIG_DIR: '', CODEX_HOME: '', GEMINI_CLI_HOME: '', ...env },
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });
const flat = (text) => text.replace(/\s+/g, ' ');

const call = (ts, input) =>
  JSON.stringify({ ts, model: 'claude-sonnet-5-5', usage: { input_tokens: input, output_tokens: 0 } });
const CLOCK = [
  call('2026-10-31T23:30:00Z', 250_000),
  call('2026-11-18T23:30:00Z', 1_000_000),
  call('2026-11-19T10:00:00Z', 500_000),
  call('2026-11-19T23:30:00Z', 250_000),
  call('2026-11-22T23:30:00Z', 250_000),
];

function scratch(lines) {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-zone-'));
  const path = join(dir, 'usage.jsonl');
  writeFileSync(path, lines.join('\n'));
  return path;
}

/** The `calls` and dollars of a statement row, or `undefined` when the period has none. */
const row = (text, period) => {
  const found = new RegExp(`^\\s*${period}\\s+(\\d+)\\s+\\$(\\d+\\.\\d+)`, 'm').exec(text);
  return found === null ? undefined : [found[1], found[2]];
};
const statement = (path, ...more) => {
  const result = run(['bill', path, '--table', ...more]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

describe('bill --timezone cuts days in the zone asked for', () => {
  it('puts a call at 23:30 UTC on the next day in Madrid', () => {
    const path = scratch(CLOCK);
    const utc = statement(path, '--by', 'day');
    assert.deepEqual(row(utc, '2026-11-18'), ['1', '2.00']);
    assert.deepEqual(row(utc, '2026-11-19'), ['2', '1.50']);
    const madrid = statement(path, '--by', 'day', '--timezone', 'Europe/Madrid');
    assert.equal(row(madrid, '2026-11-18'), undefined, 'the call at 23:30 UTC stayed on the UTC day');
    assert.deepEqual(row(madrid, '2026-11-19'), ['2', '3.00']);
    assert.deepEqual(row(madrid, '2026-11-20'), ['1', '0.5000']);
    assert.match(flat(madrid), /Days are cut in Europe\/Madrid, not UTC/);
  });

  it('cuts weeks and months there too, not only days', () => {
    const path = scratch(CLOCK);
    // Sunday 23:30 UTC is Monday in Madrid: the next ISO week.
    const utcWeeks = statement(path, '--by', 'week');
    assert.deepEqual(row(utcWeeks, '2026-W47'), ['4', '4.00']);
    const madridWeeks = statement(path, '--by', 'week', '--timezone', 'Europe/Madrid');
    assert.deepEqual(row(madridWeeks, '2026-W47'), ['3', '3.50']);
    assert.deepEqual(row(madridWeeks, '2026-W48'), ['1', '0.5000']);
    // 23:30 UTC on 31 October is already 1 November in Madrid.
    const utcMonths = statement(path, '--by', 'month');
    assert.deepEqual(row(utcMonths, '2026-10'), ['1', '0.5000']);
    const madridMonths = statement(path, '--by', 'month', '--timezone', 'Europe/Madrid');
    assert.equal(row(madridMonths, '2026-10'), undefined, 'the October call stayed in October');
    assert.deepEqual(row(madridMonths, '2026-11'), ['5', '4.50']);
  });

  it('reads a bare --since and --until day as a day of that zone', () => {
    const path = scratch(CLOCK);
    const bill = (...more) => {
      const result = run(['bill', path, '--receipt', '--since', '2026-11-19', '--until', '2026-11-19', ...more]);
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout).total;
    };
    // UTC: the 10:00 call and the 23:30 call. Madrid: the one of the evening before, and the 10:00 one.
    assert.deepEqual([bill().calls, bill().usd], [2, 1.5]);
    assert.deepEqual([bill('--timezone', 'Europe/Madrid').calls, bill('--timezone', 'Europe/Madrid').usd], [2, 3]);
  });

  it('knows a day that is 25 hours long, and that a zone is not a fixed offset', () => {
    // New York turns its clocks back on 2026-11-01: that day runs 04:00Z to 05:00Z the next day.
    const path = scratch([
      call('2026-11-01T03:59:00Z', 500_000),
      call('2026-11-01T04:00:00Z', 500_000),
      call('2026-11-02T04:59:00Z', 500_000),
      call('2026-11-02T05:00:00Z', 500_000),
    ]);
    const result = run(['bill', path, '--receipt', '--since', '2026-11-01', '--until', '2026-11-01', '--timezone', 'America/New_York']);
    assert.equal(result.status, 0, result.stderr);
    // 03:59Z is still 31 October at 23:59 EDT, and 05:00Z on the 2nd is 00:00 EST on the 2nd.
    assert.equal(JSON.parse(result.stdout).total.calls, 2);
  });

  it('names the zone, and cuts the span line in it', () => {
    const path = scratch(CLOCK);
    const out = flat(statement(path, '--by', 'day', '--timezone', 'europe/madrid'));
    assert.match(out, /Days are cut in Europe\/Madrid/, 'the spelling the platform gave the zone was not used');
    // The first call is 2026-10-31T23:30Z: 1 November in Madrid.
    assert.match(out, /This log covers 2026-11-01 → 2026-11-23/);
    assert.match(out, /Add --timezone Europe\/Madrid to bill it on the same days/);
  });

  it('UTC given by name is the default, byte for byte, but for the line that says so', () => {
    const path = scratch(CLOCK);
    const plain = statement(path, '--by', 'day');
    const named = statement(path, '--by', 'day', '--timezone', 'UTC');
    const withoutNotes = (text) =>
      flat(text)
        .replace(/Days are cut in .*? every row above\./, '')
        .replace(/Add --timezone \S+ to bill it on the same days\./, '')
        .replace(/\s+/g, ' ');
    assert.equal(withoutNotes(named), flat(plain));
  });

  it('is refused by name when the zone does not exist', () => {
    const path = scratch(CLOCK);
    const result = run(['bill', path, '--timezone', 'Nowhere/City']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--timezone does not know "Nowhere\/City"/);
    assert.equal(result.stdout, '', 'a bill was printed for a zone that does not exist');
  });

  it('is refused beside every output that cuts its days in UTC, and beside --git-range', () => {
    const path = scratch(CLOCK);
    const out = join(mkdtempSync(join(tmpdir(), 'trazum-bill-zone-out-')), 'file');
    for (const args of [
      ['--otlp-out', out],
      ['--markdown-out', out],
      ['--html-out', out],
      ['--pdf-out', out],
      ['--csv-out', out, '--csv-shape', 'day'],
    ]) {
      const result = run(['bill', path, '--timezone', 'Europe/Madrid', ...args]);
      assert.equal(result.status, 1, `${args[0]} was combined with --timezone`);
      assert.match(result.stderr, /--timezone cuts the statement's days in that zone/);
      assert.ok(result.stderr.includes(args[0]), `the refusal does not name ${args[0]}`);
    }
    const range = run(['bill', path, '--timezone', 'Europe/Madrid', '--git-range', 'main..HEAD']);
    assert.equal(range.status, 1);
    assert.match(range.stderr, /--git-range sets the period itself.*--timezone/);
  });

  it('combines with --receipt, where it only decides what a bare day means', () => {
    const path = scratch(CLOCK);
    const result = run(['bill', path, '--receipt', '--timezone', 'Europe/Madrid']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result.stderr), /--timezone Europe\/Madrid: the receipt holds instants and no day/);
    assert.equal(JSON.parse(result.stdout).total.calls, 5);
    // The csv with its default shape holds no day.
    const csv = run(['bill', path, '--timezone', 'Europe/Madrid', '--csv-out', join(mkdtempSync(join(tmpdir(), 'trazum-bill-zone-csv-')), 'bill.csv')]);
    assert.equal(csv.status, 0, csv.stderr);
  });

  it('says it in Spanish too', () => {
    const path = scratch(CLOCK);
    const result = run(['bill', path, '--timezone', 'Nowhere/City'], { TRAZUM_LOCALE: 'es' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--timezone no conoce "Nowhere\/City"/);
    const shown = run(['bill', path, '--table', '--timezone', 'Europe/Madrid'], { TRAZUM_LOCALE: 'es' });
    assert.match(flat(shown.stdout), /Los días se cortan en Europe\/Madrid/);
  });
});

describe('a bill without the new flags is what it was', () => {
  // The fixture and the three statements were captured before the flags existed.
  const fixture = () =>
    scratch([
      call('2026-11-18T23:30:00Z', 1_000_000),
      call('2026-11-19T10:00:00Z', 500_000),
      call('2026-11-22T22:30:00Z', 250_000),
    ]);

  for (const unit of ['day', 'week', 'month']) {
    it(`prints --by ${unit} byte for byte`, () => {
      assert.equal(statement(fixture(), '--by', unit), GOLDEN(`bill-default-${unit}.statement.txt`));
    });
  }

  it('gains no field on the receipt', () => {
    const result = run(['bill', fixture(), '--receipt']);
    assert.deepEqual(Object.keys(JSON.parse(result.stdout)), ['schemaVersion', 'emittedAt', 'span', 'counting', 'lines', 'total', 'gaps']);
  });
});

const codexCount = { input_tokens: 100_000, cached_input_tokens: 40_000, output_tokens: 2_000, reasoning_output_tokens: 500, total_tokens: 102_000 };
const codexRollout = [
  { type: 'session_meta', payload: { id: 'synthetic-codex', cwd: 'SYNTHETIC_PRIVATE_PATH' } },
  { type: 'turn_context', payload: { model: 'gpt-5-mini', instructions: 'SYNTHETIC_SECRET' } },
  { timestamp: '2026-10-22T10:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: codexCount, last_token_usage: codexCount } } },
].map((entry) => JSON.stringify(entry)).join('\n');

/** A home with all three agents' folders: Claude Code's example, one Codex call and Gemini CLI's three. */
function home() {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-agent-flag-'));
  cpSync(CLAUDE_EXAMPLE, join(dir, '.claude', 'projects'), { recursive: true });
  const day = join(dir, '.codex', 'sessions', '2026', '10', '22');
  mkdirSync(day, { recursive: true });
  writeFileSync(join(day, 'rollout-2026-10-22T10-00-00-synthetic.jsonl'), codexRollout);
  cpSync(GEMINI_EXAMPLE, join(dir, '.gemini', 'tmp'), { recursive: true });
  return dir;
}
const receiptOf = (args, env) => {
  const result = run(['bill', ...args, '--receipt'], env);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

describe('bill --agent keeps the records of one agent', () => {
  it('bills each agent alone, and the three add up to the whole', () => {
    const dir = home();
    try {
      const env = { HOME: dir };
      const whole = receiptOf([], env).total;
      const claude = receiptOf(['--agent', 'claude-code'], env).total;
      const codex = receiptOf(['--agent', 'codex'], env).total;
      const gemini = receiptOf(['--agent', 'gemini-cli'], env).total;
      assert.equal(codex.calls, 1, 'Codex had one call');
      assert.equal(gemini.calls, 3, 'Gemini CLI had three replies');
      assert.equal(claude.calls, receiptOf([CLAUDE_EXAMPLE]).total.calls, 'the Claude Code part is not what its folder bills alone');
      assert.equal(claude.calls + codex.calls + gemini.calls, whole.calls);
      assert.ok(Math.abs(claude.usd + codex.usd + gemini.usd - whole.usd) < 1e-9, 'the agents do not add up to the bill');
      assert.ok(codex.usd > 0 && gemini.usd > 0 && claude.usd > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints the one agent in the statement, with no By agent table, and says what it left out', () => {
    const dir = home();
    try {
      const result = run(['bill', '--table', '--agent', 'codex'], { HOME: dir });
      assert.equal(result.status, 0, result.stderr);
      assert.match(flat(result.stdout), /gpt-5-mini 1 \$/);
      assert.doesNotMatch(result.stdout, /^\s*agent\s+calls/m);
      assert.doesNotMatch(result.stdout, /gemini-2\.5|claude-/, 'another agent was billed');
      assert.match(flat(result.stderr), /--agent: only Codex's 1 record\(s\) are billed; \d+ record\(s\) of other agents or sources are left out/);
      assert.doesNotMatch(result.stderr, /importEvidence/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('takes the name the bill prints, in any case', () => {
    const dir = home();
    try {
      const byId = receiptOf(['--agent', 'gemini-cli'], { HOME: dir }).total;
      const byName = receiptOf(['--agent', 'Gemini CLI'], { HOME: dir }).total;
      assert.deepEqual(byName, byId);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps Codex import evidence off a receipt of another agent', () => {
    const dir = home();
    try {
      assert.ok(receiptOf(['--agent', 'codex'], { HOME: dir }).importEvidence, 'the Codex receipt lost its evidence');
      assert.equal(receiptOf(['--agent', 'gemini-cli'], { HOME: dir }).importEvidence, undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves a plain log out, since it belongs to no agent', () => {
    const path = scratch(CLOCK);
    const result = run(['bill', path, '--agent', 'claude-code']);
    assert.equal(result.status, 1);
    assert.match(flat(result.stderr), /--agent Claude Code found no record of that agent among what was read/);
  });

  it('refuses an agent it does not know, by name, listing the ones it does', () => {
    const path = scratch(CLOCK);
    const result = run(['bill', path, '--agent', 'cursor']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--agent does not know "cursor"\. The agents it names are claude-code, codex, gemini-cli\./);
    assert.equal(result.stdout, '');
  });

  it('is refused beside --git-range, and says it in Spanish', () => {
    const range = run(['bill', '--agent', 'codex', '--git-range', 'main..HEAD']);
    assert.equal(range.status, 1);
    assert.match(range.stderr, /--git-range sets the period itself.*--agent/);
    const es = run(['bill', scratch(CLOCK), '--agent', 'cursor'], { TRAZUM_LOCALE: 'es' });
    assert.equal(es.status, 1);
    assert.match(es.stderr, /--agent no conoce "cursor"/);
  });

  it('narrows the OTLP file to the same agent', () => {
    const dir = home();
    try {
      const out = join(dir, 'metrics.json');
      const result = run(['bill', '--receipt', '--agent', 'codex', '--otlp-out', out], { HOME: dir });
      assert.equal(result.status, 0, result.stderr);
      const text = readFileSync(out, 'utf8');
      assert.match(text, /"Codex"/);
      assert.doesNotMatch(text, /"Claude Code"|"Gemini CLI"/);
      // A plain log read beside the Codex folder belongs to no agent: it is not in the file either.
      const plain = run(['bill', join(dir, '.codex'), scratch(CLOCK), '--receipt', '--agent', 'codex', '--otlp-out', out]);
      assert.equal(plain.status, 0, plain.stderr);
      assert.doesNotMatch(readFileSync(out, 'utf8'), /claude-sonnet-5-5/, 'a log that belongs to no agent was written under --agent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
