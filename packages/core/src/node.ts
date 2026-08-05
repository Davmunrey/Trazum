/**
 * The parts of the core that read the filesystem.
 *
 * Kept off the main entry point on purpose, and the reason is a build failure
 * rather than a preference: `apps/web` bundles `@trazum/core` for the browser,
 * and a single `node:fs/promises` import anywhere in that graph fails the build
 * outright — "the chunking context does not support external modules".
 *
 * That failure is the friendly version of the real risk. The web app hands
 * `optimize()` a prompt straight from a request body; a file read reachable
 * from that entry point is path traversal available to anyone who can reach the
 * API. Two entry points make the split structural: the browser cannot import
 * what is not in its graph, whatever a future refactor does.
 *
 * Only the CLI imports this.
 */

export { loadConfig } from './config.js';
export type { LoadConfigOptions, LoadedConfig } from './config.js';

// Re-exported for convenience, so the CLI has one import for everything
// config-shaped. These halves are pure and also live on the main entry point.
export {
  CONFIG_FILENAME,
  CONFIG_KEYS,
  CONFIG_USAGE_KEYS,
  ConfigError,
  DEFAULT_EXTENSIONS,
  MAX_CONFIG_BYTES,
  MAX_CONFIG_SEARCH_DEPTH,
  budgetFor,
  parseConfig,
} from './config-schema.js';
export type { ResolvedBudget, TrazumConfig } from './config-schema.js';

export { MAX_WALK_DEPTH, MAX_WALK_FILES, walkPrompts } from './walk.js';
export type { WalkOptions, WalkResult } from './walk.js';
