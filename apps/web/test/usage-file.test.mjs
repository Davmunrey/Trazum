import assert from 'node:assert/strict';
import { register } from 'node:module';
import { describe, it } from 'node:test';
import { claudeCodeRecords, codexRecords } from '@trazum/core';

register('./helpers/loader.mjs', import.meta.url);
const { readUsageFile, UsageFileTooLarge, WHOLE_READ_MAX_BYTES } = await import('../lib/usage-file.ts');

/**
 * A dropped file too large for `File.text()`, in the Bill tab.
 *
 * A browser cannot hold a string much past 512 MiB, and a Claude Code session
 * that read large files grows past that. Past the line, the tab streams the
 * file and sets each line's message text aside with `slimUsageLine`. The line
 * is moved down to one byte here, so the streamed path runs on a small file,
 * and the converters must return exactly what they return from a whole read.
 */

const big = (n) => 'SYNTHETIC_CONTENT '.repeat(Math.ceil(n / 18)).slice(0, n);
const transcript = Array.from({ length: 12 }, (_, i) => [
  { type: 'user', timestamp: '2026-10-01T10:00:00Z', sessionId: 'big', message: { role: 'user', content: [{ type: 'tool_result', content: big(12_000) }] } },
  {
    type: 'assistant', timestamp: '2026-10-01T10:00:01Z', sessionId: 'big', cwd: '/home/me/big', requestId: `req_${i}`,
    message: { id: `msg_${i}`, model: 'claude-sonnet-5-5', content: [{ type: 'thinking', thinking: big(9_000) }], usage: { input_tokens: 100 + i, output_tokens: 20 } },
  },
]).flat().map((row) => JSON.stringify(row)).join('\n');

const codexCount = { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 1020 };
const rollout = [
  { type: 'session_meta', payload: { id: 'big-codex' } },
  { type: 'turn_context', payload: { model: 'gpt-5-mini', instructions: big(30_000) } },
  { timestamp: '2026-10-22T10:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: codexCount, last_token_usage: codexCount } } },
].map((row) => JSON.stringify(row)).join('\r\n');

describe('a dropped usage file too large to hold whole', () => {
  it('reads an ordinary file whole, as before', async () => {
    const read = await readUsageFile(new File([transcript], 'small.jsonl'));
    assert.equal(read.inParts, false);
    assert.equal(read.text, transcript);
    assert.equal(WHOLE_READ_MAX_BYTES, 256 * 1024 * 1024);
  });

  it('streams past the line and converts to exactly the same records', async () => {
    const read = await readUsageFile(new File([transcript], 'big.jsonl'), { wholeReadMaxBytes: 1 });
    assert.equal(read.inParts, true);
    assert.equal(read.slimmed, 24);
    assert.deepEqual(claudeCodeRecords(read.text), claudeCodeRecords(transcript));
    assert.ok(!read.text.includes('SYNTHETIC_CONTENT'), 'set-aside text was kept');
  });

  it('handles CRLF line endings and a chunk boundary inside a line', async () => {
    // Several small chunks, so lines are split across reads.
    const bytes = new TextEncoder().encode(rollout);
    const chunks = [];
    for (let at = 0; at < bytes.length; at += 997) chunks.push(bytes.slice(at, at + 997));
    const read = await readUsageFile(new File(chunks, 'rollout.jsonl'), { wholeReadMaxBytes: 1 });
    assert.deepEqual(codexRecords(read.text), codexRecords(rollout.replaceAll('\r\n', '\n')));
    assert.equal(codexRecords(read.text).records.length, 1);
  });

  it('names a file that is too large even line by line, rather than failing the tab', async () => {
    await assert.rejects(
      readUsageFile(new File([transcript], 'huge.jsonl'), { wholeReadMaxBytes: 1, slimmedMaxChars: 1000 }),
      (error) => error instanceof UsageFileTooLarge && error.fileName === 'huge.jsonl' && error.code === 'file-too-large',
    );
  });
});
