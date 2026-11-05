import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SLIM_STRING_CHARS, slimUsageLine } from '../dist/index.js';

/**
 * `slimUsageLine`: a usage-log line with its content set aside, for files too
 * large to hold whole. The promise is narrow: everything a converter reads
 * (types, ids, models, timestamps, paths, counts) comes back exactly, and
 * nothing that could not be parsed is rewritten.
 */

const long = (n, char = 'x') => char.repeat(n);

describe('a usage line with its content set aside', () => {
  it('returns a short line untouched, without parsing it', () => {
    const line = '{"type":"assistant","message":{"usage":{"input_tokens":1}}}';
    assert.equal(slimUsageLine(line), line);
    // Not JSON, and short: still untouched.
    assert.equal(slimUsageLine('not json at all'), 'not json at all');
  });

  it('shortens every long string and keeps every field a converter reads', () => {
    const row = {
      type: 'assistant',
      timestamp: '2026-10-01T00:00:00Z',
      sessionId: 's1',
      cwd: '/home/me/project',
      requestId: 'req_1',
      message: {
        id: 'msg_1',
        model: 'claude-sonnet-5-5',
        stop_reason: 'end_turn',
        content: [{ type: 'thinking', thinking: long(20_000) }, { type: 'text', text: long(9_000, 'y') }],
        usage: { input_tokens: 1200, output_tokens: 400, cache_read_input_tokens: 40_000, cache_creation: { ephemeral_5m_input_tokens: 5 } },
      },
    };
    const slimmed = JSON.parse(slimUsageLine(JSON.stringify(row)));
    assert.deepEqual(slimmed.message.usage, row.message.usage);
    for (const key of ['type', 'timestamp', 'sessionId', 'cwd', 'requestId']) assert.equal(slimmed[key], row[key], key);
    assert.equal(slimmed.message.model, row.message.model);
    assert.equal(slimmed.message.id, row.message.id);
    assert.equal(slimmed.message.stop_reason, row.message.stop_reason);
    assert.equal(slimmed.message.content[0].type, 'thinking');
    assert.equal(slimmed.message.content[0].thinking, '[trazum: 20000 characters not read]');
    assert.equal(slimmed.message.content[1].text, '[trazum: 9000 characters not read]');
  });

  it('keeps a string exactly at the limit, so the longest path a label rule can name survives', () => {
    const path = `/${long(SLIM_STRING_CHARS - 1)}`;
    const line = JSON.stringify({ cwd: path, pad: long(SLIM_STRING_CHARS + 1) });
    assert.equal(JSON.parse(slimUsageLine(line)).cwd, path);
  });

  it('returns a long line with no long string byte for byte, never reformatted', () => {
    // Long only because of many short fields; spacing and number spelling kept.
    const line = `{ "a": 1.0, "items": [${Array.from({ length: 2000 }, (_, i) => `"v${i}"`).join(', ')}] }`;
    assert.ok(line.length > SLIM_STRING_CHARS);
    assert.equal(slimUsageLine(line), line);
  });

  it('never rewrites a long line it cannot parse: a CSV row stays a row', () => {
    const row = `2026-10-01,claude-sonnet-5-5,"${long(10_000)}",1200,400`;
    assert.equal(slimUsageLine(row), row);
  });
});
