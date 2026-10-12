import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { SPAWN_ENV } from '../packages/cli/test/env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'packages/cli/dist/index.js');
const mcp = join(root, 'packages/mcp/dist/index.js');
const log = [1, 2].map((day) => JSON.stringify({
  model: 'claude-opus-5', label: 'synthetic-evaluation',
  ts: `2026-10-0${day}T12:00:00Z`,
  usage: { input_tokens: 200000, output_tokens: 100 },
})).join('\n');

function run(entry, args, cwd, input) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd, env: SPAWN_ENV, input, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function callTool(cwd, name, args) {
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'trazum-agent-evaluation', version: '1.0.0' },
    } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } },
  ];
  const responses = run(mcp, [], cwd, requests.map(JSON.stringify).join('\n') + '\n')
    .trim().split('\n').map((line) => JSON.parse(line));
  const answer = responses.find((response) => response.id === 2);
  assert.ok(answer, 'MCP must answer the tool call before closing');
  assert.equal(answer.error, undefined);
  assert.notEqual(answer.result.isError, true, JSON.stringify(answer.result));
  return JSON.parse(answer.result.content.map((part) => part.text ?? '').join('\n'));
}

test('an agent can exchange plans between CLI and MCP without losing evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'trazum-agent-evaluation-'));
  try {
    const logPath = join(directory, 'usage.jsonl');
    const planPath = join(directory, 'plan.json');
    writeFileSync(logPath, log);
    const cliPlan = JSON.parse(run(cli, ['plan', logPath, '--json'], directory));
    const planned = callTool(directory, 'plan_savings', { log });
    assert.equal(planned.evidence.complete, true);
    assert.equal(planned.evidence.pricedCalls, 2);
    assert.ok(planned.plan.actions.length > 0, 'Fixture must exercise a real proposal');
    assert.deepEqual(planned.plan.actions, cliPlan.actions);
    assert.equal(planned.plan.projectedSavingUsd, cliPlan.projectedSavingUsd);

    writeFileSync(planPath, JSON.stringify(planned.plan));
    const cliVerified = JSON.parse(run(cli, ['verify', planPath, '--against', logPath, '--json'], directory));
    const mcpVerified = callTool(directory, 'verify_savings', { plan: JSON.stringify(planned.plan), log });
    assert.deepEqual(mcpVerified.verification, cliVerified);

    const cliPlanVerified = callTool(directory, 'verify_savings', { plan: JSON.stringify(cliPlan), log });
    assert.equal(cliPlanVerified.verification.planCreatedAt, cliPlan.createdAt);
    assert.deepEqual(cliPlanVerified.verification.actions, cliVerified.actions);

    const disappeared = log.replaceAll('synthetic-evaluation', 'different-synthetic-workload');
    const unknown = callTool(directory, 'verify_savings', { plan: JSON.stringify(cliPlan), log: disappeared });
    assert.equal(unknown.verification.arrived, 0);
    assert.equal(unknown.verification.cannotTell, cliPlan.actions.length);

    const guard = callTool(directory, 'spend_guard', { model: 'claude-opus-5', inputTokens: 1000 });
    assert.equal(guard.verdict, 'cannot-tell', 'Missing budget must never become permission');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
