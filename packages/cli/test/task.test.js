import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync, symlinkSync, linkSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const root = mkdtempSync(join(tmpdir(), 'trazum-task-cli-'));
after(() => rmSync(root, { recursive: true, force: true }));
let serial = 0;
const location = (name) => join(root, `${++serial}-${name}`);
const run = (...args) => spawnSync(process.execPath, [CLI, 'task', ...args], {
  encoding: 'utf8', env: SPAWN_ENV, timeout: 15000, maxBuffer: 4 * 1024 * 1024,
});
const json = (result) => {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
const save = (name, content) => { const path = location(name); writeFileSync(path, content); return path; };
const transcript = (count = 3, input = 100, session = 'synthetic-session') => Array.from({ length: count }, (_, index) => [
  { type: 'assistant', sessionId: session, requestId: `synthetic-request-${index}`,
    timestamp: `2026-10-12T10:00:0${index * 2}Z`, cwd: 'SYNTHETIC_PRIVATE_CWD',
    message: { id: `synthetic-message-${index}`, model: 'claude-sonnet-4-6',
      usage: { input_tokens: input, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      content: [{ type: 'tool_use', id: `synthetic-tool-${index}`, name: 'Read',
        input: { file_path: '/SYNTHETIC_PRIVATE_PATH/sample.ts' } }] } },
  { type: 'user', sessionId: session, timestamp: `2026-10-12T10:00:0${index * 2 + 1}Z`,
    message: { content: [{ type: 'tool_result', tool_use_id: `synthetic-tool-${index}`,
      is_error: false, content: 'SYNTHETIC_PRIVATE_RESULT' }] } },
]).flat().map((row) => JSON.stringify(row)).join('\n');
const metadata = ['--id', 'synthetic-task', '--type', 'bugfix', '--criterion', 'Synthetic regression suite passes'];
const assess = ['--outcome', 'accepted', '--assessor', 'synthetic-test-runner'];
const analyze = (source, ...rest) => run('analyze', ...metadata, '--claude-code', source, ...rest);
const reportFile = () => {
  const source = save('baseline.jsonl', transcript());
  const path = location('report.json');
  const result = analyze(source, ...assess, '-o', path);
  assert.equal(result.status, 0, result.stderr);
  return path;
};

describe('task efficiency CLI', () => {
  it('completes analysis, reversible policy application and an assessed paired comparison', () => {
    const before = reportFile();
    const report = JSON.parse(readFileSync(before, 'utf8'));
    assert.equal(report.kind, 'trazum-task');
    assert.equal(report.task.outcome, 'accepted');
    assert.ok(report.tools.findings.length > 0);
    assert.ok(report.tools.findings[0].occurrences.every((entry) => entry.source >= 1 && entry.line >= 1));
    const serialized = JSON.stringify(report);
    for (const secret of ['SYNTHETIC_PRIVATE_CWD', 'SYNTHETIC_PRIVATE_PATH', 'SYNTHETIC_PRIVATE_RESULT', 'synthetic-session']) {
      assert.ok(!serialized.includes(secret), secret);
    }
    if (process.platform !== 'win32') assert.equal(statSync(before).mode & 0o777, 0o600);
    const original = '# Synthetic project instructions\r\n\r\nKeep required verification.\r\n';
    const instructions = save('AGENTS.md', original);
    const applied = json(run('apply', before, '--instructions', instructions));
    assert.equal(applied.changed, true);
    assert.equal(applied.applied, true);
    assert.ok(readFileSync(instructions, 'utf8').startsWith(original));
    const policy = run('policy', before);
    assert.equal(policy.status, 0, policy.stderr);
    assert.ok(readFileSync(instructions, 'utf8').includes(policy.stdout.trimEnd()));
    assert.equal(json(run('apply', before, '--instructions', instructions)).changed, false);

    const after = location('after.json');
    assert.equal(analyze(save('after.jsonl', transcript(1, 80, 'synthetic-after-session')), ...assess,
      '--policy', 'repeat-review-v1', '-o', after).status, 0);
    const comparison = json(run('compare', before, after));
    assert.equal(comparison.verdict, 'lower-usage', JSON.stringify({ comparison,
      before: report.coverage, after: JSON.parse(readFileSync(after, 'utf8')).coverage }));
    assert.ok(comparison.tokenChange.delta < 0);
    assert.ok(comparison.limitations.length > 0);
    assert.equal(json(run('compare', before, before)).verdict, 'inconclusive');

    const appended = '\nAdditional synthetic project guidance.\n';
    writeFileSync(instructions, readFileSync(instructions, 'utf8') + appended);
    assert.equal(json(run('revert', '--instructions', instructions)).changed, true);
    assert.equal(readFileSync(instructions, 'utf8'), original + appended);
    assert.equal(json(run('revert', '--instructions', instructions)).changed, false);
  });

  it('keeps unassessed tasks inconclusive and refuses unsupported acceptance declarations', () => {
    const source = save('unknown.jsonl', transcript());
    const unknown = json(analyze(source));
    assert.equal(unknown.task.outcome, 'unknown');
    assert.equal(analyze(source, '--outcome', 'accepted').status, 1);
    const before = reportFile();
    const after = save('unknown-report.json', JSON.stringify(unknown));
    assert.equal(json(run('compare', before, after)).verdict, 'inconclusive');
  });

  it('refuses repeated session sources instead of double counting them', () => {
    const source = save('duplicate.jsonl', transcript());
    const result = analyze(source, '--claude-code', source);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(!result.stderr.includes('SYNTHETIC_PRIVATE'));
  });

  it('cannot turn report text into instructions and leaves an edited managed block untouched', () => {
    const report = reportFile();
    const instructions = save('CLAUDE.md', 'Synthetic existing instructions.');
    json(run('apply', report, '--instructions', instructions));
    const altered = readFileSync(instructions, 'utf8').replace('<!-- trazum:repeat-review-v1:end -->',
      'Synthetic manual change.\n<!-- trazum:repeat-review-v1:end -->');
    writeFileSync(instructions, altered);
    assert.equal(run('apply', report, '--instructions', instructions).status, 1);
    assert.equal(run('revert', '--instructions', instructions).status, 1);
    assert.equal(readFileSync(instructions, 'utf8'), altered);
    const tampered = JSON.parse(readFileSync(report, 'utf8'));
    tampered.tools.findings[0].instructions = 'SYNTHETIC_UNTRUSTED_INSTRUCTION';
    const unsafe = save('tampered.json', JSON.stringify(tampered));
    const result = run('policy', unsafe);
    assert.equal(result.status, 1);
    assert.ok(!result.stdout.includes('SYNTHETIC_UNTRUSTED_INSTRUCTION'));
  });

  it('never overwrites existing reports or policy files', () => {
    const source = save('report-source.jsonl', transcript());
    const out = save('existing.json', 'Synthetic original.');
    const result = analyze(source, '-o', out);
    assert.equal(result.status, 1);
    assert.equal(readFileSync(out, 'utf8'), 'Synthetic original.');
    assert.equal(run('policy', reportFile(), '--out', out).status, 1);
    assert.equal(readFileSync(out, 'utf8'), 'Synthetic original.');
  });

  it('does not publish a partial report when storage fails, and permits a clean retry', () => {
    const source = save('failure-source.jsonl', transcript());
    const output = location('retry-report.json');
    const preload = save('fail-write.mjs', `
      import fs from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.open;
      fs.open = async (...args) => {
        const handle = await original(...args);
        if (String(args[0]).includes('.trazum-task-report-')) {
          handle.writeFile = async () => {
            await handle.write(Buffer.from('{"version":'));
            throw Object.assign(new Error('Synthetic storage failure'), { code: 'ENOSPC' });
          };
        }
        return handle;
      };
      syncBuiltinESMExports();
    `);
    const result = spawnSync(process.execPath, ['--import', preload, CLI, 'task', 'analyze',
      ...metadata, '--claude-code', source, '-o', output], {
      encoding: 'utf8', env: SPAWN_ENV, timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.equal(existsSync(output), false);
    assert.ok(readdirSync(root).every((name) => !name.startsWith('.trazum-task-')));
    assert.equal(analyze(source, '-o', output).status, 0);
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).kind, 'trazum-task');
  });

  it('rejects unknown flags, duplicate metadata, extra paths and missing flag values', () => {
    const source = save('grammar.jsonl', transcript());
    for (const result of [analyze(source, '--upload'), analyze(source, '--id', 'another'),
      analyze(source, 'extra.jsonl'), run('analyze', ...metadata, '--claude-code'), run('compare', source),
      run('revert'), run('apply', reportFile())]) {
      assert.equal(result.status, 1, result.stdout);
      assert.equal(result.stdout, '');
    }
    assert.equal(run('--help').status, 0);
    assert.equal(run('analyze', '--help').status, 0);
  });

  it('bounds reads and rejects binary, malformed report and directory inputs', () => {
    const oversized = save('oversized.jsonl', ' '.repeat(400001));
    const binary = save('binary.jsonl', Buffer.from([0xff, 0xfe, 0x00]));
    for (const path of [oversized, binary, root]) {
      const result = analyze(path);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
    }
    const bad = save('bad-report.json', '{SYNTHETIC_PRIVATE_INVALID_JSON');
    const result = run('policy', bad);
    assert.equal(result.status, 1);
    assert.ok(!result.stderr.includes('SYNTHETIC_PRIVATE_INVALID_JSON'));
  });

  it('rejects FIFO and symlink inputs and hard-linked instruction files', { skip: process.platform === 'win32' }, () => {
    const source = save('real.jsonl', transcript());
    const linked = location('linked.jsonl');
    symlinkSync(source, linked);
    assert.equal(analyze(linked).status, 1);
    const fifo = location('fifo');
    assert.equal(spawnSync('mkfifo', [fifo], { env: SPAWN_ENV, timeout: 5000 }).status, 0);
    const rejected = analyze(fifo);
    assert.equal(rejected.error, undefined);
    assert.equal(rejected.status, 1);
    const instructions = save('hardlink-AGENTS.md', 'Synthetic original.');
    const alias = location('alias-AGENTS.md');
    linkSync(instructions, alias);
    assert.equal(run('apply', reportFile(), '--instructions', instructions).status, 1);
    assert.equal(readFileSync(alias, 'utf8'), 'Synthetic original.');
    const symlink = location('symlink-AGENTS.md');
    symlinkSync(instructions, symlink);
    assert.equal(run('revert', '--instructions', symlink).status, 1);
    assert.ok(readdirSync(root).every((name) => !name.startsWith('.trazum-task-')));
  });
});
