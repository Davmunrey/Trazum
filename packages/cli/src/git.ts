import { spawnSync } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * The only place in this repository that runs another program.
 *
 * `trazum blame` needs a file's history, and the history lives in git. Nothing
 * else here has ever shelled out, so this module is written as if it were the
 * whole attack surface — because it is.
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

function git(args: readonly string[], cwd: string): string | null {
  const result = spawnSync('git', args, {
    cwd,
    // Stated rather than left to the default: this is the line that matters.
    shell: false,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    // No prompting for credentials, no pager waiting on a TTY that is not there.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat' },
  });

  if (result.error !== undefined || result.status !== 0) return null;
  return result.stdout;
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
 * Commits that touched `repoPath`, newest first.
 *
 * `--follow` so a renamed prompt keeps its history: a file moved from
 * `prompt.txt` to `prompts/support.txt` is the same prompt, and a cost history
 * that restarts at the rename is telling you the growth began the day somebody
 * tidied the directory.
 */
export function revisionsFor(
  repoPath: string,
  options: { cwd: string; max: number },
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

  const out = git(
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
  );
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
