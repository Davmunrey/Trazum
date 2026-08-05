import { mostSpecificMatch } from './glob.js';
import { isLocale } from './i18n/index.js';
import { nearestName } from './nearest.js';
import { getModel } from './pricing.js';
import { RULES } from './rules.js';
import type { Locale } from './i18n/index.js';
import type { RuleId, RuleLevel, UsageProfile } from './types.js';

/**
 * The shape and validation of `trazum.config.json`. No filesystem access — the
 * loader that reads the file lives in `config.ts`, which is only reachable via
 * `@trazum/core/node`. Keeping the schema pure is what lets the browser bundle
 * import the types and key lists without dragging `node:fs` into its graph.
 *
 * The problem this solves is small and real: every command in a repository's CI
 * repeats the same four flags, and the one place they get out of step is the
 * place the numbers stop meaning anything.
 *
 * **Every validation failure here throws.** That is the whole design. A config
 * file is trusted to carry a budget, and the failure mode of a lenient parser
 * is a typo'd key silently ignored, defaults quietly restored, and a green
 * build for a prompt nobody measured. An unreadable config is a loud error; a
 * config that half-applies is a lie.
 */

export const CONFIG_FILENAME = 'trazum.config.json';

/**
 * Largest config file this will read.
 *
 * A config is a couple of dozen lines. This exists so a hostile or accidental
 * multi-megabyte file is refused before `JSON.parse` is handed the whole thing.
 */
export const MAX_CONFIG_BYTES = 64 * 1024;

/** How far up the tree the search for a config file will walk. */
export const MAX_CONFIG_SEARCH_DEPTH = 32;

export interface TrazumConfig {
  level?: RuleLevel;
  locale?: Locale;
  disable?: RuleId[];
  usage?: Partial<UsageProfile>;
  /**
   * Token budgets by glob pattern. The most specific matching pattern wins —
   * see `mostSpecificMatch`, which states what "specific" means rather than
   * leaving it to be inferred.
   */
  budgets?: Record<string, number>;
  /** Default for `trazum diff --max-growth`, in tokens. */
  maxGrowth?: number;
  /** File extensions directory mode treats as prompts. */
  extensions?: string[];
}

/**
 * Every key the config accepts. Exported so the CLI's help can be tested
 * against it rather than against a second hand-maintained list — a setting the
 * help never mentions is one only the changelog knows about.
 */
export const CONFIG_KEYS = [
  'level',
  'locale',
  'disable',
  'usage',
  'budgets',
  'maxGrowth',
  'extensions',
] as const;

export const CONFIG_USAGE_KEYS = [
  'model',
  'callsPerMonth',
  'avgOutputTokens',
  'cacheHitRate',
  'batchEligible',
] as const;

const TOP_LEVEL_KEYS = CONFIG_KEYS;
const USAGE_KEYS = CONFIG_USAGE_KEYS;

/** Extensions directory mode reads when the config does not say otherwise. */
export const DEFAULT_EXTENSIONS = ['.txt', '.md', '.prompt', '.tmpl'];

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly source: string,
  ) {
    super(`${source}: ${message}`);
    this.name = 'ConfigError';
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Rejects a key the schema does not have, naming the nearest one that it does.
 *
 * This is the same failure as an unrecognised CLI flag, and it gets the same
 * treatment for the same reason: `"maxtokens"` where the schema says `budgets`
 * is a budget that is never read, and silence about it means CI stays green.
 */
function rejectUnknownKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  source: string,
  path: string,
): void {
  for (const key of Object.keys(object)) {
    if (allowed.includes(key)) continue;
    const nearest = nearestName(key, allowed);
    throw new ConfigError(
      nearest
        ? `unknown key "${path}${key}" — did you mean "${nearest}"?`
        : `unknown key "${path}${key}". Known keys: ${allowed.join(', ')}`,
      source,
    );
  }
}

function requireNonNegativeNumber(value: unknown, label: string, source: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ConfigError(`"${label}" must be a number of 0 or more`, source);
  }
  return value;
}

function parseUsage(raw: unknown, source: string): Partial<UsageProfile> {
  if (!isPlainObject(raw)) throw new ConfigError('"usage" must be an object', source);
  rejectUnknownKeys(raw, USAGE_KEYS, source, 'usage.');

  const usage: Partial<UsageProfile> = {};

  if (raw.model !== undefined) {
    if (typeof raw.model !== 'string') {
      throw new ConfigError('"usage.model" must be a string', source);
    }
    // getModel throws with the full list of ids, which is more useful here than
    // anything this function could add.
    getModel(raw.model);
    usage.model = raw.model;
  }
  if (raw.callsPerMonth !== undefined) {
    usage.callsPerMonth = requireNonNegativeNumber(raw.callsPerMonth, 'usage.callsPerMonth', source);
  }
  if (raw.avgOutputTokens !== undefined) {
    usage.avgOutputTokens = requireNonNegativeNumber(
      raw.avgOutputTokens,
      'usage.avgOutputTokens',
      source,
    );
  }
  if (raw.cacheHitRate !== undefined) {
    const rate = requireNonNegativeNumber(raw.cacheHitRate, 'usage.cacheHitRate', source);
    if (rate > 1) {
      throw new ConfigError('"usage.cacheHitRate" is a fraction between 0 and 1', source);
    }
    usage.cacheHitRate = rate;
  }
  if (raw.batchEligible !== undefined) {
    if (typeof raw.batchEligible !== 'boolean') {
      throw new ConfigError('"usage.batchEligible" must be true or false', source);
    }
    usage.batchEligible = raw.batchEligible;
  }

  return usage;
}

/**
 * An absolute path, in any of the shapes a config file might carry one.
 *
 * Written out rather than delegating to `path.isAbsolute` for two reasons. It
 * keeps `node:path` out of this module — the browser bundle imports it, and a
 * Node builtin anywhere in that graph fails the web build. And `isAbsolute` is
 * platform-dependent: on Linux it reads `C:\prompts` as relative, so a pattern
 * written on Windows would pass validation on a Linux CI runner and then match
 * nothing. A config should be judged the same way everywhere it is checked.
 */
const IS_ABSOLUTE = /^(?:[/\\]|[A-Za-z]:[/\\])/;

function parseBudgets(raw: unknown, source: string): Record<string, number> {
  if (!isPlainObject(raw)) throw new ConfigError('"budgets" must be an object', source);

  const budgets: Record<string, number> = {};
  for (const [pattern, value] of Object.entries(raw)) {
    if (pattern.length === 0) {
      throw new ConfigError('"budgets" has an empty pattern', source);
    }
    if (IS_ABSOLUTE.test(pattern) || pattern.includes('..')) {
      // Budgets key files inside the repository. An absolute pattern, or one
      // that climbs out with "..", either matches nothing or matches something
      // outside the project — both are mistakes worth naming.
      throw new ConfigError(
        `budget pattern "${pattern}" must be a relative path inside the project`,
        source,
      );
    }
    const tokens = requireNonNegativeNumber(value, `budgets["${pattern}"]`, source);
    if (!Number.isInteger(tokens)) {
      throw new ConfigError(`budgets["${pattern}"] must be a whole number of tokens`, source);
    }
    budgets[pattern] = tokens;
  }
  return budgets;
}

/**
 * Validates a config document.
 *
 * `source` names the file in every error, because a config error found while
 * running `trazum check` in a monorepo is useless without knowing which of
 * several config files it came from.
 */
export function parseConfig(raw: string, source = CONFIG_FILENAME): TrazumConfig {
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`not valid JSON — ${detail}`, source);
  }

  if (!isPlainObject(document)) {
    throw new ConfigError('the top level must be an object', source);
  }
  rejectUnknownKeys(document, TOP_LEVEL_KEYS, source, '');

  const config: TrazumConfig = {};

  if (document.level !== undefined) {
    if (document.level !== 'safe' && document.level !== 'aggressive') {
      throw new ConfigError('"level" must be "safe" or "aggressive"', source);
    }
    config.level = document.level;
  }

  if (document.locale !== undefined) {
    if (typeof document.locale !== 'string' || !isLocale(document.locale)) {
      throw new ConfigError(`"locale" is not a locale Trazum ships: ${String(document.locale)}`, source);
    }
    config.locale = document.locale;
  }

  if (document.disable !== undefined) {
    if (!Array.isArray(document.disable)) {
      throw new ConfigError('"disable" must be an array of rule ids', source);
    }
    const ids = RULES.map((rule) => rule.id);
    config.disable = document.disable.map((value) => {
      if (typeof value !== 'string' || !ids.includes(value as RuleId)) {
        const nearest = typeof value === 'string' ? nearestName(value, ids) : null;
        throw new ConfigError(
          nearest
            ? `"disable" names no such rule: "${String(value)}" — did you mean "${nearest}"?`
            : `"disable" names no such rule: "${String(value)}". Run "trazum rules" for the list.`,
          source,
        );
      }
      return value as RuleId;
    });
  }

  if (document.usage !== undefined) config.usage = parseUsage(document.usage, source);
  if (document.budgets !== undefined) config.budgets = parseBudgets(document.budgets, source);

  if (document.maxGrowth !== undefined) {
    config.maxGrowth = requireNonNegativeNumber(document.maxGrowth, 'maxGrowth', source);
  }

  if (document.extensions !== undefined) {
    if (!Array.isArray(document.extensions) || document.extensions.length === 0) {
      throw new ConfigError('"extensions" must be a non-empty array of strings', source);
    }
    config.extensions = document.extensions.map((value) => {
      if (typeof value !== 'string' || value.length < 2 || !value.startsWith('.')) {
        throw new ConfigError(
          `"extensions" entries look like ".txt"; got ${JSON.stringify(value)}`,
          source,
        );
      }
      return value.toLowerCase();
    });
  }

  return config;
}

export interface ResolvedBudget {
  /** The pattern the budget came from, so a surprising number can be traced. */
  pattern: string;
  maxTokens: number;
}

/**
 * The budget that applies to a path, or null when no pattern matches.
 *
 * Returning the pattern alongside the number is the point: a file failing
 * against a budget the reader cannot locate in their config is a bug report.
 */
export function budgetFor(
  path: string,
  budgets: Record<string, number> | undefined,
): ResolvedBudget | null {
  if (!budgets) return null;
  const pattern = mostSpecificMatch(Object.keys(budgets), path);
  return pattern === null ? null : { pattern, maxTokens: budgets[pattern]! };
}
