import { open, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import {
  CONFIG_FILENAME,
  ConfigError,
  MAX_CONFIG_BYTES,
  MAX_CONFIG_SEARCH_DEPTH,
  parseConfig,
} from './config-schema.js';
import type { TrazumConfig } from './config-schema.js';

/**
 * Finding and reading `trazum.config.json`.
 *
 * Split from the schema in `config-schema.ts` because this is the only half
 * that touches the filesystem, and the split is load-bearing: `apps/web`
 * bundles `@trazum/core` for the browser, where a single `node:fs` import
 * anywhere in the graph fails the build. Reachable only through
 * `@trazum/core/node`, which the CLI imports and the web app does not.
 */

export interface LoadedConfig {
  config: TrazumConfig;
  /** Absolute path the config came from, or null when none was found. */
  path: string | null;
}

/**
 * Reads a config file if it is there, or returns null.
 *
 * **The handle is opened once and everything is asked of the handle**, not of
 * the path again. Checking the size with `stat(path)` and then reading with
 * `readFile(path)` resolves the name twice, so what gets read is not
 * necessarily what got measured — a symlink swapped in between the two calls
 * defeats the size limit entirely, and on a CI runner checking out a pull
 * request that is not a hypothetical attacker. One `open`, then `fh.stat()` and
 * `fh.readFile()`, refer to the same file object throughout.
 */
async function readIfPresent(path: string): Promise<string | null> {
  let handle;
  try {
    handle = await open(path, 'r');
  } catch {
    return null;
  }

  try {
    const info = await handle.stat();
    if (!info.isFile()) return null;
    if (info.size > MAX_CONFIG_BYTES) {
      throw new ConfigError(
        `is ${info.size} bytes, over the ${MAX_CONFIG_BYTES}-byte limit for a config file`,
        path,
      );
    }
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

export interface LoadConfigOptions {
  /** Directory to start the upward search from. Defaults to the process cwd. */
  from?: string;
  /**
   * An explicit path. Given one, no search happens and a missing file is an
   * error: somebody who names a config file is not asking for defaults.
   */
  explicit?: string;
}

/**
 * Finds and reads the nearest config file.
 *
 * The search walks **upward from the working directory**, which is what makes
 * `cd packages/thing && trazum check prompt.txt` pick up the repository's
 * config. It stops at the first hit, at a directory containing `.git`, or after
 * `MAX_CONFIG_SEARCH_DEPTH` levels — a bound rather than an unlimited climb to
 * the filesystem root.
 *
 * Finding nothing is not an error: the tool is useful with no config at all,
 * and returning `{config: {}, path: null}` lets the caller say so.
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  if (options.explicit !== undefined) {
    const path = resolve(options.explicit);
    const raw = await readIfPresent(path);
    if (raw === null) throw new ConfigError('no such config file', path);
    return { config: parseConfig(raw, path), path };
  }

  let directory = resolve(options.from ?? process.cwd());

  for (let depth = 0; depth < MAX_CONFIG_SEARCH_DEPTH; depth++) {
    const candidate = join(directory, CONFIG_FILENAME);
    const raw = await readIfPresent(candidate);
    if (raw !== null) return { config: parseConfig(raw, candidate), path: candidate };

    // A repository root is a deliberate stopping point: reaching past it would
    // read a config belonging to whatever happens to be above the checkout,
    // which on a CI runner is not the project's business.
    const gitDirectory = await stat(join(directory, '.git')).catch(() => null);
    if (gitDirectory) break;

    const parent = dirname(directory);
    if (parent === directory || parent === sep) break;
    directory = parent;
  }

  return { config: {}, path: null };
}
