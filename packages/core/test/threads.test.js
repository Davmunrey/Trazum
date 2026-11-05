import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, claudeCodeRecords, parseUsageLine, profileUsage } from '../dist/index.js';

/**
 * A session with subagents is one session and several conversations.
 *
 * Claude Code gives a subagent its session's `sessionId`, and the subagent
 * keeps a context and a cache prefix of its own. Grouped with the main thread,
 * every finding that reads a conversation turn by turn mixed the two: on this
 * repository's own transcripts the main thread's smallest prompt is 110,262
 * tokens and a subagent's 58,190, the growth ceiling was drawn from the
 * second, and it came out $46 higher than the threads support. A subagent
 * is a `thread` now; the turn-by-turn findings group by session and thread,
 * and what a session costs stays the whole session's.
 */

const ON = new Date('2026-11-01T12:00:00Z');
const profile = (records) =>
  profileUsage(records.map((record) => JSON.stringify(record)).join('\n'), { catalogue: BUNDLED_CATALOGUE, on: ON });

const call = (i, prompt, over = {}) => ({
  model: 'claude-opus-5',
  label: 'app',
  session: 's-1',
  ts: new Date(Date.parse('2026-11-01T10:00:00Z') + i * 10_000).toISOString(),
  usage: { input_tokens: prompt, output_tokens: 10 },
  ...over,
});

describe('the thread field', () => {
  it('is read as a name, and absent when it is not one', () => {
    assert.equal(parseUsageLine(JSON.stringify(call(0, 100, { thread: 'agent-a' }))).thread, 'agent-a');
    assert.equal(parseUsageLine(JSON.stringify(call(0, 100))).thread, undefined);
    assert.equal(parseUsageLine(JSON.stringify(call(0, 100, { thread: '  ' }))).thread, undefined);
  });
});

describe('a session with a subagent', () => {
  // The main thread grows from 100k to 300k; the subagent sits at 50k.
  const main = [100_000, 200_000, 300_000].map((prompt, i) => call(i * 2, prompt));
  const sub = [50_000, 50_000, 50_000].map((prompt, i) => call(i * 2 + 1, prompt, { thread: 'agent-a' }));

  it('draws each thread’s growth from its own smallest turn', () => {
    const [growth] = profile([...main, ...sub]).conversations;
    // Opus 5 input at $5/MTok. Main: 600k tokens at $3.00, against 3 x 100k = $1.50.
    // Subagent: 150k at $0.75, against the same. Growth $1.50, not $2.25.
    assert.equal(growth.sessions, 2, 'the subagent was not a conversation of its own');
    assert.ok(Math.abs(growth.growthUsd - 1.5) < 1e-9, `growth ${growth.growthUsd}, expected 1.5`);
    // Without the thread, the subagent's 50k set the floor for the main thread too.
    const mixed = profile([...main, ...sub.map(({ thread, ...rest }) => rest)]).conversations[0];
    assert.ok(Math.abs(mixed.growthUsd - 2.25) < 1e-9, `mixed growth ${mixed.growthUsd}`);
  });

  it('still costs the session as one, subagent included', () => {
    const report = profile([...main, ...sub]);
    assert.equal(report.sessionSpend.sessions, 1);
    assert.ok(Math.abs(report.sessionSpend.maxUsd - report.total.totalUsd) < 1e-9);
  });

  it('does not read a subagent’s next call as the main thread retrying a truncated answer', () => {
    // Three truncated main-thread answers five minutes apart, too far apart to be
    // retries of each other, each followed ten seconds later by a subagent call.
    const log = (withThread) => [0, 30, 60].flatMap((i) => [
      call(i, 100_000, { stop_reason: 'max_tokens' }),
      call(i + 1, 50_000, { stop_reason: 'end_turn', ...(withThread ? { thread: 'agent-a' } : {}) }),
    ]);
    assert.deepEqual(profile(log(true)).truncationRetries, []);
    const mixed = profile(log(false)).truncationRetries;
    assert.equal(mixed.length, 1, 'the mixed log should show the false retry this prevents');
    assert.equal(mixed[0].retried, 3);
  });
});

describe('the Claude Code reader', () => {
  const line = (requestId, over = {}) => JSON.stringify({
    type: 'assistant',
    timestamp: '2026-11-01T10:00:00.000Z',
    sessionId: 's-1',
    requestId,
    message: { model: 'claude-opus-5', content: [{ type: 'text', text: 'SYNTHETIC_TEXT' }], usage: { input_tokens: 10, output_tokens: 1 } },
    ...over,
  });

  it('names a sidechain’s thread by its agent, and gives the main thread none', () => {
    const { records } = claudeCodeRecords([
      line('r-1'),
      line('r-2', { isSidechain: false }),
      line('r-3', { isSidechain: true, agentId: 'a884917708bb46956' }),
      line('r-4', { isSidechain: true }),
    ].join('\n'));
    assert.deepEqual(records.map((record) => record.thread), [undefined, undefined, 'a884917708bb46956', 'sidechain']);
    assert.ok(!JSON.stringify(records).includes('SYNTHETIC_TEXT'));
  });
});
