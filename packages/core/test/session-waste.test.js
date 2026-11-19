import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, analyzeSessionWaste, mcpServerOf, sessionCwd } from '../dist/index.js';

/**
 * Waste in a session, named and priced from its own counts (#822).
 *
 * **The money is worked out by hand.** Every call below is Claude Opus 5, and
 * in the bundled catalogue that model is $5 per million input tokens and $25
 * per million output, with the cache multipliers the provider publishes: a
 * 5-minute cache write is 1.25x the input price ($6.25 per million) and a cache
 * read is 0.1x ($0.50 per million). Opus 5 has one tier, fast mode, and no call
 * here asks for it, so nothing depends on how big a prompt is.
 *
 * The session is one thread of six calls. P is the prompt a call was sent
 * (input + cache read + cache write) and O its output:
 *
 *   call  tool call          cache read  cache write   P        O
 *   1     Read /a.ts               0       10,000     10,000   100
 *   2     Read /a.ts (again)  10,000        2,000     12,000   100
 *   3     Read /a.ts (again)  12,000        3,100     15,100   100
 *   4     Bash                15,100        3,100     18,200   100
 *   5     (none)              18,200          600     18,800   100
 *   6     (none: compacted)        0        5,000      5,000   100
 *
 * What a repeat added to the context is P(next) - P(this) - O(this):
 *
 *   repeat at call 2: 15,100 - 12,000 - 100 = 3,000 tokens
 *   repeat at call 3: 18,200 - 15,100 - 100 = 3,000 tokens
 *
 * Those tokens arrived as cache writes on the next call and rode as cache reads
 * on every later call until call 6, whose prompt is smaller than call 5's and so
 * says the context was compacted: nothing is carried past it. Taking them out:
 *
 *   call 3  3,000 cache write           3,000 x $6.25 / 1M = $0.01875
 *   call 4  3,000 cache read            3,000 x $0.50 / 1M = $0.00150
 *           3,000 cache write           3,000 x $6.25 / 1M = $0.01875
 *   call 5  6,000 cache read            6,000 x $0.50 / 1M = $0.00300
 *   call 6  nothing                                          $0.00000
 *                                                     total  $0.04200
 *
 * A 4,000-byte CLAUDE.md is 4,000 / 4 = 1,000 tokens. They are written once, by
 * call 1, and read by calls 2 to 5; call 6 has no cache to read, so it writes
 * them again:
 *
 *   call 1  1,000 write   $0.00625     calls 2-5  4 x 1,000 read  $0.00200
 *   call 6  1,000 write   $0.00625                          total  $0.01450
 *
 * and at the band's two ends, 33% either side (670 and 1,330 tokens):
 *
 *   670 tokens:   2 x 670 x $6.25 / 1M + 4 x 670 x $0.50 / 1M = $0.009715
 *   1,330 tokens: 2 x 1,330 x $6.25 / 1M + 4 x 1,330 x $0.50 / 1M = $0.019285
 */

const ON = new Date('2026-11-19T12:00:00Z');
const OPTIONS = { catalogue: BUNDLED_CATALOGUE, on: ON, minReads: 3 };
const SECRET = 'the-secret-9f1c-never-read';

let counter = 0;
/** One assistant line. `tools` become tool_use blocks, written on a line of their own after a text block. */
function call({ cc = 0, cr = 0, out = 100, tools = [], thread, cwd, request } = {}) {
  counter += 1;
  const requestId = request ?? `req-${counter}`;
  const usage = {
    input_tokens: 0,
    output_tokens: out,
    cache_read_input_tokens: cr,
    cache_creation_input_tokens: cc,
    cache_creation: { ephemeral_5m_input_tokens: cc, ephemeral_1h_input_tokens: 0 },
  };
  const base = {
    type: 'assistant',
    timestamp: '2026-11-19T10:00:00.000Z',
    sessionId: 'made-up-session',
    requestId,
    ...(cwd === undefined ? {} : { cwd }),
    ...(thread === undefined ? {} : { isSidechain: true, agentId: thread }),
  };
  const message = (content) => ({ model: 'claude-opus-5', content, usage });
  const lines = [JSON.stringify({ ...base, message: message([{ type: 'text', text: SECRET }]) })];
  for (const tool of tools) {
    lines.push(JSON.stringify({ ...base, message: message([{ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input }]) }));
  }
  return lines.join('\n');
}
const read = (id, path = '/a.ts', extra = {}) => ({ id, name: 'Read', input: { file_path: path, ...extra } });
const edit = (id, path) => ({ id, name: 'Edit', input: { file_path: path, old_string: SECRET, new_string: SECRET } });
const failed = (id) =>
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: SECRET }] } });
const text = (...lines) => `${lines.join('\n')}\n`;

/** The session in the table above. */
const session = (cwd) =>
  text(
    call({ cc: 10_000, tools: [read('t1')], cwd }),
    call({ cr: 10_000, cc: 2_000, tools: [read('t2')] }),
    call({ cr: 12_000, cc: 3_100, tools: [read('t3')] }),
    call({ cr: 15_100, cc: 3_100, tools: [{ id: 't4', name: 'Bash', input: { command: SECRET } }] }),
    call({ cr: 18_200, cc: 600 }),
    call({ cc: 5_000 }),
  );

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} is not ${expected}`);
const only = (report) => {
  assert.equal(report.cannotTell, null);
  return report.reads.findings;
};

describe('the same file read again', () => {
  it('prices the context a repeat added and carried, to the figure worked out above', () => {
    const report = analyzeSessionWaste([session()], OPTIONS);
    const [row] = only(report);
    assert.equal(report.session.calls, 6);
    assert.equal(row.path, '/a.ts');
    assert.equal(row.reads, 3);
    assert.equal(row.repeats, 2);
    assert.equal(row.measured, 2);
    assert.equal(row.tokens, 6_000);
    near(row.usd, 0.042, 'the saving');
    near(report.reads.usd, 0.042, 'the total');
  });

  it('stops carrying the growth where the prompt shrinks, which is a compaction', () => {
    // Without the reset, call 6 would lose 6,000 tokens it never carried and the total would grow.
    const report = analyzeSessionWaste([session()], OPTIONS);
    near(report.reads.usd, 0.042, 'call 6 contributes nothing');
  });

  it('does not count a read that follows a write to the same file', () => {
    const lines = text(
      call({ cc: 10_000, tools: [read('r1', '/b.ts')] }),
      call({ cr: 10_000, cc: 2_000, tools: [read('r2', '/b.ts')] }),
      call({ cr: 12_000, cc: 2_000, tools: [edit('e1', '/b.ts')] }),
      call({ cr: 14_000, cc: 2_000, tools: [read('r3', '/b.ts')] }),
      call({ cr: 16_000, cc: 2_000 }),
    );
    const [row] = only(analyzeSessionWaste([lines], OPTIONS));
    assert.equal(row.reads, 3);
    assert.equal(row.repeats, 1, 'r2 repeats r1; r3 reads what the edit changed');
  });

  it('does not count a different range of the same file as the same read', () => {
    const lines = text(
      call({ cc: 10_000, tools: [read('r1', '/c.ts', { offset: 0, limit: 100 })] }),
      call({ cr: 10_000, cc: 2_000, tools: [read('r2', '/c.ts', { offset: 100, limit: 100 })] }),
      call({ cr: 12_000, cc: 2_000, tools: [read('r3', '/c.ts', { offset: 200, limit: 100 })] }),
      call({ cr: 14_000, cc: 2_000 }),
    );
    assert.deepEqual(only(analyzeSessionWaste([lines], OPTIONS)), []);
  });

  it('ignores a read the tool reported as an error', () => {
    const lines = text(
      call({ cc: 10_000, tools: [read('r1', '/d.ts')] }),
      failed('r1'),
      call({ cr: 10_000, cc: 2_000, tools: [read('r2', '/d.ts')] }),
      call({ cr: 12_000, cc: 2_000, tools: [read('r3', '/d.ts')] }),
      call({ cr: 14_000, cc: 2_000, tools: [read('r4', '/d.ts')] }),
      call({ cr: 16_000, cc: 2_000 }),
    );
    const [row] = only(analyzeSessionWaste([lines], OPTIONS));
    assert.equal(row.reads, 3, 'the failed read is not a read');
    assert.equal(row.repeats, 2);
  });

  it('counts a repeat made beside other tool calls and does not price it', () => {
    const lines = text(
      call({ cc: 10_000, tools: [read('r1', '/e.ts'), read('x1', '/other.ts')] }),
      call({ cr: 10_000, cc: 2_000, tools: [read('r2', '/e.ts'), read('x2', '/other.ts')] }),
      call({ cr: 12_000, cc: 2_000, tools: [read('r3', '/e.ts'), read('x3', '/other.ts')] }),
      call({ cr: 14_000, cc: 2_000 }),
    );
    const report = analyzeSessionWaste([lines], OPTIONS);
    const rows = Object.fromEntries(only(report).map((row) => [row.path, row]));
    assert.equal(rows['/e.ts'].repeats, 2);
    assert.equal(rows['/e.ts'].measured, 0);
    assert.equal(rows['/e.ts'].usd, null, 'growth shared among two calls cannot be split, so no figure is made up');
    assert.equal(report.reads.usd, null);
  });

  it('keeps every conversation apart: a subagent reading a file the main thread read is not a repeat', () => {
    const main = text(call({ cc: 10_000, tools: [read('m1')] }), call({ cr: 10_000, cc: 2_000 }));
    const sub = text(
      call({ cc: 8_000, tools: [read('s1')], thread: 'agent-1' }),
      call({ cr: 8_000, cc: 2_000, thread: 'agent-1' }),
    );
    const report = analyzeSessionWaste([main, sub], { ...OPTIONS, minReads: 2 });
    assert.equal(report.session.threads, 2);
    assert.equal(report.session.calls, 4);
    assert.deepEqual(only(report), [], 'two reads in two threads, none repeated in either');
  });

  it('lists only files read at least --min-reads times, and says how many it left out', () => {
    const report = analyzeSessionWaste([session()], { ...OPTIONS, minReads: 4 });
    assert.deepEqual(only(report), []);
    assert.equal(report.reads.omitted, 1);
  });

  it('pairs a tool call written on its own line with the usage of its call', () => {
    // `call` writes every call as two lines, a text block and a tool_use block, with one requestId.
    const report = analyzeSessionWaste([session()], OPTIONS);
    assert.equal(report.session.calls, 6, 'twelve lines, six calls');
  });
});

describe('MCP servers loaded and never called', () => {
  const attachment = (type, body) => JSON.stringify({ type: 'attachment', attachment: { type, ...body } });
  const withList = (extra = []) =>
    text(
      attachment('deferred_tools_delta', {
        addedNames: ['mcp__alpha__one', 'mcp__alpha__two', 'mcp__beta__search', 'Bash'],
        addedLines: [`${SECRET} a description that is never read`],
        removedNames: [],
      }),
      call({ cc: 10_000, tools: [{ id: 'm1', name: 'mcp__alpha__one', input: { q: SECRET } }, ...extra] }),
      call({ cr: 10_000, cc: 100 }),
    );

  it('names the server that was loaded and not called, and the tools it brought', () => {
    const report = analyzeSessionWaste([withList()], OPTIONS);
    assert.equal(report.mcp.source, 'transcript');
    assert.equal(report.mcp.loaded, 2);
    assert.equal(report.mcp.called, 1);
    assert.deepEqual(report.mcp.unused, [{ server: 'beta', tools: 1 }]);
  });

  it('does not price it: the definitions are not in the transcript', () => {
    const { mcp } = analyzeSessionWaste([withList()], OPTIONS);
    assert.equal(mcp.unpricedReason, 'definitions-not-recorded');
    for (const entry of mcp.unused) assert.deepEqual(Object.keys(entry).sort(), ['server', 'tools'], 'no figure of money on a server');
  });

  it('says it cannot tell when the transcript lists nothing, and takes the names the person gives', () => {
    const plain = text(call({ cc: 10_000, tools: [{ id: 'm1', name: 'mcp__alpha__one', input: {} }] }));
    assert.equal(analyzeSessionWaste([plain], OPTIONS).mcp.source, 'none');
    const named = analyzeSessionWaste([plain], { ...OPTIONS, mcpServers: ['alpha', 'gamma'] });
    assert.equal(named.mcp.source, 'flag');
    assert.deepEqual(named.mcp.unused, [{ server: 'gamma', tools: null }]);
  });

  it('forgets a tool the transcript later says was removed', () => {
    const lines = text(
      attachment('deferred_tools_delta', { addedNames: ['mcp__gone__x'], removedNames: [] }),
      attachment('deferred_tools_delta', { addedNames: [], removedNames: ['mcp__gone__x'] }),
      call({ cc: 1_000 }),
    );
    const report = analyzeSessionWaste([lines], OPTIONS);
    assert.equal(report.mcp.loaded, 0);
    assert.deepEqual(report.mcp.unused, []);
  });

  it('reads the server out of a tool name', () => {
    assert.equal(mcpServerOf('mcp__alpha__one'), 'alpha');
    assert.equal(mcpServerOf('mcp__my_server__a__b'), 'my_server');
    assert.equal(mcpServerOf('Read'), undefined);
  });
});

describe('a CLAUDE.md carried on every turn', () => {
  it('prices the tokens a size implies, to the figure worked out above, with the band either side', () => {
    const report = analyzeSessionWaste([session()], { ...OPTIONS, claudeMd: [{ path: '/p/CLAUDE.md', bytes: 4_000 }] });
    const [finding] = report.claudeMd.findings;
    assert.equal(finding.tokens, 1_000);
    assert.equal(finding.calls, 6);
    near(finding.usd, 0.0145, 'the cost');
    near(finding.usdLow, 0.009715, 'the low end');
    near(finding.usdHigh, 0.019285, 'the high end');
    assert.equal(report.claudeMd.bandPct, 33);
  });

  it('says it was not checked when no size was given, and finds nothing', () => {
    const report = analyzeSessionWaste([session()], OPTIONS);
    assert.equal(report.claudeMd.checked, false);
    assert.deepEqual(report.claudeMd.findings, []);
  });
});

describe('what it reads, and what it never does', () => {
  it('carries nothing of what was said, run or returned into the report', () => {
    const withEverything = text(
      JSON.stringify({ type: 'attachment', attachment: { type: 'deferred_tools_delta', addedNames: ['mcp__s__t'], addedLines: [SECRET] } }),
      call({ cc: 10_000, tools: [read('r1'), { id: 'b1', name: 'Bash', input: { command: `echo ${SECRET}` } }], cwd: `/work/${SECRET}` }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'r1', content: SECRET }, { type: 'text', text: SECRET }] } }),
      call({ cr: 10_000, cc: 100, tools: [read('r2')] }),
      call({ cr: 10_100, cc: 100, tools: [read('r3')] }),
      call({ cr: 10_200, cc: 100 }),
    );
    const report = analyzeSessionWaste([withEverything], { ...OPTIONS, claudeMd: [{ path: '/p/CLAUDE.md', bytes: 100 }] });
    assert.ok(report.reads.findings.length > 0, 'the planted session did produce a finding to search');
    assert.equal(JSON.stringify(report).includes(SECRET), false, 'a secret planted in text, a command, a result, a description or a directory reached the report');
  });

  it('reads the directory a session ran in as a path and nothing else', () => {
    assert.equal(sessionCwd(session('/work/project')), '/work/project');
    assert.equal(sessionCwd(session()), undefined);
  });

  it('says, in the report, what it cannot know', () => {
    const report = analyzeSessionWaste([session()], OPTIONS);
    assert.ok(report.limitations.length >= 5);
    assert.equal(report.pricing.basis, 'api-equivalent');
    assert.equal(report.pricing.lastReviewed, BUNDLED_CATALOGUE.lastReviewed);
  });

  it('reports a model with no price instead of counting it as free', () => {
    const odd = text(
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-11-19T10:00:00.000Z',
        requestId: 'r-x',
        message: { model: 'made-up-model-9', content: [], usage: { input_tokens: 1_000, output_tokens: 10 } },
      }),
    );
    assert.deepEqual(analyzeSessionWaste([odd], OPTIONS).unpricedModels, ['made-up-model-9']);
  });

  it('says it cannot tell when a call could not be read as usage, and computes nothing', () => {
    const undated = text(
      JSON.stringify({ type: 'assistant', requestId: 'r-y', message: { model: 'claude-opus-5', content: [], usage: { input_tokens: 1_000, output_tokens: 10 } } }),
    );
    const report = analyzeSessionWaste([undated], OPTIONS);
    assert.equal(report.cannotTell, 'unreadable');
    assert.deepEqual(report.reads.findings, []);
  });
});
