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
  validateConfigModel,
} from './config-schema.js';
export type { ResolvedBudget, SpendConfig, TrazumConfig } from './config-schema.js';

// Local price corrections. Pure, so also on the main entry point; re-exported
// here so the CLI has one import for everything it needs to resolve a run.
export {
  MAX_PRICING_BYTES,
  PricingOverlayError,
  applyPricingOverlay,
  catalogueFromOverlay,
  parsePricingOverlay,
} from './pricing-overlay.js';
export type { PricingOverlay } from './pricing-overlay.js';

// Turns a live price feed into an overlay. Pure — the fetch is the CLI's — and
// re-exported here for the same reason as the overlay itself: one import.
export { openrouterOverlay } from './openrouter.js';
export type { OpenRouterResult } from './openrouter.js';

// The endpoint gate every outbound call in this project goes through.
export { SAFE_FETCH_INIT, checkedEndpoint } from './net.js';
export { BUNDLED_CATALOGUE } from './pricing.js';
export type { PricingCatalogue } from './pricing.js';

// Reads the process environment, so it cannot live on the browser-safe entry.
export { detectHost } from './host.js';
export type { HostEnvironment } from './host.js';

export { MAX_WALK_DEPTH, MAX_WALK_FILES, walkPrompts } from './walk.js';
export type { WalkOptions, WalkResult } from './walk.js';
