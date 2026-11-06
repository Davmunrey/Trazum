import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { handle } from '../dist/rpc.js';
import { TOOLS } from '../dist/tools.js';

/**
 * A session passed where a usage log goes, and the tool that converts it.
 *
 * An agent asked what its own work cost reaches for the session it is in.
 * `profile_usage` handed that transcript answered "No usage records in that
 * log" with every line counted unreadable, and `plan_savings` said the log
 * held no readable records: both read as a broken file, while `import_usage`
 * converts it in one call. Every log input now names what it was given and
 * the call that reads it, and the advice is followed here, not only read.
 */

const info = { name: 'synthetic-test', version: '1', instructions: '' };
const rpc = (name, args) =>
  handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, TOOLS, info);
const text = (response) => response.result.content[0].text;

const SESSION = readFileSync(
  new URL('../../../examples/claude-projects/-home-me-webapp/demo-webapp.jsonl', import.meta.url),
  'utf8',
);
const usageLog = JSON.stringify({ model: 'claude-opus-5', label: 'synthetic-work', usage: { input_tokens: 400_000, output_tokens: 1_000 } });
const codexSession = [
  { type: 'session_meta', payload: { id: 'synthetic-session', cwd: '/PRIVATE-CWD' } },
  { type: 'turn_context', payload: { model: 'gpt-5.4', cwd: '/PRIVATE-CWD' } },
  { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 }, last_token_usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 } } } },
].map((row) => JSON.stringify(row)).join('\n');
const anthropicUsage = JSON.stringify({
  data: [{ starting_at: '2026-11-01T00:00:00Z', ending_at: '2026-11-02T00:00:00Z', results: [{ model: 'claude-opus-5', uncached_input_tokens: 1000, output_tokens: 10 }] }],
  has_more: false,
});
const costReport = JSON.stringify({
  data: [{ starting_at: '2026-09-01T00:00:00Z', ending_at: '2026-09-02T00:00:00Z', results: [{ amount: '400.00', currency: 'USD' }] }],
  has_more: false,
});

const planFrom = (log) => JSON.parse(text(rpc('plan_savings', { log }))).plan;

describe('a coding agent session passed as a usage log', () => {
  const calls = {
    profile_usage: (log) => ({ log }),
    plan_savings: (log) => ({ log }),
    verify_savings: (log) => ({ plan: JSON.stringify(planFrom(usageLog)), log }),
    position: (log) => ({ log }),
  };
  for (const [tool, args] of Object.entries(calls)) {
    it(`${tool} names it and points at import_usage`, () => {
      const response = rpc(tool, args(SESSION));
      assert.equal(response.result.isError, true, `${tool} read a Claude Code session as a usage log`);
      assert.match(text(response), /log is a claude-code session, not a usage log/);
      assert.match(text(response), /Call import_usage with format "claude-code"/);
    });
  }

  it('profile_usage names previous_log when that is the one', () => {
    const response = rpc('profile_usage', { log: usageLog, previous_log: SESSION });
    assert.equal(response.result.isError, true);
    assert.match(text(response), /previous_log is a claude-code session/);
    assert.match(text(response), /pass the log it returns as previous_log/);
  });

  it('names the format import_usage needs for a Codex session', () => {
    const response = rpc('profile_usage', { log: codexSession });
    assert.equal(response.result.isError, true);
    assert.match(text(response), /Call import_usage with format "codex"/);
  });

  it('reads the log import_usage returns, which is the advice followed', () => {
    const imported = JSON.parse(text(rpc('import_usage', { format: 'claude-code', text: SESSION })));
    assert.ok(imported.records > 0);
    const profiled = rpc('profile_usage', { log: imported.log });
    assert.notEqual(profiled.result.isError, true, text(profiled));
    assert.doesNotMatch(text(profiled), /No usage records/);
    assert.notEqual(rpc('plan_savings', { log: imported.log }).result.isError, true);
  });
});

describe('other shapes passed as a usage log', () => {
  it('a provider usage report is pointed at the CLI command that converts it', () => {
    const response = rpc('profile_usage', { log: anthropicUsage });
    assert.equal(response.result.isError, true);
    assert.match(text(response), /log is anthropic-usage data, not a usage log/);
    assert.match(text(response), /trazum from-anthropic turns it into one; trazum bill reads it as it is/);
  });

  it('a cost report is pointed at reconcile', () => {
    const response = rpc('plan_savings', { log: costReport });
    assert.equal(response.result.isError, true);
    assert.match(text(response), /a provider's cost report, a bill rather than usage.*trazum reconcile/);
  });

  it('a usage log is read as before, and text nothing claims is reported as unreadable as before', () => {
    assert.notEqual(rpc('profile_usage', { log: usageLog }).result.isError, true);
    const junk = rpc('profile_usage', { log: 'not json\nstill not json' });
    assert.notEqual(junk.result.isError, true);
    assert.match(text(junk), /No usage records in that log/);
    assert.match(text(junk), /2 lines could not be read/);
  });
});

describe('the tools say so before anyone tries', () => {
  it('every log input names import_usage in its description', () => {
    let seen = 0;
    for (const tool of TOOLS) {
      const property = tool.inputSchema.properties?.log;
      if (property === undefined) continue;
      seen += 1;
      assert.match(property.description, /import_usage/, `${tool.name}.log does not mention import_usage`);
    }
    assert.ok(seen >= 4, `only ${seen} log inputs found`);
  });
});
