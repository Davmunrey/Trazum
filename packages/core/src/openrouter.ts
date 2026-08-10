import type { PricingOverlay } from './pricing-overlay.js';

/**
 * A pricing overlay built from OpenRouter's model catalogue.
 *
 * **Why a live source at all.** Trazum's bundled prices are a table somebody
 * typed, and prices change on someone else's schedule. Worse, the table only
 * covers the providers whoever typed it had reached for — so a user on Groq or
 * Together got no figure at all, from a tool whose entire output is figures.
 * OpenRouter publishes price and context window for hundreds of models across
 * dozens of providers, as data, at a URL. That is a better source than my
 * memory, and it is current by construction.
 *
 * **What it deliberately does not do.** OpenRouter publishes what a model costs
 * and how much context it takes. It does not publish whether the model has
 * prompt caching, or the minimum prefix it caches at. Both feed the caching
 * advisory, which is the largest saving Trazum reports — an order of magnitude
 * above what the trimming rules recover.
 *
 * So a model that arrives from here carries `caching: 'unknown'` and
 * `cacheMinTokens: null`, and the advisory declines. The two available lies are
 * symmetrical and both are worse: claim caching works and Trazum offers a
 * saving that cannot be bought at any price; claim it does not and Trazum hides
 * the biggest saving there is.
 *
 * **Pure, and in the core, so it is testable without a network.** The fetch
 * lives in the CLI. Everything here is a transformation of a document somebody
 * already has, which is the same split as `LlmProvider` taking a `fetchImpl`.
 */

/** The subset of OpenRouter's payload this reads. Everything else is ignored. */
interface OpenRouterModel {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
}

export interface OpenRouterResult {
  overlay: PricingOverlay;
  /** Ids that were skipped, and the reason, so nothing disappears silently. */
  skipped: Array<{ id: string; reason: string }>;
}

/**
 * OpenRouter quotes USD **per token**, as a decimal string.
 *
 * `"0.000003"` is three dollars per million. Parsed rather than multiplied
 * blindly: a free model quotes `"0"`, and a model with no price for one half
 * quotes `"-1"` on occasion. Neither is a price Trazum can put in a budget.
 */
function perMillion(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value * 1_000_000;
}

/**
 * Turns OpenRouter's catalogue into an overlay.
 *
 * `knownIds` is the set the bundled catalogue already has. For those, only the
 * three things OpenRouter actually knows are overridden — price in, price out,
 * context window. `cacheMinTokens`, `caching`, `capability` and `tier` are left
 * alone, because the bundled entry was written by somebody who looked them up
 * and this feed has nothing to say about them. Overwriting a researched fact
 * with a blank is not a refresh.
 */
export function openrouterOverlay(
  payload: unknown,
  options: { knownIds: ReadonlySet<string>; lastReviewed: string; idFor?: (id: string) => string },
): OpenRouterResult {
  const { knownIds, lastReviewed, idFor = (id) => id } = options;

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new Error('OpenRouter payload has no "data" array — is this the models endpoint?');
  }

  const models: PricingOverlay['models'] = {};
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const entry of data as OpenRouterModel[]) {
    const rawId = typeof entry?.id === 'string' ? entry.id : '';
    if (!rawId) continue;

    const id = idFor(rawId);
    const input = perMillion(entry.pricing?.prompt);
    const output = perMillion(entry.pricing?.completion);

    if (input === null || output === null) {
      // Free models and half-priced entries. Skipped rather than recorded at
      // zero: a zero price makes every saving Trazum computes zero too, and a
      // report full of $0.00 reads as "nothing to gain here" rather than as
      // "this catalogue has no price for that".
      skipped.push({ id: rawId, reason: 'no usable price' });
      continue;
    }

    const context = Number(entry.context_length);
    if (!Number.isInteger(context) || context <= 0) {
      skipped.push({ id: rawId, reason: 'no context window' });
      continue;
    }

    if (knownIds.has(id)) {
      models[id] = { inputPerMTok: input, outputPerMTok: output, contextWindow: context };
      continue;
    }

    models[id] = {
      displayName: typeof entry.name === 'string' && entry.name ? entry.name : rawId,
      inputPerMTok: input,
      outputPerMTok: output,
      contextWindow: context,
      // The two the feed cannot answer. See the note at the top of this file.
      cacheMinTokens: null,
      caching: 'unknown',
      capability: 'unknown',
      tier: 'unknown',
    };
  }

  return { overlay: { lastReviewed, models }, skipped };
}
