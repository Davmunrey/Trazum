import { spawnSync } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * The only place in this repository that runs another program.
 *
 * `trazum blame` needs a file's history, and the history lives in git;
 * `trazum bench` needs a fresh process per workload, because a memory peak is
 * a fact about a process. Nothing else here has ever shelled out, so this
 * module is written as if it were the whole attack surface — because it is.
 *
 * The rules, and why each one is here rather than in a comment on the call site:
 *
 * - **No shell, ever.** `spawnSync` with an argv array and `shell: false`, which
 *   is the default and is stated anyway. The moment a path reaches a shell
 *   string, a file called `; rm -rf ~` is a command.
 * - **Paths go after `--`.** Without it, a file named `--upload-pack=curl…` or
 *   `--output=…` is read by git as an option, and git has options that run
 *   programs. This is the specific reason `trazum blame -- <path>` is not
 *   enough on its own: the separator has to be in *our* argv, not the user's.
 * - **Object names are validated before they are used.** `git show <sha>:<path>`
 *   glues two values into one argument, so the sha is checked against
 *   `/^[0-9a-f]{40}$/` before it can contribute anything to it.
 * - **Everything is bounded.** A timeout so a hung git does not wedge the CLI, a
 *   `maxBuffer` so a large blob cannot exhaust memory, and a revision cap so
 *   `blame` on a file with 40,000 commits terminates.
 * - **The path must be inside the repository.** Reading history for
 *   `../../elsewhere/secrets.txt` is not a thing this command exists to do.
 *
 * Failures are `null` or an empty array rather than exceptions with git's own
 * wording. The caller turns them into a sentence in the reader's language.
 */

/** Ten seconds is a long time for `git log`; a hung one should not be forever. */
const TIMEOUT_MS = 10_000;

/** 32 MB. A prompt file this big is not a prompt file. */
const MAX_BUFFER = 32 * 1024 * 1024;

const SHA = /^[0-9a-f]{40}$/;

export interface Revision {
  sha: string;
  shortSha: string;
  author: string;
  /** ISO 8601, author date. */
  date: string;
  subject: string;
}

/**
 * Errors that mean *the process could not be started*, not that git said no.
 *
 * `EAGAIN` is the kernel refusing a fork because the process or thread limit is
 * momentarily full; `ENOMEM` is the same story with memory. Both are properties
 * of the machine at that instant and both are gone a moment later, which is
 * exactly why they surface on a loaded CI runner and never on a laptop.
 */
const TRANSIENT = new Set(['EAGAIN', 'ENOMEM']);

/**
 * Why a git invocation produced nothing — which is not one question but two.
 *
 * `git log` exiting 0 with no output means *this file has no history*. Failing
 * to spawn git at all means *we do not know what history this file has*. They
 * had the same representation here — `null` — so `revisionsFor` returned `[]`
 * for both and `blame` told the author "git has no commits touching p.txt",
 * confidently, on the strength of never having asked.
 *
 * That is the shape of issue #58: zero rows, exit 0, only on CI, never
 * reproducible. A fork that fails under load is invisible and looks like a fact
 * about the repository.
 */
type GitOutcome =
  | { ran: true; stdout: string }
  | { ran: true; stdout: null }
  | { ran: false; stdout: null; detail: string };

/**
 * The spawn, injectable — the same seam the LLM providers use for `fetch`.
 *
 * Exported because the retry below is otherwise untestable: provoking a real
 * `EAGAIN` means exhausting the process table, which is not something a test
 * suite should do to the machine running it. A retry nothing checks is a retry
 * somebody deletes in a refactor, and mutation testing said exactly that.
 *
 * It widens nothing in practice: the CLI has no library entry, so this module
 * is reachable only from inside this package and from its tests.
 */
export type SpawnLike = typeof spawnSync;

function runGit(
  args: readonly string[],
  cwd: string,
  spawn: SpawnLike = spawnSync,
): GitOutcome {
  /**
   * Bounded by the loop, not by a condition inside it.
   *
   * Written as `for (;;)` with a `continue` guarded by `attempt === 0` first,
   * which is one edit away from retrying for ever — and mutation testing does
   * not report that as a surviving mutant, it reports it as the suite hanging
   * until the runner is killed. In CI that is a job that burns its whole
   * timeout instead of failing in a second.
   *
   * Two attempts, and only for a failure to *start* the process. A git that ran
   * and exited non-zero is answering, and asking it twice would just re-run a
   * command that already failed for a reason.
   */
  const ATTEMPTS = 2;
  let last: GitOutcome = { ran: false, stdout: null, detail: 'not attempted' };

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const result = spawn('git', args, {
      cwd,
      // Stated rather than left to the default: this is the line that matters.
      shell: false,
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      // No prompting for credentials, no pager waiting on a TTY that is not there.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat' },
    });

    if (result.error !== undefined) {
      const code = (result.error as NodeJS.ErrnoException).code ?? '';
      last = { ran: false, stdout: null, detail: code || result.error.message };
      if (TRANSIENT.has(code)) continue;
      return last;
    }

    if (result.status !== 0) return { ran: true, stdout: null };
    return { ran: true, stdout: result.stdout };
  }

  // Every attempt was refused before git started. The machine is out of
  // whatever it ran out of, and saying so beats a third try.
  return last;
}

function git(args: readonly string[], cwd: string): string | null {
  return runGit(args, cwd).stdout;
}

/**
 * Thrown when git could not be run, as distinct from git having nothing to say.
 *
 * A distinct type rather than a message, so a caller cannot accidentally treat
 * it as an empty result — which is the whole bug.
 */
export class GitUnavailableError extends Error {
  constructor(detail: string) {
    super(`could not run git (${detail})`);
    this.name = 'GitUnavailableError';
  }
}

/**
 * Whether `git` can be run at all.
 *
 * Separate from `repositoryRoot` because the two failures need different
 * advice: "install git" and "run this inside a repository" have nothing to do
 * with each other, and a single "could not read history" would send half the
 * readers looking in the wrong place.
 */
export function gitAvailable(cwd: string): boolean {
  return git(['--version'], cwd) !== null;
}

/** The repository root containing `cwd`, or `null` if there is not one. */
export function repositoryRoot(cwd: string): string | null {
  const out = git(['rev-parse', '--show-toplevel'], cwd);
  return out === null ? null : out.trim() || null;
}

/**
 * Whether git tracks `repoPath` in the repository at `root`.
 *
 * `trazum plan --edits` writes an edit only for a tracked file: the edit is
 * opened later as a pull request, and a pull request can only change what the
 * repository holds. The path goes after `--`, like every path here, so a file
 * named like an option is read as a file.
 */
export function isTracked(root: string, repoPath: string): boolean {
  const out = git(['ls-files', '--error-unmatch', '--', repoPath], root);
  return out !== null && out.trim() !== '';
}

/**
 * The path as git knows it — relative to the repository root, forward slashes —
 * or `null` when it falls outside the repository.
 */
export function pathInRepository(root: string, target: string): string | null {
  const rel = relative(resolve(root), resolve(target));
  // Empty means the target *is* the root, `..` at the front means it escaped,
  // and an absolute result means the two are on different Windows drives. All
  // three are "outside the repository".
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return null;
  }
  return rel.split(sep).join('/');
}

/**
 * Two minutes: a bench child runs a workload in seconds, and a machine where
 * it takes longer than this deserves a loud failure, not a silent wait.
 */
const SELF_TIMEOUT_MS = 120_000;

/**
 * Runs this same CLI in a child process and returns its stdout.
 *
 * The bench's isolation seam, kept in this module so the invariant the
 * security suite asserts — child_process appears in exactly one file — stays
 * whole. The same rules as the git spawn, and one more: **every argument is
 * the caller's own.** The bench passes a script path derived from its own
 * module URL, workload ids from a const list, and a locale its catalogue
 * produced; nothing typed by a user reaches this argv.
 */
export function runSelf(scriptPath: string, args: readonly string[]): string {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    // Stated rather than left to the default, same as the git spawn above.
    shell: false,
    encoding: 'utf8',
    timeout: SELF_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `child exited with status ${result.status}`);
  }
  return result.stdout;
}

/** What `crontab` said: its exit status and both streams, or the error that kept it from starting. */
export interface CrontabResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** `ENOENT` when there is no `crontab` program on this machine. */
  errorCode: string | null;
}

/**
 * Runs the system `crontab` with one of its two fixed argument lists.
 *
 * `trazum proactive` reads the user's crontab with `crontab -l` and writes it
 * back with `crontab -`, the text on stdin. It is here, beside the other two
 * spawns, so the invariant the security suite asserts, that child_process
 * appears in exactly one file, stays whole. The same rules: no shell, and
 * **no argument of anybody's**: the argv is one of two literals, and the text
 * that changes travels on stdin, where a `;` is a character and not a command.
 */
export function runCrontab(args: readonly ['-l'] | readonly ['-'], input?: string): CrontabResult {
  const result = spawnSync('crontab', [...args], {
    shell: false,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    ...(input === undefined ? {} : { input }),
  });
  const code = result.error !== undefined && 'code' in result.error ? String((result.error as { code: unknown }).code) : null;
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    errorCode: result.error === undefined ? null : (code ?? 'ERROR'),
  };
}

/** What a desktop notifier said: its exit status and stderr, or the error that kept it from starting. */
export interface NotifierRun {
  status: number | null;
  stderr: string;
  /** `ENOENT` when this machine has no such program. */
  errorCode: string | null;
}

/**
 * Runs the platform's notifier, for `trazum watch --notify`.
 *
 * It is here, beside the other spawns, so the invariant the security suite
 * asserts, that child_process appears in exactly one file, stays whole. The
 * same rules: no shell, a timeout so a notifier that hangs cannot hang the
 * watcher, and output bounded. The command is one of three literals, and the
 * argument list is built by `watch-notify.ts`, which hands the text over as
 * data (arguments of a fixed script, an environment variable, or after `--`)
 * and never splices it into anything a program would run.
 */
export function runNotifier(
  command: 'osascript' | 'notify-send' | 'powershell.exe',
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): NotifierRun {
  const result = spawnSync(command, [...args], {
    shell: false,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    env,
  });
  const code = result.error !== undefined && 'code' in result.error ? String((result.error as { code: unknown }).code) : null;
  return {
    status: result.status,
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    errorCode: result.error === undefined ? null : (code ?? 'ERROR'),
  };
}

/**
 * Commits that touched `repoPath`, newest first.
 *
 * `--follow` so a renamed prompt keeps its history: a file moved from
 * `prompt.txt` to `prompts/support.txt` is the same prompt, and a cost history
 * that restarts at the rename is telling you the growth began the day somebody
 * tidied the directory.
 */
export function revisionsFor(
  repoPath: string,
  options: { cwd: string; max: number; spawn?: SpawnLike },
): Revision[] {
  // A unit separator between fields and a record separator between commits:
  // both are characters git will not emit inside a name or a subject, unlike
  // the tab and newline that a commit subject can absolutely contain.
  // Written as escapes, not typed in. A raw control byte in a source file is
  // how `scripts/measure-token-band.mjs` ended up with no reviewable diff for
  // three commits, one of which was a security fix.
  const FIELD = '\u001f';
  const RECORD = '\u001e';
  const format = ['%H', '%h', '%an', '%aI', '%s'].join(FIELD) + RECORD;

  const outcome = runGit(
    [
      'log',
      '--follow',
      `--max-count=${Math.max(1, Math.floor(options.max))}`,
      `--format=${format}`,
      // Everything after this is a path, whatever it looks like.
      '--',
      repoPath,
    ],
    options.cwd,
    options.spawn,
  );

  // The distinction this function used to lose. An empty list now means git
  // looked and found nothing; being unable to look throws instead, so it can
  // never be reported to somebody as a fact about their repository.
  if (!outcome.ran) throw new GitUnavailableError(outcome.detail);
  const out = outcome.stdout;
  if (out === null) return [];

  return out
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [sha = '', shortSha = '', author = '', date = '', subject = ''] = record.split(FIELD);
      return { sha, shortSha, author, date, subject };
    })
    .filter((revision) => SHA.test(revision.sha));
}

/**
 * The file's content at a commit, or `null` if it did not exist there.
 *
 * `--follow` above means the path can differ from the one at that commit, so
 * this asks git for the name it had rather than assuming today's.
 */
export function contentAt(sha: string, repoPath: string, cwd: string): string | null {
  // The sha becomes part of a single `sha:path` argument, so it is checked
  // before it can contribute anything to one.
  if (!SHA.test(sha)) return null;
  return git(['show', `${sha}:${repoPath}`], cwd);
}

/**
 * The full sha of the commit `ref` names in this checkout, or `null` when the
 * checkout does not have it.
 *
 * `trazum check --base` (#785) reads the base branch from the clone the job
 * already has, and never fetches: a commit that is not here is reported as
 * not here, with what would bring it, and is never stood in for by the
 * working tree. A ref that starts with a dash is refused before git sees it,
 * because git would read it as an option. Unable to run git at all throws,
 * for the reason `revisionsFor` does.
 */
export function commitOf(ref: string, cwd: string, spawn?: SpawnLike): string | null {
  if (ref === '' || ref.startsWith('-')) return null;
  const outcome = runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd, spawn);
  if (!outcome.ran) throw new GitUnavailableError(outcome.detail);
  const sha = outcome.stdout?.trim() ?? '';
  return SHA.test(sha) ? sha : null;
}

/**
 * Every file under `repoPath` at a commit, as paths from the repository root,
 * or `null` when git could not answer.
 *
 * `repoPath` is relative to the repository root and `cwd` is that root; an
 * empty `repoPath` means the whole tree. A file path lists that one file when
 * it is there. NUL-separated output, so a name holding a newline is one name.
 */
export function filesAt(sha: string, repoPath: string, cwd: string): string[] | null {
  if (!SHA.test(sha)) return null;
  const args = ['ls-tree', '-r', '-z', '--name-only', '--full-tree', sha];
  if (repoPath !== '') args.push('--', repoPath);
  const out = git(args, cwd);
  if (out === null) return null;
  return out.split('\u0000').filter((name) => name !== '');
}

/**
 * The name the file had at each commit, keyed by sha.
 *
 * One `git log` rather than one per revision, and it replaces a version that
 * asked per commit and got nothing back: `git log --follow --max-count=1 <sha>
 * -- <today's name>` returns an empty list for every commit before a rename,
 * because at those commits that name did not exist. The effect was that a
 * renamed prompt showed "not present" for its entire history before the move —
 * the data was there, under the old name, and the report said there was none.
 *
 * Asking once, without a starting commit, lets `--follow` do the mapping it
 * exists for: the output pairs each sha with the path it touched.
 */
export function namesByRevision(repoPath: string, cwd: string, max: number): Map<string, string> {
  const MARK = '\u001e';
  const out = git(
    [
      'log',
      '--follow',
      '--name-only',
      `--max-count=${Math.max(1, Math.floor(max))}`,
      `--format=${MARK}%H`,
      '--',
      repoPath,
    ],
    cwd,
  );

  const names = new Map<string, string>();
  if (out === null) return names;

  for (const record of out.split(MARK)) {
    const lines = record.split('\n').map((line) => line.trim()).filter((line) => line !== '');
    const [sha, name] = lines;
    if (sha !== undefined && name !== undefined && SHA.test(sha)) names.set(sha, name);
  }
  return names;
}
