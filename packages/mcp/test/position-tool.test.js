import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TOOLS } from '../dist/tools.js';

/**
 * The position over MCP — the same `positionReport` the CLI and the HTML
 * door answer with, which is the claim: an agent asking "how much room is
 * left" gets the same measured position a person reading the page gets.
 */

const tool = TOOLS.find((entry) => entry.name === 'position');

const LOG = [1, 2, 3, 4, 5, 6, 7, 8]
  .map((day) =>
    JSON.stringify({
      model: 'claude-opus-5',
      label: 'chat',
      session: 'session-key-Zq88-never-shown',
      ts: `2026-08-0${day}T10:00:00Z`,
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    }),
  )
  .join('\n');

describe('position over MCP', () => {
  it('answers with the document, division labelled, never the session key', () => {
    const out = tool.run({ log: LOG, monthlyUsd: 100, limits: { byLabel: { chat: 60 } } });
    const document = JSON.parse(out);
    assert.equal(document.source, 'usage-log');
    const month = document.positions.find((p) => p.scope === 'month');
    assert.equal(month.measuredUsd, 40);
    if (month.distance !== null) assert.equal(month.distance.arithmetic, 'division');
    assert.ok(!out.includes('session-key-Zq88'), 'the answer echoes a session key');
    assert.ok(!out.includes('forecast'), 'a forecast field appeared');
  });

  it('validates the limits policy with the config file\'s own refusals', () => {
    assert.throws(() => tool.run({ log: LOG, limits: { dayUsd: 0 } }), /outage as a policy/);
    assert.throws(() => tool.run({ log: LOG, limits: { dayusd: 5 } }), /did you mean "dayUsd"/);
    assert.throws(() => tool.run({ log: LOG, monthlyUsd: -1 }), /positive number of dollars/);
  });
});
