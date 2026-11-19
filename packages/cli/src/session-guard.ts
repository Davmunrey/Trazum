/**
 * `trazum session-guard`: a Claude Code hook that warns, then stops, at two
 * dollar figures the person chose.
 *
 * It is built on the machinery `trazum proactive` already has, and borrows it
 * rather than copying it:
 *
 * - **The same door for every write.** The settings file is changed through
 *   `applyChange` and read through `readJsonObject`, so the same refusals hold
 *   (a symbolic link, a file that changed since it was read, a file `JSON.parse`
 *   rejects) and the same backup is kept beside the file the first time.
 * - **The same record of what was added.** `~/.trazum/proactive.json` gains a
 *   `guard` entry, so `uninstall` removes the hook and the containers this
 *   command created and leaves every hook that was the person's.
 * - **The same reading of the session.** The running session's transcript is
 *   converted by `claudeCodeRecords`, as `from-claude-code` does, with its
 *   subagents' transcripts as the status line script reads them, and priced by
 *   `profileUsage` at the bundled, dated catalogue.
 * - **The same place for state.** "The warning was given" is a file in the
 *   status line's cache directory, `TRAZUM_STATUSLINE_CACHE` or
 *   `$TMPDIR/trazum-statusline`. Nothing is written anywhere else.
 *
 * **The hook protocol.** Claude Code's hooks page, read on 2026-11-19
 * (code.claude.com/docs/en/hooks), says:
 *
 * - A command hook gets `session_id` and `transcript_path` as JSON on stdin.
 * - "Exit with code 2 to block the action. On events that can block, Claude Code
 *   stops the action: a `PreToolUse` hook blocks the tool call, for example, and
 *   a `UserPromptSubmit` hook rejects the prompt." Stderr is the reason, shown
 *   to Claude (PreToolUse) or as the block reason (UserPromptSubmit).
 * - Exit 0 with no output is "no decision": the action goes ahead.
 * - `systemMessage` in JSON on stdout at exit 0 is a "warning message shown to
 *   the user". Plain stdout on UserPromptSubmit is added as context for the
 *   model, which is why a warning is never printed as plain text: it would cost
 *   tokens and change what the model reads.
 *
 * So a stop is exit code 2 with the reason on stderr, on both events, and a
 * warning is `{"systemMessage": ...}` on stdout with exit 0.
 *
 * **Nothing has a default.** Two thresholds and a failure policy are required,
 * and a missing one is refused by name. A threshold is a decision about money
 * and the policy is a decision about which failure to accept; neither is
 * Trazum's to make.
 *
 * **Never $0 by guessing.** A transcript that cannot be read, a model with no
 * price, or no transcript at all is "cannot tell". What happens then is
 * `--on-cannot-tell`, with the meaning the gateway gives it: `fail-open` lets
 * the work go on and says so, `fail-closed` stops it and says so. The one thing
 * it never does is count the unpriced calls as free. When the calls that were
 * priced already reach a threshold, that is a floor and the threshold holds.
 *
 * Nothing here sends anything anywhere.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { claudeCodeRecords, FAILURE_POLICIES, formatUsd, profileUsage } from '@trazum/core';
import type { FailurePolicy, PricingCatalogue } from '@trazum/core';
import type { CliMessages } from './i18n/index.js';
import {
  applyChange,
  emptyManifest,
  failure,
  isObject,
  jsonChange,
  manifestEmpty,
  manifestFrom,
  pathsFor,
  q,
  readJsonObject,
  removeEmptyDir,
  shown,
  stableRuntime,
  undo,
} from './proactive.js';
import type { Change, Ctx, Finding, Manifest, Obj } from './proactive.js';

// --------------------------------------------------------------------------
// The thresholds
// --------------------------------------------------------------------------

export interface Thresholds {
  warnUsd: number;
  stopUsd: number;
  policy: FailurePolicy;
}

export type ThresholdRefusal =
  | { code: 'missing'; flags: string[] }
  | { code: 'notAmount'; flag: string; given: string }
  | { code: 'badPolicy'; given: string; allowed: string }
  | { code: 'warnNotBelowStop' };

/** Both amounts and the policy, as given, or the first thing wrong with them. */
export function parseThresholds(given: {
  warn: string | undefined;
  stop: string | undefined;
  policy: string | undefined;
}): { ok: true; thresholds: Thresholds } | { ok: false; refusal: ThresholdRefusal } {
  const missing = [
    ...(given.warn === undefined ? ['--warn'] : []),
    ...(given.stop === undefined ? ['--stop'] : []),
    ...(given.policy === undefined ? ['--on-cannot-tell'] : []),
  ];
  if (missing.length > 0) return { ok: false, refusal: { code: 'missing', flags: missing } };
  const amount = (text: string): number | null => {
    const value = /^\s*$/.test(text) ? Number.NaN : Number(text);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const warnUsd = amount(given.warn as string);
  if (warnUsd === null) return { ok: false, refusal: { code: 'notAmount', flag: '--warn', given: given.warn as string } };
  const stopUsd = amount(given.stop as string);
  if (stopUsd === null) return { ok: false, refusal: { code: 'notAmount', flag: '--stop', given: given.stop as string } };
  if (!(FAILURE_POLICIES as readonly string[]).includes(given.policy as string)) {
    return { ok: false, refusal: { code: 'badPolicy', given: given.policy as string, allowed: FAILURE_POLICIES.join(', ') } };
  }
  if (warnUsd >= stopUsd) return { ok: false, refusal: { code: 'warnNotBelowStop' } };
  return { ok: true, thresholds: { warnUsd, stopUsd, policy: given.policy as FailurePolicy } };
}

// --------------------------------------------------------------------------
// What the session has cost
// --------------------------------------------------------------------------

export type CannotTellCause = 'no-transcript' | 'unreadable' | 'unparseable' | 'skipped';

export type SessionCost =
  | { kind: 'measured'; usd: number }
  /** Some calls are on a model with no price: `usd` is what the priced ones cost, and the truth is more. */
  | { kind: 'floor'; usd: number; unpricedModels: string[] }
  | { kind: 'cannot-tell'; cause: CannotTellCause };

export async function jsonlFiles(folder: string): Promise<string[] | null> {
  const info = await stat(folder).catch(() => null);
  if (info === null || !info.isDirectory()) return [];
  try {
    const entries = await readdir(folder, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => join(entry.parentPath, entry.name))
      .sort();
  } catch {
    return null;
  }
}

/**
 * What the running session has cost so far, at the catalogue, or why that
 * cannot be said.
 *
 * The transcript is the session's own file and its subagents' transcripts are
 * in the folder beside it named after the session: the status line script reads
 * them the same way, and says what leaving them out cost.
 */
export async function sessionCost(transcriptPath: unknown, catalogue: PricingCatalogue, on: Date): Promise<SessionCost> {
  if (typeof transcriptPath !== 'string' || transcriptPath === '') return { kind: 'cannot-tell', cause: 'no-transcript' };
  const files = [transcriptPath];
  const subagents = await jsonlFiles(join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents'));
  if (subagents === null) return { kind: 'cannot-tell', cause: 'unreadable' };
  files.push(...subagents);

  const lines: string[] = [];
  let unparseable = 0;
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      return { kind: 'cannot-tell', cause: 'unreadable' };
    }
    const conversion = claudeCodeRecords(text);
    // A file with lines and none that parsed is not an empty session.
    if (conversion.records.length === 0 && conversion.unparseable > 0 && conversion.otherLines === 0) unparseable += 1;
    for (const record of conversion.records) lines.push(JSON.stringify(record));
  }
  if (unparseable > 0) return { kind: 'cannot-tell', cause: 'unparseable' };

  const report = profileUsage(lines.length === 0 ? '' : `${lines.join('\n')}\n`, { catalogue, on });
  if (report.skippedLines.length > 0) return { kind: 'cannot-tell', cause: 'skipped' };
  if (report.unpricedModels.length > 0) return { kind: 'floor', usd: report.total.totalUsd, unpricedModels: report.unpricedModels };
  return { kind: 'measured', usd: report.total.totalUsd };
}

// --------------------------------------------------------------------------
// The decision
// --------------------------------------------------------------------------

export type Decision =
  | { action: 'allow' }
  | { action: 'warn'; usd: number; atLeast: boolean }
  | { action: 'block'; usd: number; atLeast: boolean }
  | { action: 'allow-cannot-tell'; cause: CannotTellCause | 'unpriced'; models: string[] }
  | { action: 'block-cannot-tell'; cause: CannotTellCause | 'unpriced'; models: string[] };

/**
 * Thresholds against cost, and the policy where the cost cannot be said.
 *
 * The comparison is "at or over": a session at exactly the stop figure is
 * stopped. A floor counts as far as it goes: calls that were priced and already
 * reach a threshold are a fact, and the unpriced ones can only add to it.
 */
export function decide(cost: SessionCost, thresholds: Thresholds): Decision {
  if (cost.kind === 'cannot-tell') return cannotTell(cost.cause, [], thresholds.policy);
  const atLeast = cost.kind === 'floor';
  if (cost.usd >= thresholds.stopUsd) return { action: 'block', usd: cost.usd, atLeast };
  if (cost.usd >= thresholds.warnUsd) return { action: 'warn', usd: cost.usd, atLeast };
  if (cost.kind === 'floor') return cannotTell('unpriced', cost.unpricedModels, thresholds.policy);
  return { action: 'allow' };
}

function cannotTell(cause: CannotTellCause | 'unpriced', models: string[], policy: FailurePolicy): Decision {
  return policy === 'fail-closed' ? { action: 'block-cannot-tell', cause, models } : { action: 'allow-cannot-tell', cause, models };
}

// --------------------------------------------------------------------------
// "The warning was given", kept where the status line keeps its cache
// --------------------------------------------------------------------------

/** The status line's cache directory, as its script resolves it. */
export function stateDir(env: NodeJS.ProcessEnv): string {
  return env.TRAZUM_STATUSLINE_CACHE || join(env.TMPDIR || '/tmp', 'trazum-statusline');
}

/** A session id is hashed for the file name: it came from stdin and is not a path. */
function markerPath(dir: string, session: string, kind: 'warned' | 'cannot-tell'): string {
  return join(dir, `guard-${createHash('sha256').update(session).digest('hex').slice(0, 32)}.${kind}`);
}

export async function alreadyGiven(dir: string, session: string, kind: 'warned' | 'cannot-tell'): Promise<boolean> {
  return stat(markerPath(dir, session, kind)).then(
    () => true,
    () => false,
  );
}

/** Never throws: a notice that cannot be remembered is given again, which is the safe direction. */
export async function remember(dir: string, session: string, kind: 'warned' | 'cannot-tell'): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(markerPath(dir, session, kind), '');
  } catch {
    /* given again next time */
  }
}

// --------------------------------------------------------------------------
// The lines in the settings file
// --------------------------------------------------------------------------

/** The events the hook is wired to, both of which can block. */
export const GUARD_EVENTS = ['UserPromptSubmit', 'PreToolUse'] as const;
export type GuardEvent = (typeof GUARD_EVENTS)[number];

const amountText = (value: number): string => String(value);

/** The command written into the settings: the CLI that stays, then the exact thresholds. */
export function guardCommand(node: string, entry: string, thresholds: Thresholds): string {
  return `${q(node)} ${q(entry)} session-guard check --warn ${amountText(thresholds.warnUsd)} --stop ${amountText(thresholds.stopUsd)} --on-cannot-tell ${thresholds.policy}`;
}

/**
 * Whether a command is the one `guardCommand` writes, and what it carries.
 *
 * JSON has no comments, so a hook is Trazum's by being exactly this shape. A
 * hook of the person's that merely mentions `session-guard` is not matched.
 */
export function parseGuardCommand(command: string): { node: string; entry: string; thresholds: Thresholds } | null {
  const match = /^'([^']*)' '([^']*)' session-guard check --warn (\S+) --stop (\S+) --on-cannot-tell (fail-open|fail-closed)$/.exec(command);
  if (match === null) return null;
  const parsed = parseThresholds({ warn: match[3], stop: match[4], policy: match[5] });
  if (!parsed.ok) return null;
  const thresholds = parsed.thresholds;
  if (guardCommand(match[1] as string, match[2] as string, thresholds) !== command) return null;
  return { node: match[1] as string, entry: match[2] as string, thresholds };
}

const isOurs = (hook: unknown): boolean => isObject(hook) && typeof hook.command === 'string' && parseGuardCommand(hook.command) !== null;

export interface GuardView {
  /** The thresholds of the hooks that are ours, by event; an event with none is absent. */
  found: Partial<Record<GuardEvent, Thresholds>>;
  /** The key whose shape this command cannot edit, when there is one. */
  shape: string | null;
}

export function viewGuard(settings: Obj): GuardView {
  const view: GuardView = { found: {}, shape: null };
  if (!('hooks' in settings)) return view;
  if (!isObject(settings.hooks)) return { found: {}, shape: 'hooks' };
  for (const event of GUARD_EVENTS) {
    if (!(event in settings.hooks)) continue;
    const list = settings.hooks[event];
    if (!Array.isArray(list)) return { found: {}, shape: `hooks.${event}` };
    for (const entry of list) {
      if (!isObject(entry) || !Array.isArray(entry.hooks)) continue;
      for (const hook of entry.hooks) {
        if (isOurs(hook)) view.found[event] = parseGuardCommand((hook as Obj).command as string)?.thresholds as Thresholds;
      }
    }
  }
  return view;
}

/** Adds the hook to each event, or rewrites ours there; touches no other hook. Returns the containers it created. */
export function withGuard(settings: Obj, command: string): string[] {
  const created: string[] = [];
  if (!('hooks' in settings)) {
    settings.hooks = {};
    created.push('hooks');
  }
  const hooks = settings.hooks as Obj;
  for (const event of GUARD_EVENTS) {
    if (!(event in hooks)) {
      hooks[event] = [];
      created.push(event);
    }
    const list = hooks[event] as unknown[];
    let found = false;
    for (const entry of list) {
      if (!isObject(entry) || !Array.isArray(entry.hooks)) continue;
      for (const hook of entry.hooks) {
        if (isOurs(hook)) {
          (hook as Obj).command = command;
          found = true;
        }
      }
    }
    // UserPromptSubmit takes no matcher; PreToolUse's matcher is the tool, and every tool is one.
    if (!found) list.push({ ...(event === 'PreToolUse' ? { matcher: '*' } : {}), hooks: [{ type: 'command', command }] });
  }
  return created;
}

/** Removes exactly the hooks `withGuard` wrote, and the containers it made when they are empty. */
export function withoutGuard(settings: Obj, created: string[]): void {
  if (!isObject(settings.hooks)) return;
  const hooks = settings.hooks;
  for (const event of GUARD_EVENTS) {
    const list = hooks[event];
    if (!Array.isArray(list)) continue;
    const kept: unknown[] = [];
    for (const entry of list) {
      if (!isObject(entry) || !Array.isArray(entry.hooks)) {
        kept.push(entry);
        continue;
      }
      const remaining = entry.hooks.filter((hook) => !isOurs(hook));
      if (remaining.length === entry.hooks.length) kept.push(entry);
      else if (remaining.length > 0) {
        entry.hooks = remaining;
        kept.push(entry);
      } else if (Object.keys(entry).some((key) => key !== 'matcher' && key !== 'hooks')) {
        entry.hooks = [];
        kept.push(entry);
      }
    }
    hooks[event] = kept;
    if (kept.length === 0 && created.includes(event)) delete hooks[event];
  }
  if (Object.keys(hooks).length === 0 && created.includes('hooks')) delete settings.hooks;
}

// --------------------------------------------------------------------------
// The hook itself: `trazum session-guard check`
// --------------------------------------------------------------------------

export interface CheckResult {
  /** What goes to standard output: JSON for Claude Code, or nothing. */
  stdout: string;
  /** What goes to standard error: the reason, when the exit code is 2. */
  stderr: string;
  /** 0 lets the action go on. 2 is the code the hooks page documents for blocking it. */
  code: 0 | 2;
}

const SILENT: CheckResult = { stdout: '', stderr: '', code: 0 };

/** One hook call: the JSON Claude Code wrote on stdin, in; what to print and how to exit, out. */
export async function check(
  stdin: string,
  thresholds: Thresholds,
  options: { catalogue: PricingCatalogue; env: NodeJS.ProcessEnv; now: Date; t: CliMessages },
): Promise<CheckResult> {
  const { t } = options;
  let input: unknown;
  try {
    input = JSON.parse(stdin);
  } catch {
    input = null;
  }
  const fields = isObject(input) ? input : {};
  const session = typeof fields.session_id === 'string' ? fields.session_id : '';

  let cost: SessionCost;
  try {
    cost = await sessionCost(fields.transcript_path, options.catalogue, options.now);
  } catch {
    // Whatever went wrong, it is not a session that cost nothing.
    cost = { kind: 'cannot-tell', cause: 'unreadable' };
  }
  const decision = decide(cost, thresholds);
  const dir = stateDir(options.env);
  const usd = (value: number): string => formatUsd(value);
  const message = (text: string): string => JSON.stringify({ systemMessage: text });
  const why = (cause: CannotTellCause | 'unpriced', models: string[]): string =>
    cause === 'unpriced' ? t.sessionGuard.unpriced(models.join(', ')) : t.sessionGuard.cause[cause]();
  // A session with no id cannot be remembered, so it is told every time rather than never.
  const given = async (kind: 'warned' | 'cannot-tell'): Promise<boolean> => session !== '' && (await alreadyGiven(dir, session, kind));
  const note = async (kind: 'warned' | 'cannot-tell'): Promise<void> => {
    if (session !== '') await remember(dir, session, kind);
  };

  switch (decision.action) {
    case 'allow':
      return SILENT;
    case 'warn': {
      if (await given('warned')) return SILENT;
      await note('warned');
      return {
        ...SILENT,
        stdout: message(t.sessionGuard.warn(usd(decision.usd), usd(thresholds.warnUsd), usd(thresholds.stopUsd), decision.atLeast)),
      };
    }
    case 'block':
      return { stdout: '', stderr: t.sessionGuard.block(usd(decision.usd), usd(thresholds.stopUsd), decision.atLeast), code: 2 };
    case 'allow-cannot-tell': {
      if (await given('cannot-tell')) return SILENT;
      await note('cannot-tell');
      return { ...SILENT, stdout: message(t.sessionGuard.cannotTellOpen(why(decision.cause, decision.models))) };
    }
    case 'block-cannot-tell':
      return { stdout: '', stderr: t.sessionGuard.cannotTellClosed(why(decision.cause, decision.models)), code: 2 };
  }
}

// --------------------------------------------------------------------------
// install, uninstall
// --------------------------------------------------------------------------

export type GuardPlan =
  | { kind: 'refused'; message: string }
  | { kind: 'nothing'; message: string }
  | { kind: 'plan'; changes: Change[]; patch: (m: Manifest) => void };

/** What an install or an uninstall would change, read from the disk and written to nothing. */
export async function planGuard(ctx: Ctx, action: 'install' | 'uninstall', thresholds: Thresholds | null, t: CliMessages): Promise<GuardPlan> {
  const p = pathsFor(ctx);
  const home = resolve(ctx.home);
  const refuse = (finding: Finding): GuardPlan => ({ kind: 'refused', message: t.proactive.reason[finding.code](finding.params) });
  const file = shown(ctx, p.settings);

  if (ctx.platform === 'win32') return { kind: 'refused', message: t.sessionGuard.windows() };
  const manifestRead = await readJsonObject(ctx, p.manifest, home);
  if (manifestRead.kind === 'refused') return refuse(manifestRead.finding);
  const manifest = manifestRead.kind === 'ok' ? manifestFrom(manifestRead.value) : emptyManifest();
  const read = await readJsonObject(ctx, p.settings, home);
  if (read.kind === 'refused') return refuse(read.finding);
  const value: Obj = read.kind === 'ok' ? read.value : {};
  const view = viewGuard(value);
  if (view.shape !== null) return { kind: 'refused', message: t.sessionGuard.settingsShape(file, view.shape) };

  if (action === 'uninstall') {
    if (Object.keys(view.found).length === 0) return { kind: 'nothing', message: t.sessionGuard.nothingToUninstall() };
    const next = structuredClone(value);
    withoutGuard(next, manifest.guard?.created ?? []);
    const madeByUs = manifest.guard?.createdFile === true || manifest.statusline?.createdFile === true;
    const gone = madeByUs && Object.keys(next).length === 0;
    return {
      kind: 'plan',
      changes: [jsonChange('session-guard', p.settings, read, gone ? null : next, false)],
      patch: (m) => {
        delete m.guard;
      },
    };
  }

  if (thresholds === null) return { kind: 'refused', message: t.sessionGuard.refusedMissing('--warn, --stop, --on-cannot-tell') };
  if (read.kind === 'absent' && !(await stat(join(home, '.claude')).then((info) => info.isDirectory(), () => false))) {
    return { kind: 'refused', message: t.sessionGuard.noClaude(shown(ctx, join(home, '.claude'))) };
  }
  const runtime = await stableRuntime(ctx);
  if (!runtime.ok) return refuse({ code: runtime.code === 'unstable' ? 'cli.unstable' : 'cli.unsafe', params: { path: runtime.path } });
  const next = structuredClone(value);
  const created = withGuard(next, guardCommand(runtime.node, runtime.entry, thresholds));
  const backup = !(manifest.guard?.createdFile === true || manifest.statusline?.createdFile === true);
  const change = jsonChange('session-guard', p.settings, read, next, backup, 0o600);
  if (change.after === change.before) return { kind: 'nothing', message: t.sessionGuard.alreadyInstalled(file) };
  return {
    kind: 'plan',
    changes: [change],
    patch: (m) => {
      m.guard = {
        createdFile: m.guard?.createdFile === true || read.kind === 'absent',
        created: [...new Set([...(m.guard?.created ?? []), ...created])],
      };
    },
  };
}

/** A write that failed, as the finding `trazum proactive` would report for it. */
export class GuardWriteFailed extends Error {
  constructor(readonly finding: Finding) {
    super(finding.code);
  }
}

/** Writes a plan through the one door, then the record of it; puts it all back if any write fails. */
export async function applyGuardPlan(ctx: Ctx, plan: Extract<GuardPlan, { kind: 'plan' }>, action: 'install' | 'uninstall'): Promise<void> {
  const p = pathsFor(ctx);
  const manifestRead = await readJsonObject(ctx, p.manifest, resolve(ctx.home));
  const was = manifestRead.kind === 'ok' ? manifestRead.raw : null;
  const manifest = manifestRead.kind === 'ok' ? manifestFrom(manifestRead.value) : emptyManifest();
  const applied: Change[] = [];
  try {
    for (const change of plan.changes) {
      await applyChange(ctx, change);
      applied.push(change);
    }
    plan.patch(manifest);
    const text = manifestEmpty(manifest) ? null : `${JSON.stringify(manifest, null, 2)}\n`;
    if (text !== was) {
      const change: Change = { item: 'manifest', target: p.manifest, before: was, after: text, mode: 0o600, added: [], removed: [], backup: false };
      await applyChange(ctx, change);
      applied.push(change);
    }
    if (action === 'uninstall') await removeEmptyDir(ctx, p.stateDir);
  } catch (error) {
    const left = await undo(ctx, applied);
    if (left.length > 0) {
      throw new GuardWriteFailed({ code: 'write.partial', params: { files: left.map((target) => shown(ctx, target)).join(', ') } });
    }
    throw new GuardWriteFailed(failure(ctx, error));
  }
}

/** Which of the two events carry the hook: both, one, or none. */
export function guardState(view: GuardView): 'on' | 'partial' | 'off' {
  const n = Object.keys(view.found).length;
  return n === GUARD_EVENTS.length ? 'on' : n === 0 ? 'off' : 'partial';
}
