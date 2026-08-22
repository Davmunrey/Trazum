import { readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

import { DEFAULT_EXTENSIONS } from './config-schema.js';
import { matchGlob } from './glob.js';

/**
 * Finding the prompt files under a directory.
 *
 * Three things this deliberately does not do, each because of what it would
 * mean on a CI runner reading a repository somebody else opened a pull request
 * against:
 *
 * 1. **It does not follow symlinks.** A link is skipped, not resolved. A link
 *    to `/etc` or to a parent directory turns "check the prompts folder" into
 *    reading and printing token counts for files outside the project, and a
 *    link loop turns it into a hang.
 * 2. **It does not walk without bound.** Depth and file count are capped, and
 *    hitting the cap is reported rather than silently truncating the list —
 *    "0 files over budget" and "I stopped looking" must not read the same.
 * 3. **It does not guess at what a prompt is.** Only the configured extensions
 *    are read. Everything else is left alone rather than tokenised on the
 *    chance it might be a prompt.
 */

export const MAX_WALK_DEPTH = 12;
export const MAX_WALK_FILES = 2000;

/** Directories never worth descending into, and expensive when they are. */
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  'vendor',
  '.venv',
  '__pycache__',
]);

export interface WalkResult {
  /** Matching files, as paths relative to the root, with `/` separators. */
  files: string[];
  /** True when a cap stopped the walk early, so the caller can say so. */
  truncated: boolean;
}

export interface WalkOptions {
  extensions?: readonly string[];
  maxFiles?: number;
  maxDepth?: number;
  /**
   * Paths to leave out, as globs against the path relative to the root.
   *
   * **Why this had to exist.** Directory mode decided what a prompt was from
   * the extension alone, and `.txt` in a repository with a test corpus means
   * *fixtures*. Pointed at this project's own root it read seventy-four
   * documents — README, changelog, roadmap — and thirty-five test fixtures as
   * prompts, which is why nobody here had ever committed a baseline of it. A
   * hard-coded skip list would have been guessing on somebody else's layout;
   * this is the repository saying which of its files are prompts.
   *
   * A directory is skipped whole when the pattern matches it, so an ignored
   * tree costs one comparison rather than one per file in it.
   */
  ignore?: readonly string[];
}

/**
 * Lists prompt files under `root`, relative to it and sorted.
 *
 * Sorted because the output is read by humans and compared between runs: a
 * report whose row order depends on the filesystem's directory order is one
 * nobody can diff.
 */
export async function walkPrompts(root: string, options: WalkOptions = {}): Promise<WalkResult> {
  const extensions = (options.extensions ?? DEFAULT_EXTENSIONS).map((value) =>
    value.toLowerCase(),
  );
  const maxFiles = options.maxFiles ?? MAX_WALK_FILES;
  const maxDepth = options.maxDepth ?? MAX_WALK_DEPTH;
  const ignore = options.ignore ?? [];

  /**
   * Whether a path relative to the root is excluded.
   *
   * A directory is offered both bare and with a trailing slash, so
   * `packages/**` and `packages/` both keep the walk out of it. Matching the
   * directory rather than each file under it is what makes an ignored tree
   * cheap instead of merely quiet.
   */
  const excluded = (relPath: string): boolean =>
    ignore.some((pattern) => matchGlob(pattern, relPath) || matchGlob(pattern, `${relPath}/`));

  const files: string[] = [];
  let truncated = false;

  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > maxDepth) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      // An unreadable directory is skipped rather than fatal: one permission
      // problem deep in a tree should not throw away the rest of the report.
      return;
    }

    // Sorted here as well as at the end, so the file that trips the cap is the
    // same one on every run.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        return;
      }
      // Skipped before the type checks: a symlink is never followed, whatever
      // it points at.
      if (entry.isSymbolicLink()) continue;
      if (entry.name.startsWith('.')) continue;

      const full = join(directory, entry.name);

      const rel = relative(root, full).split(sep).join('/');

      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
        if (excluded(rel)) continue;
        await visit(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!extensions.includes(extname(entry.name).toLowerCase())) continue;
      if (excluded(rel)) continue;

      files.push(rel);
    }
  };

  await visit(root, 0);
  files.sort();
  return { files, truncated };
}
