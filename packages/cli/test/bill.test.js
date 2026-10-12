import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from './env.mjs';

/**
 * One door, and what it refuses to open.
 *
 * `bill` composes the converters; what is tested here is not their
 * arithmetic, which each has its own file for, but the door's own promises:
 * every file is named with its shape, a file no shape claims is named and
 * not guessed, a provider's bill is pointed at `reconcile`, and the receipt
 * at the end is the same document `receipt` writes.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/* Under the pinned environment every spawn here uses, so the English these
   assertions read is the English the process writes, whatever the machine's
   own locale says. */
const run = (args) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: SPAWN_ENV, timeout: 60000 });

function mixed() {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-'));
  writeFileSync(
    join(dir, 'usage.jsonl'),
    '{"model":"claude-opus-5","ts":"2026-09-01T10:00:00Z","usage":{"input_tokens":1000,"output_tokens":200}}\n',
  );
  writeFileSync(
    join(dir, 'activity.json'),
    JSON.stringify({
      data: [
        {
          byok_usage_inference: 0,
          completion_tokens: 125,
          date: '2026-09-02',
          endpoint_id: '550e8400-e29b-41d4-a716-446655440000',
          model: 'openai/gpt-4.1',
          model_permaslug: 'openai/gpt-4.1-2025-04-14',
          prompt_tokens: 50,
          provider_name: 'OpenAI',
          reasoning_tokens: 25,
          requests: 5,
          usage: 0.015,
        },
      ],
    }),
  );
  writeFileSync(
    join(dir, 'cost.json'),
    JSON.stringify({
      data: [{ starting_at: '2026-09-01T00:00:00Z', ending_at: '2026-09-02T00:00:00Z', results: [{ amount: '400.00', currency: 'USD' }] }],
      has_more: false,
    }),
  );
  writeFileSync(join(dir, 'other.json'), '{"hello":"world"}\n');
  return dir;
}

describe('trazum bill reads a directory of whatever it finds', () => {
  it('names every file with its shape, and prices what it read', () => {
    const dir = mixed();
    const out = join(dir, 'receipt.json');
    const result = run(['bill', dir, '-o', out]);
    assert.equal(result.status, 0, result.stderr);

    assert.match(result.stderr, /usage\.jsonl: usage-log/);
    assert.match(result.stderr, /activity\.json: openrouter, 1 record/);
    /* A bill is not usage, and the door for it is named. */
    assert.match(result.stderr, /cost\.json: .*reconcile/);
    /* Not guessed at. */
    assert.match(result.stderr, /other\.json: no shape/);
    assert.match(result.stderr, /2 of 4 file\(s\) read as usage/);

    const receipt = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(receipt.total.calls, 1);
    assert.ok(receipt.total.usd > 0);
    /* The slug the bundled catalogue does not price is a named gap, not a
       zero: this is where --pricing-live earns its keep. */
    const unpriced = receipt.gaps.find((gap) => gap.kind === 'unpriced');
    assert.deepEqual(unpriced?.models, ['openai/gpt-4.1']);
    /* And the door says which flag prices a slug, derived from that gap. */
    assert.match(result.stderr, /--pricing-live/);
  });

  it('calls a prefixed id what it is, and names the ones priced under their own name', () => {
    /* `gemini/` and `xai/` are LiteLLM's prefixes, not OpenRouter's, so the
       hint no longer says every slash id is an OpenRouter slug. And the prefix
       is never stripped by rule: the line names the ids whose model after the
       slash is priced here, and says why it was left alone. */
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-prefix-'));
    const line = (model) =>
      JSON.stringify({ ts: '2026-10-05T12:00:00Z', model, usage: { input_tokens: 1000, output_tokens: 0 } });
    writeFileSync(join(dir, 'u.jsonl'), [line('xai/grok-4.3'), line('gemini/gemini-3.1-pro-preview'), line('mistralai/nobody-prices-this')].join('\n'));
    const result = run(['bill', join(dir, 'u.jsonl'), '--receipt']);
    assert.equal(result.status, 0, result.stderr);
    const said = result.stderr.replace(/\s+/g, ' ');
    assert.doesNotMatch(said, /are OpenRouter slugs/, 'a LiteLLM prefix was called an OpenRouter slug');
    assert.match(said, /3 unpriced model id\(s\) carry a provider prefix/);
    assert.match(said, /gemini\/gemini-3\.1-pro-preview, xai\/grok-4\.3: the model after the slash is priced here/);
    assert.doesNotMatch(said, /mistralai\/nobody-prices-this[^.]*: the model after the slash/);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.total.calls, 0, 'a prefixed id was priced by stripping the prefix');
  });

  it('says a Claude Code bill is an API-rate equivalent, on every surface, and only there', () => {
    /* A Pro or Max plan pays the plan. "Your bill" over transcripts is what
       the same work costs on the API, and a person who is not told so is
       handed a figure they never owed. A metered usage log is money billed,
       so it gets no such sentence. */
    const projects = new URL('../../../examples/claude-projects', import.meta.url).pathname;
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-plan-'));
    const html = join(dir, 'bill.html');
    const markdown = join(dir, 'bill.md');
    const result = run(['bill', projects, '--table', '--html-out', html, '--markdown-out', markdown]);
    assert.equal(result.status, 0, result.stderr);
    const sentence = /Claude Code and Codex transcripts are priced at catalogue API rates\. On a subscription you paid the plan, not this API-equivalent estimate/;
    const flat = (text) => text.replace(/\s+/g, ' ');
    assert.match(flat(result.stdout), sentence, 'the statement does not say what a plan pays');
    assert.match(flat(readFileSync(html, 'utf8').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'")), sentence, 'the HTML');
    assert.match(flat(readFileSync(markdown, 'utf8')), sentence, 'the Markdown');

    const metered = run(['bill', join(mixed(), 'usage.jsonl'), '--table']);
    assert.equal(metered.status, 0, metered.stderr);
    assert.doesNotMatch(flat(metered.stdout), /On a subscription you paid/, 'a metered API log was called an equivalent');
  });

  it('does not hint at --pricing-live when nothing unpriced is a slug', () => {
    const dir = mixed();
    const result = run(['bill', join(dir, 'usage.jsonl')]);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /--pricing-live/);
  });

  it('writes the receipt to stdout when no file is asked for', () => {
    const dir = mixed();
    const result = run(['bill', join(dir, 'usage.jsonl')]);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.total.calls, 1);
  });

  it('refuses a directory in which nothing is usage, by name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-empty-'));
    writeFileSync(join(dir, 'notes.json'), '{"a":1}\n');
    const result = run(['bill', dir]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /nothing to bill/);
  });

  it('needs a path when Claude Code has no folder here, and says what to give it', () => {
    // An empty home: with a real one, no path now reads ~/.claude/projects.
    const empty = mkdtempSync(join(tmpdir(), 'trazum-bill-nopath-'));
    const result = spawnSync(process.execPath, [CLI, 'bill'], {
      encoding: 'utf8',
      env: { ...SPAWN_ENV, HOME: empty, CLAUDE_CONFIG_DIR: '' },
      timeout: 60000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /trazum bill/);
  });
});

/**
 * The glob and the extension, which once made one directory two bills.
 *
 * `trazum bill logs/*.jsonl` is what a person types, and the shell turns it into
 * every file. Reading the first and dropping the rest priced $0.01 of a $7.51
 * bill with no gap; skipping `.log` priced $7.51 of what `profile` called
 * $15.01. Both understated, both quietly, so both are pinned on totals.
 */
describe('trazum bill reads every path it is given', () => {
  const small = '{"model":"claude-opus-5","ts":"2026-09-01T10:00:00Z","usage":{"input_tokens":1000,"output_tokens":200}}\n';
  const big = '{"model":"claude-opus-5","ts":"2026-09-02T10:00:00Z","usage":{"input_tokens":1000000,"output_tokens":100000}}\n';
  const totalOf = (result) => JSON.parse(result.stdout).total;

  it('prices every file a shell glob expands to, not the first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-glob-'));
    writeFileSync(join(dir, 'a.jsonl'), small);
    writeFileSync(join(dir, 'b.jsonl'), big);
    const result = run(['bill', join(dir, 'a.jsonl'), join(dir, 'b.jsonl')]);
    assert.equal(result.status, 0, result.stderr);
    const total = totalOf(result);
    assert.equal(total.calls, 2);
    assert.ok(Math.abs(total.usd - 7.51) < 1e-9, `usd ${total.usd}`);
  });

  it('reads a file once when it is named twice', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-twice-'));
    writeFileSync(join(dir, 'a.jsonl'), small);
    writeFileSync(join(dir, 'b.jsonl'), big);
    const result = run(['bill', dir, join(dir, 'b.jsonl')]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(totalOf(result).calls, 2);
  });

  it('reads the same files profile reads, .log and .gz included', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-ext-'));
    writeFileSync(join(dir, 'a.jsonl'), small);
    writeFileSync(join(dir, 'b.ndjson'), big);
    writeFileSync(join(dir, 'c.log'), big);
    writeFileSync(join(dir, 'd.jsonl.gz'), gzipSync(small));
    const bill = run(['bill', dir]);
    assert.equal(bill.status, 0, bill.stderr);
    const profile = run(['profile', dir, '--json']);
    assert.equal(profile.status, 0, profile.stderr);
    assert.equal(totalOf(bill).calls, 4);
    assert.equal(totalOf(bill).calls, JSON.parse(profile.stdout).total.calls);
  });

  it('a one-path command refuses the paths it would ignore, naming the first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-one-path-'));
    writeFileSync(join(dir, 'a.jsonl'), small);
    writeFileSync(join(dir, 'b.jsonl'), big);
    const result = run(['receipt', join(dir, 'a.jsonl'), join(dir, 'b.jsonl')]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /receipt reads one path and was given 2/);
    assert.match(result.stderr, /b\.jsonl/);
  });
});

/**
 * The front door as a first run meets it: no path, a terminal, and a folder
 * of Claude Code projects. Each was a place the one line on the README
 * stopped short: no path was a refusal, the sessions came out with no
 * project, and a terminal got sixty lines of JSON before the first figure.
 */
describe('trazum bill as a first run meets it', () => {
  const transcript = (id, model, input, output) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-10-02T10:00:00.000Z',
      sessionId: `s-${id}`,
      requestId: `r-${id}`,
      message: { model, content: [{ type: 'text', text: 'never read' }], usage: { input_tokens: input, output_tokens: output } },
    });

  /** A home with a Claude Code projects folder, two projects in it. */
  function home() {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-home-'));
    const projects = join(dir, '.claude', 'projects');
    mkdirSync(join(projects, '-home-me-webapp'), { recursive: true });
    mkdirSync(join(projects, '-home-me-etl'), { recursive: true });
    writeFileSync(join(projects, '-home-me-webapp', 'a.jsonl'), `${transcript('a1', 'claude-opus-5', 100_000, 2_000)}\n`);
    writeFileSync(
      join(projects, '-home-me-etl', 'b.jsonl'),
      `${transcript('b1', 'claude-opus-5', 10_000, 500)}\n${transcript('b2', 'claude-opus-5', 10_000, 500)}\n`,
    );
    return { dir, projects };
  }
  const as = (homeDir, args) =>
    spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      env: { ...SPAWN_ENV, HOME: homeDir, CLAUDE_CONFIG_DIR: '' },
      timeout: 60000,
    });

  it('with no path, reads Claude Code\'s own folder and names it', () => {
    const { dir, projects } = home();
    const result = as(dir, ['bill']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /No path given, so reading Claude Code's own folder/);
    assert.ok(result.stderr.includes(projects));
    assert.equal(JSON.parse(result.stdout).total.calls, 3);
  });

  it('with no path and no folder, refuses and names every place it looked', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-nohome-'));
    const result = as(dir, ['bill']);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(join(dir, '.claude', 'projects')));
    assert.ok(result.stderr.includes(join(dir, '.config', 'claude', 'projects')));
    assert.match(result.stderr, /trazum bill ~\/\.claude\/projects/);
  });

  it('labels each session by its project folder, as from-claude-code does', () => {
    const { dir, projects } = home();
    const result = as(dir, ['bill', projects]);
    assert.equal(result.status, 0, result.stderr);
    const labels = JSON.parse(result.stdout).lines.map((line) => line.label).sort();
    assert.deepEqual(labels, ['home-me-etl', 'home-me-webapp']);
    assert.match(result.stderr, /2 Claude Code transcript\(s\) labelled by their project folder/);
  });

  it('leaves them unlabelled when asked, and lets --label win', () => {
    const { dir, projects } = home();
    const declined = JSON.parse(as(dir, ['bill', projects, '--no-label-from-project']).stdout);
    assert.deepEqual([...new Set(declined.lines.map((line) => line.label))], [null]);
    const named = JSON.parse(as(dir, ['bill', projects, '--label', 'agents']).stdout);
    assert.deepEqual([...new Set(named.lines.map((line) => line.label))], ['agents']);
  });

  it('prints a statement a person reads with --table, and the receipt with --receipt', () => {
    const { dir, projects } = home();
    const statement = as(dir, ['bill', projects, '--table']);
    assert.equal(statement.status, 0, statement.stderr);
    assert.match(statement.stdout, /Your bill/);
    assert.match(statement.stdout, /across 3 priced call\(s\)/);
    assert.match(statement.stdout, /project\s+calls\s+USD\s+share/);
    assert.match(statement.stdout, /home-me-webapp/);
    assert.match(statement.stdout, /--pdf-out bill\.pdf/);
    assert.throws(() => JSON.parse(statement.stdout));
    const forced = as(dir, ['bill', projects, '--table', '--receipt']);
    assert.equal(JSON.parse(forced.stdout).total.calls, 3);
  });

  it('collapses a large folder into one line per shape and counts what it could not read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-bill-many-'));
    for (let i = 0; i < 6; i += 1) {
      writeFileSync(join(dir, `u${i}.jsonl`), '{"model":"claude-opus-5","usage":{"input_tokens":1000,"output_tokens":10}}\n');
    }
    for (let i = 0; i < 5; i += 1) writeFileSync(join(dir, `x${i}.json`), '{"hello":"world"}\n');
    const result = run(['bill', dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /6 file\(s\): usage-log, read as they are/);
    assert.equal((result.stderr.match(/no shape this tool reads claims it/g) ?? []).length, 3);
    assert.match(result.stderr, /2 more file\(s\) no shape claims/);
  });
});
