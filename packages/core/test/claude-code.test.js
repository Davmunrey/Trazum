import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { claudeCodeRecords, parseUsageLine } from '../dist/index.js';

/**
 * The transcript converter, held to the two promises the 1.69 plan makes:
 * the counts survive exactly once per API call, and nothing else survives
 * at all. Both are proven the three-doors way — by inspecting the output,
 * not by trusting the code.
 */

const SECRET_TEXT = 'the-user-said-something-private-9f1c';
const SECRET_PATH = '/home/somebody/very-private-project';
const SECRET_BRANCH = 'feature/secret-launch';

const assistant = (over = {}) => ({
  type: 'assistant',
  timestamp: '2026-08-10T10:00:00.000Z',
  sessionId: 'session-1',
  requestId: 'req-1',
  cwd: SECRET_PATH,
  gitBranch: SECRET_BRANCH,
  message: {
    model: 'claude-sonnet-5',
    content: [{ type: 'text', text: SECRET_TEXT }],
    usage: {
      input_tokens: 10,
      output_tokens: 20,
      cache_read_input_tokens: 30,
      cache_creation_input_tokens: 40,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 40 },
      service_tier: 'standard',
    },
  },
  ...over,
});

const lines = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n');

describe('the transcript converter prices each call once', () => {
  it('collapses the one-line-per-content-block repetition', () => {
    // The measured norm: one call, three lines, identical usage. One record.
    const text = lines(assistant(), assistant(), assistant());
    const out = claudeCodeRecords(text);
    assert.equal(out.records.length, 1);
    assert.equal(out.collapsed, 2);
    assert.equal(out.streamed, 0);
    assert.equal(out.disagreements, 0);
  });

  it('keeps the final counts of a call written while streaming, without alarm', () => {
    const early = assistant();
    early.message = { ...early.message, usage: { ...early.message.usage, output_tokens: 1 } };
    const out = claudeCodeRecords(lines(early, assistant()));
    assert.equal(out.records.length, 1);
    assert.equal(out.records[0].usage.output_tokens, 20, 'the final line did not stand');
    assert.equal(out.streamed, 1);
    assert.equal(out.disagreements, 0);
  });

  it('counts a shrinking count as a disagreement, not as streaming', () => {
    const late = assistant();
    late.message = { ...late.message, usage: { ...late.message.usage, output_tokens: 5 } };
    const out = claudeCodeRecords(lines(assistant(), late));
    assert.equal(out.streamed, 0);
    assert.equal(out.disagreements, 1);
    // The last line still stands — resolved loudly, not silently reordered.
    assert.equal(out.records[0].usage.output_tokens, 5);
  });

  it('keeps calls with no requestId, counted', () => {
    const bare = assistant({ requestId: undefined });
    delete bare.requestId;
    const out = claudeCodeRecords(lines(bare, bare));
    // Nothing to collapse against: both are kept, and the count says so.
    assert.equal(out.records.length, 2);
    assert.equal(out.noRequestId, 2);
  });

  it('counts the transcript’s other business without converting it', () => {
    const out = claudeCodeRecords(
      lines({ type: 'user', message: { content: SECRET_TEXT } }, { type: 'system' }, assistant()) +
        '\nnot json at all\n',
    );
    assert.equal(out.records.length, 1);
    assert.equal(out.otherLines, 2);
    assert.equal(out.unparseable, 1);
  });

  it('every record it emits parses as a usage-log line, TTL split intact', () => {
    // The whole point: the output feeds parseUsageLine — the same door every
    // other log walks through. A record the parser rejects is a conversion
    // that lied about its own format.
    const out = claudeCodeRecords(lines(assistant()), { label: 'agent' });
    const parsed = parseUsageLine(JSON.stringify(out.records[0]));
    assert.ok(parsed !== null, 'parseUsageLine rejected a converted record');
    assert.equal(parsed.model, 'claude-sonnet-5');
    assert.equal(parsed.label, 'agent');
    assert.equal(parsed.session, 'session-1');
    assert.ok(parsed.ts !== null, 'the timestamp did not survive');
    assert.equal(parsed.writeTtlKnown, true, 'the cache TTL split did not survive');
  });
});

describe('nothing but the numbers crosses the conversion', () => {
  it('no message text, no path, no branch, no requestId in the output', () => {
    // Grep the entire serialised output — the three-doors method. The
    // fixture plants a secret in each field a transcript actually carries;
    // if any appears, the converter reached past the usage object.
    const out = claudeCodeRecords(lines(assistant(), { type: 'user', message: { content: SECRET_TEXT } }));
    const serialised = JSON.stringify(out);
    for (const planted of [SECRET_TEXT, SECRET_PATH, SECRET_BRANCH, 'req-1', 'service_tier']) {
      assert.ok(!serialised.includes(planted), `${planted} crossed the conversion`);
    }
    // And the session id is the one thing of the envelope that does survive
    // — grouped by downstream, never printed, the standing rule.
    assert.ok(serialised.includes('session-1'));
  });
});
