import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * One bill across the coding agents on a machine.
 *
 * `bill` with no path read Claude Code's folders alone, so somebody who also
 * ran Codex or Gemini CLI got a bill missing part of the work and no sign of
 * it. It now looks in each agent's own folder, names every folder it reads,
 * and splits the total by agent once more than one spent money.
 *
 * The Gemini CLI example in `examples/gemini-tmp` is written the way the
 * recorder writes (google-gemini/gemini-cli, chatRecordingService.ts): a reply
 * appended before its tokens and again with them, a tool-call turn, a `$set`
 * and a `$rewindTo`. Its three replies, at Google's list prices:
 *
 * - gemini-2.5-pro: 40,000 input + 80,000 cache read + 8,000 output
 *   (2,000 candidates + 6,000 reasoning)
 * - gemini-2.5-pro: 34,000 input (incl. 4,000 tool results) + 120,000 cache
 *   read + 2,000 output (800 + 1,200 reasoning)
 * - gemini-2.5-flash: 40,000 input + 2,000 output (1,500 + 500 reasoning)
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const GEMINI_EXAMPLE = new URL('../../../examples/gemini-tmp', import.meta.url).pathname;
const CLAUDE_EXAMPLE = new URL('../../../examples/claude-projects', import.meta.url).pathname;

const run = (args, env = {}) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, TRAZUM_LOCALE: 'en', CLAUDE_CONFIG_DIR: '', CODEX_HOME: '', GEMINI_CLI_HOME: '', ...env },
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });
const flat = (text) => text.replace(/\s+/g, ' ');

const codexCount = { input_tokens: 100_000, cached_input_tokens: 40_000, output_tokens: 2_000, reasoning_output_tokens: 500, total_tokens: 102_000 };
const codexRollout = [
  { type: 'session_meta', payload: { id: 'synthetic-codex', cwd: 'SYNTHETIC_PRIVATE_PATH' } },
  { type: 'turn_context', payload: { model: 'gpt-5-mini', instructions: 'SYNTHETIC_SECRET' } },
  { timestamp: '2026-10-22T10:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: codexCount, last_token_usage: codexCount } } },
].map((row) => JSON.stringify(row)).join('\n');

/** A home with all three agents' folders, laid out the way each agent lays them out. */
function home() {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-agents-'));
  cpSync(CLAUDE_EXAMPLE, join(dir, '.claude', 'projects'), { recursive: true });
  const day = join(dir, '.codex', 'sessions', '2026', '10', '22');
  mkdirSync(day, { recursive: true });
  writeFileSync(join(day, 'rollout-2026-10-22T10-00-00-synthetic.jsonl'), codexRollout);
  cpSync(GEMINI_EXAMPLE, join(dir, '.gemini', 'tmp'), { recursive: true });
  // Shell history and a checkpoint share tmp with the chats, and must not be read as usage.
  writeFileSync(join(dir, '.gemini', 'tmp', 'webshop', 'shell_history'), 'ls\n');
  return dir;
}

describe('Gemini CLI sessions', () => {
  it('reads the recorder\'s own layout: one record per reply, reasoning as output, tool results as input', () => {
    const result = run(['from-gemini-cli', GEMINI_EXAMPLE]);
    assert.equal(result.status, 0, result.stderr);
    const records = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(records.length, 3, 'a reply the recorder rewrote was counted twice, or one was lost');
    assert.deepEqual(records[0].usage, { input_tokens: 40_000, output_tokens: 8_000, cache_read_input_tokens: 80_000 });
    assert.deepEqual(records[1].usage, { input_tokens: 34_000, output_tokens: 2_000, cache_read_input_tokens: 120_000 });
    assert.equal(records[2].model, 'gemini-2.5-flash');
    assert.match(flat(result.stderr), /1 rewritten line\(s\) read once/);
    assert.match(flat(result.stderr), /Reasoning tokens are priced as output/);
    // Prompts and replies never leave the session file.
    assert.ok(!result.stdout.includes('checkout'), 'prompt text reached the usage log');
    assert.ok(!result.stdout.includes('Here is the plan'), 'reply text reached the usage log');
  });

  it('reads the older single-document session the same way', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-gemini-legacy-'));
    const legacy = {
      sessionId: 'legacy-1', projectHash: 'a'.repeat(64), startTime: '2026-09-01T00:00:00Z', lastUpdated: '2026-09-01T00:01:00Z',
      messages: [
        { id: 'u1', type: 'user', timestamp: '2026-09-01T00:00:00Z', content: 'hi' },
        { id: 'g1', type: 'gemini', timestamp: '2026-09-01T00:00:05Z', content: 'hello', model: 'gemini-2.5-flash',
          tokens: { input: 1_000, output: 100, cached: 0, thoughts: 50, tool: 0, total: 1_150 } },
      ],
    };
    writeFileSync(join(dir, 'session-2026-09-01T00-00-legacy.json'), JSON.stringify(legacy, null, 2));
    const result = run(['from-gemini-cli', dir]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).usage, { input_tokens: 1_000, output_tokens: 150, cache_read_input_tokens: 0 });
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses impossible counts and prices an unexplained remainder as output, never as zero', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-gemini-odd-'));
    const rows = [
      { sessionId: 's', projectHash: 'p' },
      // cached above input: impossible, refused
      { id: 'a', type: 'gemini', timestamp: '2026-10-01T00:00:00Z', model: 'gemini-2.5-pro', tokens: { input: 10, output: 1, cached: 20, total: 11 } },
      // an older recorder with no thoughts/tool counts, whose total exceeds its parts
      { id: 'b', type: 'gemini', timestamp: '2026-10-01T00:00:00Z', model: 'gemini-2.5-pro', tokens: { input: 1_000, output: 100, cached: 0, total: 1_400 } },
      // no model at all
      { id: 'c', type: 'gemini', timestamp: '2026-10-01T00:00:00Z', tokens: { input: 5, output: 5, cached: 0, total: 10 } },
    ];
    writeFileSync(join(dir, 'session-odd.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n'));
    const result = run(['from-gemini-cli', dir]);
    assert.equal(result.status, 0, result.stderr);
    const records = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(records.length, 1);
    assert.equal(records[0].usage.output_tokens, 400, 'the remainder was dropped instead of priced as output');
    assert.match(flat(result.stderr), /1 reply\(ies\) without a model, 1 with impossible token counts/);
    assert.match(flat(result.stderr), /remainder is priced as output/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('bill with no path reads every agent it finds', () => {
  it('names each agent\'s folder and splits the total by agent', () => {
    const dir = home();
    const result = run(['bill', '--table'], { HOME: dir });
    assert.equal(result.status, 0, result.stderr);
    const said = flat(result.stderr);
    assert.match(said, /reading Claude Code's own folder/);
    assert.match(said, /reading Codex's own folder: .*\.codex\/sessions/);
    assert.match(said, /reading Gemini CLI's own folder: .*\.gemini\/tmp\/webshop\/chats/);
    assert.doesNotMatch(said, /shell_history/, 'a file beside the chats was read as usage');
    const out = flat(result.stdout);
    for (const agent of ['Claude Code', 'Codex', 'Gemini CLI']) {
      assert.match(out, new RegExp(`${agent} \\d+ \\$`), `${agent} has no row in the By agent table`);
    }
    assert.match(out, /Agent sessions \(Claude Code, Codex, Gemini CLI\) are priced at catalogue API rates/);
    // Gemini sessions are labelled by the project their .project_root names.
    assert.match(out, /webshop 3 \$/);
    // Nothing private reaches the statement.
    assert.ok(!(result.stdout + result.stderr).includes('SYNTHETIC_SECRET'));
    rmSync(dir, { recursive: true, force: true });
  });

  it('the agents\' rows add up to the receipt\'s total', () => {
    const dir = home();
    const receipt = JSON.parse(run(['bill', '--receipt'], { HOME: dir }).stdout);
    const statement = run(['bill', '--table'], { HOME: dir }).stdout;
    const block = statement.slice(statement.indexOf('agent'), statement.indexOf('project'));
    const rows = [...block.matchAll(/\$(\d+\.\d+)/g)].map((match) => Number(match[1]));
    assert.equal(rows.length, 3);
    // Each row is shown rounded (to the cent over $1), so the sum may be off by half a cent a row, no more.
    assert.ok(Math.abs(rows.reduce((a, b) => a + b, 0) - receipt.total.usd) <= 0.005 * rows.length, `${rows} vs ${receipt.total.usd}`);
    rmSync(dir, { recursive: true, force: true });
  });

  it('honours CODEX_HOME and GEMINI_CLI_HOME, the way the agents themselves do', () => {
    const dir = home();
    const elsewhere = mkdtempSync(join(tmpdir(), 'trazum-agents-moved-'));
    cpSync(join(dir, '.codex'), join(elsewhere, 'codex-home'), { recursive: true });
    cpSync(join(dir, '.gemini'), join(elsewhere, 'gemini-home', '.gemini'), { recursive: true });
    rmSync(join(dir, '.codex'), { recursive: true, force: true });
    rmSync(join(dir, '.gemini'), { recursive: true, force: true });
    const result = run(['bill', '--receipt'], {
      HOME: dir,
      CODEX_HOME: join(elsewhere, 'codex-home'),
      GEMINI_CLI_HOME: join(elsewhere, 'gemini-home'),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(flat(result.stderr), /codex-home\/sessions/);
    assert.match(flat(result.stderr), /gemini-home\/\.gemini\/tmp\/webshop\/chats/);
    rmSync(dir, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  });

  it('with no agent folder at all, refuses and names every place it looked', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-agents-none-'));
    const result = run(['bill'], { HOME: dir });
    assert.equal(result.status, 1);
    for (const place of ['.claude/projects', '.codex/sessions', '.gemini/tmp']) {
      assert.ok(result.stderr.includes(place), `the refusal does not name ${place}`);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('a bill of one agent prints no By agent table', () => {
    const result = run(['bill', CLAUDE_EXAMPLE, '--table']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /^\s*agent\s+calls/m);
    assert.ok(readFileSync(join(GEMINI_EXAMPLE, 'webshop', '.project_root'), 'utf8').includes('webshop'));
  });
});
