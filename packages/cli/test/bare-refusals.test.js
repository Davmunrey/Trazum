import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const SOURCE = new URL('../src/index.ts', import.meta.url).pathname;

/**
 * No command answers a mistyped path with a syscall.
 *
 * The doctrine: *a refusal never arrives bare. "Denied" with nothing after it
 * leaves a caller two moves, do it anyway or fail, and both are worse than the
 * thing they wanted.* Three tests already cite that rule for other refusals.
 *
 * Seven commands broke it on the commonest mistake there is. `optimize`,
 * `check`, `profile`, `position`, `diff`, `semantic` and `conform` printed
 * `ENOENT: no such file or directory, open '/nope/x.txt'` — Node's sentence,
 * naming a syscall — while the five converters answered `/nope/x.json: not
 * found`. The CLI disagreed with itself about how to refuse, and the majority
 * spelling was the one a reader cannot act on.
 *
 * ## Why this reads every command rather than those seven
 *
 * A list of seven is a list somebody has to remember to extend. The commands
 * come out of `COMMAND_FLAGS`, so a command added next year is covered by
 * existing rather than by anyone noticing. Not every command takes a path, and
 * those refuse some other way; this asserts nothing about *which* refusal
 * arrives, only that no refusal arrives wearing Node's error codes.
 */
const commands = () => {
  const source = readFileSync(SOURCE, 'utf8');
  const start = source.indexOf('const COMMAND_FLAGS');
  assert.notEqual(start, -1, 'COMMAND_FLAGS is no longer where this test looks for it');
  const block = source.slice(start, source.indexOf('\n};', start));
  const names = [...new Set([...block.matchAll(/^ {2}'?([a-z][a-z-]*)'?:\s*\[/gm)].map((m) => m[1]))];
  assert.ok(names.length >= 30, `only ${names.length} commands parsed out of COMMAND_FLAGS`);
  const reading = names.filter((name) => !NOT_A_PATH.has(name));
  assert.ok(
    reading.length >= 40,
    `only ${reading.length} commands left after the exclusions — the list has grown`,
  );
  return reading;
};

/**
 * The three that do not read a path and do not end on their own.
 *
 * `serve` starts a server, `write` waits on the reader, `bench` runs a
 * measurement. None of them opens the argument as a file, so none of them can
 * produce the refusal under test, and all three would sit here until the
 * timeout — thirty-six of the hundred seconds this took before they were named.
 *
 * Named rather than inferred, with the count held below, so a fourth cannot
 * join them quietly.
 */
const NOT_A_PATH = new Set(['serve', 'write', 'bench']);

/** The shapes Node uses and this product does not. */
const BARE = /\b(ENOENT|EISDIR|EACCES|EPERM|ENOTDIR|EMFILE|ELOOP)\b/;

/**
 * One run, as a promise.
 *
 * Ninety spawns in series took a hundred seconds, which is a guard nobody will
 * want in the suite and therefore a guard that gets deleted. Eight at a time
 * brings it under ten, and the commands are independent: each reads a path
 * that does not exist and writes nothing.
 */
const run = (args) =>
  new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { encoding: 'utf8', env: SPAWN_ENV, timeout: 20000 },
      (_error, stdout, stderr) => resolve(`${stdout}${stderr}`),
    );
  });

/** `mapper` over `items`, at most `width` in flight. */
async function inFlight(items, width, mapper) {
  const out = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await mapper(items[i]);
  });
  await Promise.all(workers);
  return out;
}

describe('a refusal never arrives wearing a syscall', () => {
  it('reads the command list it claims to read', () => {
    assert.ok(commands().includes('profile'));
    assert.ok(commands().includes('optimize'));
  });

  it('never prints a raw filesystem error, for any command', async () => {
    /* Two positionals, so the ones that compare a pair are exercised too. */
    const said = await inFlight(commands(), 8, (command) =>
      run([command, '/nope/trazum-missing.txt', '/nope/trazum-missing-2.txt']),
    );
    const bare = commands()
      .map((command, i) => [command, said[i]])
      .filter(([, out]) => BARE.test(out))
      .map(([command, out]) => `${command}: ${out.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
    assert.deepEqual(bare, [], 'these answered a missing path with a syscall');
  });

  it('never prints a raw filesystem error for a directory where a file was meant', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trazum-bare-'));
    const said = await inFlight(commands(), 8, (command) => run([command, dir]));
    const bare = commands()
      .map((command, i) => [command, said[i]])
      .filter(([, out]) => BARE.test(out))
      .map(([command, out]) => `${command}: ${out.replace(/\s+/g, ' ').trim().slice(0, 90)}`);
    assert.deepEqual(bare, [], 'these answered a directory with a syscall');
  });

  it('says the path and the move, not just that something failed', async () => {
    const said = await run(['optimize', '/nope/trazum-missing.txt']);
    assert.match(said, /\/nope\/trazum-missing\.txt/, 'the refusal does not name the path');
    assert.match(said, /Check the path|point this at/, 'the refusal does not say what would settle it');
  });
});
