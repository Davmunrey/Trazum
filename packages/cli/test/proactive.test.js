import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { BUNDLED_CATALOGUE } from '../../core/dist/node.js';
import { sectionOf } from '../../../test-utils/section.mjs';
import { SPAWN_ENV } from './env.mjs';
import {
  CRONTAB,
  MANAGED_MARK,
  RefusedWrite,
  allowlist,
  applyChange,
  cronLine,
  detectFormat,
  diffLines,
  managedLines,
  parseManaged,
  parseManagedLine,
  pathsFor,
  readExisting,
  readJsonObject,
  run,
  serialise,
  systemCrontab,
  undo,
  withManagedLine,
  withStatusLine,
  withoutManagedLines,
  withoutStatusLine,
} from '../dist/proactive.js';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;
const SCRIPT = new URL('../assets/trazum-statusline.sh', import.meta.url).pathname;
const PLUGIN_SCRIPT = new URL('../../../plugin/statusline/trazum-statusline.sh', import.meta.url).pathname;
const DOC = new URL('../../../docs/json-output.md', import.meta.url).pathname;

/**
 * `trazum proactive`: a command that edits files in a person's home directory,
 * tested against a home that is made up.
 *
 * Every test builds its own home, project and crontab under the temporary
 * directory and passes them in, so none of them can reach the real ones. The
 * last test in this file asserts that: the real home is hashed before the
 * first test and after the last, and `HOME` is pointed at a made-up one for
 * the whole file, so a function that reached for `os.homedir()` would write
 * into the made-up home, where this file would see it, and not into the real.
 */

const REAL_HOME = homedir();
/** What is at a path, read in one go: asking first and reading after are two looks at it. */
const whatIsAt = (path) => {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code === 'EISDIR') return readdirSync(path).sort().join(',');
    throw error;
  }
};
const snapshotReal = () => {
  const out = {};
  for (const name of ['.claude/settings.json', '.claude/settings.json.trazum-backup', '.mcp.json', '.trazum', '.trazum/proactive.json']) {
    out[name] = whatIsAt(join(REAL_HOME, name));
  }
  return out;
};
const realBefore = snapshotReal();
let sandboxHome;
before(async () => {
  sandboxHome = await mkdtemp(join(tmpdir(), 'trazum-proactive-home-'));
  process.env.HOME = sandboxHome;
  process.env.USERPROFILE = sandboxHome;
});

// ---------------------------------------------------------------------------
// A made-up machine
// ---------------------------------------------------------------------------

/** An in-memory crontab that records every write. */
const memoryCrontab = (initial) => {
  const box = { text: initial, writes: [] };
  return {
    box,
    read: () => (box.text === 'missing' ? { kind: 'missing' } : typeof box.text === 'object' && box.text !== null ? { kind: 'error', message: box.text.error } : box.text === null ? { kind: 'none' } : { kind: 'ok', text: box.text }),
    write: (text) => {
      box.writes.push(text);
      box.text = text;
    },
  };
};

const PAYLOAD = {
  data: [
    {
      starting_at: '2026-08-01T00:00:00Z',
      ending_at: '2026-08-02T00:00:00Z',
      results: [{ model: 'claude-opus-5', uncached_input_tokens: 200_000, output_tokens: 0 }],
    },
  ],
};

/** A home, a project inside it, a CLI that stays, and a crontab. */
async function world({ cron = null, claude = true, settings, platform = 'linux', entry } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'trazum-proactive-'));
  const home = join(root, 'home');
  const project = join(home, 'proj');
  const keep = join(root, 'keep', 'dist');
  await mkdir(project, { recursive: true });
  await mkdir(keep, { recursive: true });
  await writeFile(join(keep, 'index.js'), '#!/usr/bin/env node\n', { mode: 0o755 });
  if (claude) await mkdir(join(home, '.claude'), { recursive: true });
  if (settings !== undefined) await writeFile(join(home, '.claude', 'settings.json'), settings);
  const crontab = memoryCrontab(cron);
  const ctx = {
    home,
    cwd: project,
    platform,
    execPath: process.execPath,
    entry: entry ?? join(keep, 'index.js'),
    trazumBin: undefined,
    crontab,
    script: () => readFile(SCRIPT, 'utf8'),
    catalogue: BUNDLED_CATALOGUE,
  };
  return { root, home, project, keep, ctx, crontab, paths: pathsFor(ctx) };
}

/** What `watch` needs: something in the store, and a limit somebody chose. */
async function ready(w, { store = true, budget = true } = {}) {
  if (store) {
    await writeFile(join(w.project, 'usage.json'), JSON.stringify(PAYLOAD));
    const result = spawnSync(process.execPath, [CLI, 'connect', 'anthropic', '--payload', 'usage.json', '--store'], { cwd: w.project, encoding: 'utf8', env: SPAWN_ENV, timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
  }
  if (budget) await writeFile(join(w.project, 'trazum.config.json'), '{"spend":{"maxUsd":100}}\n');
}

/** Every file under a directory, by relative path: content, or `->` and the link target. */
async function tree(dir) {
  const out = {};
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) out[relative(dir, path)] = `-> ${readlinkSync(path)}`;
      else if (entry.isDirectory()) {
        out[`${relative(dir, path)}/`] = 'dir';
        await walk(path);
      } else out[relative(dir, path)] = await readFile(path, 'utf8');
    }
  };
  await walk(dir);
  return out;
}

const yes = () => true;
const turn = (w, action, options = {}) => run(w.ctx, { action, items: ['statusline', 'watch', 'mcp'], dryRun: false, decide: yes, ...options });
const statusOf = (outcome, item, which = 'after') => outcome[which].find((entry) => entry.item === item);
const parse = async (path) => JSON.parse(await readFile(path, 'utf8'));
const USER_SETTINGS = `${JSON.stringify(
  { model: 'opus', hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo mine' }] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo guard' }] }] } },
  null,
  2,
)}\n`;

// ---------------------------------------------------------------------------
// The crontab text, exhaustively
// ---------------------------------------------------------------------------

describe('the crontab text', () => {
  const project = '/home/u/proj';
  const line = cronLine(project, '/usr/bin/node', '/opt/trazum/dist/index.js');

  it('writes one line that reads back as the same three paths', () => {
    assert.match(line, / # trazum watch \(managed\)$/);
    const parsed = parseManagedLine(line);
    assert.deepEqual([parsed.project, parsed.node, parsed.entry], [project, '/usr/bin/node', '/opt/trazum/dist/index.js']);
    assert.ok(line.endsWith(MANAGED_MARK));
  });

  it('adds to an empty crontab, a missing one and one with no final newline', () => {
    assert.equal(withManagedLine(null, line, project), `${line}\n`);
    assert.equal(withManagedLine('', line, project), `${line}\n`);
    assert.equal(withManagedLine('MAILTO=me', line, project), `MAILTO=me\n${line}\n`);
  });

  it('keeps every other line byte for byte, blank lines and comments included', () => {
    const before = '# mine\nMAILTO=me\n\n0 3 * * * /usr/bin/backup\n\n';
    assert.equal(withManagedLine(before, line, project), `${before}${line}\n`);
  });

  it('is idempotent: adding twice is adding once', () => {
    const once = withManagedLine('0 3 * * * x\n', line, project);
    assert.equal(withManagedLine(once, line, project), once);
    assert.equal(managedLines(withManagedLine(once, line, project)).length, 1);
  });

  it('replaces this project\'s managed line in place and collapses duplicates, and keeps another project\'s', () => {
    const stale = cronLine(project, '/gone/node', '/gone/index.js');
    const other = cronLine('/home/u/other', '/usr/bin/node', '/opt/trazum/dist/index.js');
    const text = `a\n${stale}\n${other}\n${stale}\nb\n`;
    const after = withManagedLine(text, line, project);
    assert.deepEqual(after.split('\n'), ['a', line, other, 'b', '']);
  });

  it('a line that only mentions trazum, or copies part of the marker, is not managed', () => {
    for (const mine of [
      '0 * * * * trazum watch --once',
      '0 * * * * /usr/bin/x  # trazum watch (managed) was here',
      "0 * * * * cd '/p' && trazum watch --once",
      '# trazum watch (managed)',
      "0 * * * * cd '/p' && '/n' '/e' watch --once --webhook https://x # trazum watch (managed)",
    ]) {
      assert.equal(parseManagedLine(mine), null, mine);
      assert.equal(managedLines(`${mine}\n`).length, 0);
      assert.equal(withoutManagedLines(`${mine}\n`, '/p'), `${mine}\n`);
    }
  });

  it('removes only this project\'s lines, and leaves the rest as it was', () => {
    const other = cronLine('/home/u/other', '/usr/bin/node', '/e.js');
    const text = `MAILTO=me\n${line}\n0 3 * * * backup # mentions trazum\n${other}\n`;
    assert.equal(withoutManagedLines(text, project), `MAILTO=me\n0 3 * * * backup # mentions trazum\n${other}\n`);
    assert.equal(withoutManagedLines(`${line}\n`, project), '');
    assert.equal(withoutManagedLines(`${line}\n${line}\n`, project), '');
    assert.equal(withoutManagedLines(`x\n${line}`, project), 'x');
  });

  it('reads the real program: a crontab, none yet, no program, and a failure', () => {
    const run = (result) => systemCrontab(() => result);
    const base = { status: 0, stdout: '', stderr: '', errorCode: null };
    assert.deepEqual(run({ ...base, stdout: '0 * * * * x\n' }).read(), { kind: 'ok', text: '0 * * * * x\n' });
    assert.deepEqual(run({ ...base, status: 1, stderr: 'crontab: no crontab for tester' }).read(), { kind: 'none' });
    assert.deepEqual(run({ ...base, status: null, errorCode: 'ENOENT' }).read(), { kind: 'missing' });
    assert.equal(run({ ...base, status: 1, stderr: 'crontab: permission denied' }).read().kind, 'error');
    const seen = [];
    systemCrontab((args, input) => {
      seen.push([args, input]);
      return base;
    }).write('x\n');
    assert.deepEqual(seen, [[['-'], 'x\n']]);
    assert.throws(() => run({ ...base, status: 1, stderr: 'bad' }).write('x'), /bad/);
  });
});

// ---------------------------------------------------------------------------
// JSON, edited as data
// ---------------------------------------------------------------------------

describe('JSON as data', () => {
  it('keeps two spaces, four, a tab, CRLF and the absence of a final newline', () => {
    const value = { a: 1, b: { c: [1, 2] } };
    for (const [indent, eol, final] of [['  ', '\n', true], ['    ', '\n', true], ['\t', '\n', false], ['  ', '\r\n', true]]) {
      const text = serialise(value, { indent, eol, final });
      assert.deepEqual(detectFormat(text), { indent, eol, final });
      assert.equal(serialise(JSON.parse(text), detectFormat(text)), text);
    }
  });

  it('adds the status line and the hook to nothing, and again to the result, once', () => {
    const value = {};
    assert.deepEqual(withStatusLine(value, '/s.sh', '/bin/t'), ['hooks', 'Stop']);
    assert.equal(value.statusLine.command, "TRAZUM_BIN='/bin/t' '/s.sh'");
    assert.equal(value.hooks.Stop[0].hooks[0].command, "TRAZUM_BIN='/bin/t' '/s.sh' --refresh");
    const once = JSON.stringify(value);
    assert.deepEqual(withStatusLine(value, '/s.sh', '/bin/t'), []);
    assert.equal(JSON.stringify(value), once);
  });

  it('appends to a Stop array that has hooks in it, and removes only its own', () => {
    const value = { hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo mine' }] }] } };
    const mine = structuredClone(value);
    const created = withStatusLine(value, '/s.sh', '/bin/t');
    assert.deepEqual(created, []);
    assert.equal(value.hooks.Stop.length, 2);
    withoutStatusLine(value, '/s.sh', created);
    assert.deepEqual(value, mine);
  });

  it('removes a container it made, and leaves an empty one the person had', () => {
    const made = {};
    const created = withStatusLine(made, '/s.sh', '/bin/t');
    withoutStatusLine(made, '/s.sh', created);
    assert.deepEqual(made, {});
    const had = { hooks: { Stop: [] } };
    withStatusLine(had, '/s.sh', '/bin/t');
    withoutStatusLine(had, '/s.sh', []);
    assert.deepEqual(had, { hooks: { Stop: [] } });
  });

  it('leaves a user hook that sits in the same entry as its own', () => {
    const value = { hooks: { Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo a' }, { type: 'command', command: "'/s.sh' --refresh" }] }] } };
    withoutStatusLine(value, '/s.sh', []);
    assert.deepEqual(value.hooks.Stop[0].hooks, [{ type: 'command', command: 'echo a' }]);
  });

  it('knows its own command only by the exact text it writes', () => {
    assert.deepEqual(parseManaged("TRAZUM_BIN='/b' '/s.sh'", '/s.sh'), { refresh: false, bin: '/b' });
    assert.deepEqual(parseManaged("TRAZUM_BIN='/b' '/s.sh' --refresh", '/s.sh'), { refresh: true, bin: '/b' });
    assert.deepEqual(parseManaged("'/s.sh' --refresh", '/s.sh'), { refresh: true, bin: null });
    for (const other of ["'/s.sh' --refresh; rm -rf ~", "'/other.sh' --refresh", '/s.sh --refresh', "TRAZUM_BIN='/b '/s.sh'", 'echo /s.sh']) {
      assert.equal(parseManaged(other, '/s.sh'), null, other);
    }
  });

  it('reads the added and removed lines of a change', () => {
    assert.deepEqual(diffLines('a\nb\nc\n', 'a\nx\nb\nc\n'), { added: ['x'], removed: [] });
    assert.deepEqual(diffLines('a\nb\nc\n', 'a\nc\n'), { added: [], removed: ['b'] });
    assert.deepEqual(diffLines(null, 'a\nb\n'), { added: ['a', 'b'], removed: [] });
    assert.deepEqual(diffLines('a\n', null), { added: [], removed: ['a'] });
  });
});

describe('a file that cannot be rewritten without changing something else', () => {
  const read = async (text) => {
    const w = await world({ settings: text });
    return readJsonObject(w.ctx, w.paths.settings, w.home);
  };

  it('refuses comments, trailing commas, a top-level array and an empty file, naming each', async () => {
    for (const text of ['{\n  // mine\n  "a": 1\n}\n', '{ "a": 1, }', '[1]', '']) {
      const result = await read(text);
      assert.equal(result.kind, 'refused', text);
      assert.match(result.finding.code, /^file\.(unparseable|shape)$/);
    }
  });

  it('refuses a duplicate key, which writing it back would lose', async () => {
    const result = await read('{\n  "a": 1,\n  "a": 2\n}\n');
    assert.equal(result.finding.code, 'file.notExact');
  });

  it('accepts inline arrays and says its layout will be normalised', async () => {
    const result = await read('{ "hooks": { "Stop": [{ "matcher": "*" }] } }\n');
    assert.equal(result.kind, 'ok');
    assert.equal(result.reformatted, true);
  });

  it('is not troubled by a file written exactly as it would be', async () => {
    const result = await read(USER_SETTINGS);
    assert.equal(result.kind, 'ok');
    assert.equal(result.reformatted, false);
  });
});

// ---------------------------------------------------------------------------
// The faults the issue names
// ---------------------------------------------------------------------------

describe('a settings file with other hooks in it', () => {
  it('keeps every one of them when Trazum is turned on, and when it is turned off', async () => {
    const w = await world({ settings: USER_SETTINGS });
    await turn(w, 'on');
    const on = await parse(w.paths.settings);
    assert.deepEqual(on.hooks.PreToolUse, JSON.parse(USER_SETTINGS).hooks.PreToolUse);
    assert.deepEqual(on.hooks.Stop[0], JSON.parse(USER_SETTINGS).hooks.Stop[0], 'the user\'s Stop hook is first and unchanged');
    assert.equal(on.hooks.Stop.length, 2);
    assert.equal(on.model, 'opus');
    await turn(w, 'off');
    assert.equal(await readFile(w.paths.settings, 'utf8'), USER_SETTINGS, 'the file is what it was, byte for byte');
  });

  it('is turned on by a status line and a Stop hook, and never by SessionStart', async () => {
    const w = await world({ settings: USER_SETTINGS });
    await turn(w, 'on');
    const text = await readFile(w.paths.settings, 'utf8');
    assert.doesNotMatch(text, /SessionStart/);
    const on = JSON.parse(text);
    assert.deepEqual(Object.keys(on.hooks).sort(), ['PreToolUse', 'Stop']);
    assert.match(on.hooks.Stop[1].hooks[0].command, / --refresh$/);
    assert.equal(on.hooks.Stop[1].matcher, '*');
    assert.equal(on.statusLine.type, 'command');
  });
});

describe('a second run', () => {
  it('adds the same line to nothing, twice', async () => {
    const w = await world({ settings: USER_SETTINGS, cron: '0 3 * * * x\n' });
    await ready(w);
    await mkdir(join(w.project, '.cursor'));
    await turn(w, 'on');
    const first = await tree(w.root);
    const second = await turn(w, 'on');
    assert.deepEqual(await tree(w.root), first, 'every file is the same after the second run');
    assert.deepEqual(second.results.map((r) => r.outcome), ['nothing', 'nothing', 'nothing']);
    assert.equal(w.crontab.box.writes.length, 1);
    assert.equal(managedLines(w.crontab.box.text).length, 1);
    const settings = await readFile(w.paths.settings, 'utf8');
    assert.equal(settings.split(w.paths.script).length - 1, 2, 'the script is named once for the status line and once for the hook');
    assert.deepEqual(statusOf(second, 'statusline').verdict, 'on');
  });
});

describe('an uninstall', () => {
  it('removes nothing the person wrote', async () => {
    const mine = {
      hooks: {
        Stop: [{ matcher: '*', hooks: [{ type: 'command', command: "'/elsewhere/trazum-statusline.sh' --refresh" }, { type: 'command', command: 'trazum profile x.jsonl' }] }],
      },
    };
    const w = await world({ settings: `${JSON.stringify(mine, null, 2)}\n`, cron: '17 * * * * trazum watch --once\n0 5 * * * x # trazum watch\n' });
    await ready(w);
    // An MCP entry typed by hand, identical to what would be written, in a second file.
    await writeFile(join(w.project, '.mcp.json'), `${JSON.stringify({ mcpServers: { trazum: { command: 'npx', args: ['-y', '@trazum/mcp'] }, other: { command: 'x' } } }, null, 2)}\n`);
    const before = await tree(w.root);
    await turn(w, 'off');
    assert.deepEqual(await tree(w.root), before);
    assert.deepEqual(w.crontab.box.writes, []);
    const off = await run(w.ctx, { action: 'off', items: ['mcp'], dryRun: true, decide: yes });
    assert.deepEqual(off.results.map((r) => r.outcome), ['nothing']);
    assert.ok(statusOf(off, 'mcp').notes.some((n) => n.code === 'mcp.notAdded'));
  });

  it('removes the entry it added and leaves the one beside it', async () => {
    const w = await world();
    await writeFile(join(w.project, '.mcp.json'), `${JSON.stringify({ mcpServers: { other: { command: 'x' } } }, null, 4)}\n`);
    const before = await readFile(join(w.project, '.mcp.json'), 'utf8');
    await turn(w, 'on');
    const on = JSON.parse(await readFile(join(w.project, '.mcp.json'), 'utf8'));
    assert.deepEqual(Object.keys(on.mcpServers), ['other', 'trazum']);
    assert.match(await readFile(join(w.project, '.mcp.json'), 'utf8'), /^ {4}"mcpServers"/m, 'four-space indentation kept');
    await turn(w, 'off');
    assert.equal(await readFile(join(w.project, '.mcp.json'), 'utf8'), before);
  });

  it('leaves an entry somebody changed after it was added', async () => {
    const w = await world();
    await writeFile(join(w.project, '.mcp.json'), '{}\n');
    await turn(w, 'on');
    const edited = JSON.parse(await readFile(join(w.project, '.mcp.json'), 'utf8'));
    edited.mcpServers.trazum.args = ['-y', '@trazum/mcp@2.7.12'];
    await writeFile(join(w.project, '.mcp.json'), `${JSON.stringify(edited, null, 2)}\n`);
    const before = await readFile(join(w.project, '.mcp.json'), 'utf8');
    const off = await turn(w, 'off', { items: ['mcp'] });
    assert.equal(await readFile(join(w.project, '.mcp.json'), 'utf8'), before);
    assert.ok(statusOf(off, 'mcp').notes.some((n) => n.code === 'mcp.changed'));
  });

  it('leaves no managed line and no file of its own behind, and keeps the person\'s crontab', async () => {
    const w = await world({ cron: '# mine\n0 3 * * * backup\n', settings: USER_SETTINGS });
    await ready(w);
    await turn(w, 'on');
    assert.equal(managedLines(w.crontab.box.text).length, 1);
    await turn(w, 'off');
    assert.equal(managedLines(w.crontab.box.text).length, 0);
    assert.equal(w.crontab.box.text, '# mine\n0 3 * * * backup\n');
    assert.equal(existsSync(w.paths.script), false);
    assert.equal(existsSync(w.paths.scriptDir), false);
    assert.equal(existsSync(w.paths.manifest), false);
    // What stays is the copy of what they had, which is theirs to delete.
    assert.deepEqual((await readdir(w.paths.stateDir)).sort(), ['crontab.trazum-backup']);
  });

  it('leaves a managed line for another project alone, and says so', async () => {
    const other = cronLine('/home/u/other', process.execPath, '/opt/trazum/dist/index.js');
    const w = await world({ cron: `${other}\n` });
    await ready(w);
    await turn(w, 'on', { items: ['watch'] });
    assert.equal(managedLines(w.crontab.box.text).length, 2);
    const off = await turn(w, 'off', { items: ['watch'] });
    assert.equal(w.crontab.box.text, `${other}\n`);
    assert.ok(statusOf(off, 'watch').notes.some((n) => n.code === 'watch.otherProjects'));
  });
});

describe('nothing is written without a yes', () => {
  it('a dry run touches nothing, asks nothing and writes no crontab', async () => {
    const w = await world({ settings: USER_SETTINGS, cron: '0 3 * * * x\n' });
    await ready(w);
    await mkdir(join(w.project, '.cursor'));
    const before = await tree(w.root);
    let asked = 0;
    const outcome = await turn(w, 'on', { dryRun: true, decide: () => {
      asked += 1;
      return true;
    } });
    assert.deepEqual(await tree(w.root), before);
    assert.equal(asked, 0);
    assert.deepEqual(w.crontab.box.writes, []);
    assert.deepEqual(outcome.results.map((r) => r.outcome), ['would-write', 'would-write', 'would-write']);
    // And it shows the lines it would add.
    const added = outcome.results.flatMap((r) => r.changes.flatMap((c) => c.added)).join('\n');
    assert.match(added, /watch --once # trazum watch \(managed\)/);
    assert.match(added, /@trazum\/mcp/);
    assert.match(added, /--refresh/);
  });

  it('an item answered with no is not written, and the others still are', async () => {
    const w = await world({ settings: USER_SETTINGS, cron: '' });
    await ready(w);
    const before = await tree(w.home);
    const outcome = await turn(w, 'on', { decide: (item) => item !== 'statusline' });
    assert.equal(outcome.results[0].outcome, 'declined');
    assert.equal(await readFile(w.paths.settings, 'utf8'), USER_SETTINGS);
    assert.equal(existsSync(w.paths.script), false);
    assert.equal(outcome.results[1].outcome, 'written');
    assert.equal(w.crontab.box.writes.length, 1);
    assert.equal(existsSync(w.paths.manifest), false);
    assert.deepEqual(await tree(w.home), before);
  });
});

describe('where it may write', () => {
  it('refuses a file off its list, and prints the list', async () => {
    const w = await world();
    const names = allowlist(w.ctx).map((entry) => entry.target);
    assert.ok(names.includes(w.paths.settings) && names.includes(CRONTAB));
    for (const target of [join(w.home, '.bashrc'), join(w.home, '.claude', 'settings.local.json'), join(w.project, 'trazum.config.json'), join(w.home, '.ssh', 'authorized_keys'), '/etc/passwd', join(w.home, '.claude', '..', '.profile')]) {
      await assert.rejects(
        () => applyChange(w.ctx, { item: 'statusline', target, before: null, after: 'x\n', mode: 0o644, added: [], removed: [], backup: false }),
        (error) => error instanceof RefusedWrite && error.reason === 'not-allowed' && error.allowed.includes(w.paths.settings),
        target,
      );
      if (target.startsWith(w.root)) assert.equal(existsSync(target), false, target);
    }
  });

  it('is never in the config: a budget nobody gave is not written', async () => {
    const w = await world();
    await ready(w, { budget: false });
    const outcome = await turn(w, 'on', { items: ['watch'] });
    assert.equal(existsSync(join(w.project, 'trazum.config.json')), false);
    assert.equal(statusOf(outcome, 'watch').verdict, 'not-ready');
    assert.equal(statusOf(outcome, 'watch').code, 'watch.noBudget');
    assert.match(statusOf(outcome, 'watch').params.measured, /^\$1\.00$/, 'the measured figure is shown, and the limit is left to the person');
    assert.deepEqual(w.crontab.box.writes, []);
  });

  it('says what a watch is missing: the store, the limit, or both', async () => {
    const both = await world();
    assert.equal(statusOf(await inspectedRun(both), 'watch').code, 'watch.noStoreNoBudget');
    const noStore = await world();
    await ready(noStore, { store: false });
    assert.equal(statusOf(await inspectedRun(noStore), 'watch').code, 'watch.noStore');
    const noBudget = await world();
    await ready(noBudget, { budget: false });
    assert.equal(statusOf(await inspectedRun(noBudget), 'watch').code, 'watch.noBudget');
    const fine = await world();
    await ready(fine);
    assert.equal(statusOf(await inspectedRun(fine), 'watch').verdict, 'off');
  });

  it('does not follow a symbolic link, and does not write through a parent that is one', async () => {
    const w = await world();
    const outside = join(w.root, 'elsewhere.json');
    await writeFile(outside, USER_SETTINGS);
    await symlink(outside, w.paths.settings);
    const outcome = await turn(w, 'on', { items: ['statusline'] });
    assert.equal(lstatSync(w.paths.settings).isSymbolicLink(), true);
    assert.equal(await readFile(outside, 'utf8'), USER_SETTINGS, 'what the link points at is untouched');
    assert.equal(statusOf(outcome, 'statusline').verdict, 'could-not-tell');
    assert.equal(statusOf(outcome, 'statusline').code, 'file.symlink');
    assert.equal(existsSync(w.paths.script), false);
    await assert.rejects(
      () => applyChange(w.ctx, { item: 'statusline', target: w.paths.settings, before: USER_SETTINGS, after: '{}\n', mode: 0o600, added: [], removed: [], backup: false }),
      (error) => error instanceof RefusedWrite && error.reason === 'symlink',
    );
    assert.equal(await readFile(outside, 'utf8'), USER_SETTINGS);

    // `~/.claude` itself a link to somewhere outside the home.
    const w2 = await world({ claude: false });
    await mkdir(join(w2.root, 'dotfiles'));
    await writeFile(join(w2.root, 'dotfiles', 'settings.json'), USER_SETTINGS);
    await symlink(join(w2.root, 'dotfiles'), join(w2.home, '.claude'));
    const before = await tree(w2.root);
    const second = await turn(w2, 'on', { items: ['statusline'] });
    assert.equal(statusOf(second, 'statusline').code, 'file.outside');
    assert.deepEqual(await tree(w2.root), before);
  });
});

async function inspectedRun(w) {
  return run(w.ctx, { action: 'on', items: ['watch'], dryRun: true, decide: yes });
}

describe('what an outside reviewer found, and what holds it now', () => {
  /*
    Codacy's reviewer read the first version of this command and left nine
    comments. Six were right, and each is a test here: what it described is
    planted in the harness and has to fail one of these.
  */

  it('does not take a crontab it could not read for an empty one', async () => {
    // "No crontab" when it was inspected, unreadable when it is written: the two
    // used to compare equal, and the write would have replaced a crontab with one line.
    for (const second of [{ kind: 'error', message: 'temporary failure' }, { kind: 'missing' }]) {
      const w = await world();
      await ready(w);
      const writes = [];
      let reads = 0;
      w.ctx.crontab = {
        read: () => (++reads <= 1 ? { kind: 'none' } : second),
        write: (text) => writes.push(text),
      };
      const outcome = await turn(w, 'on', { items: ['watch'] });
      const [result] = outcome.results;
      assert.equal(result.outcome, 'failed', JSON.stringify(second));
      assert.equal(result.error.code, 'write.unreadable');
      assert.deepEqual(writes, [], 'a crontab was written over one that could not be read');
    }
  });

  it('does not write a hook command through a home directory with a quote in its name', async () => {
    const w = await world({ settings: undefined });
    const home = join(w.root, "o'brien");
    await mkdir(join(home, '.claude'), { recursive: true });
    await writeFile(join(home, '.claude', 'settings.json'), '{}\n');
    const ctx = { ...w.ctx, home };
    const before = await tree(home);
    const outcome = await run(ctx, { action: 'on', items: ['statusline'], dryRun: false, decide: yes });
    const status = statusOf(outcome, 'statusline');
    assert.deepEqual([status.verdict, status.code], ['not-ready', 'cli.unsafe']);
    assert.equal(status.params.path, pathsFor(ctx).script, 'the path named is not the script that would have been quoted');
    assert.deepEqual(await tree(home), before, 'something was written under a home the command cannot quote');
  });

  it('puts back the first file of an item when the second cannot be written, and records nothing', async () => {
    const w = await world();
    const first = join(w.project, '.mcp.json');
    const second = join(w.project, '.cursor', 'mcp.json');
    await mkdir(join(w.project, '.cursor'));
    const mine = `${JSON.stringify({ mcpServers: { other: { command: 'x' } } }, null, 2)}\n`;
    await writeFile(first, mine);
    await writeFile(second, mine);
    // The second file changes after the plan is shown and before it is written.
    const edited = `${JSON.stringify({ mcpServers: { other: { command: 'y' } } }, null, 2)}\n`;
    const outcome = await run(w.ctx, {
      action: 'on',
      items: ['mcp'],
      dryRun: false,
      decide: async () => {
        await writeFile(second, edited);
        return true;
      },
    });
    const [result] = outcome.results;
    assert.equal(result.outcome, 'failed');
    assert.equal(result.error.code, 'write.changed');
    assert.equal(await readFile(first, 'utf8'), mine, 'the first file kept an entry nothing records');
    assert.equal(await readFile(second, 'utf8'), edited, 'the edit made meanwhile was lost');
    assert.equal(existsSync(w.paths.manifest), false, 'the manifest records an item that was not written');
    // And the next run finds nothing half done: both files are offered again.
    const again = await turn(w, 'on', { items: ['mcp'] });
    assert.equal(again.results[0].outcome, 'written');
    assert.deepEqual(Object.keys((await parse(first)).mcpServers), ['other', 'trazum']);
    assert.deepEqual(Object.keys((await parse(second)).mcpServers), ['other', 'trazum']);
    await turn(w, 'off', { items: ['mcp'] });
    assert.equal(await readFile(first, 'utf8'), mine);
    assert.equal(await readFile(second, 'utf8'), edited);
  });

  it('says which files it could not put back, when putting back fails too', async () => {
    const w = await world();
    const a = join(w.project, '.mcp.json');
    const b = join(w.project, '.cursor', 'mcp.json');
    await mkdir(join(w.project, '.cursor'));
    const change = (target) => ({ item: 'mcp', target, before: null, after: '{"a":1}\n', mode: 0o644, added: [], removed: [], backup: false });
    await applyChange(w.ctx, change(a));
    await applyChange(w.ctx, change(b));
    await writeFile(a, '{"a":2}\n');
    assert.deepEqual(await undo(w.ctx, [change(a), change(b)]), [a], 'the file somebody changed meanwhile is the one left');
    assert.equal(existsSync(b), false, 'the other was not put back');
    assert.equal(await readFile(a, 'utf8'), '{"a":2}\n');
  });

  it('leaves a status line script the person changed: not replaced by on, not removed by off', async () => {
    const w = await world({ settings: '{}\n' });
    await turn(w, 'on', { items: ['statusline'] });
    const shipped = await readFile(w.paths.script, 'utf8');
    const theirs = `${shipped}\n# my own colours\n`;
    await writeFile(w.paths.script, theirs);

    // Still on: a script somebody edited still runs.
    assert.equal(statusOf(await inspectedRun(w), 'statusline').verdict, 'on');

    const off = await turn(w, 'off', { items: ['statusline'] });
    assert.equal(off.results[0].outcome, 'written');
    assert.equal(await readFile(w.paths.settings, 'utf8'), '{}\n', 'the entries this command wrote are gone');
    assert.equal(await readFile(w.paths.script, 'utf8'), theirs, 'the script the person changed was removed');
    const after = statusOf(off, 'statusline');
    assert.deepEqual([after.verdict, after.code], ['not-ready', 'statusline.scriptChanged']);

    const on = await turn(w, 'on', { items: ['statusline'] });
    assert.equal(on.results[0].outcome, 'nothing', 'a script that is not this command\'s was written over');
    assert.equal(await readFile(w.paths.script, 'utf8'), theirs);
    assert.equal(await readFile(w.paths.settings, 'utf8'), '{}\n');
  });

  it('does not take a file that was already where its script goes', async () => {
    const w = await world({ settings: '{}\n' });
    await mkdir(join(w.paths.script, '..'), { recursive: true });
    await writeFile(w.paths.script, '#!/bin/sh\necho mine\n');
    const outcome = await turn(w, 'on', { items: ['statusline'] });
    assert.equal(statusOf(outcome, 'statusline').code, 'statusline.scriptChanged');
    assert.equal(await readFile(w.paths.script, 'utf8'), '#!/bin/sh\necho mine\n');
    assert.equal(await readFile(w.paths.settings, 'utf8'), '{}\n');
  });

  it('still replaces its own script after an upgrade, by the record of what it wrote', async () => {
    const w = await world({ settings: '{}\n' });
    await turn(w, 'on', { items: ['statusline'] });
    const old = await readFile(w.paths.script, 'utf8');
    assert.match((await parse(w.paths.manifest)).statusline.script, /^[0-9a-f]{64}$/);
    // The next version of the CLI ships a different script, and the hook has gone.
    const newer = `${old}\n# a later version\n`;
    w.ctx.script = async () => newer;
    await writeFile(w.paths.settings, `${JSON.stringify({ statusLine: (await parse(w.paths.settings)).statusLine }, null, 2)}\n`);
    const repaired = await turn(w, 'on', { items: ['statusline'] });
    assert.equal(repaired.results[0].outcome, 'written');
    assert.equal(await readFile(w.paths.script, 'utf8'), newer, 'its own script, unchanged since it wrote it, was not updated');
    await turn(w, 'off', { items: ['statusline'] });
    assert.equal(existsSync(w.paths.script), false, 'its own script was left behind');
  });
});

describe('what is at a path is read through one open', () => {
  it('tells a file, nothing, a link, a link to nothing and a directory apart, and reads only the file', async () => {
    const w = await world();
    const file = join(w.root, 'a.json');
    await writeFile(file, '{"a":1}\n', { mode: 0o640 });
    assert.deepEqual(await readExisting(file), { kind: 'file', text: '{"a":1}\n', mode: 0o640 });
    assert.deepEqual(await readExisting(join(w.root, 'missing.json')), { kind: 'absent' });
    assert.deepEqual(await readExisting(join(file, 'under-a-file')), { kind: 'absent' });
    await symlink(file, join(w.root, 'link.json'));
    assert.deepEqual(await readExisting(join(w.root, 'link.json')), { kind: 'symlink' }, 'the text behind a link is not returned');
    await symlink(join(w.root, 'nowhere'), join(w.root, 'dangling.json'));
    assert.deepEqual(await readExisting(join(w.root, 'dangling.json')), { kind: 'symlink' });
    assert.deepEqual(await readExisting(w.home), { kind: 'other' });
  });

  it('is how the module looks at a file before reading it: no question about a path is asked ahead of its read', () => {
    const source = readFileSync(new URL('../src/proactive.ts', import.meta.url), 'utf8');
    const body = (name) => {
      const start = source.indexOf(`export async function ${name}(`);
      assert.ok(start !== -1, `${name} is gone`);
      return source.slice(start, source.indexOf('\n}\n', start));
    };
    for (const name of ['applyChange', 'readJsonObject']) {
      assert.ok(body(name).includes('await readExisting('), `${name} does not read through the one open`);
      assert.doesNotMatch(body(name), /\blstat\(|\bstat\(|\baccess\(|\breadFile\(/, `${name} asks about a path, or reads it, on its own`);
    }
    const one = body('readExisting');
    assert.ok(one.includes('constants.O_NOFOLLOW'), 'the open follows a link');
    const kind = one.indexOf('await handle.stat()');
    const text = one.indexOf('await handle.readFile(');
    assert.ok(kind !== -1 && text !== -1 && kind < text, 'the kind and the text are not both taken from the one handle, kind first');
    assert.doesNotMatch(one, /(?<![.\w])stat\(|\breadFile\(path/, 'the path is asked what it is, or read, beside the handle');
  });
});

describe('a settings file it cannot read', () => {
  it('is left alone and named, while the other items go ahead', async () => {
    const text = '{\n  // my notes\n  "model": "opus",\n}\n';
    const w = await world({ settings: text, cron: '' });
    await ready(w);
    const outcome = await turn(w, 'on');
    assert.equal(await readFile(w.paths.settings, 'utf8'), text);
    assert.equal(statusOf(outcome, 'statusline').verdict, 'could-not-tell');
    assert.equal(statusOf(outcome, 'statusline').code, 'file.unparseable');
    assert.match(statusOf(outcome, 'statusline').params.file, /settings\.json$/);
    assert.equal(existsSync(w.paths.script), false);
    assert.equal(outcome.results[0].outcome, 'nothing');
    assert.equal(statusOf(outcome, 'watch').verdict, 'on');
    assert.equal(existsSync(w.paths.settings + '.trazum-backup'), false);
    await turn(w, 'off');
    assert.equal(await readFile(w.paths.settings, 'utf8'), text, 'and off leaves it alone too');
  });

  it('is left alone when its hooks is not an object, or its Stop is not an array', async () => {
    for (const [value, key] of [[{ hooks: [] }, 'hooks'], [{ hooks: 'x' }, 'hooks'], [{ hooks: null }, 'hooks'], [{ hooks: { Stop: {} } }, 'hooks.Stop'], [{ hooks: { Stop: 'x' } }, 'hooks.Stop']]) {
      const text = `${JSON.stringify(value, null, 2)}\n`;
      const w = await world({ settings: text });
      const outcome = await turn(w, 'on', { items: ['statusline'] });
      assert.equal(await readFile(w.paths.settings, 'utf8'), text);
      assert.equal(statusOf(outcome, 'statusline').code, 'file.shape');
      assert.equal(statusOf(outcome, 'statusline').params.key, key);
    }
  });

  it('is left alone when a MCP config is not parseable, and the other client is still written', async () => {
    const w = await world();
    await mkdir(join(w.project, '.cursor'));
    await writeFile(join(w.project, '.mcp.json'), '{ "mcpServers": { } // none\n}');
    const before = await readFile(join(w.project, '.mcp.json'), 'utf8');
    const outcome = await turn(w, 'on', { items: ['mcp'] });
    assert.equal(await readFile(join(w.project, '.mcp.json'), 'utf8'), before);
    assert.equal(existsSync(join(w.project, '.cursor', 'mcp.json')), true);
    assert.equal(statusOf(outcome, 'mcp').code, 'file.unparseable');
  });

  it('writes nothing at all when its own manifest cannot be read', async () => {
    const w = await world({ settings: USER_SETTINGS });
    await mkdir(w.paths.stateDir);
    await writeFile(w.paths.manifest, 'not json');
    const before = await tree(w.root);
    const outcome = await turn(w, 'on');
    assert.deepEqual(await tree(w.root), before);
    assert.ok(outcome.results.every((r) => r.outcome === 'failed' || r.outcome === 'nothing'));
  });
});

describe('a status line somebody else set', () => {
  it('is reported and left, with no hook added for a line nobody will see', async () => {
    const text = `${JSON.stringify({ statusLine: { type: 'command', command: 'my-line.sh' } }, null, 2)}\n`;
    const w = await world({ settings: text });
    const outcome = await turn(w, 'on', { items: ['statusline'] });
    assert.equal(await readFile(w.paths.settings, 'utf8'), text);
    assert.equal(statusOf(outcome, 'statusline').verdict, 'not-ready');
    assert.equal(statusOf(outcome, 'statusline').code, 'statusline.foreign');
    assert.equal(statusOf(outcome, 'statusline').params.command, 'my-line.sh');
    assert.equal(existsSync(w.paths.script), false);
    await turn(w, 'off');
    assert.equal(await readFile(w.paths.settings, 'utf8'), text);
  });
});

describe('the one function that writes', () => {
  it('makes one backup the first time a file changes, and never replaces it', async () => {
    const w = await world({ settings: USER_SETTINGS, cron: '0 3 * * * mine\n' });
    await ready(w);
    await turn(w, 'on');
    const backup = `${w.paths.settings}.trazum-backup`;
    assert.equal(await readFile(backup, 'utf8'), USER_SETTINGS);
    assert.equal(await readFile(w.paths.cronBackup, 'utf8'), '0 3 * * * mine\n');
    // The person edits their file; Trazum is turned off and on again.
    const edited = JSON.parse(await readFile(w.paths.settings, 'utf8'));
    edited.theme = 'dark';
    await writeFile(w.paths.settings, `${JSON.stringify(edited, null, 2)}\n`);
    w.crontab.box.text = `${w.crontab.box.text}1 1 * * * later\n`;
    await turn(w, 'off');
    await turn(w, 'on');
    assert.equal(await readFile(backup, 'utf8'), USER_SETTINGS, 'still the file as it was before the first change');
    assert.equal(await readFile(w.paths.cronBackup, 'utf8'), '0 3 * * * mine\n');
  });

  it('keeps no backup of a file it made, and removes that file when it is turned off', async () => {
    const w = await world();
    await mkdir(join(w.project, '.cursor'));
    await turn(w, 'on', { items: ['mcp', 'statusline'] });
    const made = join(w.project, '.cursor', 'mcp.json');
    assert.equal(existsSync(made), true);
    assert.equal(existsSync(`${made}.trazum-backup`), false);
    assert.equal(existsSync(`${w.paths.settings}.trazum-backup`), false);
    assert.equal((lstatSync(w.paths.settings).mode & 0o777).toString(8), '600');
    await turn(w, 'off');
    assert.equal(existsSync(made), false);
    assert.equal(existsSync(w.paths.settings), false, 'the settings file it created is removed again');
    assert.equal(existsSync(join(w.project, '.cursor')), true, 'a folder it did not create stays');
    assert.equal(existsSync(join(w.home, '.claude')), true);
  });

  it('keeps the mode of a file that is there, and leaves no temporary file beside it', async () => {
    const w = await world({ settings: USER_SETTINGS });
    chmodSync(w.paths.settings, 0o640);
    await turn(w, 'on', { items: ['statusline'] });
    assert.equal((lstatSync(w.paths.settings).mode & 0o777).toString(8), '640');
    assert.equal((lstatSync(w.paths.script).mode & 0o777).toString(8), '755');
    assert.deepEqual((await readdir(join(w.home, '.claude'))).sort(), ['settings.json', 'settings.json.trazum-backup']);
    assert.deepEqual((await readdir(w.paths.scriptDir)).sort(), ['trazum-statusline.sh']);
  });

  it('writes a new file and renames it over the old, so a reader never sees half of one', async () => {
    const w = await world({ settings: USER_SETTINGS });
    const before = lstatSync(w.paths.settings).ino;
    await turn(w, 'on', { items: ['statusline'] });
    assert.notEqual(lstatSync(w.paths.settings).ino, before);
  });

  it('refuses to write a file that changed since it was read, and the person\'s edit survives', async () => {
    const w = await world({ settings: USER_SETTINGS });
    const outcome = await turn(w, 'on', {
      items: ['statusline'],
      decide: async () => {
        await writeFile(w.paths.settings, `${JSON.stringify({ ...JSON.parse(USER_SETTINGS), edited: 'meanwhile' }, null, 2)}\n`);
        return true;
      },
    });
    assert.equal(outcome.results[0].outcome, 'failed');
    assert.equal(outcome.results[0].error.code, 'write.changed');
    assert.equal(JSON.parse(await readFile(w.paths.settings, 'utf8')).edited, 'meanwhile');
    assert.doesNotMatch(await readFile(w.paths.settings, 'utf8'), /trazum-statusline/);
  });

  it('keeps tabs, CRLF and a missing final newline', async () => {
    const tabs = JSON.stringify({ model: 'x' }, null, '\t');
    const crlf = `${JSON.stringify({ model: 'x' }, null, 2).replace(/\n/g, '\r\n')}\r\n`;
    for (const [text, probe] of [[tabs, (s) => s.includes('\n\t"statusLine"') && !s.endsWith('\n')], [crlf, (s) => s.includes('\r\n  "statusLine"') && s.endsWith('\r\n') && !/[^\r]\n/.test(s)]]) {
      const w = await world({ settings: text });
      await turn(w, 'on', { items: ['statusline'] });
      const on = await readFile(w.paths.settings, 'utf8');
      assert.ok(probe(on), JSON.stringify(on.slice(0, 60)));
      await turn(w, 'off');
      assert.equal(await readFile(w.paths.settings, 'utf8'), text);
    }
  });
});

describe('the CLI it will keep running', () => {
  it('refuses a one-off npx run for the status line and the schedule, and says why', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trazum-proactive-npx-'));
    const entry = join(root, '.npm', '_npx', 'abc123', 'node_modules', '@trazum', 'cli', 'dist', 'index.js');
    await mkdir(join(entry, '..'), { recursive: true });
    await writeFile(entry, '');
    const w = await world({ cron: '', entry });
    await ready(w);
    await mkdir(join(w.project, '.cursor'));
    const outcome = await turn(w, 'on');
    assert.equal(statusOf(outcome, 'statusline').code, 'cli.unstable');
    assert.equal(statusOf(outcome, 'watch').code, 'cli.unstable');
    assert.equal(statusOf(outcome, 'statusline').verdict, 'not-ready');
    assert.equal(existsSync(w.paths.settings), false);
    assert.deepEqual(w.crontab.box.writes, []);
    assert.equal(statusOf(outcome, 'mcp').verdict, 'on', 'the MCP entry is `npx -y @trazum/mcp` by name and needs no path');
  });

  it('accepts a CLI the person named with TRAZUM_BIN, and writes that one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trazum-proactive-npx-'));
    const npx = join(root, '_npx', 'x', 'index.js');
    await mkdir(join(npx, '..'), { recursive: true });
    await writeFile(npx, '');
    const w = await world({ entry: npx, settings: '{}\n' });
    w.ctx.trazumBin = join(w.keep, 'index.js');
    await turn(w, 'on', { items: ['statusline'] });
    const on = await parse(w.paths.settings);
    assert.equal(on.statusLine.command, `TRAZUM_BIN='${join(w.keep, 'index.js')}' '${w.paths.script}'`);
  });

  it('refuses, for the status line, a CLI the hook could not start, and still schedules with it', async () => {
    // The hook runs the file by its path; the crontab line runs node with it.
    const w = await world({ cron: '', settings: '{}\n' });
    await ready(w);
    await chmod(join(w.keep, 'index.js'), 0o644);
    const outcome = await turn(w, 'on');
    assert.equal(statusOf(outcome, 'statusline').verdict, 'not-ready');
    assert.equal(statusOf(outcome, 'statusline').code, 'cli.notExecutable');
    assert.equal(await readFile(w.paths.settings, 'utf8'), '{}\n');
    assert.equal(existsSync(w.paths.script), false);
    assert.equal(statusOf(outcome, 'watch').verdict, 'on');
  });

  it('stops calling the status line on when its CLI can no longer be started', async () => {
    const w = await world({ settings: '{}\n' });
    assert.equal(statusOf(await turn(w, 'on', { items: ['statusline'] }), 'statusline').verdict, 'on');
    await chmod(join(w.keep, 'index.js'), 0o644);
    const now = statusOf(await inspectedRun(w), 'statusline');
    assert.deepEqual([now.verdict, now.code], ['not-ready', 'cli.notExecutable']);
  });

  it('refuses a path that cannot sit inside quotes, in a shell line or a crontab', async () => {
    const root = await mkdtemp(join(tmpdir(), 'trazum-proactive-quote-'));
    for (const bad of ["it's", '100%', 'a\nb']) {
      const keep = join(root, bad);
      await mkdir(keep, { recursive: true });
      await writeFile(join(keep, 'index.js'), '');
      const w = await world({ cron: '', entry: join(keep, 'index.js') });
      await ready(w);
      const outcome = await turn(w, 'on', { items: ['statusline', 'watch'] });
      assert.equal(statusOf(outcome, 'statusline').code, 'cli.unsafe', JSON.stringify(bad));
      assert.equal(statusOf(outcome, 'watch').code, 'cli.unsafe');
      assert.deepEqual(w.crontab.box.writes, []);
    }
    const w = await world({ cron: '' });
    const hostile = join(w.home, "pro'j%x");
    await mkdir(hostile);
    w.ctx.cwd = hostile;
    await ready({ ...w, project: hostile });
    assert.equal(statusOf(await inspectedRun(w), 'watch').code, 'cli.unsafe');
  });

  it('notices that what it wrote is gone, and repairs it on the next yes', async () => {
    const w = await world({ settings: '{}\n' });
    await turn(w, 'on', { items: ['statusline'] });
    await rm(w.paths.script);
    const second = await run(w.ctx, { action: 'on', items: ['statusline'], dryRun: true, decide: yes });
    assert.equal(statusOf(second, 'statusline').verdict, 'off');
    assert.equal(statusOf(second, 'statusline').code, 'statusline.stale');
    const repaired = await turn(w, 'on', { items: ['statusline'] });
    assert.equal(statusOf(repaired, 'statusline').verdict, 'on');
    assert.equal(existsSync(w.paths.script), true);
  });
});

describe('the platforms', () => {
  it('reports the status line and the schedule as not available on Windows, and still does the MCP entry', async () => {
    const w = await world({ platform: 'win32' });
    await mkdir(join(w.project, '.cursor'));
    const outcome = await turn(w, 'on');
    assert.equal(statusOf(outcome, 'statusline').verdict, 'not-available');
    assert.equal(statusOf(outcome, 'watch').verdict, 'not-available');
    assert.equal(statusOf(outcome, 'mcp').verdict, 'on');
  });

  it('reports no crontab program as not available, and a crontab that fails as unknown', async () => {
    const none = await world({ cron: 'missing' });
    await ready(none);
    assert.equal(statusOf(await inspectedRun(none), 'watch').verdict, 'not-available');
    const failing = await world({ cron: { error: 'denied' } });
    await ready(failing);
    const outcome = await turn(failing, 'on', { items: ['watch'] });
    assert.equal(statusOf(outcome, 'watch').verdict, 'could-not-tell');
    assert.deepEqual(failing.crontab.box.writes, []);
  });

  it('starts a crontab that does not exist yet with the one line', async () => {
    const w = await world({ cron: null });
    await ready(w);
    await turn(w, 'on', { items: ['watch'] });
    assert.deepEqual(w.crontab.box.writes.length, 1);
    assert.equal(w.crontab.box.text, `${cronLine(w.project, process.execPath, join(w.keep, 'index.js'))}\n`);
    assert.equal(existsSync(w.paths.cronBackup), false, 'there was nothing of theirs to keep');
  });

  it('says there is no Claude Code to add to, rather than making its settings', async () => {
    const w = await world({ claude: false });
    const outcome = await turn(w, 'on', { items: ['statusline'] });
    assert.equal(statusOf(outcome, 'statusline').code, 'statusline.noClaude');
    assert.equal(existsSync(join(w.home, '.claude')), false);
  });
});

describe('the MCP clients', () => {
  it('knows the two whose files the documents state, and prints the plugin for the third', async () => {
    const w = await world();
    assert.equal(statusOf(await run(w.ctx, { action: 'on', items: ['mcp'], dryRun: true, decide: yes }), 'mcp').code, 'mcp.noClientClaude');
    await rm(join(w.home, '.claude'), { recursive: true });
    assert.equal(statusOf(await run(w.ctx, { action: 'on', items: ['mcp'], dryRun: true, decide: yes }), 'mcp').code, 'mcp.noClient');
    assert.equal(existsSync(join(w.project, '.mcp.json')), false);
  });

  it('leaves a trazum entry that is not its own, and calls the item on', async () => {
    const w = await world();
    const text = `${JSON.stringify({ mcpServers: { trazum: { command: 'node', args: ['/mine/server.js'] } } }, null, 2)}\n`;
    await writeFile(join(w.project, '.mcp.json'), text);
    const outcome = await turn(w, 'on', { items: ['mcp'] });
    assert.equal(await readFile(join(w.project, '.mcp.json'), 'utf8'), text);
    assert.equal(statusOf(outcome, 'mcp').verdict, 'on');
    assert.ok(statusOf(outcome, 'mcp').notes.some((n) => n.code === 'mcp.other'));
  });
});

// ---------------------------------------------------------------------------
// The command, as a person runs it
// ---------------------------------------------------------------------------

describe('the command', () => {
  /** The real CLI, a made-up home, and a fake `crontab` first on PATH. */
  async function machine() {
    const w = await world({ settings: USER_SETTINGS });
    const bin = join(w.root, 'bin');
    await mkdir(bin);
    const store = join(w.root, 'crontab.txt');
    await writeFile(
      join(bin, 'crontab'),
      `#!/bin/sh\ncase "$1" in\n  -l) if [ -f "${store}" ]; then cat "${store}"; else echo "no crontab for tester" >&2; exit 1; fi ;;\n  -) cat > "${store}" ;;\nesac\n`,
    );
    await chmod(join(bin, 'crontab'), 0o755);
    await ready(w);
    const run = (args, input) =>
      spawnSync(process.execPath, [CLI, 'proactive', ...args], {
        cwd: w.project,
        encoding: 'utf8',
        timeout: 30000,
        input: input ?? '',
        env: { ...SPAWN_ENV, HOME: w.home, USERPROFILE: w.home, PATH: `${bin}:${process.env.PATH}` },
      });
    return { w, run, store };
  }

  it('is a dry run when the input is not a terminal and --yes was not given', async () => {
    const { w, run: trazum } = await machine();
    const before = await tree(w.root);
    const result = trazum(['on', '--json']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await tree(w.root), before);
    const document = JSON.parse(result.stdout);
    assert.equal(document.dryRun, true);
    assert.deepEqual(document.changes.map((c) => c.outcome), ['would-write', 'would-write', 'nothing']);
    const text = trazum(['on']).stdout;
    assert.equal(text.includes('~/.claude/settings.json'), true);
  });

  it('turns everything on with --yes, reports it, and turns it off again', async () => {
    const { w, run: trazum, store } = await machine();
    await mkdir(join(w.project, '.cursor'));
    const on = trazum(['on', '--yes', '--json']);
    assert.equal(on.status, 0, on.stderr);
    assert.deepEqual(JSON.parse(on.stdout).items.map((i) => i.state), ['on', 'on', 'on']);
    assert.equal(managedLines(readFileSync(store, 'utf8')).length, 1);

    const status = JSON.parse(trazum(['status', '--json']).stdout);
    assert.deepEqual(status.items.map((i) => [i.item, i.state]), [['statusline', 'on'], ['watch', 'on'], ['mcp', 'on']]);
    assert.equal(status.dryRun, true);
    assert.equal(status.action, 'status');

    const off = trazum(['off', '--yes', '--json']);
    assert.equal(off.status, 0, off.stderr);
    assert.deepEqual(JSON.parse(off.stdout).items.map((i) => i.state), ['off', 'off', 'off']);
    assert.equal(await readFile(w.paths.settings, 'utf8'), USER_SETTINGS);
    assert.equal(managedLines(readFileSync(store, 'utf8')).length, 0);
  });

  it('runs what it installed: the hook computes with the CLI it named, and the status line reports it', async () => {
    const { w, run: trazum } = await machine();
    assert.equal(trazum(['on', '--yes', '--only', 'statusline']).status, 0);
    const settings = await parse(w.paths.settings);
    const call = (requestId, output) =>
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-08-10T10:00:00.000Z',
        sessionId: 's1',
        requestId,
        message: {
          model: 'claude-sonnet-5',
          content: [{ type: 'text', text: 'hello' }],
          usage: { input_tokens: 100, output_tokens: output, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 },
        },
      });
    const transcript = join(w.root, 'session.jsonl');
    await writeFile(transcript, `${call('req-1', 200)}\n${call('req-2', 30)}\n`);
    const input = JSON.stringify({ session_id: 's1', model: { display_name: 'Sonnet' }, transcript_path: transcript, cost: { total_cost_usd: 1.5 } });
    const sh = (command) => spawnSync('sh', ['-c', command], { input, encoding: 'utf8', timeout: 30000, env: { ...SPAWN_ENV, TRAZUM_STATUSLINE_CACHE: join(w.root, 'cache') } });

    // Before the first turn ends there is no cache, and the line says whose figure it shows.
    const first = sh(settings.statusLine.command);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Sonnet {2}\$1\.5 \(Claude Code\)/);

    // The Stop hook, exactly as written into the settings: it has to reach the
    // CLI through the path in TRAZUM_BIN, or the status line never has a figure
    // of Trazum's and nothing says why.
    const refresh = sh(settings.hooks.Stop.at(-1).hooks[0].command);
    assert.equal(refresh.status, 0, refresh.stderr);
    assert.equal(existsSync(join(w.root, 'cache', 's1.txt')), true, 'the hook as installed wrote no cache');

    const second = sh(settings.statusLine.command).stdout;
    assert.doesNotMatch(second, /\(Claude Code\)/);
    assert.match(second, /Sonnet {2}\$\d+\.\d{4} · 2 calls/);
  });

  /**
   * The command in a real terminal, answered by a script. Python's `pty` gives
   * the CLI a terminal for standard input and output, answers each question as
   * it appears, and returns everything a person would have seen, in the order
   * they would have seen it.
   */
  const IN_A_TERMINAL = [
    'import os, pty, select, sys, time',
    'answers = [a for a in sys.argv[1].split(",") if a]',
    'pid, fd = pty.fork()',
    'if pid == 0:',
    '    os.execvp(sys.argv[2], sys.argv[2:])',
    'out = b""',
    'asked = 0',
    'deadline = time.time() + 60',
    'while time.time() < deadline:',
    '    ready, _, _ = select.select([fd], [], [], 0.2)',
    '    if fd in ready:',
    '        try:',
    '            chunk = os.read(fd, 65536)',
    '        except OSError:',
    '            break',
    '        if not chunk:',
    '            break',
    '        out += chunk',
    '        while asked < len(answers) and out.count(b"/N] ") > asked:',
    '            os.write(fd, answers[asked].encode() + b"\\n")',
    '            asked += 1',
    '    elif os.waitpid(pid, os.WNOHANG)[0]:',
    '        break',
    'sys.stdout.buffer.write(out)',
  ].join('\n');
  const hasPython = spawnSync('python3', ['-c', 'import pty'], { encoding: 'utf8' }).status === 0;
  const plain = (text) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');

  it('in a terminal, prints every file and every line of an item before it asks about it', { skip: hasPython ? false : 'python3 with pty is not on this machine' }, async () => {
    const { w, store } = await machine();
    const bin = join(w.root, 'bin');
    const inTerminal = (answers, args) =>
      plain(
        spawnSync('python3', ['-c', IN_A_TERMINAL, answers, process.execPath, CLI, 'proactive', ...args], {
          cwd: w.project,
          encoding: 'utf8',
          timeout: 90000,
          env: { ...SPAWN_ENV, HOME: w.home, USERPROFILE: w.home, PATH: `${bin}:${process.env.PATH}`, TERM: 'dumb' },
        }).stdout,
      );

    // No to everything: asked, shown, and nothing written.
    const before = await tree(w.root);
    const refused = inTerminal('n,n,n', ['on']);
    const questions = [...refused.matchAll(/\[y\/N\] /g)].map((match) => match.index);
    assert.ok(questions.length >= 2, `asked ${questions.length} question(s):\n${refused}`);
    const [first, second] = questions;
    // The status line: its settings file and the lines it adds are above its question.
    const settingsLine = refused.indexOf('~/.claude/settings.json');
    const added = refused.indexOf('+ ');
    const hook = refused.indexOf('--refresh');
    assert.ok(settingsLine !== -1 && settingsLine < first, `the file is not named before the first question:\n${refused}`);
    assert.ok(added !== -1 && added < first, 'no added line is printed before the first question');
    assert.ok(hook !== -1 && hook < first, 'the hook line is not printed before the question that writes it');
    // The schedule: its crontab line is between the two questions, not after both.
    const cron = refused.indexOf('watch --once');
    assert.ok(cron > first && cron < second, 'the crontab line is not printed between the first answer and the second question');
    assert.equal((refused.match(/--refresh/g) ?? []).length, 1, 'the lines of an item are printed twice');
    assert.match(refused, /not written, you said no/);
    assert.deepEqual(await tree(w.root), before, 'a no wrote something');

    // Yes to the first, no to the rest: only the status line is written.
    const accepted = inTerminal('y,n,n', ['on']);
    assert.match(accepted, /status line: wrote/);
    assert.equal((accepted.match(/--refresh/g) ?? []).length, 1, 'the lines of a written item are printed again after it is written');
    assert.equal(parseManaged((await parse(w.paths.settings)).statusLine.command, w.paths.script)?.refresh, false);
    assert.equal(existsSync(store), false, 'the crontab was written on a no');
  });

  it('refuses an action and an item it does not know', async () => {
    const { run: trazum } = await machine();
    assert.equal(trazum(['enable']).status, 1);
    assert.equal(trazum(['on', '--only', 'everything']).status, 1);
  });

  it('answers in another language when asked, and says the same thing in the JSON', async () => {
    const { run: trazum } = await machine();
    const en = trazum(['status']).stdout;
    const es = trazum(['status', '--locale', 'es']).stdout;
    assert.notEqual(en, es);
    assert.equal(JSON.stringify(JSON.parse(trazum(['status', '--json']).stdout).items.map((i) => i.reason)), JSON.stringify(JSON.parse(trazum(['status', '--json', '--locale', 'es']).stdout).items.map((i) => i.reason)));
  });

  it('documents every field of its JSON, and emits no other', async () => {
    const { run: trazum } = await machine();
    const document = readFileSync(DOC, 'utf8');
    const scope = sectionOf(document, '## The proactive document');
    const promised = new Set();
    for (const row of scope.matchAll(/^\| ((?:`[^`]+`(?:, )?)+) \|/gm)) {
      for (const token of row[1].matchAll(/`([^`]+)`/g)) if (!token[1].includes('.')) promised.add(token[1].replace(/\[\]$/, ''));
    }
    promised.delete('Field');
    const result = JSON.parse(trazum(['on', '--yes', '--json']).stdout);
    assert.deepEqual(Object.keys(result).filter((key) => !promised.has(key)), []);
    assert.deepEqual([...promised].filter((key) => !(key in result)), []);
    const documented = (name) => scope.includes(`\`${name}\``) || scope.includes(`\`${name}[]\``);
    for (const key of ['item', 'state', 'reason', 'detail', 'files', 'notes']) assert.ok(documented(`items[].${key}`), key);
    for (const key of ['item', 'outcome', 'error', 'files']) assert.ok(documented(`changes[].${key}`), key);
    for (const key of Object.keys(result.items[0])) assert.ok(documented(`items[].${key}`), key);
    for (const key of Object.keys(result.changes[0])) assert.ok(documented(`changes[].${key}`), key);
  });
});

// ---------------------------------------------------------------------------
// The things it relies on being true
// ---------------------------------------------------------------------------

describe('what it ships', () => {
  it('carries the status line script byte for byte as the plugin does, and the package ships it', () => {
    assert.equal(readFileSync(SCRIPT, 'utf8'), readFileSync(PLUGIN_SCRIPT, 'utf8'), 'cp plugin/statusline/trazum-statusline.sh packages/cli/assets/');
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.ok(manifest.files.includes('assets'));
    assert.equal((lstatSync(SCRIPT).mode & 0o111) !== 0, true);
  });

  it('wires the refresh to Stop in what it writes, as the script and the plugin README say', () => {
    const source = readFileSync(new URL('../src/proactive.ts', import.meta.url), 'utf8');
    assert.match(source, /hooks\.Stop = \[\]/);
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''), /SessionStart/);
  });

  it('is the only file with a write function, and the writes all go through applyChange', () => {
    const source = readFileSync(new URL('../src/proactive.ts', import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const writers = [...code.matchAll(/\b(writeFile|rename|rm|rmdir|unlink|mkdir|chmod|copyFile)\(/g)].map((m) => m[1]);
    assert.ok(writers.length > 0);
    // Each of them lives inside applyChange, writeBackup or removeEmptyDir, and nowhere else.
    const allowed = ['applyChange', 'writeBackup', 'removeEmptyDir'];
    const bodies = allowed.map((name) => {
      const start = code.indexOf(`function ${name}(`);
      assert.notEqual(start, -1, name);
      const next = code.indexOf('\n}\n', start);
      return code.slice(start, next);
    });
    let outside = code;
    for (const body of bodies) outside = outside.replace(body, '');
    assert.doesNotMatch(outside, /\b(writeFile|rename|rm|rmdir|unlink|chmod|copyFile)\(/);
  });
});

after(() => {
  assert.deepEqual(snapshotReal(), realBefore, 'the real home directory is exactly as it was');
});
