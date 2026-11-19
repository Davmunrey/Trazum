import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const SOURCE = readFileSync(new URL('../src/waste.ts', import.meta.url), 'utf8');

/**
 * `trazum waste`, end to end on made-up sessions in temporary directories.
 *
 * The figures are the ones `packages/core/test/session-waste.test.js` works out
 * by hand: the three-read session there costs $0.042 in repeated reads, and a
 * 4,000-byte CLAUDE.md is 1,000 tokens and $0.0145 over its six calls. This file
 * checks the command's reading and refusals, not the arithmetic a second time.
 */

const SECRET = 'the-secret-9f1c-never-read';
let counter = 0;

function call({ cc = 0, cr = 0, tools = [], cwd, thread }) {
  counter += 1;
  const usage = {
    input_tokens: 0,
    output_tokens: 100,
    cache_read_input_tokens: cr,
    cache_creation_input_tokens: cc,
    cache_creation: { ephemeral_5m_input_tokens: cc, ephemeral_1h_input_tokens: 0 },
  };
  const base = {
    type: 'assistant',
    timestamp: '2026-11-19T10:00:00.000Z',
    sessionId: 'made-up-session',
    requestId: `req-${counter}`,
    ...(cwd === undefined ? {} : { cwd }),
    ...(thread === undefined ? {} : { isSidechain: true, agentId: thread }),
  };
  const lines = [JSON.stringify({ ...base, message: { model: 'claude-opus-5', content: [{ type: 'text', text: SECRET }], usage } })];
  for (const tool of tools) {
    lines.push(JSON.stringify({ ...base, message: { model: 'claude-opus-5', content: [{ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input }], usage } }));
  }
  return lines.join('\n');
}
const read = (id, path = '/a.ts') => ({ id, name: 'Read', input: { file_path: path } });

const sessionText = (cwd) =>
  `${[
    call({ cc: 10_000, tools: [read('t1')], cwd }),
    call({ cr: 10_000, cc: 2_000, tools: [read('t2')] }),
    call({ cr: 12_000, cc: 3_100, tools: [read('t3')] }),
    call({ cr: 15_100, cc: 3_100, tools: [{ id: 't4', name: 'Bash', input: { command: SECRET } }] }),
    call({ cr: 18_200, cc: 600 }),
    call({ cc: 5_000 }),
  ].join('\n')}\n`;

/** A made-up machine: a project directory with a 4,000-byte CLAUDE.md, a transcript, and a home that must stay empty. */
async function machine({ claudeMd = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-waste-'));
  const project = join(root, 'project');
  const home = join(root, 'home');
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  if (claudeMd) await writeFile(join(project, 'CLAUDE.md'), `${SECRET}${'x'.repeat(4_000 - SECRET.length)}`);
  const transcript = join(root, 'session.jsonl');
  await writeFile(transcript, sessionText(project));
  return { root, project, home, transcript };
}

const run = (m, args, more = {}) =>
  spawnSync(process.execPath, [CLI, 'waste', ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, HOME: m.home, USERPROFILE: m.home, ...more },
    timeout: 30000,
  });

const tree = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = join(entry.parentPath, entry.name);
      return `${file} ${statSync(file).size} ${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
    })
    .sort();

describe('trazum waste', () => {
  it('prices the repeated reads and the CLAUDE.md it finds in the directory the session ran in', async () => {
    const m = await machine();
    const r = run(m, [m.transcript, '--json']);
    assert.equal(r.status, 0, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.kind, 'trazum-waste');
    assert.equal(report.reads.findings[0].path, '/a.ts');
    assert.ok(Math.abs(report.reads.findings[0].usd - 0.042) < 1e-9);
    assert.equal(report.claudeMd.findings[0].bytes, 4_000);
    assert.equal(report.claudeMd.findings[0].path, join(m.project, 'CLAUDE.md'));
    assert.ok(Math.abs(report.claudeMd.findings[0].usd - 0.0145) < 1e-9);
    assert.equal(report.pricing.basis, 'api-equivalent');
  });

  it('prints the findings for a person, with the date of the catalogue and what it did not price', async () => {
    const m = await machine();
    const r = run(m, [m.transcript]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('/a.ts'));
    assert.ok(r.stdout.includes('$0.042'), r.stdout);
    assert.ok(r.stdout.includes('$0.0145') || r.stdout.includes('$0.015'), r.stdout);
    assert.ok(/not in the transcript|records no list/.test(r.stdout), 'the MCP finding says why it is not priced');
    assert.ok(r.stdout.includes('recommends and edits no file'));
  });

  it('reads the subagents in the folder beside the transcript', async () => {
    const m = await machine();
    const folder = join(m.root, 'session', 'subagents');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'agent-1.jsonl'), `${[call({ cc: 3_000, thread: 'agent-1' }), call({ cr: 3_000, cc: 100, thread: 'agent-1' })].join('\n')}\n`);
    const report = JSON.parse(run(m, [m.transcript, '--json']).stdout);
    assert.equal(report.session.calls, 8);
    assert.equal(report.session.threads, 2);
  });

  it('takes the size of a CLAUDE.md named with --claude-md, and says so when there is none to size', async () => {
    const m = await machine({ claudeMd: false });
    assert.equal(JSON.parse(run(m, [m.transcript, '--json']).stdout).claudeMd.checked, false);
    const other = join(m.root, 'other.md');
    await writeFile(other, 'y'.repeat(8_000));
    const report = JSON.parse(run(m, [m.transcript, '--claude-md', other, '--json']).stdout);
    assert.equal(report.claudeMd.findings[0].bytes, 8_000);
    assert.equal(report.claudeMd.findings[0].tokens, 2_000);
  });

  it('never prints a line of the CLAUDE.md, of the conversation, or of a command it ran', async () => {
    const m = await machine();
    for (const args of [[], ['--json']]) {
      const r = run(m, [m.transcript, ...args]);
      assert.equal(r.stdout.includes(SECRET) || r.stderr.includes(SECRET), false, `a planted secret was printed with [${args}]`);
    }
  });

  it('writes nothing: not the transcript, not the CLAUDE.md, not the home directory', async () => {
    const m = await machine();
    const before = tree(m.root);
    for (const args of [[], ['--json']]) assert.equal(run(m, [m.transcript, ...args]).status, 0);
    assert.deepEqual(tree(m.root), before);
    assert.deepEqual(readdirSync(m.home), []);
  });

  it('opens no file for its content except the transcripts', () => {
    // `sizeOf` is a stat. Every read of a file's text in this module is one of the session's own transcripts.
    const reads = SOURCE.match(/readFile\(/g) ?? [];
    assert.equal(reads.length, 1, 'a second read of a file would be a read of something that is not a transcript');
    const sizeOfBody = SOURCE.slice(SOURCE.indexOf('export async function sizeOf'));
    assert.ok(sizeOfBody.includes('stat(') && !sizeOfBody.includes('readFile'));
    assert.ok(!/writeFile|appendFile|unlink|rename|mkdir|createWriteStream/.test(SOURCE), 'it recommends and edits no file');
  });

  it('refuses a pricing overlay, a missing path, a bad --min-reads and a path that is not a file', async () => {
    const m = await machine();
    for (const flag of ['--pricing', '--pricing-live', '--config']) {
      const r = run(m, [m.transcript, flag]);
      assert.notEqual(r.status, 0, flag);
      assert.ok(r.stderr.includes(flag), r.stderr);
    }
    assert.notEqual(run(m, []).status, 0);
    assert.notEqual(run(m, [m.transcript, '--min-reads', '1']).status, 0, 'a file read once has not been read again');
    assert.notEqual(run(m, [m.transcript, '--min-reads', 'many']).status, 0);
    assert.notEqual(run(m, [join(m.root, 'nope.jsonl')]).status, 0);
    assert.notEqual(run(m, [m.root]).status, 0);
  });

  it('lists a file only at --min-reads reads, and takes server names from --mcp-servers', async () => {
    const m = await machine();
    const none = JSON.parse(run(m, [m.transcript, '--min-reads', '4', '--json']).stdout);
    assert.deepEqual(none.reads.findings, []);
    const named = JSON.parse(run(m, [m.transcript, '--mcp-servers', 'alpha, beta', '--json']).stdout);
    assert.equal(named.mcp.source, 'flag');
    assert.deepEqual(named.mcp.unused.map((entry) => entry.server), ['alpha', 'beta']);
  });

  it('answers in the language asked for', async () => {
    const m = await machine();
    const en = run(m, [m.transcript]).stdout;
    const es = run(m, [m.transcript, '--locale', 'es']).stdout;
    assert.notEqual(en, es);
    assert.ok(es.includes('/a.ts') && es.includes('$0.042'));
  });
});

/** The text of one `## ` section of a document, up to the next. */
const sectionOf = (document, heading) => {
  const start = document.indexOf(`${heading}\n`);
  assert.ok(start >= 0, `${heading} is not in the document`);
  const next = document.indexOf('\n## ', start + heading.length);
  return document.slice(start, next < 0 ? undefined : next);
};

describe('the document it prints with --json', () => {
  it('documents every field in docs/json-output.md, and emits no other', async () => {
    const document = readFileSync(new URL('../../../docs/json-output.md', import.meta.url), 'utf8');
    const scope = sectionOf(document, '## The waste document');
    const promised = new Set();
    for (const row of scope.matchAll(/^\| ((?:`[^`]+`(?:, )?)+) \|/gm)) {
      for (const token of row[1].matchAll(/`([^`]+)`/g)) promised.add(token[1].replace(/\[\]/g, ''));
    }
    promised.delete('Field');
    const m = await machine();
    const report = JSON.parse(run(m, [m.transcript, '--json', '--mcp-servers', 'alpha']).stdout);
    const emitted = new Set();
    const walk = (value, path) => {
      if (Array.isArray(value)) {
        for (const item of value) if (typeof item === 'object' && item !== null) walk(item, path);
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      for (const [key, inner] of Object.entries(value)) {
        emitted.add(path === '' ? key : `${path}.${key}`);
        walk(inner, path === '' ? key : `${path}.${key}`);
      }
    };
    walk(report, '');
    assert.deepEqual([...emitted].filter((key) => !promised.has(key)).sort(), [], 'emitted and not documented');
    assert.deepEqual([...promised].filter((key) => !emitted.has(key)).sort(), [], 'documented and not emitted');
  });
});
