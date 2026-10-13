import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';
import { sectionOf } from '../../../test-utils/section.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const DOC = new URL('../../../docs/json-output.md', import.meta.url);
const root = mkdtempSync(join(tmpdir(), 'trazum-task-contract-'));
after(() => rmSync(root, { recursive: true, force: true }));

const run = (...args) => {
  const result = spawnSync(process.execPath, [CLI, 'task', ...args], {
    encoding: 'utf8', env: SPAWN_ENV, timeout: 15000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

function source(name, repeats, inputTokens) {
  const rows = Array.from({ length: repeats }, (_, index) => [
    { type: 'assistant', sessionId: `synthetic-${name}`, requestId: `synthetic-${name}-${index}`,
      timestamp: `2026-10-12T10:00:0${index * 2}Z`,
      message: { id: `synthetic-message-${index}`, model: 'claude-sonnet-4-6',
        usage: { input_tokens: inputTokens, output_tokens: 10,
          cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        content: [{ type: 'tool_use', id: `synthetic-call-${index}`, name: 'Read',
          input: { file_path: '/SYNTHETIC/task-fixture.ts' } }] } },
    { type: 'user', sessionId: `synthetic-${name}`,
      message: { content: [{ type: 'tool_result', tool_use_id: `synthetic-call-${index}`,
        content: 'Synthetic fixture output.', is_error: false }] } },
  ]).flat();
  const path = join(root, `${name}.jsonl`);
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n'));
  return path;
}

function documented(heading) {
  const doc = readFileSync(DOC, 'utf8');
  const family = sectionOf(doc, '## The task document');
  const start = family.indexOf(`\n${heading}\n`);
  assert.notEqual(start, -1, `missing task variant heading: ${heading}`);
  const rest = family.slice(start + heading.length + 2);
  const end = rest.search(/^### /m);
  const variant = end === -1 ? rest : rest.slice(0, end);
  assert.ok(variant.includes('| Field | What it holds |'), `${heading} has no field table`);
  const rows = [...variant.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]);
  assert.ok(rows.length > 0, `${heading} documents no fields`);
  assert.equal(new Set(rows).size, rows.length, `${heading} documents a field twice`);
  assert.ok(rows.every((field) => /^[A-Za-z][A-Za-z0-9]*$/u.test(field)),
    `${heading} has a field this top-level harvest cannot check`);
  return rows.sort();
}

describe('the task document fields match the documented contract', () => {
  let report;
  let comparison;
  let receipts;
  before(() => {
    const metadata = ['--type', 'synthetic-regression', '--criterion', 'Synthetic tests pass',
      '--outcome', 'accepted', '--assessor', 'synthetic-test-runner'];
    report = run('analyze', '--id', 'synthetic-baseline', ...metadata,
      '--claude-code', source('baseline', 2, 100));
    const later = run('analyze', '--id', 'synthetic-policy', ...metadata,
      '--policy', 'repeat-review-v1', '--claude-code', source('policy', 1, 80));
    const baseline = join(root, 'baseline-report.json');
    const after = join(root, 'after-report.json');
    writeFileSync(baseline, JSON.stringify(report));
    writeFileSync(after, JSON.stringify(later));
    comparison = run('compare', baseline, after);
    assert.equal(comparison.verdict, 'lower-usage');
    const instructions = join(root, 'AGENTS.md');
    writeFileSync(instructions, 'Synthetic task contract instructions.\n');
    receipts = [run('apply', baseline, '--instructions', instructions),
      run('revert', '--instructions', instructions)];
  });

  it('documents every emitted report field and emits every documented field', () => {
    assert.deepEqual(Object.keys(report).sort(), documented('### Report'));
  });

  it('documents every emitted comparison field and emits every documented field', () => {
    assert.deepEqual(Object.keys(comparison).sort(), documented('### Comparison'));
  });

  it('documents both policy receipts without accepting undocumented fields', () => {
    const fields = documented('### Policy receipt');
    for (const receipt of receipts) assert.deepEqual(Object.keys(receipt).sort(), fields);
  });
});
