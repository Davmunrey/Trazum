import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SPAWN_ENV } from './env.mjs';

/**
 * A file handed to the wrong door, and the way to the right one.
 *
 * Found by running the CLI on real Claude Code sessions. `profile` on one
 * answered "No usage records in that file, 84 lines could not be read" and
 * exited 0, which reads as a broken file, while `bill` reads the same file as
 * it is. And `bill`, telling somebody why rows of an Anthropic usage report
 * were left out, sent them to `trazum from-anthropic-usage`, a command that
 * answers "Unknown command". Every pointer here is followed, not only read.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const SHAPES = new URL('../../core/src/usage-shapes.ts', import.meta.url);
const HELP_EN = new URL('../src/i18n/en.ts', import.meta.url);
const HELP_ES = new URL('../src/i18n/es.ts', import.meta.url);
const CLAUDE_EXAMPLE = new URL('../../../examples/claude-projects', import.meta.url).pathname;
const SESSION = join(CLAUDE_EXAMPLE, '-home-me-webapp', 'demo-webapp.jsonl');
const PROJECT = join(CLAUDE_EXAMPLE, '-home-me-webapp');

const run = (args, env = {}) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, TRAZUM_LOCALE: 'en', ...env },
    timeout: 60000,
  });
const flat = (text) => text.replace(/\s+/g, ' ');
const scratch = () => mkdtempSync(join(tmpdir(), 'trazum-shapes-'));

/** An Anthropic usage report with one row it cannot price: no model named. */
function anthropicUsage(dir) {
  const file = join(dir, 'anthropic-usage.json');
  writeFileSync(
    file,
    JSON.stringify({
      data: [
        {
          starting_at: '2026-11-01T00:00:00Z',
          ending_at: '2026-11-02T00:00:00Z',
          results: [
            { model: 'claude-opus-5', uncached_input_tokens: 2_000_000, output_tokens: 100_000 },
            { model: null, uncached_input_tokens: 900_000, output_tokens: 0 },
          ],
        },
      ],
      has_more: false,
    }),
  );
  return file;
}

/** The commands `bill` names, read from the map itself so a new shape is held too. */
function pointedCommands() {
  const source = readFileSync(SHAPES, 'utf8');
  const block = /const SHAPE_COMMAND[^=]*= \{([\s\S]*?)\n\};/.exec(source);
  assert.ok(block, 'SHAPE_COMMAND is no longer declared in packages/core/src/usage-shapes.ts');
  const commands = [...block[1].matchAll(/:\s*'([a-z-]+)'/g)].map(([, command]) => command);
  assert.ok(commands.length >= 8, `SHAPE_COMMAND parsed to ${commands.length} commands`);
  return commands;
}

describe('the command bill points at for the reasons', () => {
  it('is a command this CLI has, for every shape', () => {
    for (const command of pointedCommands()) {
      const result = run([command]);
      assert.doesNotMatch(result.stderr, /Unknown command/, `bill points at trazum ${command}, which does not exist`);
    }
  });

  it('is from-anthropic for an Anthropic usage report, and running it gives the reasons', () => {
    const file = anthropicUsage(scratch());
    const bill = run(['bill', file, '--receipt']);
    assert.equal(bill.status, 0, bill.stderr);
    const said = flat(bill.stderr);
    assert.match(said, /1 row\(s\) left out\. Run trazum from-anthropic on it for the reasons\./);
    assert.doesNotMatch(said, /from-anthropic-usage/);

    const followed = run(['from-anthropic', file]);
    assert.equal(followed.status, 0, followed.stderr);
    assert.match(flat(followed.stderr), /no model/i, 'the command bill points at does not say why the row was left out');
  });

  it('names no command where none exists, rather than one that does not', () => {
    const source = readFileSync(SHAPES, 'utf8');
    assert.match(source, /'batch-results': null,/);
    assert.match(source, /'usage-log': null,/);
  });
});

describe('a single-log command handed a coding agent session', () => {
  for (const command of ['profile', 'receipt', 'plan']) {
    it(`${command} names what the file is and the two commands that read it`, () => {
      const result = run([command, SESSION]);
      assert.equal(result.status, 1, `${command} read a Claude Code session as an empty usage log`);
      const said = flat(result.stderr);
      assert.match(said, /is claude-code data, not a usage log/);
      assert.ok(said.includes(`trazum bill ${SESSION} reads it as it is`), said);
      assert.ok(said.includes(`trazum from-claude-code ${SESSION} -o usage.jsonl`), said);
      assert.doesNotMatch(said, /could not be read/);
    });
  }

  it('reads the usage log the advice writes', () => {
    const out = join(scratch(), 'usage.jsonl');
    const converted = run(['from-claude-code', SESSION, '-o', out]);
    assert.equal(converted.status, 0, converted.stderr);
    const profiled = run(['profile', out]);
    assert.equal(profiled.status, 0, profiled.stderr);
    assert.doesNotMatch(flat(profiled.stdout), /No usage records/);
  });

  it('points bill at the directory given, when the session came out of one', () => {
    for (const command of ['profile', 'plan']) {
      const result = run([command, PROJECT]);
      assert.equal(result.status, 1, `${command} read a folder of sessions as empty usage logs`);
      assert.ok(flat(result.stderr).includes(`trazum bill ${PROJECT} reads it as it is`), `${command}: ${result.stderr}`);
    }
  });

  it('verify --against a folder of sessions says the same, naming the folder', () => {
    const dir = scratch();
    const usage = join(dir, 'usage.jsonl');
    const plan = join(dir, 'plan.json');
    assert.equal(run(['from-claude-code', CLAUDE_EXAMPLE, '-o', usage]).status, 0);
    assert.equal(run(['plan', usage, '--out', plan]).status, 0);
    const result = run(['verify', plan, '--against', PROJECT]);
    assert.equal(result.status, 1);
    assert.ok(flat(result.stderr).includes(`trazum bill ${PROJECT} reads it as it is`), result.stderr);
    const folders = run(['verify', plan, '--against', CLAUDE_EXAMPLE]);
    assert.equal(folders.status, 1);
    assert.ok(flat(folders.stderr).includes(`trazum bill "${CLAUDE_EXAMPLE}" reads every usage log`), folders.stderr);
  });

  it('says it in Spanish too', () => {
    const result = run(['profile', SESSION], { TRAZUM_LOCALE: 'es' });
    assert.equal(result.status, 1);
    assert.match(flat(result.stderr), /son datos de claude-code, no un registro de uso/);
    assert.ok(flat(result.stderr).includes(`trazum from-claude-code ${SESSION} -o uso.jsonl`));
  });

  it('points a provider report at its own converter', () => {
    const file = anthropicUsage(scratch());
    const result = run(['profile', file]);
    assert.equal(result.status, 1);
    assert.ok(flat(result.stderr).includes(`trazum from-anthropic ${file} -o usage.jsonl`), result.stderr);
  });

  it('points a cost report at reconcile, as bill does', () => {
    const file = join(scratch(), 'cost.json');
    writeFileSync(
      file,
      JSON.stringify({
        data: [{ starting_at: '2026-09-01T00:00:00Z', ending_at: '2026-09-02T00:00:00Z', results: [{ amount: '400.00', currency: 'USD' }] }],
        has_more: false,
      }),
    );
    const result = run(['profile', file]);
    assert.equal(result.status, 1);
    assert.match(flat(result.stderr), /a provider's cost report, a bill rather than usage.*trazum reconcile/);
  });

  it('still reads a plain usage log, and a file nothing claims the way it always did', () => {
    const dir = scratch();
    const log = join(dir, 'usage.jsonl');
    writeFileSync(log, '{"model":"claude-opus-5","usage":{"input_tokens":1000,"output_tokens":200}}\n');
    assert.equal(run(['profile', log]).status, 0);

    const junk = join(dir, 'notes.log');
    writeFileSync(junk, 'not json\nstill not json\n');
    const read = run(['profile', junk]);
    assert.equal(read.status, 0, read.stderr);
    assert.match(flat(`${read.stdout}${read.stderr}`), /2 lines could not be read/);
  });
});

describe('a directory handed to a command that does not walk folders', () => {
  it('profile and plan say bill walks them, when the directory holds folders', () => {
    for (const command of ['profile', 'plan']) {
      const result = run([command, CLAUDE_EXAMPLE]);
      assert.equal(result.status, 1);
      const said = flat(result.stderr);
      assert.match(said, /No usage logs in/);
      assert.ok(said.includes(`trazum bill "${CLAUDE_EXAMPLE}" reads every usage log and coding-agent session under it`), said);
    }
  });

  it('says nothing about folders when there are none', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'readme.txt'), 'hello\n');
    const result = run(['profile', dir]);
    assert.equal(result.status, 1);
    assert.doesNotMatch(flat(result.stderr), /holds folders/);
  });

  it('profile --by-source went into the folders, so it does not send anyone to walk them', () => {
    const dir = scratch();
    mkdirSync(join(dir, 'empty-service'));
    const result = run(['profile', dir, '--by-source']);
    assert.equal(result.status, 1);
    assert.doesNotMatch(flat(result.stderr), /holds folders/);
  });

  it('receipt names the directory and the command that reads one', () => {
    const result = run(['receipt', CLAUDE_EXAMPLE]);
    assert.equal(result.status, 1);
    const said = flat(result.stderr);
    assert.ok(said.includes(`${CLAUDE_EXAMPLE} is a directory, and this command reads one usage log`), said);
    assert.ok(said.includes(`trazum bill ${CLAUDE_EXAMPLE} reads every usage log`), said);
  });

  it('receipt no longer offers a directory in its help', () => {
    for (const help of [HELP_EN, HELP_ES]) {
      const line = readFileSync(help, 'utf8').split('\n').find((text) => text.trim().startsWith('trazum receipt <'));
      assert.ok(line, `no receipt usage line in ${help.pathname}`);
      assert.doesNotMatch(line, /\|dir>/, 'the help offers a directory receipt refuses');
    }
  });
});
