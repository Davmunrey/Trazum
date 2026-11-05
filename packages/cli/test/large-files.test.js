import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';
import { SPAWN_ENV } from './env.mjs';

/**
 * Usage files too large to hold whole.
 *
 * JavaScript cannot hold a string much past 512 MiB, and a Claude Code session
 * that read large files grows past that: one such transcript failed the whole
 * bill with the runtime's "Invalid string length", naming no file. Past a size
 * line, a file is now read line by line with its message text set aside.
 *
 * The line is moved down to one byte here (TRAZUM_WHOLE_READ_MAX_BYTES), so
 * every file takes the line-by-line path, and the bill must come out byte for
 * byte the same as the whole read: same calls, same money, same labels. The
 * fixtures carry long thinking, tool results and instructions, the content
 * that is set aside, in all three agents' formats.
 */

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const CLAUDE_EXAMPLE = new URL('../../../examples/claude-projects', import.meta.url).pathname;
const GEMINI_EXAMPLE = new URL('../../../examples/gemini-tmp', import.meta.url).pathname;

const run = (args, env = {}) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, TRAZUM_LOCALE: 'en', ...env },
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  });
const flat = (text) => text.replace(/\s+/g, ' ');
const big = (n) => 'SYNTHETIC_CONTENT '.repeat(Math.ceil(n / 18)).slice(0, n);

/** A Claude Code transcript whose lines are long because of content, not usage. */
const claudeTranscript = Array.from({ length: 30 }, (_, i) => [
  { type: 'user', timestamp: `2026-10-0${1 + (i % 9)}T10:00:00Z`, sessionId: 'big', cwd: '/home/me/big', message: { role: 'user', content: [{ type: 'tool_result', content: big(12_000) }] } },
  {
    type: 'assistant', timestamp: `2026-10-0${1 + (i % 9)}T10:00:01Z`, sessionId: 'big', cwd: '/home/me/big', requestId: `req_big_${i}`,
    message: {
      id: `msg_big_${i}`, model: i % 2 ? 'claude-sonnet-5-5' : 'claude-opus-5-5',
      content: [{ type: 'thinking', thinking: big(9_000), signature: 'sig' }, { type: 'text', text: big(5_000) }],
      usage: { input_tokens: 1_000 + i, output_tokens: 300 + i, cache_read_input_tokens: 20_000, cache_creation_input_tokens: i % 5 === 0 ? 4_000 : 0 },
    },
  },
]).flat().map((row) => JSON.stringify(row)).join('\n');

const codexCount = { input_tokens: 100_000, cached_input_tokens: 40_000, output_tokens: 2_000, reasoning_output_tokens: 500, total_tokens: 102_000 };
const codexRollout = [
  { type: 'session_meta', payload: { id: 'big-codex', cwd: '/home/me/big' } },
  { type: 'turn_context', payload: { model: 'gpt-5-mini', instructions: big(30_000) } },
  { type: 'response_item', payload: { type: 'message', content: [{ type: 'output_text', text: big(20_000) }] } },
  { timestamp: '2026-10-22T10:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: codexCount, last_token_usage: codexCount } } },
].map((row) => JSON.stringify(row)).join('\n');

function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-large-'));
  cpSync(CLAUDE_EXAMPLE, join(dir, 'claude'), { recursive: true });
  mkdirSync(join(dir, 'claude', '-home-me-big'), { recursive: true });
  writeFileSync(join(dir, 'claude', '-home-me-big', 'big.jsonl'), claudeTranscript);
  mkdirSync(join(dir, 'codex', '2026', '10', '22'), { recursive: true });
  writeFileSync(join(dir, 'codex', '2026', '10', '22', 'rollout-2026-10-22T10-00-00-big.jsonl'), codexRollout);
  cpSync(GEMINI_EXAMPLE, join(dir, 'gemini'), { recursive: true });
  return dir;
}

describe('a usage file too large to hold whole', () => {
  it('bills the same, byte for byte, read line by line as read whole', () => {
    const dir = tree();
    try {
      const paths = ['claude', 'codex', 'gemini'].map((name) => join(dir, name));
      const whole = run(['bill', ...paths, '--receipt']);
      assert.equal(whole.status, 0, whole.stderr);
      const parts = run(['bill', ...paths, '--receipt'], { TRAZUM_WHOLE_READ_MAX_BYTES: '1' });
      assert.equal(parts.status, 0, parts.stderr);
      assert.equal(parts.stdout, whole.stdout, 'reading line by line changed the bill');
      // The receipt is real: every agent's calls are in it.
      const receipt = JSON.parse(whole.stdout);
      assert.ok(receipt.lines.some((line) => line.model === 'gpt-5-mini'), 'the Codex call is missing');
      assert.ok(receipt.lines.some((line) => line.model.startsWith('gemini-')), 'the Gemini calls are missing');
      assert.ok(receipt.lines.some((line) => line.label === 'home-me-big'), 'the large Claude Code session is missing');
      // Said, per file, because a bill read differently should say how.
      assert.match(flat(parts.stderr), /big\.jsonl: \d+ MB, too large to hold whole, so it was read line by line; the message text in 60 line\(s\) was set aside/);
      assert.doesNotMatch(whole.stderr, /read line by line/);
      // Set-aside text never reaches the output, and neither does the marker.
      assert.ok(!parts.stdout.includes('SYNTHETIC_CONTENT') && !parts.stdout.includes('characters not read'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads a gzipped log that inflates past the line the same way', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-large-gz-'));
    try {
      const file = join(dir, 'big.jsonl.gz');
      writeFileSync(file, gzipSync(claudeTranscript));
      const whole = run(['bill', file, '--receipt']);
      assert.equal(whole.status, 0, whole.stderr);
      const parts = run(['bill', file, '--receipt'], { TRAZUM_WHOLE_READ_MAX_BYTES: '1' });
      assert.equal(parts.status, 0, parts.stderr);
      assert.equal(parts.stdout, whole.stdout);
      assert.match(flat(parts.stderr), /read line by line/);

      // A corrupt archive is still the gzip refusal, on either path.
      writeFileSync(file, Buffer.concat([gzipSync(claudeTranscript).subarray(0, 200), Buffer.from('garbage')]));
      const broken = run(['bill', file], { TRAZUM_WHOLE_READ_MAX_BYTES: '1' });
      assert.notEqual(broken.status, 0);
      assert.match(flat(broken.stderr), /is gzipped and would not decompress/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('names the file and what to do when even the slimmed lines are too many, never "Invalid string length"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trazum-large-refuse-'));
    try {
      const file = join(dir, 'huge.jsonl');
      writeFileSync(file, claudeTranscript);
      const result = run(['bill', file], { TRAZUM_WHOLE_READ_MAX_BYTES: '1', TRAZUM_SLIMMED_MAX_CHARS: '2000' });
      assert.equal(result.status, 1);
      assert.match(flat(result.stderr), /huge\.jsonl is \d+ MB, and even with its message text set aside it is more than one read can hold\. Split it/);
      assert.doesNotMatch(result.stderr, /Invalid string length|at file:\/\//);

      const es = run(['bill', file], { TRAZUM_WHOLE_READ_MAX_BYTES: '1', TRAZUM_SLIMMED_MAX_CHARS: '2000', TRAZUM_LOCALE: 'es' });
      assert.match(flat(es.stderr), /ni dejando aparte el texto de los mensajes cabe en una sola lectura/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves an ordinary file on the whole-file path: the line is far above any real log', () => {
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    assert.match(source, /: 256 \* 1024 \* 1024;/, 'the whole-read line moved');
    assert.match(source, /: 500 \* 1024 \* 1024;/, 'the slimmed ceiling moved past the runtime string limit');
  });
});
