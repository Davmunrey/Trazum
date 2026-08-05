import { open, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import {
  CONFIG_FILENAME,
  ConfigError,
  MAX_CONFIG_BYTES,
  MAX_CONFIG_SEARCH_DEPTH,
  parseConfig,
  validateConfigModel,
} from './config-schema.js';
import type { TrazumConfig } from './config-schema.js';
import { BUNDLED_CATALOGUE } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';
import { MAX_PRICING_BYTES, PricingOverlayError, applyPricingOverlay, parsePricingOverlay } from './pricing-overlay.js';

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
  /**
   * Prices to work from: the bundled catalogue, with the config's `pricing`
   * overlay applied if it named one. Always present, so a caller never has to
   * decide which of two sources to use.
   */
  pricing: PricingCatalogue;
  /** Absolute path the overlay came from, or null when there was none. */
  pricingPath: string | null;
}

/**
 * Resolves a config's `pricing` overlay, if it names one.
 *
 * The path is relative to **the config file**, not the working directory, so a
 * config found by walking upward still finds its own overlay. Reusing
 * `readIfPresent` means the overlay gets the same one-handle read and the same
 * size limit as the config itself.
 */
async function resolvePricing(
  config: TrazumConfig,
  configPath: string,
): Promise<{ pricing: PricingCatalogue; pricingPath: string | null }> {
  if (!config.pricing) return { pricing: BUNDLED_CATALOGUE, pricingPath: null };

  const path = resolve(dirname(configPath), config.pricing);
  const raw = await readIfPresent(path, MAX_PRICING_BYTES);
  if (raw === null) {
    // Named and missing is an error, for the same reason `--config` is: somebody
    // who points at a price list is not asking for the bundled one.
    throw new PricingOverlayError('no such pricing overlay', path);
  }
  return {
    pricing: applyPricingOverlay(BUNDLED_CATALOGUE, parsePricingOverlay(raw, path), path),
    pricingPath: path,
  };
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
async function readIfPresent(path: string, limit = MAX_CONFIG_BYTES): Promise<string | null> {
  let handle;
  try {
    handle = await open(path, 'r');
  } catch {
    return null;
  }

  try {
    const info = await handle.stat();
    if (!info.isFile()) return null;
    if (info.size > limit) {
      throw new ConfigError(`is ${info.size} bytes, over the ${limit}-byte limit`, path);
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
    return finish(parseConfig(raw, path), path);
  }

  let directory = resolve(options.from ?? process.cwd());

  for (let depth = 0; depth < MAX_CONFIG_SEARCH_DEPTH; depth++) {
    const candidate = join(directory, CONFIG_FILENAME);
    const raw = await readIfPresent(candidate);
    if (raw !== null) return finish(parseConfig(raw, candidate), candidate);

    // A repository root is a deliberate stopping point: reaching past it would
    // read a config belonging to whatever happens to be above the checkout,
    // which on a CI runner is not the project's business.
    const gitDirectory = await stat(join(directory, '.git')).catch(() => null);
    if (gitDirectory) break;

    const parent = dirname(directory);
    if (parent === directory || parent === sep) break;
    directory = parent;
  }

  return { config: {}, path: null, pricing: BUNDLED_CATALOGUE, pricingPath: null };
}

/**
 * Resolves the overlay and checks the model, in that order.
 *
 * The order is the point: `usage.model` may name a model the overlay introduces,
 * so validating it before the overlay is read would reject a config that is
 * correct.
 */
async function finish(config: TrazumConfig, path: string): Promise<LoadedConfig> {
  const { pricing, pricingPath } = await resolvePricing(config, path);
  validateConfigModel(config, pricing, path);
  return { config, path, pricing, pricingPath };
}
