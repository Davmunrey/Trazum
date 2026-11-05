import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

/**
 * A Claude Code project folder as a session with subagents leaves it.
 *
 * The layout is the one Claude Code writes, measured on this repository's own
 * transcripts: the session at `<project>/<session>.jsonl`, each subagent at
 * `<project>/<session>/subagents/…/agent-<id>.jsonl`, and beside them the
 * session's other files (`agent-<id>.meta.json`, `agent-<id>.prefix.json`, a
 * workflow's `journal.jsonl`). Three things went wrong on it at once:
 *
 * - a subagent's spend was labelled by its parent folder, a `wf_…` or
 *   `subagents`, which is no project at all;
 * - a transcript that said `gen_ai.` or `resourceSpans` in its first prompt
 *   was claimed by the OTel reader too, refused as ambiguous, and its whole
 *   spend left the bill;
 * - every side file was named as a file no shape claims, a hundred and fifty
 *   lines of apparent trouble on a first run.
 */

const cli = new URL('../dist/index.js', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: SPAWN_ENV });

const call = (id, input, prompt = 'SYNTHETIC_TEXT') => [
  JSON.stringify({ type: 'user', sessionId: 's-1', message: { role: 'user', content: prompt } }),
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-11-01T10:00:00.000Z',
    sessionId: 's-1',
    requestId: `r-${id}`,
    message: { model: 'claude-opus-5', content: [{ type: 'text', text: 'never read' }], usage: { input_tokens: input, output_tokens: 0 } },
  }),
].join('\n');

it('bills a session’s subagents under its project, reads a transcript that talks telemetry, and counts side files once', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-subagents-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const project = join(dir, '-home-me-webapp');
  const session = join(project, 'session-1');
  const workflow = join(session, 'subagents', 'workflows', 'wf_1234abcd-567');
  mkdirSync(workflow, { recursive: true });
  mkdirSync(join(session, 'subagents', 'plain'), { recursive: true });

  // 200k Opus 5 input is $1.00; each of the four transcripts below is one call.
  writeFileSync(`${session}.jsonl`, call('main', 200_000));
  writeFileSync(join(workflow, 'agent-a1.jsonl'), call('wf', 200_000));
  writeFileSync(join(session, 'subagents', 'plain', 'agent-b2.jsonl'), call('task', 200_000));
  writeFileSync(
    join(workflow, 'agent-c3.jsonl'),
    call('otel', 200_000, 'Read resourceSpans and every gen_ai.usage.input_tokens attribute in the export.'),
  );
  // Claude Code's own side files, inside the session's folder.
  writeFileSync(join(workflow, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'workflow' }));
  writeFileSync(join(workflow, 'agent-a1.prefix.json'), JSON.stringify({ prefix: [] }));
  writeFileSync(join(workflow, 'journal.jsonl'), JSON.stringify({ type: 'result', key: 'k', result: 'x' }));
  // And a stray file outside any session, which is still named.
  writeFileSync(join(dir, 'notes.json'), JSON.stringify({ hello: 'world' }));

  const billed = run('bill', dir, '--locale', 'en');
  assert.equal(billed.status, 0, billed.stderr);
  const receipt = JSON.parse(billed.stdout);

  assert.equal(receipt.total.calls, 4, 'a transcript was left out of the bill');
  assert.ok(Math.abs(receipt.total.usd - 4) < 1e-9, `billed ${receipt.total.usd}, expected 4`);
  assert.deepEqual([...new Set(receipt.lines.map((line) => line.label))], ['home-me-webapp']);
  assert.doesNotMatch(billed.stderr, /ambiguous|more than one shape/);
  assert.match(billed.stderr, /3 file\(s\) Claude Code keeps inside its sessions' folders/);
  assert.match(billed.stderr, /notes\.json: no shape this tool reads claims it/);
  assert.doesNotMatch(billed.stderr, /meta\.json|prefix\.json|journal\.jsonl/);
  assert.ok(!(billed.stdout + billed.stderr).includes('SYNTHETIC_TEXT'));
});

it('from-claude-code labels a subagent by its session’s project too', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'trazum-subagents-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const session = join(dir, '-home-me-etl', 'session-9');
  mkdirSync(join(session, 'subagents'), { recursive: true });
  writeFileSync(`${session}.jsonl`, call('main', 1_000));
  writeFileSync(join(session, 'subagents', 'agent-z.jsonl'), call('sub', 1_000));

  const converted = run('from-claude-code', dir, '--locale', 'en');
  assert.equal(converted.status, 0, converted.stderr);
  const labels = converted.stdout.trim().split('\n').map((line) => JSON.parse(line).label);
  assert.deepEqual(labels, ['home-me-etl', 'home-me-etl']);
});
