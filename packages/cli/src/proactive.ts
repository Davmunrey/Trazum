/**
 * `trazum proactive`: the three places Trazum can speak first, turned on and
 * off from one command.
 *
 * It edits files in a person's home directory, so this module is written for
 * restraint before features. The rules, each held by `proactive.test.js`:
 *
 * - **One door for every write.** `applyChange` takes the target, the text the
 *   caller read and the text it wants, and is the only function here that
 *   writes. It refuses a target that is not on the allowlist it prints, one
 *   that is a symlink, one whose parent leaves its root, and one that changed
 *   since it was read. It writes a temporary file beside the target and renames
 *   it over, keeps the mode, and makes one backup beside the file on the first
 *   change only.
 * - **Nothing is written because nobody said no.** Planning never writes; the
 *   caller decides, per item, and a decision of "no" is the default.
 * - **JSON is edited as data.** A file `JSON.parse` rejects, or one this
 *   module could not write back exactly as it was apart from the lines it
 *   adds, is left alone and named.
 * - **Its own lines are recognisable without a marker.** JSON has no comments,
 *   so a hook and a status line are Trazum's by the exact command written, and
 *   a server entry by being exactly the entry written and recorded in the
 *   manifest. The crontab line carries a trailing comment.
 * - **The home directory is a parameter.** Nothing below reads the real
 *   environment; `Ctx` carries every fact about the machine, so a test passes a
 *   made-up one.
 *
 * Nothing here sends anything anywhere. What it turns on reads files already
 * on the machine.
 */

import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, chmod, lstat, mkdir, open, realpath, rename, rmdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { bucketedProfile, bucketsFromRecords } from '@trazum/core';
import type { PricingCatalogue } from '@trazum/core';
import { loadConfig } from '@trazum/core/node';
import type { CrontabResult } from './git.js';
import type { ProactiveCode } from './i18n/types.js';
import { readStore } from './store-fs.js';

// --------------------------------------------------------------------------
// What it is about
// --------------------------------------------------------------------------

export type Item = 'statusline' | 'watch' | 'mcp';
export const ITEMS: readonly Item[] = ['statusline', 'watch', 'mcp'];

export type Verdict = 'on' | 'off' | 'not-ready' | 'not-available' | 'could-not-tell';

/** A reason as data: the command turns it into a sentence in the reader's language. */
export interface Finding {
  code: ProactiveCode;
  params: Record<string, string>;
}

export interface ItemStatus extends Finding {
  item: Item;
  verdict: Verdict;
  /** Files this item reads or would write, as absolute paths. */
  files: string[];
  /** Things left alone while the item went on or off, each with its reason. */
  notes: Finding[];
}

/** The crontab, behind a seam so a test never touches the real one. */
export type CrontabRead =
  | { kind: 'ok'; text: string }
  | { kind: 'none' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

export interface CrontabIO {
  read(): CrontabRead | Promise<CrontabRead>;
  write(text: string): void | Promise<void>;
}

/** The real crontab, through the one module that may start a process. */
export function systemCrontab(run: (args: readonly ['-l'] | readonly ['-'], input?: string) => CrontabResult): CrontabIO {
  return {
    read() {
      const result = run(['-l']);
      if (result.errorCode === 'ENOENT') return { kind: 'missing' };
      if (result.errorCode !== null) return { kind: 'error', message: result.errorCode };
      if (result.status === 0) return { kind: 'ok', text: result.stdout };
      if (result.status === 1 && /no crontab for/i.test(result.stderr)) return { kind: 'none' };
      return { kind: 'error', message: (result.stderr.trim() || `exit status ${result.status}`).slice(0, 200) };
    },
    write(text) {
      const result = run(['-'], text);
      if (result.errorCode !== null || result.status !== 0) {
        throw new Error((result.stderr.trim() || result.errorCode || `exit status ${result.status}`).slice(0, 200));
      }
    },
  };
}

/** Every fact about the machine the command needs, so a test can make one up. */
export interface Ctx {
  /** The person's home directory, resolved once by the caller. */
  home: string;
  /** The project: where `watch` runs and where project MCP configs live. */
  cwd: string;
  platform: NodeJS.Platform;
  /** The node binary running this CLI. */
  execPath: string;
  /** The CLI's entry file, symlinks resolved. */
  entry: string;
  /** `TRAZUM_BIN`, when the person set one: a CLI they chose to keep. */
  trazumBin: string | undefined;
  crontab: CrontabIO;
  /** The status line script, as shipped in the CLI package. */
  script: () => Promise<string>;
  catalogue: PricingCatalogue;
}

// --------------------------------------------------------------------------
// Where it may write
// --------------------------------------------------------------------------

/** The pseudo-target for the user's crontab: not a path, and on the allowlist. */
export const CRONTAB = 'crontab';

export const BACKUP_SUFFIX = '.trazum-backup';
export const MANAGED_MARK = '# trazum watch (managed)';
export const MCP_ENTRY = { command: 'npx', args: ['-y', '@trazum/mcp'] } as const;

export interface Paths {
  settings: string;
  scriptDir: string;
  script: string;
  stateDir: string;
  manifest: string;
  cronBackup: string;
  mcp: { client: 'claude-code' | 'cursor'; path: string; dir: string; folder: string | null }[];
}

export function pathsFor(ctx: Ctx): Paths {
  const home = resolve(ctx.home);
  const cwd = resolve(ctx.cwd);
  const stateDir = join(home, '.trazum');
  const scriptDir = join(stateDir, 'statusline');
  return {
    settings: join(home, '.claude', 'settings.json'),
    scriptDir,
    script: join(scriptDir, 'trazum-statusline.sh'),
    stateDir,
    manifest: join(stateDir, 'proactive.json'),
    cronBackup: join(stateDir, `crontab${BACKUP_SUFFIX}`),
    mcp: [
      { client: 'claude-code', path: join(cwd, '.mcp.json'), dir: cwd, folder: null },
      { client: 'cursor', path: join(cwd, '.cursor', 'mcp.json'), dir: cwd, folder: join(cwd, '.cursor') },
    ],
  };
}

interface Allowed {
  target: string;
  /** The directory a target must stay inside once symlinks are resolved. */
  root: string;
  /** Whether a first change keeps a copy of what the person had. */
  backup: boolean;
}

/** Every target a write may name. The list is printed when one is refused. */
export function allowlist(ctx: Ctx): Allowed[] {
  const p = pathsFor(ctx);
  const home = resolve(ctx.home);
  const owned: Allowed[] = [
    { target: p.settings, root: home, backup: true },
    ...p.mcp.map((m) => ({ target: m.path, root: m.dir, backup: true })),
  ];
  return [
    ...owned,
    { target: CRONTAB, root: home, backup: true },
    { target: p.script, root: home, backup: false },
    { target: p.manifest, root: home, backup: false },
    { target: p.cronBackup, root: home, backup: false },
    // The copy made beside a file the first time it changes.
    ...owned.map((entry) => ({ target: `${entry.target}${BACKUP_SUFFIX}`, root: entry.root, backup: false })),
  ];
}

export class RefusedWrite extends Error {
  constructor(
    readonly reason: 'not-allowed' | 'symlink' | 'outside' | 'changed' | 'unreadable',
    readonly target: string,
    readonly allowed: string[],
  ) {
    super(`refused to write ${target}: ${reason}`);
  }
}

/** A path in the shape a person reads: `~` for the home directory. */
export function shown(ctx: Ctx, path: string): string {
  const home = resolve(ctx.home);
  if (path === home) return '~';
  return path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path;
}

// --------------------------------------------------------------------------
// The one door
// --------------------------------------------------------------------------

export interface Change {
  item: Item | 'manifest' | 'session-guard';
  /** An absolute path, or `CRONTAB`. */
  target: string;
  /** What the caller read: `null` when the file was not there. */
  before: string | null;
  /** What it wants there: `null` removes the file. */
  after: string | null;
  /** The mode of a file this creates. An existing file keeps its own. */
  mode: number;
  /** Lines that appear, and lines that go, as a person reads them. */
  added: string[];
  removed: string[];
  /** Keep a copy of `before` beside the target, unless one is there already. */
  backup: boolean;
}

async function present(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

async function realOrSelf(path: string): Promise<string> {
  // The nearest ancestor that exists, resolved, with the rest put back: a
  // target that is not there yet still lives somewhere that can be checked.
  let tail = '';
  let at = path;
  for (;;) {
    try {
      return join(await realpath(at), tail);
    } catch {
      const parent = dirname(at);
      if (parent === at) return path;
      tail = join(basename(at), tail);
      at = parent;
    }
  }
}

export type Existing =
  | { kind: 'absent' }
  | { kind: 'symlink' }
  | { kind: 'other' }
  | { kind: 'file'; text: string; mode: number };

/**
 * What is at a path, and its text when it is a file, through one open.
 *
 * Asking what a path is and then reading it are two looks at the path, and it
 * can be swapped for something else between them: a file checked not to be a
 * symbolic link and then read through one. So the file is opened once, told
 * not to follow a link, and both the kind and the text are taken from that
 * one handle. What was checked is what was read.
 */
export async function readExisting(path: string): Promise<Existing> {
  // Where the platform cannot refuse a link at open (Windows), the path is
  // looked at after the handle is held: late, and still not before the read.
  const noFollow: number | undefined = constants.O_NOFOLLOW;
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, constants.O_RDONLY | (noFollow ?? 0));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'absent' };
    if (code === 'ELOOP' || code === 'EMLINK') return { kind: 'symlink' };
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) return { kind: 'other' };
    const text = await handle.readFile('utf8');
    if (noFollow === undefined && (await lstat(path)).isSymbolicLink()) return { kind: 'symlink' };
    return { kind: 'file', text, mode: info.mode & 0o777 };
  } finally {
    await handle.close();
  }
}

/**
 * The only function in this module that writes.
 *
 * It takes the target, the text the caller read (`before`) and the text it
 * wants (`after`). It does not decide anything; it refuses.
 */
export async function applyChange(ctx: Ctx, change: Change): Promise<void> {
  const list = allowlist(ctx);
  const names = [...new Set(list.map((entry) => entry.target))];
  const entry = list.find((candidate) => candidate.target === change.target);
  if (entry === undefined) throw new RefusedWrite('not-allowed', change.target, names);

  // The text on disk is what the caller read, or nothing is written. A file
  // that changed between the read and the write is somebody else's edit.
  if (change.target === CRONTAB) {
    const now = await ctx.crontab.read();
    // A crontab that cannot be read is not an empty one. Read as "none" a
    // moment ago and unreadable now, it would have matched "nothing there", and
    // the write would have replaced whatever the person has with one line.
    if (now.kind === 'missing' || now.kind === 'error') throw new RefusedWrite('unreadable', change.target, names);
    const current = now.kind === 'ok' ? now.text : null;
    if ((current ?? '') !== (change.before ?? '')) throw new RefusedWrite('changed', change.target, names);
    // A crontab made of nothing but this command's own lines has nothing of the person's to keep.
    const theirs = cronRows(current).rows.some((row) => parseManagedLine(row) === null);
    if (change.backup && current !== null && theirs) {
      await writeBackup(ctx, pathsFor(ctx).cronBackup, current, 0o600);
    }
    await ctx.crontab.write(change.after ?? '');
    return;
  }

  const root = await realOrSelf(entry.root);
  const parent = await realOrSelf(dirname(change.target));
  if (parent !== root && !parent.startsWith(`${root}${sep}`)) throw new RefusedWrite('outside', change.target, names);

  const there = await readExisting(change.target);
  if (there.kind === 'symlink') throw new RefusedWrite('symlink', change.target, names);
  if (there.kind === 'other') throw new Error(`${change.target} is not a regular file`);
  const current = there.kind === 'file' ? there.text : null;
  if (current !== change.before) throw new RefusedWrite('changed', change.target, names);

  if (change.after === null) {
    if (there.kind === 'file') await rm(change.target);
    return;
  }

  const mode = there.kind === 'file' ? there.mode : change.mode;
  if (change.backup && entry.backup && current !== null) {
    await writeBackup(ctx, `${change.target}${BACKUP_SUFFIX}`, current, mode);
  }
  await mkdir(dirname(change.target), { recursive: true });
  const temp = join(dirname(change.target), `.${basename(change.target)}.trazum-${process.pid}-${randomBytes(4).toString('hex')}.tmp`);
  try {
    await writeFile(temp, change.after, { flag: 'wx', mode });
    await chmod(temp, mode);
    await rename(temp, change.target);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/** One copy of what the person had, made the first time and never replaced. */
async function writeBackup(ctx: Ctx, path: string, text: string, mode: number): Promise<void> {
  if (!allowlist(ctx).some((entry) => entry.target === path)) {
    throw new RefusedWrite('not-allowed', path, allowlist(ctx).map((entry) => entry.target));
  }
  if (await present(path)) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, { flag: 'wx', mode });
}

/** A directory this command made, removed once it is empty. Never anything else. */
export async function removeEmptyDir(ctx: Ctx, dir: string): Promise<void> {
  const p = pathsFor(ctx);
  if (dir !== p.scriptDir && dir !== p.stateDir) return;
  await rmdir(dir).catch(() => undefined);
}

// --------------------------------------------------------------------------
// JSON, edited as data
// --------------------------------------------------------------------------

export interface Format {
  indent: string;
  eol: '\n' | '\r\n';
  final: boolean;
}

export function detectFormat(raw: string): Format {
  const indent = /^([ \t]+)\S/m.exec(raw)?.[1] ?? '  ';
  return { indent, eol: raw.includes('\r\n') ? '\r\n' : '\n', final: raw.endsWith('\n') };
}

export function serialise(value: unknown, format: Format): string {
  const text = JSON.stringify(value, null, format.indent);
  return (format.eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text) + (format.final ? format.eol : '');
}

export type Obj = Record<string, unknown>;
export const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type JsonRead =
  | { kind: 'absent' }
  | { kind: 'ok'; raw: string; value: Obj; format: Format; reformatted: boolean }
  | { kind: 'refused'; finding: Finding };

/**
 * A JSON object file, read for editing, or the reason it is to be left alone.
 *
 * The last check is the strict one: the parsed value, written back untouched,
 * has to say what the file says. Spacing and line breaks may be normalised (the
 * snippet in plugin/README.md has inline arrays, and refusing every file that
 * pasted it would refuse the people this is for), and that is reported. A value
 * that would not survive the round trip is left alone.
 */
export async function readJsonObject(ctx: Ctx, file: string, root: string): Promise<JsonRead> {
  const name = shown(ctx, file);
  let there: Existing;
  try {
    there = await readExisting(file);
  } catch (error) {
    return { kind: 'refused', finding: { code: 'file.unreadable', params: { file: name, why: (error as Error).message } } };
  }
  if (there.kind === 'absent') return { kind: 'absent' };
  if (there.kind === 'symlink') return { kind: 'refused', finding: { code: 'file.symlink', params: { file: name } } };
  if (there.kind === 'other') return { kind: 'refused', finding: { code: 'file.unreadable', params: { file: name, why: 'not a regular file' } } };
  const realRoot = await realOrSelf(root);
  const parent = await realOrSelf(dirname(file));
  if (parent !== realRoot && !parent.startsWith(`${realRoot}${sep}`)) {
    return { kind: 'refused', finding: { code: 'file.outside', params: { file: name } } };
  }
  const raw = there.text;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return { kind: 'refused', finding: { code: 'file.unparseable', params: { file: name, why: (error as Error).message } } };
  }
  if (!isObject(value)) return { kind: 'refused', finding: { code: 'file.shape', params: { file: name, key: '(top level)' } } };
  const format = detectFormat(raw);
  const rewritten = serialise(value, format);
  // Spacing and line breaks may be normalised and are said so; a value, a key or an
  // escape that would not survive the round trip (a duplicate key, 1.0 written as 1)
  // is not something this command may rewrite.
  if (rewritten !== raw && withoutSpacing(rewritten) !== withoutSpacing(raw)) {
    return { kind: 'refused', finding: { code: 'file.notExact', params: { file: name } } };
  }
  return { kind: 'ok', raw, value, format, reformatted: rewritten !== raw };
}

/** The text with every space, tab and line break outside a string removed. */
function withoutSpacing(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inString) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
      out += ch;
    }
  }
  return out;
}

/** Lines that appear and lines that go, in order: a longest-common-subsequence diff. */
export function diffLines(before: string | null, after: string | null): { added: string[]; removed: string[] } {
  const a = before === null ? [] : before.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const b = after === null ? [] : after.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  if (before === null) return { added: b, removed: [] };
  if (after === null) return { added: [], removed: a };
  if (a.length * b.length > 4_000_000) {
    const keep = new Map<string, number>();
    for (const line of a) keep.set(line, (keep.get(line) ?? 0) + 1);
    const added: string[] = [];
    for (const line of b) {
      const left = keep.get(line) ?? 0;
      if (left > 0) keep.set(line, left - 1);
      else added.push(line);
    }
    const had = new Map<string, number>();
    for (const line of b) had.set(line, (had.get(line) ?? 0) + 1);
    const removed: string[] = [];
    for (const line of a) {
      const left = had.get(line) ?? 0;
      if (left > 0) had.set(line, left - 1);
      else removed.push(line);
    }
    return { added, removed };
  }
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const added: string[] = [];
  const removed: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      removed.push(a[i++] as string);
    } else {
      added.push(b[j++] as string);
    }
  }
  while (i < a.length) removed.push(a[i++] as string);
  while (j < b.length) added.push(b[j++] as string);
  return { added, removed };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --------------------------------------------------------------------------
// The manifest: what this command added, so it removes that and no more
// --------------------------------------------------------------------------

export interface Manifest {
  v: 1;
  /**
   * `script` is the sha256 of the status line script as this command wrote it:
   * how it knows, later, that the file there is still its own and not one the
   * person changed.
   */
  statusline?: { createdFile: boolean; created: string[]; script?: string };
  mcp?: Record<string, { createdFile: boolean; createdKey: boolean }>;
  /** What `session-guard install` created in the settings file, so `uninstall` leaves what was the person's. */
  guard?: { createdFile: boolean; created: string[] };
}

export const emptyManifest = (): Manifest => ({ v: 1 });

export function manifestFrom(value: Obj): Manifest {
  const out = emptyManifest();
  const s = value.statusline;
  if (isObject(s)) {
    out.statusline = {
      createdFile: s.createdFile === true,
      created: Array.isArray(s.created) ? s.created.filter((x): x is string => typeof x === 'string') : [],
      ...(typeof s.script === 'string' ? { script: s.script } : {}),
    };
  }
  const g = value.guard;
  if (isObject(g)) {
    out.guard = {
      createdFile: g.createdFile === true,
      created: Array.isArray(g.created) ? g.created.filter((x): x is string => typeof x === 'string') : [],
    };
  }
  if (isObject(value.mcp)) {
    out.mcp = {};
    for (const [path, record] of Object.entries(value.mcp)) {
      if (isObject(record)) out.mcp[path] = { createdFile: record.createdFile === true, createdKey: record.createdKey === true };
    }
  }
  return out;
}

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

export const manifestEmpty = (m: Manifest): boolean =>
  m.statusline === undefined && m.guard === undefined && (m.mcp === undefined || Object.keys(m.mcp).length === 0);

// --------------------------------------------------------------------------
// The CLI this will keep running
// --------------------------------------------------------------------------

export const q = (text: string): string => `'${text}'`;

/** A path that can sit inside single quotes, in a shell string and in a crontab. */
export function quotable(path: string): boolean {
  // `'` ends the quote; `%` is a newline to cron; a newline ends the line.
  return !/['%\r\n\0]/.test(path);
}

/** Where a one-off runner unpacks a package: not there tomorrow. */
const TRANSIENT_HOMES = [/[\\/]_npx[\\/]/, /[\\/]dlx[\\/]/, /[\\/]bunx-/, /[\\/]\.npm[\\/]_npx[\\/]/];

export type Runtime = { ok: true; entry: string; node: string } | { ok: false; code: 'unstable' | 'unsafe'; path: string };

/**
 * The CLI a scheduled job and a hook can call tomorrow.
 *
 * `npx @trazum/cli` unpacks into a cache nobody promised to keep, and the
 * status line script is not published inside the package. So a path written
 * into somebody's settings must be one that stays: a CLI installed where the
 * person keeps it, or one they named with `TRAZUM_BIN`. A run from the npx
 * cache is refused, with the reason.
 */
export async function stableRuntime(ctx: Ctx): Promise<Runtime> {
  const chosen = ctx.trazumBin !== undefined && ctx.trazumBin !== '';
  const entry = chosen ? resolve(ctx.cwd, ctx.trazumBin as string) : ctx.entry;
  if (!quotable(entry) || !quotable(ctx.execPath)) return { ok: false, code: 'unsafe', path: quotable(entry) ? ctx.execPath : entry };
  if (!chosen && TRANSIENT_HOMES.some((pattern) => pattern.test(entry))) return { ok: false, code: 'unstable', path: entry };
  if (!(await stat(entry).then((info) => info.isFile(), () => false))) return { ok: false, code: 'unstable', path: entry };
  return { ok: true, entry, node: ctx.execPath };
}

// --------------------------------------------------------------------------
// Item 1: the status line and its Stop hook
// --------------------------------------------------------------------------

const statusCommand = (script: string, entry: string): string => `TRAZUM_BIN=${q(entry)} ${q(script)}`;

/** Whether a command is the one this writes, and which CLI it names. */
export function parseManaged(command: string, script: string): { refresh: boolean; bin: string | null } | null {
  let rest = command;
  let bin: string | null = null;
  const head = "TRAZUM_BIN='";
  if (rest.startsWith(head)) {
    const end = rest.indexOf("' ", head.length);
    if (end < 0) return null;
    bin = rest.slice(head.length, end);
    rest = rest.slice(end + 2);
  }
  if (rest === q(script)) return { refresh: false, bin };
  if (rest === `${q(script)} --refresh`) return { refresh: true, bin };
  return null;
}

interface SettingsView {
  statusLine: 'none' | 'ours' | 'foreign';
  foreign: string;
  hook: 'none' | 'ours';
  bin: string | null;
  shape: string | null;
}

export function viewSettings(value: Obj, script: string): SettingsView {
  const view: SettingsView = { statusLine: 'none', foreign: '', hook: 'none', bin: null, shape: null };
  if ('statusLine' in value) {
    const line = value.statusLine;
    const command = isObject(line) && typeof line.command === 'string' ? line.command : null;
    const ours = command === null ? null : parseManaged(command, script);
    if (ours !== null && !ours.refresh) {
      view.statusLine = 'ours';
      view.bin = ours.bin;
    } else {
      view.statusLine = 'foreign';
      view.foreign = command ?? JSON.stringify(line).slice(0, 80);
    }
  }
  if ('hooks' in value) {
    if (!isObject(value.hooks)) {
      view.shape = 'hooks';
      return view;
    }
    if ('Stop' in value.hooks) {
      const stop = value.hooks.Stop;
      if (!Array.isArray(stop)) {
        view.shape = 'hooks.Stop';
        return view;
      }
      for (const entry of stop) {
        if (!isObject(entry) || !Array.isArray(entry.hooks)) continue;
        for (const hook of entry.hooks) {
          const command = isObject(hook) && typeof hook.command === 'string' ? hook.command : null;
          const ours = command === null ? null : parseManaged(command, script);
          if (ours?.refresh) {
            view.hook = 'ours';
            view.bin ??= ours.bin;
          }
        }
      }
    }
  }
  return view;
}

/** Adds what is missing; never replaces what is there. Returns the keys it created. */
export function withStatusLine(value: Obj, script: string, entry: string): string[] {
  const created: string[] = [];
  const status = statusCommand(script, entry);
  const refresh = `${status} --refresh`;
  if (isObject(value.statusLine) && typeof value.statusLine.command === 'string' && parseManaged(value.statusLine.command, script) !== null) {
    value.statusLine.command = status;
  } else if (!('statusLine' in value)) {
    value.statusLine = { type: 'command', command: status };
  }
  if (!('hooks' in value)) {
    value.hooks = {};
    created.push('hooks');
  }
  const hooks = value.hooks as Obj;
  if (!('Stop' in hooks)) {
    hooks.Stop = [];
    created.push('Stop');
  }
  const stop = hooks.Stop as unknown[];
  let found = false;
  for (const entryObject of stop) {
    if (!isObject(entryObject) || !Array.isArray(entryObject.hooks)) continue;
    for (const hook of entryObject.hooks) {
      if (isObject(hook) && typeof hook.command === 'string' && parseManaged(hook.command, script)?.refresh) {
        hook.command = refresh;
        found = true;
      }
    }
  }
  if (!found) stop.push({ matcher: '*', hooks: [{ type: 'command', command: refresh }] });
  return created;
}

/** Removes exactly what `withStatusLine` writes, and the containers it made when they are empty. */
export function withoutStatusLine(value: Obj, script: string, created: string[]): void {
  if (isObject(value.statusLine) && typeof value.statusLine.command === 'string') {
    const ours = parseManaged(value.statusLine.command, script);
    if (ours !== null && !ours.refresh) delete value.statusLine;
  }
  if (!isObject(value.hooks) || !Array.isArray(value.hooks.Stop)) return;
  const hooks = value.hooks;
  const kept: unknown[] = [];
  for (const entryObject of hooks.Stop as unknown[]) {
    if (!isObject(entryObject) || !Array.isArray(entryObject.hooks)) {
      kept.push(entryObject);
      continue;
    }
    const remaining = entryObject.hooks.filter(
      (hook) => !(isObject(hook) && typeof hook.command === 'string' && parseManaged(hook.command, script)?.refresh),
    );
    if (remaining.length === entryObject.hooks.length) {
      kept.push(entryObject);
    } else if (remaining.length > 0) {
      entryObject.hooks = remaining;
      kept.push(entryObject);
    } else if (Object.keys(entryObject).some((key) => key !== 'matcher' && key !== 'hooks')) {
      entryObject.hooks = [];
      kept.push(entryObject);
    }
  }
  hooks.Stop = kept;
  if (kept.length === 0 && created.includes('Stop')) delete hooks.Stop;
  if (Object.keys(hooks).length === 0 && created.includes('hooks')) delete value.hooks;
}

// --------------------------------------------------------------------------
// Item 2: a scheduled `watch`
// --------------------------------------------------------------------------

const CRON_SCHEDULE = '17 * * * *';

export interface ManagedLine {
  index: number;
  line: string;
  project: string;
  node: string;
  entry: string;
}

function quoted(text: string, from: number): { value: string; end: number } | null {
  if (text[from] !== "'") return null;
  const end = text.indexOf("'", from + 1);
  return end < 0 ? null : { value: text.slice(from + 1, end), end: end + 1 };
}

/** The line this writes for a project. */
export function cronLine(project: string, node: string, entry: string): string {
  return `${CRON_SCHEDULE} cd ${q(project)} && ${q(node)} ${q(entry)} watch --once ${MANAGED_MARK}`;
}

/** A line is Trazum's when it ends in the marker and has the shape `cronLine` writes. */
export function parseManagedLine(line: string): Omit<ManagedLine, 'index'> | null {
  if (!line.endsWith(` ${MANAGED_MARK}`)) return null;
  const fields = line.split(' ');
  if (fields.length < 6) return null;
  const rest = fields.slice(5).join(' ');
  if (!rest.startsWith('cd ')) return null;
  const project = quoted(rest, 3);
  if (project === null || rest.slice(project.end, project.end + 4) !== ' && ') return null;
  const node = quoted(rest, project.end + 4);
  if (node === null || rest[node.end] !== ' ') return null;
  const entry = quoted(rest, node.end + 1);
  if (entry === null || rest.slice(entry.end) !== ` watch --once ${MANAGED_MARK}`) return null;
  return { line, project: project.value, node: node.value, entry: entry.value };
}

const cronRows = (text: string | null): { rows: string[]; final: boolean } => {
  if (text === null || text === '') return { rows: [], final: true };
  const rows = text.split('\n');
  const final = rows[rows.length - 1] === '';
  if (final) rows.pop();
  return { rows, final };
};

export function managedLines(text: string | null): ManagedLine[] {
  const out: ManagedLine[] = [];
  cronRows(text).rows.forEach((line, index) => {
    const parsed = parseManagedLine(line);
    if (parsed !== null) out.push({ index, ...parsed });
  });
  return out;
}

/** The crontab with this project's managed line in it, once. Every other line is untouched. */
export function withManagedLine(text: string | null, line: string, project: string): string {
  const { rows } = cronRows(text);
  const at = managedLines(text).filter((found) => found.project === project);
  if (at.length > 0) {
    const first = at[0] as ManagedLine;
    rows[first.index] = line;
    const drop = new Set(at.slice(1).map((found) => found.index));
    return `${rows.filter((_, index) => !drop.has(index)).join('\n')}\n`;
  }
  return `${[...rows, line].join('\n')}\n`;
}

/** The crontab without this project's managed lines. A line that only mentions trazum stays. */
export function withoutManagedLines(text: string, project: string): string {
  const { rows, final } = cronRows(text);
  const drop = new Set(managedLines(text).filter((found) => found.project === project).map((found) => found.index));
  const kept = rows.filter((_, index) => !drop.has(index));
  return kept.length === 0 ? '' : `${kept.join('\n')}${final ? '\n' : ''}`;
}

export interface WatchReadiness {
  records: number;
  measuredUsd: number | null;
  budget: boolean;
  configError: string | null;
}

/** What `watch` needs before it is worth scheduling: something in the store and a limit somebody chose. */
export async function watchReadiness(ctx: Ctx): Promise<WatchReadiness> {
  const root = resolve(ctx.cwd);
  const { resolved } = await readStore(root);
  let measuredUsd: number | null = null;
  if (resolved.records.length > 0) {
    const report = bucketedProfile(
      { provider: 'store', granularity: 'bucketed', buckets: bucketsFromRecords(resolved.records), window: null, gaps: [], unavailable: [] },
      { catalogue: ctx.catalogue },
    );
    measuredUsd = report.total.totalUsd;
  }
  try {
    const { config } = await loadConfig({ from: root });
    const budget = [config.spend?.maxUsd, config.spend?.maxDayUsd, config.spend?.maxCacheLossUsd].some((v) => v !== undefined);
    return { records: resolved.records.length, measuredUsd, budget, configError: null };
  } catch (error) {
    return { records: resolved.records.length, measuredUsd, budget: false, configError: (error as Error).message.slice(0, 160) };
  }
}


// --------------------------------------------------------------------------
// Inspecting: what is on, what is off, and what turning each way would change
// --------------------------------------------------------------------------

export interface Plan {
  changes: Change[];
  /** How the manifest changes once the changes are written. */
  patch: (m: Manifest) => void;
}

export interface ItemInspection {
  status: ItemStatus;
  install: Plan | null;
  uninstall: Plan | null;
}

const verdictOf = (
  item: Item,
  verdict: Verdict,
  code: ProactiveCode,
  params: Record<string, string>,
  files: string[],
  notes: Finding[] = [],
): ItemStatus => ({ item, verdict, code, params, files, notes });

const inspected = (s: ItemStatus, install: Plan | null = null, uninstall: Plan | null = null): ItemInspection => ({
  status: s,
  install,
  uninstall,
});

export const NEW_FORMAT: Format = { indent: '  ', eol: '\n', final: true };

export function jsonChange(
  item: Item | 'session-guard',
  target: string,
  read: JsonRead,
  next: Obj | null,
  backup: boolean,
  mode = 0o644,
): Change {
  const before = read.kind === 'ok' ? read.raw : null;
  const format = read.kind === 'ok' ? read.format : NEW_FORMAT;
  const after = next === null ? null : serialise(next, format);
  const diff = diffLines(before, after);
  // A file this command made, and never anybody's before it, has nothing to keep.
  return { item, target, before, after, mode, added: diff.added, removed: diff.removed, backup: backup && before !== null };
}

const isFile = (path: string): Promise<boolean> =>
  stat(path).then(
    (info) => info.isFile(),
    () => false,
  );

/**
 * Whether the hook can start this file by its path.
 *
 * The status line script runs `"$TRAZUM_BIN" from-claude-code ...`: the path
 * itself, not node with the path. A CLI that is a file and not executable makes
 * the hook fail, and the hook is silent by design, so the line would show
 * Claude Code's figure for ever and nothing would say why. The schedule is not
 * asked this: its crontab line names node and then the file.
 */
const canExecute = (path: string): Promise<boolean> =>
  access(path, constants.X_OK).then(
    () => true,
    () => false,
  );

async function inspectStatusLine(ctx: Ctx, manifest: Manifest): Promise<ItemInspection> {
  const p = pathsFor(ctx);
  const files = [p.settings, p.script];
  const file = shown(ctx, p.settings);

  if (ctx.platform === 'win32') return inspected(verdictOf('statusline', 'not-available', 'statusline.windows', {}, files));
  const read = await readJsonObject(ctx, p.settings, resolve(ctx.home));
  if (read.kind === 'refused') {
    return inspected(verdictOf('statusline', 'could-not-tell', read.finding.code, read.finding.params, files));
  }
  const claudeDir = join(resolve(ctx.home), '.claude');
  if (read.kind === 'absent' && !(await lstat(claudeDir).then((i) => i.isDirectory(), () => false))) {
    return inspected(verdictOf('statusline', 'not-available', 'statusline.noClaude', { dir: shown(ctx, claudeDir) }, files));
  }
  const value: Obj = read.kind === 'ok' ? read.value : {};
  const view = viewSettings(value, p.script);
  if (view.shape !== null) {
    return inspected(verdictOf('statusline', 'could-not-tell', 'file.shape', { file, key: view.shape }, files));
  }

  // Turning it off does not depend on whether turning it on could.
  const source = await ctx.script();
  const copy: Existing = await readExisting(p.script).catch((): Existing => ({ kind: 'other' }));
  const scriptThere = copy.kind !== 'absent';
  const scriptText = copy.kind === 'file' ? copy.text : null;
  // The copy is this command's when it is what it would write now, or what it
  // recorded writing. Anything else there is the person's: a script they
  // changed, or a file of their own. It is not replaced and it is not removed.
  const scriptOurs = scriptText !== null && (scriptText === source || digest(scriptText) === manifest.statusline?.script);
  const ours = view.statusLine === 'ours' || view.hook === 'ours';
  let uninstall: Plan | null = null;
  if (ours || scriptOurs) {
    const changes: Change[] = [];
    if (ours) {
      const next = structuredClone(value);
      withoutStatusLine(next, p.script, manifest.statusline?.created ?? []);
      const gone = manifest.statusline?.createdFile === true && Object.keys(next).length === 0;
      changes.push(jsonChange('statusline', p.settings, read, gone ? null : next, false));
    }
    if (scriptOurs) {
      changes.push({ item: 'statusline', target: p.script, before: scriptText, after: null, mode: 0o755, added: [], removed: [shown(ctx, p.script)], backup: false });
    }
    uninstall = {
      changes,
      patch: (m) => {
        delete m.statusline;
      },
    };
  }

  if (view.statusLine === 'foreign') {
    return inspected(
      verdictOf('statusline', 'not-ready', 'statusline.foreign', { command: view.foreign, file, script: shown(ctx, p.script) }, files),
      null,
      uninstall,
    );
  }

  const complete = view.statusLine === 'ours' && view.hook === 'ours';
  const binGone = view.bin !== null && !((await isFile(view.bin)) && (await canExecute(view.bin)));
  const broken = complete && (!scriptThere || binGone);
  if (complete && !broken) return inspected(verdictOf('statusline', 'on', 'statusline.on', { file }, files), null, uninstall);

  if (scriptThere && !scriptOurs) {
    return inspected(verdictOf('statusline', 'not-ready', 'statusline.scriptChanged', { script: shown(ctx, p.script) }, files), null, uninstall);
  }
  // The script's path goes into the same shell line as the CLI's, in the same
  // quotes, and it is under the home directory: a home with a quote in its
  // name would end the quote early.
  if (!quotable(p.script)) {
    return inspected(verdictOf('statusline', 'not-ready', 'cli.unsafe', { path: p.script }, files), null, uninstall);
  }
  const runtime = await stableRuntime(ctx);
  if (!runtime.ok) {
    return inspected(
      verdictOf('statusline', 'not-ready', runtime.code === 'unstable' ? 'cli.unstable' : 'cli.unsafe', { path: runtime.path }, files),
      null,
      uninstall,
    );
  }
  if (!(await canExecute(runtime.entry))) {
    return inspected(verdictOf('statusline', 'not-ready', 'cli.notExecutable', { path: runtime.entry }, files), null, uninstall);
  }

  const next = structuredClone(value);
  const created = withStatusLine(next, p.script, runtime.entry);
  const changes: Change[] = [];
  if (scriptText !== source) {
    const lines = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
    changes.push({ item: 'statusline', target: p.script, before: scriptText, after: source, mode: 0o755, added: [`${shown(ctx, p.script)} [${lines} lines]`], removed: [], backup: false });
  }
  const settings = jsonChange('statusline', p.settings, read, next, !(manifest.statusline?.createdFile === true), 0o600);
  if (settings.after !== settings.before) changes.push(settings);
  const install: Plan = {
    changes,
    patch: (m) => {
      const before = m.statusline;
      m.statusline = {
        createdFile: before?.createdFile === true || read.kind === 'absent',
        created: [...new Set([...(before?.created ?? []), ...created])],
        script: digest(source),
      };
    },
  };
  const code: ProactiveCode = complete ? 'statusline.stale' : ours ? 'statusline.partial' : 'statusline.off';
  const missing = view.statusLine === 'ours' ? 'hook' : 'line';
  const notes: Finding[] = read.kind === 'ok' && read.reformatted ? [{ code: 'file.reformat', params: { file } }] : [];
  return inspected(verdictOf('statusline', 'off', code, { file, missing }, files, notes), install, uninstall);
}

/** What `watch` reports about itself when it has nothing to watch with. */
function readinessParams(ready: WatchReadiness): Record<string, string> {
  return { measured: ready.measuredUsd === null ? '' : `$${ready.measuredUsd.toFixed(2)}` };
}

async function inspectWatch(ctx: Ctx): Promise<ItemInspection> {
  const project = resolve(ctx.cwd);
  const files: string[] = [CRONTAB];
  const where = shown(ctx, project);
  if (ctx.platform === 'win32') return inspected(verdictOf('watch', 'not-available', 'watch.windows', {}, files));

  const crontab = await ctx.crontab.read();
  if (crontab.kind === 'missing') return inspected(verdictOf('watch', 'not-available', 'watch.noCrontab', {}, files));
  if (crontab.kind === 'error') return inspected(verdictOf('watch', 'could-not-tell', 'watch.crontabError', { why: crontab.message }, files));
  const text = crontab.kind === 'ok' ? crontab.text : null;

  const all = managedLines(text);
  const mine = all.filter((found) => found.project === project);
  const others = all.length - mine.length;
  const notes: Finding[] = others > 0 ? [{ code: 'watch.otherProjects', params: { count: String(others) } }] : [];

  let uninstall: Plan | null = null;
  if (mine.length > 0 && text !== null) {
    const after = withoutManagedLines(text, project);
    const diff = diffLines(text, after);
    uninstall = {
      changes: [{ item: 'watch', target: CRONTAB, before: text, after, mode: 0o600, added: diff.added, removed: diff.removed, backup: false }],
      patch: () => undefined,
    };
  }

  const ready = await watchReadiness(ctx);
  const first = mine[0];
  const stale = first !== undefined && !((await isFile(first.node)) && (await isFile(first.entry)));
  const scheduled = first !== undefined && !stale;
  if (ready.configError !== null) {
    return inspected(verdictOf('watch', 'could-not-tell', 'watch.configError', { why: ready.configError }, files, notes), null, uninstall);
  }
  const unready = ready.records === 0 || !ready.budget;
  if (unready) {
    const code: ProactiveCode = scheduled
      ? 'watch.scheduledNotReady'
      : ready.records === 0 && !ready.budget
        ? 'watch.noStoreNoBudget'
        : ready.records === 0
          ? 'watch.noStore'
          : 'watch.noBudget';
    return inspected(verdictOf('watch', 'not-ready', code, { project: where, ...readinessParams(ready) }, files, notes), null, uninstall);
  }
  if (scheduled) {
    const schedule = (first as ManagedLine).line.split(' ').slice(0, 5).join(' ');
    return inspected(verdictOf('watch', 'on', 'watch.on', { project: where, schedule }, files, notes), null, uninstall);
  }

  if (!quotable(project)) return inspected(verdictOf('watch', 'not-ready', 'cli.unsafe', { path: project }, files, notes), null, uninstall);
  const runtime = await stableRuntime(ctx);
  if (!runtime.ok) {
    return inspected(
      verdictOf('watch', 'not-ready', runtime.code === 'unstable' ? 'cli.unstable' : 'cli.unsafe', { path: runtime.path }, files, notes),
      null,
      uninstall,
    );
  }
  const after = withManagedLine(text, cronLine(project, runtime.node, runtime.entry), project);
  const diff = diffLines(text, after);
  const install: Plan = {
    changes: [{ item: 'watch', target: CRONTAB, before: text, after, mode: 0o600, added: diff.added, removed: diff.removed, backup: true }],
    patch: () => undefined,
  };
  return inspected(verdictOf('watch', 'off', stale ? 'watch.stale' : 'watch.off', { project: where }, files, notes), install, uninstall);
}

async function inspectMcp(ctx: Ctx, manifest: Manifest): Promise<ItemInspection> {
  const p = pathsFor(ctx);
  const files = p.mcp.map((m) => m.path);

  const found: Paths['mcp'] = [];
  for (const target of p.mcp) {
    const hasFile = await present(target.path);
    const hasFolder = target.folder !== null && (await present(target.folder));
    if (hasFile || hasFolder) found.push(target);
  }
  if (found.length === 0) {
    const hasClaude = await lstat(join(resolve(ctx.home), '.claude')).then((i) => i.isDirectory(), () => false);
    return inspected(verdictOf('mcp', 'not-available', hasClaude ? 'mcp.noClientClaude' : 'mcp.noClient', { dir: shown(ctx, resolve(ctx.cwd)) }, files));
  }

  type Row = { path: string; read: JsonRead; state: 'absent' | 'ours' | 'other'; refused: Finding | null };
  const rows: Row[] = [];
  for (const target of found) {
    const read = await readJsonObject(ctx, target.path, target.dir);
    if (read.kind === 'refused') {
      rows.push({ path: target.path, read, state: 'absent', refused: read.finding });
      continue;
    }
    const servers = read.kind === 'ok' ? read.value.mcpServers : undefined;
    if (servers !== undefined && !isObject(servers)) {
      rows.push({ path: target.path, read, state: 'absent', refused: { code: 'file.shape', params: { file: shown(ctx, target.path), key: 'mcpServers' } } });
      continue;
    }
    const entry = servers?.trazum;
    rows.push({ path: target.path, read, state: entry === undefined ? 'absent' : deepEqual(entry, MCP_ENTRY) ? 'ours' : 'other', refused: null });
  }

  const notes: Finding[] = [];
  const uninstallChanges: Change[] = [];
  const removedFrom: string[] = [];
  const installChanges: Change[] = [];
  const addedTo: Record<string, { createdFile: boolean; createdKey: boolean }> = {};
  for (const row of rows) {
    const name = shown(ctx, row.path);
    if (row.refused !== null) {
      notes.push(row.refused);
      continue;
    }
    const record = manifest.mcp?.[row.path];
    if (row.state === 'absent') {
      const next: Obj = row.read.kind === 'ok' ? structuredClone(row.read.value) : {};
      const createdKey = !('mcpServers' in next);
      if (createdKey) next.mcpServers = {};
      (next.mcpServers as Obj).trazum = structuredClone(MCP_ENTRY);
      installChanges.push(jsonChange('mcp', row.path, row.read, next, true));
      if (row.read.kind === 'ok' && row.read.reformatted) notes.push({ code: 'file.reformat', params: { file: name } });
      addedTo[row.path] = { createdFile: row.read.kind === 'absent', createdKey };
    } else if (row.state === 'other') {
      notes.push({ code: record === undefined ? 'mcp.other' : 'mcp.changed', params: { file: name } });
    } else if (record === undefined) {
      // Exactly the entry this writes, put there by somebody else: theirs to remove.
      notes.push({ code: 'mcp.notAdded', params: { file: name } });
    } else if (row.read.kind === 'ok') {
      const next = structuredClone(row.read.value);
      const servers = next.mcpServers as Obj;
      delete servers.trazum;
      if (Object.keys(servers).length === 0 && record.createdKey) delete next.mcpServers;
      const gone = record.createdFile && Object.keys(next).length === 0;
      uninstallChanges.push(jsonChange('mcp', row.path, row.read, gone ? null : next, false));
      removedFrom.push(row.path);
    }
  }

  const uninstall: Plan | null =
    uninstallChanges.length === 0
      ? null
      : {
          changes: uninstallChanges,
          patch: (m) => {
            for (const path of removedFrom) if (m.mcp !== undefined) delete m.mcp[path];
            if (m.mcp !== undefined && Object.keys(m.mcp).length === 0) delete m.mcp;
          },
        };
  const install: Plan | null =
    installChanges.length === 0
      ? null
      : {
          changes: installChanges,
          patch: (m) => {
            m.mcp = { ...(m.mcp ?? {}), ...addedTo };
          },
        };

  const open = installChanges.map((change) => shown(ctx, change.target)).join(', ');
  if (install !== null) return inspected(verdictOf('mcp', 'off', 'mcp.off', { files: open }, files, notes), install, uninstall);
  const refused = rows.find((row) => row.refused !== null)?.refused ?? null;
  if (refused !== null) {
    return inspected(verdictOf('mcp', 'could-not-tell', refused.code, refused.params, files, notes.filter((n) => n !== refused)), null, uninstall);
  }
  return inspected(verdictOf('mcp', 'on', 'mcp.on', { files: rows.map((row) => shown(ctx, row.path)).join(', ') }, files, notes), null, uninstall);
}

export interface Inspection {
  items: Record<Item, ItemInspection>;
  manifest: Manifest;
  manifestRead: JsonRead;
  /** Set when the manifest could not be read: nothing is changed until it can be. */
  blocked: Finding | null;
}

export async function inspectAll(ctx: Ctx): Promise<Inspection> {
  const manifestRead = await readJsonObject(ctx, pathsFor(ctx).manifest, resolve(ctx.home));
  const manifest = manifestRead.kind === 'ok' ? manifestFrom(manifestRead.value) : emptyManifest();
  const items = {
    statusline: await inspectStatusLine(ctx, manifest),
    watch: await inspectWatch(ctx),
    mcp: await inspectMcp(ctx, manifest),
  };
  return { items, manifest, manifestRead, blocked: manifestRead.kind === 'refused' ? manifestRead.finding : null };
}

// --------------------------------------------------------------------------
// Doing it
// --------------------------------------------------------------------------

/**
 * Puts back what an item wrote before it failed, newest first, through the
 * same door it was written by. Returns the targets it could not put back.
 *
 * An item is several writes: two MCP files, or the script and the settings,
 * and then the record of what was added. Written half, it leaves an entry no
 * record claims, which `off` would then take for the person's and never
 * remove.
 */
export async function undo(ctx: Ctx, applied: readonly Change[]): Promise<string[]> {
  const left: string[] = [];
  for (const change of [...applied].reverse()) {
    try {
      await applyChange(ctx, { ...change, before: change.after, after: change.before, added: [], removed: [], backup: false });
    } catch {
      left.push(change.target);
    }
  }
  return left;
}

export type Action = 'on' | 'off';
export type Outcome = 'written' | 'declined' | 'would-write' | 'nothing' | 'failed';

export interface ItemResult {
  item: Item;
  outcome: Outcome;
  changes: { target: string; added: string[]; removed: string[] }[];
  error: Finding | null;
}

export interface RunOptions {
  action: Action;
  items: readonly Item[];
  /** True writes nothing, whatever `decide` says. */
  dryRun: boolean;
  /** Asked once per item, with what it would write. */
  decide: (item: Item, changes: Change[]) => boolean | Promise<boolean>;
}

export function failure(ctx: Ctx, error: unknown): Finding {
  if (error instanceof RefusedWrite) {
    return {
      code: `write.${error.reason}` as ProactiveCode,
      params: { file: shown(ctx, error.target), allowed: error.allowed.map((entry) => shown(ctx, entry)).join(', ') },
    };
  }
  return { code: 'write.failed', params: { why: (error as Error).message.slice(0, 200) } };
}

/**
 * Turns the chosen items on or off, one item at a time, each only on a yes.
 *
 * Returns the statuses before, what each item did, and the statuses after,
 * read again from the disk rather than assumed.
 */
export async function run(
  ctx: Ctx,
  options: RunOptions,
): Promise<{ before: ItemStatus[]; results: ItemResult[]; after: ItemStatus[] }> {
  const p = pathsFor(ctx);
  let current = await inspectAll(ctx);
  const before = ITEMS.map((item) => current.items[item].status);
  const results: ItemResult[] = [];

  for (const item of options.items) {
    const plan = options.action === 'on' ? current.items[item].install : current.items[item].uninstall;
    const shownChanges = (plan?.changes ?? []).map((c) => ({ target: c.target, added: c.added, removed: c.removed }));
    if (plan === null || plan.changes.length === 0) {
      results.push({ item, outcome: 'nothing', changes: [], error: null });
      continue;
    }
    if (current.blocked !== null) {
      results.push({ item, outcome: 'failed', changes: shownChanges, error: current.blocked });
      continue;
    }
    if (options.dryRun) {
      results.push({ item, outcome: 'would-write', changes: shownChanges, error: null });
      continue;
    }
    if (!(await options.decide(item, plan.changes))) {
      results.push({ item, outcome: 'declined', changes: shownChanges, error: null });
      continue;
    }
    const applied: Change[] = [];
    try {
      for (const change of plan.changes) {
        await applyChange(ctx, change);
        applied.push(change);
      }
      // The manifest follows the files it describes, and goes when nothing is left to describe.
      const next = structuredClone(current.manifest);
      plan.patch(next);
      const text = manifestEmpty(next) ? null : `${JSON.stringify(next, null, 2)}\n`;
      const was = current.manifestRead.kind === 'ok' ? current.manifestRead.raw : null;
      if (text !== was) {
        await applyChange(ctx, { item: 'manifest', target: p.manifest, before: was, after: text, mode: 0o600, added: [], removed: [], backup: false });
      }
      if (options.action === 'off') {
        await removeEmptyDir(ctx, p.scriptDir);
        await removeEmptyDir(ctx, p.stateDir);
      }
      results.push({ item, outcome: 'written', changes: shownChanges, error: null });
    } catch (error) {
      const left = await undo(ctx, applied);
      const finding: Finding =
        left.length === 0 ? failure(ctx, error) : { code: 'write.partial', params: { files: left.map((target) => (target === CRONTAB ? CRONTAB : shown(ctx, target))).join(', ') } };
      results.push({ item, outcome: 'failed', changes: shownChanges, error: finding });
    }
    // The next item plans against what is on disk now.
    current = await inspectAll(ctx);
  }

  return { before, results, after: ITEMS.map((item) => current.items[item].status) };
}
