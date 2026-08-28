import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * The four commands the CLI dispatched and nothing ran.
 *
 * `from-litellm`, `from-helicone`, `from-langsmith` and `feedback` had core
 * tests for their parsers and none for the commands. That gap is not the same
 * shape as a missing unit test, because what the command adds to the parser is
 * exactly the part a parser test cannot see:
 *
 * - the **directory walk**, which decides which files are an export at all,
 *   and in what order;
 * - the **aggregation across files**, where a per-file counter added to the
 *   wrong accumulator is a plausible typo and a silently wrong summary;
 * - the **stdout/stderr split**, which is the whole contract with a pipeline —
 *   records on stdout, the honest count on stderr, so `| trazum profile -`
 *   reads a log rather than a log with a summary glued to the end of it;
 * - the **refusals**, each of which has to name what is missing.
 *
 * And `feedback` prints a URL it invites somebody to open. It says in its own
 * output that it sends nothing; that sentence had no test, on the one command
 * whose output is a link a user is told to click.
 *
 * The fixtures are the same shapes the core tests use, because those were
 * written from each vendor's own schema rather than from memory of one. The
 * secret is the same too: a substring hit on it anywhere in stdout, stderr or a
 * written file is a real leak, not a coincidence.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const run = (args, cwd) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: SPAWN_ENV,
    cwd,
    timeout: 30_000,
  });

/** Distinctive enough that a substring match is evidence rather than an accident. */
const SECRET = 'ACME-CONFIDENTIAL-Q3-PRICING';

const scratch = () => mkdtemp(join(tmpdir(), 'trazum-vendor-'));

const litellmRow = (over = {}) => ({
  request_id: 'req-1',
  call_type: 'acompletion',
  api_key: `sk-hash-${SECRET}`,
  spend: 0.0421,
  total_tokens: 1300,
  prompt_tokens: 1200,
  completion_tokens: 100,
  startTime: '2026-08-01T10:00:00.000Z',
  endTime: '2026-08-01T10:00:03.000Z',
  model: 'claude-opus-5',
  custom_llm_provider: 'anthropic',
  api_base: `https://gateway.invalid/${SECRET}`,
  user: `person-${SECRET}@example.com`,
  request_tags: ['support'],
  end_user: `end-${SECRET}`,
  requester_ip_address: `203.0.113.9 ${SECRET}`,
  messages: [{ role: 'user', content: `Summarise ${SECRET}` }],
  response: { choices: [{ message: { content: `About ${SECRET}` } }] },
  session_id: 'sess-a',
  status: 'success',
  ...over,
});

const heliconeRow = (over = {}) => ({
  request_id: 'req-1',
  request_created_at: '2026-08-01T10:00:00.000Z',
  response_created_at: '2026-08-01T10:00:03.000Z',
  request_model: 'claude-opus-5',
  model_override: null,
  response_model: 'claude-opus-5',
  prompt_tokens: 1200,
  completion_tokens: 100,
  total_tokens: 1300,
  request_properties: { 'Helicone-Property-Label': 'support' },
  request_user_id: `person-${SECRET}@example.com`,
  request_body: { messages: [{ role: 'user', content: `Summarise ${SECRET}` }] },
  response_body: { choices: [{ message: { content: `About ${SECRET}` } }] },
  signed_body_url: `https://assets.invalid/${SECRET}`,
  cache_enabled: 0,
  ...over,
});

const langsmithRun = (over = {}) => ({
  id: 'run-1',
  trace_id: 'trace-a',
  dotted_order: '20260801T100000000000Zrun-1',
  name: 'ChatAnthropic',
  run_type: 'llm',
  start_time: '2026-08-01T10:00:00.000Z',
  end_time: '2026-08-01T10:00:03.000Z',
  prompt_tokens: 1200,
  completion_tokens: 100,
  total_tokens: 1300,
  total_cost: 0.0421,
  tags: ['support'],
  extra: {
    metadata: {
      ls_model_name: 'claude-opus-5',
      ls_provider: 'anthropic',
      internal_note: `see ${SECRET}`,
    },
  },
  inputs: { messages: [{ role: 'user', content: `Summarise ${SECRET}` }] },
  outputs: { generations: [{ text: `About ${SECRET}` }] },
  session_id: 'project-1',
  ...over,
});

/** The three converters, with everything that differs between them declared. */
const VENDORS = [
  {
    command: 'from-litellm',
    export: (n) => JSON.stringify(Array.from({ length: n }, (_, i) => litellmRow({ request_id: `req-${i}` }))),
  },
  {
    command: 'from-helicone',
    export: (n) => JSON.stringify(Array.from({ length: n }, (_, i) => heliconeRow({ request_id: `req-${i}` }))),
  },
  {
    command: 'from-langsmith',
    export: (n) => JSON.stringify(Array.from({ length: n }, (_, i) => langsmithRun({ id: `run-${i}` }))),
  },
];

for (const vendor of VENDORS) {
  describe(`trazum ${vendor.command}`, () => {
    it('writes records to stdout and the count to stderr', async () => {
      // The pipeline contract. A summary on stdout makes `| trazum profile -`
      // read a log with prose at the end of it, which fails at the wrong layer
      // and blames the wrong file.
      const dir = await scratch();
      await writeFile(join(dir, 'export.json'), vendor.export(3));

      const result = run([vendor.command, join(dir, 'export.json')]);
      assert.equal(result.status, 0, result.stderr);

      const lines = result.stdout.trim().split('\n').filter(Boolean);
      assert.equal(lines.length, 3, `stdout carried ${lines.length} lines, not 3 records`);
      for (const line of lines) {
        const record = JSON.parse(line);
        assert.equal(record.model, 'claude-opus-5');
        assert.ok(record.usage.input_tokens > 0);
      }
      assert.ok(result.stderr.length > 0, 'the conversion reported nothing about itself');
    });

    it('reads a directory as every export in it, and says how many', async () => {
      /**
       * The walk is the command's own code and the parser never sees it. Three
       * files, one of them nested, and one `.txt` that must not be read: an
       * export directory is somebody's download folder as often as not.
       */
      const dir = await scratch();
      await mkdir(join(dir, 'nested'), { recursive: true });
      await writeFile(join(dir, 'a.json'), vendor.export(2));
      await writeFile(join(dir, 'b.jsonl'), vendor.export(1));
      await writeFile(join(dir, 'nested', 'c.json'), vendor.export(3));
      await writeFile(join(dir, 'notes.txt'), `nothing here but ${SECRET}`);

      const result = run([vendor.command, dir]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        result.stdout.trim().split('\n').filter(Boolean).length,
        6,
        'the walk read a different set of files than the three exports',
      );
      // The count is the aggregate, not the last file's. A per-file counter
      // assigned instead of added is the plausible typo here, and it reads
      // exactly like a correct summary.
      assert.match(result.stderr, /3/, 'the summary does not name the three files it read');
    });

    it('refuses a path that is not there, and names it', async () => {
      const missing = join(await scratch(), 'nope.json');
      const result = run([vendor.command, missing]);
      assert.notEqual(result.status, 0);
      assert.ok(result.stderr.includes(missing), 'the refusal does not say which path');
      assert.equal(result.stdout.trim(), '', 'a refusal still wrote records');
    });

    it('refuses a directory holding no export, rather than converting nothing', async () => {
      // Zero records and exit 0 is the flattering answer: it looks like an
      // export with nothing in it, which is a different and much rarer thing
      // than pointing the command at the wrong folder.
      const dir = await scratch();
      await writeFile(join(dir, 'readme.txt'), 'not an export');
      const result = run([vendor.command, dir]);
      assert.notEqual(result.status, 0, 'an empty directory converted successfully');
      assert.ok(result.stderr.includes(dir));
    });

    it('carries no prompt, completion, key, address or user across', async () => {
      /**
       * The doctrine rule that outlives every one of these formats. Checked on
       * everything the command emits — stdout, stderr **and** the file it
       * writes — because a converter that keeps the promise on the pipe and
       * breaks it on `-o` has broken it.
       */
      const dir = await scratch();
      await writeFile(join(dir, 'export.json'), vendor.export(2));
      const out = join(dir, 'usage.jsonl');

      const result = run([vendor.command, join(dir, 'export.json'), '-o', out]);
      assert.equal(result.status, 0, result.stderr);

      const written = await readFile(out, 'utf8');
      for (const [where, text] of [['stdout', result.stdout], ['stderr', result.stderr], ['the file', written]]) {
        assert.ok(!text.includes(SECRET), `${where} carried text from the export`);
      }
      assert.equal(written.trim().split('\n').length, 2);
      assert.ok(result.stderr.includes(out), '-o did not say where it wrote');
      assert.equal(result.stdout.trim(), '', '-o wrote the records twice');
    });

    it('produces a log the rest of the product can read', async () => {
      // The only claim that matters about a converter: what comes out is a
      // usage log, not a shape that merely looks like one. Proved by pricing
      // it, which is the thing somebody converts an export in order to do.
      const dir = await scratch();
      await writeFile(join(dir, 'export.json'), vendor.export(4));
      const out = join(dir, 'usage.jsonl');
      assert.equal(run([vendor.command, join(dir, 'export.json'), '-o', out]).status, 0);

      const profiled = run(['profile', out, '--json']);
      assert.equal(profiled.status, 0, profiled.stderr);
      const report = JSON.parse(profiled.stdout);
      assert.equal(report.total.calls, 4, 'the converted log priced a different number of calls');
      assert.ok(report.total.totalUsd > 0, 'four priced calls came to nothing');
    });
  });
}

describe('the three converters agree about how a conversion is reported', () => {
  it('sends records one way and the count the other, in all three', async () => {
    /**
     * Written as one assertion over all three rather than three assertions,
     * because the failure this catches is one converter drifting from its
     * siblings — which is what happened to the refusal wording across seven
     * commands, and to the gate that applied to one branch and not the others.
     */
    const dir = await scratch();
    const results = [];
    for (const vendor of VENDORS) {
      const file = join(dir, `${vendor.command}.json`);
      await writeFile(file, vendor.export(2));
      const result = run([vendor.command, file]);
      assert.equal(result.status, 0, result.stderr);
      results.push({
        command: vendor.command,
        records: result.stdout.trim().split('\n').filter(Boolean).length,
        quiet: result.stdout.includes('['),
      });
    }
    assert.deepEqual(
      results,
      VENDORS.map((vendor) => ({ command: vendor.command, records: 2, quiet: false })),
      'the three converters do not agree about what goes on stdout',
    );
  });
});

describe('trazum feedback', () => {
  it('sends nothing, and the sentence saying so is true', async () => {
    /**
     * The one command whose output is a link the reader is told to open, so
     * everything in the URL travels the moment they do. It says it sends
     * nothing; nothing checked that, and "sends nothing" is a claim about a
     * network call that a printer is one line away from making.
     */
    const result = run(['feedback']);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.length > 0);

    // No outbound call: the command is in the offline suite's table, and this
    // is the half that says the URL is printed rather than followed.
    const source = await readFile(new URL('../src/index.ts', import.meta.url).pathname, 'utf8');
    const body = source.slice(source.indexOf('function commandFeedback'));
    const own = body.slice(0, body.indexOf('\n}\n'));
    assert.doesNotMatch(own, /\bfetch\s*\(|open\s*\(|exec|spawn/, 'feedback reaches the network');
  });

  it('puts only the machine in the link, and never the person or their work', async () => {
    /**
     * What is in the URL is what travels. The environment lines are facts about
     * the machine — version, platform, locale — and the body must carry nothing
     * else: not the working directory, not a file the user was working on, not
     * an environment variable. Each of those is one plausible "helpful" commit
     * away, and each would be invisible in review because the URL is encoded.
     */
    const dir = await scratch();
    await writeFile(join(dir, `${SECRET}.txt`), 'a prompt');
    const result = run(['feedback'], dir);
    assert.equal(result.status, 0, result.stderr);

    const url = result.stdout.split('\n').map((line) => line.trim()).find((line) => line.includes('issues/new?body='));
    assert.ok(url, 'no link was printed, so there is nothing to check');

    const decoded = decodeURIComponent(url.slice(url.indexOf('body=') + 5));
    assert.ok(!decoded.includes(dir), 'the working directory travels in the link');
    assert.ok(!decoded.includes(SECRET), "a file name from the user's directory travels in the link");
    // Conditional rather than defaulted: a sentinel meaning "match nothing"
    // is how a NUL byte got into this file on its first draft, and a file
    // git calls binary is a file no reviewer sees the diff of.
    const home = process.env.HOME;
    if (home) assert.ok(!decoded.includes(home), 'a home directory travels in the link');

    // And it does carry the four facts a "cannot reproduce" thread asks for,
    // so this is a bound on what travels rather than an argument for an empty
    // body.
    assert.match(decoded, /Trazum \d+\.\d+\.\d+/);
    assert.match(decoded, /Node v\d+/);
    assert.ok(decoded.includes(process.platform), 'the platform is missing');
    assert.match(decoded, /locale (en|es)/);
  });

  it('names a place to go for each kind of report, security included', async () => {
    // A feedback command that offers one box sends a vulnerability to a public
    // issue tracker. The private route has to be on the same screen as the
    // public one.
    const result = run(['feedback']);
    for (const expected of ['issues/new', 'discussions', 'security/advisories/new']) {
      assert.ok(result.stdout.includes(expected), `no route to ${expected}`);
    }
  });

  it('says the same in the other locale', async () => {
    // The command exists to be read by somebody who has hit a problem, which
    // is the worst moment to be reading a second language.
    const english = run(['feedback', '--locale', 'en']);
    const spanish = run(['feedback', '--locale', 'es']);
    assert.equal(spanish.status, 0, spanish.stderr);
    assert.notEqual(english.stdout, spanish.stdout, 'the Spanish output is the English one');
    for (const expected of ['issues/new', 'security/advisories/new']) {
      assert.ok(spanish.stdout.includes(expected), `the Spanish output drops ${expected}`);
    }
    assert.match(spanish.stdout, /locale es/);
  });
});
